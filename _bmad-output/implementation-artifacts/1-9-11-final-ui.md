# E1-S9–E1-S11 — Cierre de seguimiento, dashboard y teléfono existente

Status: IMPLEMENTATION_COMPLETE

## E1-S9

`FollowUpActions` is the reusable client component for dashboard and capture
result. It delegates schedule, transition, clear, version and retry behavior
to the E1-S8 server adapters. It renders all action states and keeps the
existing local state when a command fails.

## E1-S10

Dashboard ordering is deterministic and separated into active conversations,
due/today follow-up, no open next action, and remaining contacts. Cards expose
the next action or `Sin próxima acción`. The existing Realtime indicator and
manual refresh remain independent; Realtime unavailable does not disable
`Actualizar datos`.

## E1-S11

Capture consumes the E1-S3 normalized phone lookup after successful creation.
Deleted leads are excluded by the repository contract, and the result offers
`Abrir lead existente` or `Crear nueva oportunidad`. The new lead remains a
separate record; no merge or overwrite path was added.

## Validation

- `scripts/e1-s9-s11-ui-contract-check.mjs` passes.
- Typecheck passes.
- Lint passes with the pre-existing unused-function warning in
  `lib/leads/repository.ts`.
- `git diff --check` passes.
- Remote Realtime, Supabase and real-device validation remain
  `DEFERRED_RUNTIME_VALIDATION`.
