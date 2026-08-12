# E4-S7 verification report

Status: PASS
Fecha: 2026-08-11
Modo: read-only local verification; no grants, policies or rows were modified.

Checks:

- table inventory and RLS flags: PASS
- policy inventory: PASS
- RPC execute grants, including `soft_delete_lead(uuid)`: PASS
- public catalog target exception limited to `car_models` and `car_model_images`: PASS
- Phase A anonymous policies on `leads`, `lead_messages` and `lead_follow_up_actions`: OBSERVED/TEMPORARY, not approved as Phase B target
- `leadflow_events` RLS currently disabled: OBSERVED, final enforcement remains E4-S8
- Realtime publication membership inventory: PASS
- unlisted operations: FAIL-CLOSED by matrix contract

The report contains metadata and counts only; no private rows, secrets or tokens.
The observed `anon` execution grant on `soft_delete_lead(uuid)` is recorded as a temporary Phase A permission and is not approved as a target. Final Phase B revocations remain exclusively in E4-S8.
