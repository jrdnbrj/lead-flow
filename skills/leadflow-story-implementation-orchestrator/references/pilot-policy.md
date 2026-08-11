# Pilot policy

## Pilot A — E4-S1

Use an explicit allowlist containing only `E4-S1`. Verify readiness handoff, projection reconciliation, execution type, dependency closure, scope freeze, and external-evidence request. Enter `AWAITING_EXTERNAL_EVIDENCE`; do not run backup/restore or any remote operation. Import and validate a human-produced result, then review it and exercise `done_gate.py` only when every required artifact is present. Do not run a real preflight during the pilot-design/build turn.

The expected current type is `OPERATIONAL`, unless a frozen proposal explicitly includes repository implementation work, in which case it is `HYBRID`. No implementation type is inferred by a script.

## Pilot B — E4-S2

Start only after E4-S1 is `DONE` with validated human evidence, and only with an explicit allowlist containing `E4-S2`. Require its frozen type to be `IMPLEMENTATION`; otherwise stop. Demonstrate `IMPLEMENTING → VALIDATING → REVIEWING → NEEDS_TECHNICAL_FIX/REVALIDATING` when needed → `DONE_GATE → DONE`. Stop after E4-S2; never select E4-S3 automatically.
