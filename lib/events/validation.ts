import type { EventEnvelopeInput, EventRegistryEntry } from './types';

const PAIRS = new Set(['PWA/ADVISOR', 'WEBHOOK/WEBHOOK', 'PUSH/ADVISOR', 'SCHEDULER/SCHEDULER', 'SYSTEM/SYSTEM', 'LEADFLOW_WHATSAPP_ACCEPTED/WEBHOOK', 'NATIVE_WHATSAPP_CONFIRMED/ADVISOR']);
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function trimAsciiSpaces(value: string): string {
  return value.replace(/^ +| +$/g, '');
}

function validateValue(value: unknown, spec: Record<string, unknown>, path: string): void {
  const type = spec.type as string | undefined;
  const values = spec.values as string[] | undefined;
  if (values && !values.includes(String(value))) throw new Error(`EVENT_ENUM_INVALID:${path}`);
  if (type === 'uuid' && (typeof value !== 'string' || !UUID.test(value))) throw new Error('EVENT_UUID_INVALID');
  if (type === 'positive_int' && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) throw new Error('EVENT_POSITIVE_INT_INVALID');
  if (type === 'digest_hex' && (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))) throw new Error('EVENT_DIGEST_INVALID');
  if (type === 'boolean' && typeof value !== 'boolean') throw new Error('EVENT_BOOLEAN_INVALID');
  if (type === 'timestamp' && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) throw new Error('EVENT_TIMESTAMP_INVALID');
  if (['safe_text', 'safe_code', 'safe_code_or_safe_text'].includes(type ?? '') && (typeof value !== 'string' || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value) || value.normalize('NFC') !== value)) throw new Error('EVENT_SAFE_TEXT_INVALID');
  if (type === 'array') {
    if (!Array.isArray(value)) throw new Error('EVENT_ARRAY_INVALID');
    if (typeof spec.min_items === 'number' && value.length < spec.min_items) throw new Error('EVENT_ARRAY_MIN_ITEMS');
    if (typeof spec.max_items === 'number' && value.length > spec.max_items) throw new Error('EVENT_ARRAY_MAX_ITEMS');
    if (spec.unique === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) throw new Error('EVENT_ARRAY_DUPLICATE');
    for (const item of value) validateValue(item, (spec.items ?? {}) as Record<string, unknown>, path);
  }
  if (type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('EVENT_OBJECT_INVALID');
    const object = value as Record<string, unknown>;
    const required = (spec.required ?? []) as string[];
    for (const key of required) if (!(key in object)) throw new Error('EVENT_NESTED_REQUIRED_FIELD');
    const properties = (spec.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(object)) {
      if (!(key in properties) && spec.additional === 'reject') throw new Error('EVENT_NESTED_ADDITIONAL_FIELD');
      if (key in properties) validateValue(object[key], properties[key], `${path}.${key}`);
    }
    for (const condition of (spec.conditionals ?? []) as Array<Record<string, unknown>>) {
      const when = condition.when as Record<string, unknown>;
      const actual = object[when.field as string];
      const match = (when.equals !== undefined && actual === when.equals) || (when.not_equals !== undefined && actual !== when.not_equals) || (Array.isArray(when.in) && (when.in as unknown[]).includes(actual));
      if (match) {
        for (const key of (condition.required ?? []) as string[]) if (!(key in object)) throw new Error('EVENT_NESTED_CONDITIONAL_REQUIRED');
        for (const key of (condition.forbidden ?? []) as string[]) if (key in object) throw new Error('EVENT_NESTED_CONDITIONAL_FORBIDDEN');
      }
    }
  }
}
export function validateEventEnvelope(registry: EventRegistryEntry, event: EventEnvelopeInput): void {
  if (registry.emit_status !== 'ENABLED') throw new Error('EVENT_TYPE_DISABLED');
  if (event.schema_version !== undefined && event.schema_version !== 1) throw new Error('EVENT_SCHEMA_VERSION_INVALID');
  if (event.stage !== registry.allowed_stage) throw new Error('EVENT_STAGE_INVALID');
  if (!PAIRS.has(`${event.source}/${event.actor_kind}`)) throw new Error('EVENT_SOURCE_ACTOR_INVALID');
  if (event.actor_kind === 'ADVISOR' && !event.actor_id) throw new Error('EVENT_ACTOR_ID_REQUIRED');
  const required = new Set(registry.payload_contract.required);
  const allowed = new Set([...required, ...registry.payload_contract.optional]);
  for (const key of required) if (!(key in event.payload)) throw new Error(`EVENT_PAYLOAD_REQUIRED_FIELD:${key}`);
  for (const key of Object.keys(event.payload)) if (!allowed.has(key)) throw new Error(`EVENT_PAYLOAD_ADDITIONAL_FIELD:${key}`);
  if (/password|secret|token|cookie|authorization|service.role|private.key|raw_payload|request_body/i.test(JSON.stringify(event.payload))) throw new Error('EVENT_SENSITIVE_PAYLOAD');
  for (const [key, type] of Object.entries(registry.payload_contract.types)) {
    if (!(key in event.payload)) continue;
    const value = event.payload[key];
    const arrayRule = (registry.payload_contract.rules?.arrays as Record<string, unknown> | undefined)?.[key] as Record<string, unknown> | undefined;
    const enumRule = registry.payload_contract.enums[key] ? { values: registry.payload_contract.enums[key] } : {};
    validateValue(value, { type, ...enumRule, ...(arrayRule ?? {}) }, key);
  }
  for (const [key, values] of Object.entries(registry.payload_contract.enums)) {
    if (key in event.payload && !values.includes(String(event.payload[key]))) throw new Error(`EVENT_ENUM_INVALID:${key}`);
  }
  for (const condition of (registry.payload_contract.rules?.conditionals ?? []) as Array<Record<string, unknown>>) {
    const when = condition.when as Record<string, unknown>;
    const actual = event.payload[when.field as string];
    const match = (when.equals !== undefined && actual === when.equals) || (when.not_equals !== undefined && actual !== when.not_equals) || (Array.isArray(when.in) && (when.in as unknown[]).includes(actual));
    if (!match) continue;
    for (const key of (condition.required ?? []) as string[]) if (!(key in event.payload)) throw new Error('EVENT_CONDITIONAL_REQUIRED_FIELD');
    for (const key of (condition.forbidden ?? []) as string[]) if (key in event.payload) throw new Error('EVENT_CONDITIONAL_FORBIDDEN_FIELD');
    for (const [key, expected] of Object.entries((condition.equals ?? {}) as Record<string, unknown>)) if (event.payload[key] !== expected) throw new Error('EVENT_CONDITIONAL_VALUE_INVALID');
  }
  if (Number.isNaN(Date.parse(event.occurred_at))) throw new Error('EVENT_TIMESTAMP_INVALID');
  if (event.error_code !== undefined && event.error_code !== null && !SAFE_CODE.test(event.error_code)) throw new Error('EVENT_ERROR_CODE_INVALID');
  if (registry.event_class === 'TRANSITION') {
    const aggregateVersion = event.aggregate_version;
    if (event.aggregate_type !== registry.aggregate_type || !event.aggregate_id || typeof aggregateVersion !== 'number' || !Number.isInteger(aggregateVersion) || aggregateVersion < 1) throw new Error('EVENT_AGGREGATE_INVALID');
  } else if (event.aggregate_type || event.aggregate_id || event.aggregate_version !== undefined && event.aggregate_version !== null) {
    throw new Error('EVENT_AGGREGATE_FORBIDDEN');
  }
}
