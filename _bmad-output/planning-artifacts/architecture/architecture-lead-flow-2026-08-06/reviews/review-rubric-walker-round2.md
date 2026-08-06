# Reviewer Gate round 2 — Good-spine rubric walker

**Artifact:** `ARCHITECTURE-SPINE.md`
**Review mode:** independent read from scratch; no edits to the spine
**Date:** 2026-08-06
**Verdict:** **FAIL — do not finalize yet.**

The revision resolves most first-round architecture gaps, but five high-severity divergences remain. Two are internal contract contradictions (`UNKNOWN` recovery and the event registry); three leave MUST requirements without one enforceable implementation path (WhatsApp action completion, Push materialization after subscription changes, and the one-minute Push bound). Mechanical lint passes with zero findings.

## Gate summary

| Severity | Count | Gate effect |
| --- | ---: | --- |
| Critical | 0 | — |
| High | 5 | Blocks finalization |
| Medium | 3 | Fix or move to an explicit, safe Deferred boundary |
| Low | 0 | — |

## Explicit recheck of first-round issue classes

| Prior issue class | Result | Evidence |
| --- | --- | --- |
| Auth / webhook cutover | **PASS** | AD-3 makes the privileged fixed-owner provider path unconditional, deploys it before anonymous access is revoked, asserts ownership integrity in one transaction and keeps production in maintenance on failure. AD-6 forbids cookie clients for provider traffic. This is compatible with replacing the current webhook's anonymous `createSupabaseServerClient()` path without reopening anonymous access. |
| Exact date and time | **PASS** | AD-4 requires an explicit date and time, server-side `America/Guayaquil` interpretation and UTC persistence; it forbids the existing days-only/midnight helper and defines both response shortcuts. |
| Deno / Next.js seam | **PASS** | AD-6 assigns shared mutable policy to versioned PostgreSQL RPCs and limits the Edge Function to bounded orchestration/provider I/O. The Runtime seam convention forbids a second Deno domain implementation. |
| `UNKNOWN` retries | **PARTIAL / FAIL** | AD-7 now prevents unsafe automatic resend, but its declared state machine has no legal reconciliation transition out of `UNKNOWN`; H-1 below remains. |
| Environment isolation | **PASS** | AD-13 and the environment table separate local synthetic data/effects from production, forbid production-first migrations, isolate Compose services behind HTTPS ingress and require release pins, readiness, backup/restore and rollback evidence. |

## High findings

### H-1 — `UNKNOWN` is safe from duplicate resend but is an unrecoverable terminal state

**Evidence:** AD-7 declares the only effect transitions as `READY -> CLAIMED -> ACCEPTED | REJECTED_TERMINAL | RETRYABLE | UNKNOWN | CANCELED`, then says an `UNKNOWN` may be resolved through proven remote idempotency or a reliable query-by-key (`ARCHITECTURE-SPINE.md:91-95`). No `UNKNOWN -> ...` transition exists, and only the original claim token may record a result.

**Divergence:** a late worker or reconciliation job that obtains definitive provider evidence can either reject that evidence because the row is already `UNKNOWN`, mutate an allegedly terminal state, or create a second effect row. All three choices are compatible with only part of the Rule, and produce incompatible audit histories.

**Required correction:** define the complete reconciliation state machine. At minimum, specify which authenticated actor/RPC may apply a late result, how the original attempt is identified, and the audited transitions from `UNKNOWN` to a definitive result. Returning to `READY` must be allowed only after query-by-key proves no effect occurred (or under a provider contract that guarantees reuse of the same remote idempotency key). No path may silently create a new business-effect identity.

### H-2 — FR-010 and FR-013 do not have an authoritative WhatsApp-to-action completion contract

**Evidence:** the PRD requires a WhatsApp action sent from LeadFlow to resolve when Evolution accepts it, while a native-WhatsApp response resolves by explicit manual confirmation and remains distinguishable (`prd.md:117-120`). AD-4 assigns ownership of actions and messages, AD-5 defines response-action convergence, and AD-8 defines first-contact items, but none binds an outbound message/effect to the exact follow-up action it may complete (`ARCHITECTURE-SPINE.md:73-101`). The capability map groups FR-010–FR-013 under AD-4–AD-6 without supplying that missing rule (`ARCHITECTURE-SPINE.md:279-281`). Current code confirms the brownfield seam: Evolution status callbacks update `lead_messages` and the lead's WhatsApp status, not a selected follow-up action (`app/api/webhooks/evolution/route.ts:142-162`).

