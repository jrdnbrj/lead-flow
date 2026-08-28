---
title: 'First Contact multi-vehicle resources'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'b628e9a7bdcd2ae794d8cb806a586060ed420c05'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** First Contact stores several interested models but currently sends the photo and technical sheet only for the first model, so the advisor cannot provide the resources for all selected vehicles.

**Approach:** Keep the current manual, send-once First Contact flow and expand only its resource projection to the first three models in the stored selection order. Preserve the existing text behavior for all selected models, E3 fencing/idempotency, customer Evolution instance, and current visual language.

## Boundaries & Constraints

**Always:** Process `lead.carModels.slice(0, 3)` in order; create one MESSAGE item; create independent PHOTO and TECHNICAL_SHEET items per bounded model; allow missing resource kinds independently as `NOT_AVAILABLE`; execute MESSAGE first, then each model's photo and sheet deterministically; preserve claim, fence, retries, provider IDs, operation/effect versions, and historical operations.

**Ask First:** None; the product decisions are explicit. Stop before any real-customer WhatsApp smoke test.

**Never:** Do not modify leads schema or lead selection UX; do not expand historical First Contact operations; do not backfill external effects; do not change Evolution architecture/instances/webhooks, Push, reminders, Auth, catalog behavior, or unrelated UI; do not send unsolicited real WhatsApp messages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| ONE_MODEL | One selected model | MESSAGE + that model's PHOTO/SHEET | Missing kind is `NOT_AVAILABLE`; other kind remains sendable |
| THREE_MODELS | Three selected models | MESSAGE + six model-scoped resource items | Each item has independent result/retry |
| OVER_LIMIT | Five selected models | Resources only for first three; text may mention all five | Never resolve/send model four or five resources |
| STALE_OPERATION | Existing First Contact operation | Existing items/results unchanged | No new effects or provider IO |
| PARTIAL_ASSETS | One kind missing for a model | Available kind sends independently | No fabricated/substituted asset |

</frozen-after-approval>

## Code Map

- `lib/first-contact/command.ts` -- build model-scoped items and execute resources in deterministic order.
- `lib/first-contact/types.ts` -- represent model identity in resource items and provider inputs.
- `lib/first-contact/order.ts` -- preserve MESSAGE then model/resource order.
- `lib/leads/repository.ts` -- resolve assets for up to three models using existing catalog/fallback rules.
- `components/leads/first-contact-summary.tsx` -- display model plus resource and preserve independent retries.
- `supabase/migrations/049_first_contact_multi_vehicle_resources.sql` -- widen the forward E3 item contract without changing historical migrations.
- `scripts/e3-multi-vehicle-contract-check.mjs` and existing E3 checks -- cover bounded projection, ordering, identity, retries, and legacy behavior.

## Tasks & Acceptance

**Execution:**
- [ ] `lib/leads/repository.ts`, `lib/first-contact/command.ts`, `lib/first-contact/types.ts`, `lib/first-contact/order.ts` -- resolve and send first-three model resources independently and deterministically -- preserve current E3 semantics.
- [ ] `supabase/migrations/049_first_contact_multi_vehicle_resources.sql` -- allow one message plus model-scoped resource items up to seven -- retain ownership, idempotency, and historical replay.
- [ ] `components/leads/first-contact-summary.tsx` -- label model-specific resources and retry only the selected effect -- retain current visual patterns.
- [ ] `scripts/e3-multi-vehicle-contract-check.mjs` and existing checks -- verify all required scenarios -- prevent regressions.

**Acceptance Criteria:**
- Given one, two, or three models, when First Contact starts, then resources are created only for those models in stored order.
- Given more than three models, when First Contact starts, then only the first three produce resource items while the text retains current all-model behavior.
- Given a missing photo or sheet, when First Contact starts, then the missing kind is `NOT_AVAILABLE` and the other kind remains independently sendable.
- Given an accepted model A resource, when model B is retried, then model A is not resent.
- Given an existing operation, when the advisor repeats the command, then historical items/effects remain unchanged and no duplicate operation is created.
- Given a message failure, when execution completes, then no resource provider IO occurs.
- Given partial resource failure, when results are read, then each model/resource shows its own persisted state.

## Design Notes

Use a stable model-scoped item key such as `PHOTO:<catalog-id>` and `TECHNICAL_SHEET:<catalog-id>` plus the resource version for effect identity. Keep one text item. For deterministic transport, execute resource items serially after an accepted message; missing items have no external effect.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.
- `bash scripts/ci-contract-checks.sh` -- expected: existing contracts plus multi-vehicle checks pass.
- `git diff --check` -- expected: no whitespace errors.
