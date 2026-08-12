# E1-S8 — Adaptadores de acciones y retiro de mutaciones directas

Status: IMPLEMENTATION_COMPLETE

## Scope

The manual scheduling, update, and clear server-action paths delegate to the
versioned E1-S6/E1-S7 RPC contracts. They preserve `ActionResponse<T>`, pass
`expectedActionVersion` from the existing dashboard action model, and return
sanitized functional errors when persistence does not confirm the command.

The inbound customer-reply path remains outside this story because it belongs
to the later inbound integration scope; it was not changed here.

## Acceptance evidence

- `createFollowUpAction` calls `create_lead_follow_up_action_v1`.
- `updateFollowUpAction` and `clearLeadAction` call
  `transition_lead_follow_up_action_v1`.
- Manual adapter blocks contain no direct insert/update/delete against
  `lead_follow_up_actions` and do not update lead action projection columns.
- Functional RPC failures are mapped to stable user-facing `ActionResponse`
  messages rather than exposing Supabase payloads.
- `scripts/e1-s8-action-adapter-contract-check.mjs` passes.
- Typecheck, lint, and `git diff --check` pass; lint retains one pre-existing
  unused-function warning in `lib/leads/repository.ts`.

## Deferred runtime validation

Remote Supabase execution, real ownership/RLS behavior, concurrent clients,
and production event delivery remain `DEFERRED_RUNTIME_VALIDATION`.
