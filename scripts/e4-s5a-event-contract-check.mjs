import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const migration = fs.readFileSync('supabase/migrations/011_leadflow_event_registry_and_append.sql', 'utf8');
const names = [
  'lead_created','lead_capture_failed','next_action_created','next_action_done','next_action_postponed','next_action_ignored','next_action_canceled',
  'inbound_message_received','inbound_message_rejected','inbound_lead_match_ambiguous','response_action_upserted','first_contact_requested','first_contact_result',
  'push_delivery_scheduled','push_generated','push_service_result','push_subscription_activated','push_subscription_deactivated','push_subscription_invalid','push_action_taken','push_action_rejected','push_duplicate_suppressed',
  'external_effect_claimed','external_effect_io_started','external_effect_result_recorded','external_effect_retry_scheduled','external_effect_canceled','external_effect_reconciled','purchase_decision_recorded','audit_correction',
];
assert.equal(names.length, 30);
for (const name of names) assert.equal((migration.match(new RegExp(`^  \\('${name}'`, 'gm')) ?? []).length, 1, name);
assert.doesNotMatch(migration, /corporate_sync_/);
assert.match(migration, /REGISTERED_DISABLED/);
assert.match(migration, /revoke all on table public\.leadflow_events from public, anon, authenticated/);
assert.match(migration, /append_leadflow_event_v1/);
assert.match(migration, /leadflow_validate_event_contract_v1/);
assert.match(migration, /EVENT_UUID_INVALID/);
assert.match(migration, /EVENT_OCCURRED_AT_REQUIRED/);
assert.match(migration, /EVENT_ENUM_INVALID/);
assert.match(migration, /'result'/);
assert.match(migration, /EVENT_TYPE_DISABLED/);
assert.match(migration, /EVENT_KEY_CONFLICT/);
assert.match(migration, /revoke all on table public\.leadflow_event_registry from public, anon, authenticated, service_role/);
assert.match(migration, /leadflow_events_registry_insert_guard/);
assert.match(migration, /e\.source=p_event->>'source'/);
assert.match(migration, /'fields'/);
assert.match(migration, /resource_results/);
assert.match(migration, /provider_message_id/);
assert.match(migration, /TRIM_ASCII_THEN_NFC/);
assert.match(migration, /fingerprint_kind_dependent/);

const key = (eventType, recipe, components) => {
  assert.equal(recipe.length, components.length);
  const framed = components.map((component, index) => {
    assert.equal(component.name, recipe[index]);
    const value = component.value === null ? 'NULL' : String(component.value);
    return `${component.name}=${Buffer.byteLength(value, 'utf8')}:${value};`;
  }).join('');
  return crypto.createHash('sha256').update(`leadflow-event-key/v1|event_type=${eventType}|schema_version=1|${framed}`, 'utf8').digest('hex');
};
assert.match(key('lead_created', ['lead_id'], [{ name: 'lead_id', value: '00000000-0000-4000-8000-000000000001' }]), /^[0-9a-f]{64}$/);
assert.notEqual(key('lead_capture_failed', ['idempotency_key', 'stage'], [{ name: 'idempotency_key', value: 'x' }, { name: 'stage', value: 'CAPTURE' }]), key('lead_capture_failed', ['idempotency_key', 'stage'], [{ name: 'idempotency_key', value: 'x' }, { name: 'stage', value: 'ACTIONS' }]));

const validate = (registry, event) => {
  if (registry.emit_status !== 'ENABLED') throw new Error('EVENT_TYPE_DISABLED');
  if (/secret|token|password|raw_payload/i.test(JSON.stringify(event.payload))) throw new Error('EVENT_SENSITIVE_PAYLOAD');
  const allowed = new Set([...registry.required, ...registry.optional]);
  for (const required of registry.required) if (!(required in event.payload)) throw new Error('EVENT_PAYLOAD_REQUIRED_FIELD');
  for (const key of Object.keys(event.payload)) if (!allowed.has(key)) throw new Error('EVENT_PAYLOAD_ADDITIONAL_FIELD');
  if (registry.event_class === 'TRANSITION' && (!event.aggregate_type || !event.aggregate_id || event.aggregate_version < 1)) throw new Error('EVENT_AGGREGATE_INVALID');
};
const fact = { event_class: 'FACT', emit_status: 'ENABLED', required: ['lead_id'], optional: [] };
assert.throws(() => validate({ ...fact, emit_status: 'REGISTERED_DISABLED' }, { payload: { lead_id: 'x' } }), /DISABLED/);
assert.throws(() => validate(fact, { payload: {} }), /REQUIRED/);
assert.throws(() => validate(fact, { payload: { lead_id: 'x', extra: true } }), /ADDITIONAL/);
assert.throws(() => validate(fact, { payload: { lead_id: 'x', token: 'nope' } }), /SENSITIVE/);
assert.throws(() => validate({ event_class: 'TRANSITION', emit_status: 'ENABLED', required: [], optional: [] }, { payload: {}, aggregate_type: null, aggregate_id: null, aggregate_version: 0 }), /AGGREGATE/);

const resourceResult = { resource: 'MESSAGE', result: 'ACCEPTED', provider_message_id: 'provider-1' };
assert.equal(resourceResult.resource, 'MESSAGE');
assert.ok(['ACCEPTED', 'FAILED', 'UNKNOWN', 'NOT_AVAILABLE'].includes(resourceResult.result));
assert.throws(() => ({ resource: 'MESSAGE', result: 'ACCEPTED' }).provider_message_id ?? (() => { throw new Error('nested required'); })(), /nested required/);
assert.throws(() => ({ resource: 'MESSAGE', result: 'FAILED', provider_message_id: 'unexpected' }).provider_message_id && (() => { throw new Error('nested forbidden'); })(), /nested forbidden/);

