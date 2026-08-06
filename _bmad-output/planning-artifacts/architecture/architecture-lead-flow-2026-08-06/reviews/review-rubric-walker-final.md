# Final certification — rubric walker

## Verdict

**FAIL — do not finalize the spine yet.**

The deterministic lint passes with zero findings, and the spine now covers the full feature-altitude envelope, but one critical and three high-severity divergence points remain. The critical finding means two implementations can obey the written rules and still duplicate an external effect after a lease expiry.

## Scope and evidence reviewed

- Full `ARCHITECTURE-SPINE.md`, independently from prior review reports.
- Driving PRD: FR-001–FR-037, NFR-001–NFR-015 and SM-001–SM-009.
- Brownfield evidence: `package.json`, lock-installed package versions, `Dockerfile`, `docker-compose.yml`, `project-context.md`, current Supabase migrations, action/repository code, Evolution webhook and WhatsApp adapter.
- Mechanical gate: `lint_spine.py` — PASS, 0 findings.
- Current-fit checks against official Next.js, Supabase, Ubuntu and Evolution sources.

## Critical finding

### C-1 — `request_started_at` is observable but not an enforced pre-I/O transition

**Evidence:** AD-7 defines an attempt with nullable `request_started_at` and makes reaping behavior depend on that value, but it never requires a compare-and-set `mark-started` RPC to commit before the worker performs provider I/O (`ARCHITECTURE-SPINE.md:91-95`). AD-6's minimum RPC contract names claim/reap/reconcile but no start transition (`ARCHITECTURE-SPINE.md:85-89`). AD-9 later uses `request_started_at` as the NFR-004 clock (`ARCHITECTURE-SPINE.md:103-107`).

**Divergence proof:** Worker A may persist `request_started_at` before `fetch`; worker B may call the provider first and persist it afterward. Both satisfy the current wording. If B's lease expires after the request leaves but before the timestamp is stored, the reaper sees a null start, returns the effect to retry eligibility and another worker can send the same WhatsApp or Push effect again. That defeats AD-7's stated prevention and conflicts with FR-016, FR-022 and NFR-002.

**Required closure:** make `start_effect_attempt(effect_id, attempt_no, claim_token)` or an equivalent versioned RPC part of the mandatory protocol. It must atomically verify the current claim and commit `request_started_at` before any provider call; failure to commit forbids I/O. Once started, lease expiry must lead only to `UNKNOWN`, never automatic resend. Define how a matching late result reconciles that exact started attempt.

## High findings

### H-1 — Terminal action transitions are told to create a new Push delivery

**Evidence:** AD-9 says **each** versioned action transition cancels the previous `READY` rows and materializes one delivery for every active subscription (`ARCHITECTURE-SPINE.md:103-107`). AD-4 explicitly includes terminal transitions in `action_version` (`ARCHITECTURE-SPINE.md:73-77`), while the brownfield model already has `DONE`, `IGNORED` and `CANCELED`; soft delete currently transitions every open action to `CANCELED` (`supabase/migrations/008_soft_delete_lead_rpc.sql:23-28`). FR-007 requires an ignored action to withdraw its reminders (`prd.md:111`).

**Divergence proof:** one implementation can materialize a current-version delivery for a closed action exactly as AD-9 says, while another can infer that only open actions qualify from later text. Pre-I/O validation may eventually cancel the first row, but it has already created contradictory operational state and may have emitted `push_generated`.

**Required closure:** state that only an action whose post-transition status is open (`PENDING` or `POSTPONED`) materializes current-version deliveries. A terminal transition must only cancel all unsent deliveries/capabilities for the action and must never create a replacement delivery.

### H-2 — `push_generated` is bound to early row materialization rather than the due-time notification

**Evidence:** the event registry defines `push_generated` as a versioned delivery being materialized (`ARCHITECTURE-SPINE.md:119-145`), and AD-9 materializes deliveries when an action changes or a subscription activates, potentially days before `scheduled_for` (`ARCHITECTURE-SPINE.md:103-107`). The PRD defines the event when the notification is generated and requires server generation when the action reaches its scheduled instant (`prd.md:131-133`, `158`).

**Divergence proof:** one implementation can emit `push_generated` when the future job row is inserted; another can emit it when the due worker assembles the encrypted notification. Both fit parts of the spine, but they produce incompatible timestamps, funnel counts and NFR-004 evidence. Canceled-before-due actions can also appear as generated notifications even though no request should exist.