**Divergence:** separate stories can complete the newest open action, every open WhatsApp/response action, an action inferred by lead, or no action. They can also label the same completion as automatic or manual, corrupting SM-004 and the `next_action_done` event source.

**Required correction:** bind an outbound reply command and its AD-7 effect/message to one explicit `follow_up_action_id`. A single owning RPC may transition only that still-open action to `DONE` when Evolution returns the accepted evidence defined by the PRD; rejection, failure or `UNKNOWN` leaves it open with a functional error. The manual native-WhatsApp command must use the same action transition with a distinct completion source. First contact must not accidentally close an unrelated action unless the command explicitly bound it.

### H-3 — Subscription creation/reactivation can leave a current action with no Push delivery

**Evidence:** AD-9 materializes delivery rows only when an action is scheduled, once per subscription active at that moment. The same Rule says resubscription reactivates the subscription identity “without touching its action” (`ARCHITECTURE-SPINE.md:103-107`). NFR-015 requires explicit reactivation while actions remain pending (`prd.md:215-217`).

**Divergence:** if an action is scheduled before permission is granted, or a subscription is reactivated before/after the due instant, one implementation will create the missing current-version delivery during subscription upsert, another will wait for an action change that may never occur, and another will synthesize it in the dispatcher. The latter two can respectively lose or duplicate FR-018 notifications.

**Required correction:** select one authority. Either the subscription upsert/reactivation RPC must atomically materialize missing deliveries for all eligible open current-version actions, or the claim RPC must lazily materialize them under the same unique key before claiming. Define due actions, already-past actions, invalid-to-active transitions and cancellation behavior so reactivation preserves the action and cannot duplicate a delivery.

### H-4 — The operational rule permits violation of the one-minute Push requirement

**Evidence:** NFR-004 requires the Push request within one minute of the scheduled instant (`prd.md:194-197`). AD-9 schedules `dispatch-push` only once per minute, while AD-13 does not alert until two Cron minutes are missed or the due backlog exceeds two minutes (`ARCHITECTURE-SPINE.md:103-107,127-131`). Network invocation, claim and provider I/O occur after the minute tick, so a near-boundary action or one missed run can exceed the bound before any alert fires.

**Divergence:** implementations can interpret “every minute” as sufficient, use different clock/skew tolerances, or accept a two-minute backlog despite the MUST SLO.

**Required correction:** bind a cadence and processing budget that mathematically leave headroom under 60 seconds, define the timestamp measured for compliance, and alert at or before breach. Supabase Cron currently supports sub-minute schedules, so a bounded 20–30 second dispatcher is a viable selected baseline; the acceptance test must exercise worst-positioned due timestamps and one delayed invocation. The two-minute backlog threshold may remain as a secondary incident threshold, not the NFR-004 gate.

### H-5 — The event registry is simultaneously closed and required to emit names outside it

**Evidence:** AD-5 mandates `inbound_lead_match_ambiguous`, which is absent from the PRD event list (`ARCHITECTURE-SPINE.md:79-83`; `prd.md:144-164`). AD-7 also requires claim/result/retry events without canonical names. AD-10 states that the PRD event names and payloads are a closed registry (`ARCHITECTURE-SPINE.md:109-113`), while the PRD itself contains the wildcard `corporate_sync_*` rather than concrete event types.

**Divergence:** a builder must either violate the closed registry, omit required operational evidence, overload a PRD event with a different meaning, or invent names independently. Every choice breaks AD-10's stated prevention of synonymous/incompatible analytics.

**Required correction:** define one versioned canonical registry that contains the PRD events plus every architecture-required event, or explicitly separate the closed product-event registry from a named operational/audit-event registry. The rule must state where each AD-5/AD-7 event lands. Keep corporate event names unimplemented until AD-14 reopens, then replace the wildcard with concrete names before coding.

## Medium findings

### M-1 — The Supabase secret-key convention is not valid across both selected runtimes

AD-12 and the Configuration convention make singular `SUPABASE_SECRET_KEY` canonical for the whole architecture (`ARCHITECTURE-SPINE.md:121-125,159-161`). Current hosted Edge Functions receive `SUPABASE_SECRET_KEYS` as a JSON map; singular `SUPABASE_SECRET_KEY` is a local CLI fallback, and custom secret names may not use the reserved `SUPABASE_` prefix. A Node implementation and a hosted Edge implementation can therefore follow the spine and still disagree or fail in production.

