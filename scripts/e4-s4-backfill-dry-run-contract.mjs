import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sqlPath = path.resolve('scripts/e4-s4-backfill-dry-run.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

assert.match(sql, /begin read only/i);
assert.match(sql, /rollback\s*;/i);
assert.doesNotMatch(sql, /\b(insert\s+into\s+(?!_e4_s4_checks)|update\s+(?!_e4_s4_checks)|delete\s+from|alter\s+(table|publication|policy)|drop\s+(table|schema)|truncate|grant\s|revoke\s)/i);
assert.match(sql, /create\s+temporary\s+table\s+_e4_s4_checks/i);
for (const required of ['leads', 'leadflow_settings', 'lead_messages', 'lead_follow_up_actions', 'leadflow_installation']) {
  assert.match(sql, new RegExp(`public\\.${required}`));
}
for (const future of ['push_subscriptions', 'external_effects', 'leadflow_events', 'lead_contact_operations', 'lead_contact_operation_items', 'lead_milestones', 'push_deliveries']) {
  assert.match(sql, new RegExp(`public\\.${future}`));
}
assert.match(sql, /provider_message_id is not null/i);
assert.match(sql, /deleted_at is not null/i);
assert.match(sql, /lead_messages_lead_id_fkey/);
assert.match(sql, /lead_follow_up_actions_lead_id_fkey/);
assert.match(sql, /CONSTRAINT-OWNERSHIP-FK/);
assert.match(sql, /CONSTRAINT-SETTINGS-IDENTITY/);
assert.match(sql, /leadflow_settings_user_id_key/);
assert.match(sql, /ROOT-LEADS-TENANT-LEGACY/);
assert.match(sql, /soft-deleted leads remain ownership roots/);
assert.match(sql, /DERIVED-MESSAGES-SOFT-DELETED/);
assert.match(sql, /DERIVED-ACTIONS-SOFT-DELETED/);
assert.match(sql, /writers_inventory/i);
assert.match(sql, /private_rows_emitted.*false/is);

const pass = (input) => ({
  orphan: 0,
  ownerMismatch: 0,
  invalidRelation: 0,
  duplicateProviderIds: 0,
  settingsInvalid: 0,
  ...input,
});
const evaluate = (input) => {
  const findings = Object.entries(input)
    .filter(([key, value]) => ['orphan', 'ownerMismatch', 'invalidRelation', 'duplicateProviderIds', 'settingsInvalid'].includes(key) && value !== 0)
    .map(([key, value]) => `${key}=${value}`);
  return { status: findings.length === 0 ? 'PASS' : 'FAIL', findings };
};

assert.deepEqual(evaluate(pass({})), { status: 'PASS', findings: [] });
for (const key of ['orphan', 'ownerMismatch', 'invalidRelation', 'duplicateProviderIds', 'settingsInvalid']) {
  assert.equal(evaluate(pass({ [key]: 1 })).status, 'FAIL', key);
}
assert.equal(evaluate(pass({ softDeletedDerivedRows: 3 })).status, 'PASS');
assert.equal(evaluate(pass({ repeatedPhoneValues: 4 })).status, 'PASS');
assert.equal(evaluate(pass({ nullProviderMessageIds: 4 })).status, 'PASS');
assert.equal(evaluate(pass({ validMultipleActionsPerLead: 2 })).status, 'PASS');

const requiredReportContract = [
  'ROOT-LEADS-OWNERSHIP', 'ROOT-LEADS-SOFT-DELETED', 'ROOT-LEADS-TENANT-LEGACY',
  'ROOT-SETTINGS-OWNERSHIP', 'ROOT-SETTINGS-IDENTITY', 'DERIVED-MESSAGES-INTEGRITY',
  'DERIVED-MESSAGES-SOFT-DELETED', 'DERIVED-ACTIONS-INTEGRITY', 'DERIVED-ACTIONS-SOFT-DELETED',
  'CONSTRAINT-DERIVED-FK', 'CONSTRAINT-OWNERSHIP-FK', 'CONSTRAINT-SETTINGS-IDENTITY',
];
const sqlCheckIds = new Set([...sql.matchAll(/'([A-Z][A-Z0-9-]+)'\s*,/g)].map((match) => match[1]));
for (const checkId of requiredReportContract) {
  assert(sqlCheckIds.has(checkId), `recipe does not emit ${checkId}`);
}

const fixtureReport = {
  private_rows_emitted: false,
  checks: [...sqlCheckIds].filter((check_id) => requiredReportContract.includes(check_id)).map((check_id) => ({ check_id, status: 'PASS' })),
  future_roots_absent_are_na: true,
  tenant_id_authoritative: false,
};
assert.equal(fixtureReport.private_rows_emitted, false);
assert.equal(fixtureReport.tenant_id_authoritative, false);
assert.deepEqual(new Set(fixtureReport.checks.map(({ check_id }) => check_id)), new Set(requiredReportContract));

console.log('E4-S4_BACKFILL_DRY_RUN_CONTRACT_PASS');