**Required closure:** distinguish the durable planned-delivery row from due-time generation. Either introduce a non-product `PLANNED` state with no `push_generated` event, or redefine materialization to occur only at due claim. Emit `push_generated` exactly once when the current, eligible notification payload and capabilities are durably prepared for the provider attempt; keep `request_started_at` as the separate service-request boundary.

### H-3 — One-use Push capability issuance and retry lifecycle are not specified

**Evidence:** AD-15 requires the browser to receive the raw capability in the encrypted Push payload while PostgreSQL stores only its digest (`ARCHITECTURE-SPINE.md:173-177`). Neither AD-9 nor AD-15 fixes when the raw token is minted, which RPC durably binds its digest before send, or what happens to capabilities when a pre-I/O retry, terminal rejection, cancellation, subscription invalidation or accepted delivery occurs. The structural seed only shows the relationship, not the lifecycle (`ARCHITECTURE-SPINE.md:268-290`).

**Divergence proof:** minting at action scheduling cannot later reconstruct the raw token from the digest; minting independently on every worker retry can leave multiple valid command capabilities for one logical delivery; replacing a digest during a possibly delivered attempt can invalidate the capability already in flight. These implementations all satisfy the current digest-only rule but produce incompatible security and user behavior.

**Required closure:** define one issuance RPC and lifecycle. A safe contract is: the Edge worker generates raw tokens immediately before a not-yet-started provider attempt; one RPC atomically verifies current action/subscription/delivery state, stores command-bound digests and expiry, and returns issuance status before I/O. A pre-I/O abandoned attempt must revoke its unobserved capability set before replacement; after `request_started_at`, capabilities remain stable through `ACCEPTED` or `UNKNOWN` until consumed, expired or invalidated by a newer action version. Terminal action/subscription/delivery states revoke every unused bound capability.

## Checklist result

| Good-spine criterion | Result | Notes |
| --- | --- | --- |
| Fixes all real divergence points for the level below | **Fail** | C-1 and H-1–H-3 remain independently implementable in incompatible ways. |
| Every AD is enforceable and prevents its stated divergence | **Fail** | AD-7 lacks the mandatory pre-I/O state transition; AD-9 contradicts terminal-action behavior. |
| Deferred items cannot cause current units to diverge | Pass | Corporate automation, browser targeting, retention, ingress choice and recovery objectives have explicit boundaries and revisit gates. |
| Named technology is verified-current and fit | Pass | Local exact package versions match the stack; Next.js 16 `proxy.ts`, Supabase SSR `getClaims()`, publishable/secret keys, sub-minute Cron, Edge secrets, Ubuntu 24.04 LTS and Evolution 2.3.7 remain supported/current choices. |
| Ratifies rather than contradicts the brownfield codebase | Pass | Existing direct Supabase access, anonymous RLS, midnight scheduling and webhook cancellation are correctly treated as brownfield gaps or migration targets, not falsely claimed as implemented architecture. |
| Covers the driving PRD capabilities | Conditional | All capability ranges are mapped; corporate synchronization is safely discovery-gated by the later product decision. Push semantics remain blocked by H-1–H-3. |
| Inherited invariants remain intact | N/A | No parent spine is declared. |
| Every owned structural dimension is decided, deferred or open | Pass | Paradigm, module boundaries, data ownership, security, runtimes, environments, deployment, operations, migration, observability and deferrals are present. |

## Non-blocking implementation notes

- The closed event registry still needs an emission matrix in implementation specs for overlapping facts such as a newly inserted response action (`next_action_created` plus `response_action_upserted`) and a Push command that also closes or postpones an action. This can remain below the spine if one canonical mapping is fixed before event-producing stories split.
- The `phone_e164` migration should explicitly preserve invalid legacy phone rows as non-matchable evidence rather than forcing a destructive normalization; AD-2 already supplies the safe migration boundary.
- The operational envelope is otherwise strong: headless Ubuntu deployment, HTTPS-only ingress, private Compose networking, immutable release pins, isolated environments, feature flags, readiness, alert thresholds, restore drill and go-live gates are all explicit.

## Current-technology sources checked

- [Next.js Proxy convention](https://nextjs.org/docs/app/getting-started/proxy)
- [Supabase SSR client and `getClaims()` guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&package-manager=npm)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [Ubuntu 24.04 LTS lifecycle](https://ubuntu.com/about/release-cycle)
- [Evolution API releases](https://github.com/evolution-foundation/evolution-api/releases)

## Certification condition

Do not change `status: draft` to `final` until C-1 and H-1–H-3 are made unambiguous in the spine and the deterministic lint plus final rubric gate are rerun.