Split the contract by runtime: retain the chosen Node deployment variable only if explicitly injected there; for hosted `dispatch-push`, use the platform-provided plural key map or pinned `@supabase/server` `auth: 'secret:<name>'`/admin context. Keep the separate scheduler credential under a non-reserved name such as `LEADFLOW_SCHEDULER_SECRET`. Official references: [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets), [Edge Function secret-name limits](https://supabase.com/docs/guides/functions/limits).

### M-2 — Encrypted Push subscription data lacks a cross-runtime encryption contract

AD-9 requires encrypted endpoint/key material, but does not bind the encryption owner, format, key identifier, rotation/read-old-write-new behavior or whether PostgreSQL/Vault or application code decrypts it (`ARCHITECTURE-SPINE.md:103-107`). Next.js writes subscriptions and the Deno Edge Function consumes them, so two independently built units can produce incompatible ciphertext even while obeying the Rule.

Choose one encryption boundary before the Push story: database-owned encryption exposed only through scoped RPCs, or a versioned application envelope shared by both runtimes. Bind the stored `cipher_version`/`key_id`, rotation procedure and endpoint-digest algorithm; never put VAPID private material or a data-encryption key in browser-readable configuration.

### M-3 — Delivery milestone multiplicity makes FR-037 metrics ambiguous

AD-11 makes `PURCHASE_DECISION` unique but leaves `DELIVERY` multiplicity and metric selection undefined (`ARCHITECTURE-SPINE.md:115-119`). Two metric builders can use first, latest or every delivery milestone and calculate different purchase-to-delivery durations while both use persisted timestamps.

Define whether `DELIVERY` is unique per lead or which canonical occurrence feeds FR-037; keep repeatable `BLOCKER` entries separate. This can be an AD-11 amendment or an explicit Deferred item with a revisit condition before FR-036/FR-037 implementation.

## Good-spine checklist result

| Criterion | Result | Notes |
| --- | --- | --- |
| Real divergence points fixed | **FAIL** | H-1–H-5 remain shared cross-story/runtime decisions. |
| Every AD Rule enforceable and prevents its divergence | **FAIL** | AD-7 has no legal `UNKNOWN` reconciliation; AD-10 contradicts AD-5/AD-7. |
| Deferred cannot permit incompatible implementation | **PASS** | Corporate automation is blocked behind discovery and a future spine update; ingress, browser target, retention and repair choices have safe boundaries/revisit conditions. |
| Named technology verified-current | **CONDITIONAL** | Local package versions match the stack; Next.js 16 `proxy.ts`, Ubuntu 24.04 LTS, Evolution 2.3.7, Supabase Cron Beta and Web Push are viable. M-1 must correct the hosted Edge key contract. |
| Brownfield compatibility | **PASS** | AD-2 is additive; AD-3 gives a non-anonymous cutover path; the current direct webhook/action/Realtime behaviors are treated as migration seams rather than claimed as already compliant. |
| Full PRD coverage | **FAIL** | FR-010/FR-013, NFR-004 and NFR-015 lack a complete governing rule. |
| Deployment, environments, infrastructure, providers and operations | **CONDITIONAL** | The envelope is present and suitable for headless Ubuntu, but the Push SLO and hosted Edge key contract need correction. |

## Technology reality check

- The repository versions in the spine match installed packages: Next.js `16.2.12`, React `19.2.4`, TypeScript `5.9.3`, Tailwind `4.3.3`, Zod `4.4.3`, Supabase JS `2.110.9` and Supabase SSR `0.12.3`.
- `proxy.ts` is the current Next.js 16 convention and is correctly treated as an optimistic boundary rather than the only authorization check: [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy), [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication).
- Supabase supports scheduling Edge Functions with Cron/`pg_cron`, `pg_net` and Vault; Cron is currently Beta and supports sub-minute schedules: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase Cron](https://supabase.com/docs/guides/cron), [Cron product status](https://supabase.com/features/supabase-cron).
- Ubuntu Server 24.04 LTS remains supported through May 2029 and is a valid conservative host baseline: [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).
- Evolution API `2.3.7` is an official released baseline: [Evolution API releases](https://github.com/evolution-foundation/evolution-api/releases).
- Persistent notifications require a Service Worker and secure context; action support remains appropriately progressive: [MDN `showNotification()`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

## Deterministic checks

```text
lint_spine.py: PASS
total_findings: 0
```

## Gate condition

Do not set `status: final` until H-1–H-5 are corrected and the deterministic lint plus a fresh semantic gate pass again. M-1 and M-2 should be corrected in the spine because they are shared runtime contracts; M-3 may be moved to Deferred only if FR-036/FR-037 implementation is explicitly blocked until the revisit condition is satisfied.
