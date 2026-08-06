# Post-fix certification — rubric walker

**Verdict: FAIL**

No critical finding remains, but three high-severity contracts still allow independently built units to diverge or violate Push/audit requirements. The spine must remain `draft`.

## Review basis

Independent review from the current files only; prior review reports were not used as evidence.

- Architecture spine: `ARCHITECTURE-SPINE.md`
- Product contract: `prd-lead-flow-2026-08-05/prd.md`, especially FR-003–FR-025 and NFR-001–NFR-015
- Brownfield paths: `lib/leads/actions.ts`, `lib/leads/repository.ts`, `app/api/webhooks/evolution/route.ts`, `lib/whatsapp/service.ts`, migrations `001`–`009`, `package.json`, `Dockerfile` and `docker-compose.yml`
- BMad good-spine checklist and deterministic lint

`lint_spine.py`: **PASS, 0 findings**.

The named local package versions match installed `node_modules`. Current-fit checks also agree with the official [Next.js 16.2 release](https://nextjs.org/blog/next-16-2), [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), [Supabase Cron](https://supabase.com/docs/guides/cron) and the official [Evolution API v2.3.7 release](https://github.com/evolution-foundation/evolution-api/releases/tag/2.3.7).

## Critical findings

None.

## High findings

### H1 — Push materialization has an impossible postcondition after generation

**Evidence:** AD-9 requires `repair_push_materialization_v1` to leave exactly one **`SCHEDULED`** delivery for every current open action × active subscription generation. The same AD then advances that delivery to generated at `begin_effect_io_v1`, and later to a service-result projection, while the action may legitimately remain open.

**Divergence test:** after one Push is generated and the advisor has not acted, the next scheduler repair can either:

1. treat the generated/result delivery as satisfying the invariant, contradicting the literal `SCHEDULED` postcondition;
2. try to create another `SCHEDULED` row and collide with the unique delivery identity; or
3. regress/reuse the existing delivery as `SCHEDULED`, risking another provider request.

These implementations all obey different parts of AD-9 but are incompatible. This directly affects FR-022 and FR-024.

**Required correction:** define the postcondition over one canonical delivery/effect identity in an explicit lifecycle. `SCHEDULED` should be required only when no attempt has started; `GENERATED`, `ACCEPTED`, `REJECTED_TERMINAL` and `UNKNOWN` must satisfy or terminate materialization without replacement according to a closed transition table. Repair must never regress or rematerialize a started identity.

### H2 — Subscription identity does not actually prevent duplicate endpoints

**Evidence:** AD-9 says it prevents duplicated endpoints and versions subscription lifecycle changes, but it defines no stable endpoint identity, digest or uniqueness/upsert constraint. Delivery uniqueness includes `subscription_id`, so two rows representing the same browser endpoint produce two valid delivery identities and two Push requests.

**Divergence test:** two concurrent registration requests may either update one subscription or insert two active subscriptions. Both can follow the stated lock order because the spine never defines how an endpoint is matched before locking. The resulting systems differ observably and one violates FR-022/FR-024.

**Required correction:** define a server-derived stable endpoint fingerprint and a uniqueness boundary such as `(user_id, endpoint_fingerprint)`, with one RPC that atomically activates, rotates, reactivates or no-ops that identity. Encryption may keep endpoint/key material confidential, but it cannot be the deduplication key.

### H3 — Effect-version changes and canonical event aggregate versions conflict

**Evidence:** AD-7 says every logical effect-state mutation increments `effect_version` and appends its AD-10 event. Claim and definitive provider result mutate the logical effect (`READY/RETRYABLE -> CLAIMED` and `CLAIMED/UNKNOWN -> ACCEPTED/REJECTED_TERMINAL`). AD-10 instead classifies `external_effect_attempt_claimed` and `external_effect_attempt_result` as `ATTEMPT`, requires `aggregate_version` to be null for `ATTEMPT`, and has no canonical `EXTERNAL_EFFECT` transition mapping for claimed, accepted or terminal rejection.

**Divergence test:** one Effects implementation can emit only attempt events with no aggregate version, while another can invent unregistered effect-transition events or attach an effect version contrary to AD-10. All three choices violate part of the spine, and audit reconstruction cannot deterministically join each resulting `effect_version` to one canonical transition event.

**Required correction:** either classify these effect state changes as canonical `TRANSITION` events and map each to `(EXTERNAL_EFFECT, effect_id, resulting effect_version)`, or narrow AD-7 so attempt-only mutations do not claim a versioned logical transition. Provider acceptance/rejection must still have one registered, aggregate-versioned effect transition; capability projection events such as `push_service_result` remain separate.

## Required certification probes

| Probe | Result | Certification note |
| --- | --- | --- |
| Atomic begin-I/O | PASS | `claim_effect_v1`, the write-once `request_started_at` fence, claim-token digest, lease check and same-lock reaper rule prohibit a second automatic provider I/O after a started/uncertain attempt. A failed begin is explicitly a hard no-I/O result. |
| Canonical effect ledger | PASS | AD-7 makes `external_effects` and its attempt/observation tables the sole effect state machine and defines source-aggregate constraints for Push, first contact and replies. H3 concerns its audit projection, not ledger ownership. |
| Terminal Push materialization | PASS with H1 blocking broader lifecycle | Terminal action transitions explicitly cancel unsent deliveries/effects/capabilities and forbid replacement. H1 still makes repair non-convergent after a non-terminal delivery leaves `SCHEDULED`. |
| Scheduled vs generated semantics | PASS | Materialization emits `push_delivery_scheduled`; `push_generated` occurs only for a due, revalidated candidate at the committed pre-I/O fence. |
| Capability lifecycle and persistence | PASS | Raw capability tokens are confined to Edge memory, encrypted payload and `Notification.data`; only digests persist server-side. Issue, begin-I/O binding, invalidation, expiry, one-use consumption, replay result and `AUTH_REQUIRED` behavior are deterministic. |
| Event aggregate versions | FAIL | H3 leaves effect state/version transitions without one canonical event mapping. |
| Advisor singleton immutability | PASS | One database singleton is authoritative; runtime updates/deletes and account replacement are forbidden, while the only future replacement path is a closed-write reviewed migration with whole-graph assertions and session invalidation. |
| Full operational envelope | PASS | Headless Ubuntu topology, TLS/private networking, immutable image release inputs, environment isolation, secrets/rotation, feature flags, liveness/readiness, Cron monitoring, one-minute acceptance probes, backup/restore and go-live/rollback gates are all addressed or safely closed in Deferred. |

## Good-spine checklist result

| Criterion | Result |
| --- | --- |
| Real divergence points fixed | FAIL — H1, H2 and H3 remain. |
| Every Rule enforceably prevents its stated divergence | FAIL — AD-9 does not prevent duplicate subscription endpoints and its repair postcondition conflicts with its own lifecycle. |
| Deferred items are bounded | PASS — deferred choices forbid implementation until their revisit gates are met. |
| Named technology verified/current | PASS. |
| Brownfield is ratified, not rewritten | PASS — the spine explicitly preserves current routes, Supabase projection trigger, Realtime fallback, Evolution integration and additive migration path while identifying current gaps such as days-at-midnight scheduling and inbound cancellation. |
| PRD capabilities covered | PASS at architecture scope; corporate automation is intentionally discovery-gated with a closed no-implementation boundary. |
| Structural dimensions covered | PASS — paradigm, module dependencies, mutation authority, data ownership, security, deployment, environments, provider strategy, operations and deferrals are present. |

## Certification condition

Re-run the rubric walker after resolving H1–H3 and keeping `status: draft`. Certification passes only if the delivery repair invariant is lifecycle-aware, subscriptions have a database-enforced endpoint identity, and every effect-version transition has one non-contradictory canonical event contract.