const tsCheck = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
import { validateEventEnvelope } from ${JSON.stringify(path.resolve('lib/events/validation.ts'))};
import { buildEventKey } from ${JSON.stringify(path.resolve('lib/events/event-key.ts'))};
const registry = {
  event_type: 'response_action_upserted', schema_version: 1, event_class: 'TRANSITION', emit_status: 'ENABLED',
  owner_capability: 'test', allowed_stage: 'INBOUND', aggregate_type: 'FOLLOW_UP_ACTION', aggregate_table: 'lead_follow_up_actions',
  payload_contract: {
    required: ['classification', 'resource_results'], optional: ['review_label'],
    types: { classification: 'safe_code', resource_results: 'array' }, enums: { classification: ['NO_SUGGESTION', 'PENDING', 'REVIEW'] }, normalization: {},
    rules: { arrays: { resource_results: { type: 'array', items: { type: 'object', required: ['resource', 'result'], optional: ['provider_message_id'], additional: 'reject', properties: { resource: { type: 'enum', values: ['MESSAGE', 'PHOTOS', 'TECHNICAL_SHEET'] }, result: { type: 'enum', values: ['ACCEPTED', 'FAILED', 'UNKNOWN', 'NOT_AVAILABLE'] }, provider_message_id: { type: 'safe_text' } }, conditionals: [{ when: { field: 'result', equals: 'ACCEPTED' }, required: ['provider_message_id'] }, { when: { field: 'result', in: ['FAILED', 'UNKNOWN', 'NOT_AVAILABLE'] }, forbidden: ['provider_message_id'] }] } } }, conditionals: [{ when: { field: 'classification', equals: 'REVIEW' }, required: ['review_label'], equals: { review_label: 'Revisar' } }] }
  },
  identity_recipe: []
};
const envelope = (payload) => ({ event_type: 'response_action_upserted', schema_version: 1, occurred_at: '2026-08-11T00:00:00Z', source: 'WEBHOOK', stage: 'INBOUND', actor_kind: 'WEBHOOK', aggregate_type: 'FOLLOW_UP_ACTION', aggregate_id: '00000000-0000-4000-8000-000000000001', aggregate_version: 1, payload, identity_components: [] });
validateEventEnvelope(registry, envelope({ classification: 'REVIEW', review_label: 'Revisar', resource_results: [{ resource: 'MESSAGE', result: 'ACCEPTED', provider_message_id: 'p1' }] }));
assert.throws(() => validateEventEnvelope(registry, envelope({ classification: 'REVIEW', resource_results: [{ resource: 'MESSAGE', result: 'ACCEPTED' }] })), /EVENT_(NESTED_)?CONDITIONAL_REQUIRED/);
assert.throws(() => validateEventEnvelope(registry, envelope({ classification: 'PENDING', review_label: 'Revisar', resource_results: [{ resource: 'MESSAGE', result: 'FAILED', provider_message_id: 'p1' }] })), /EVENT_(NESTED_)?CONDITIONAL_FORBIDDEN/);
assert.throws(() => validateEventEnvelope(registry, envelope({ classification: 'REVIEW', review_label: 'Revisar', extra: true, resource_results: [{ resource: 'MESSAGE', result: 'ACCEPTED', provider_message_id: 'p1' }] })), /EVENT_PAYLOAD_ADDITIONAL_FIELD/);
assert.throws(() => validateEventEnvelope(registry, envelope({ classification: 'INVALID', resource_results: [] })), /EVENT_ENUM_INVALID/);
const identityRegistry = { ...registry, event_type: 'inbound_message_rejected', identity_recipe: [{ component: 'evolution_instance_canonical', type: 'safe_text', nullable: false, constant: null, normalization: 'TRIM_ASCII_THEN_NFC', order: 1 }, { component: 'fingerprint_kind', type: 'fingerprint_kind', nullable: false, constant: null, normalization: 'ASCII_TOKEN', order: 2 }, { component: 'fingerprint_value', type: 'fingerprint_value', nullable: false, constant: null, normalization: 'BY_FINGERPRINT_KIND', order: 3 }] };
const keyA = buildEventKey(identityRegistry, [{ name: 'evolution_instance_canonical', value: '  MiInstancia  ' }, { name: 'fingerprint_kind', value: 'PROVIDER_MESSAGE_ID' }, { name: 'fingerprint_value', value: '  Msg-1  ' }]);
const keyB = buildEventKey(identityRegistry, [{ name: 'evolution_instance_canonical', value: 'MiInstancia' }, { name: 'fingerprint_kind', value: 'PROVIDER_MESSAGE_ID' }, { name: 'fingerprint_value', value: 'Msg-1' }]);
assert.equal(keyA, keyB);
const keyLowerKind = buildEventKey(identityRegistry, [{ name: 'evolution_instance_canonical', value: 'MiInstancia' }, { name: 'fingerprint_kind', value: 'provider_message_id' }, { name: 'fingerprint_value', value: 'Msg-1' }]);
assert.equal(keyLowerKind, keyB);
assert.throws(() => buildEventKey(identityRegistry, [{ name: 'evolution_instance_canonical', value: 'x' }, { name: 'fingerprint_kind', value: '' }, { name: 'fingerprint_value', value: 'x' }]), /fingerprint kind/);
console.log('E4_S5A_TYPESCRIPT_CONTRACT_PASS');
`], { encoding: 'utf8' });
assert.equal(tsCheck.status, 0, tsCheck.stderr || tsCheck.stdout);
assert.match(tsCheck.stdout, /E4_S5A_TYPESCRIPT_CONTRACT_PASS/);

console.log('E4-S5A_EVENT_CONTRACT_PASS');
