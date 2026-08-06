# Final post-correction rubric certification — LeadFlow

## Verdict

**PASS — no CRITICAL or HIGH divergence remains.**

The corrected spine now closes the previously blocking choices around Push materialization, endpoint identity, external-effect fencing and event versions, and the Auth/RLS cutover. The remaining work is implementation proof already required by the spine; it does not permit two compliant units to choose observably incompatible contracts.

## Review basis

- Full `ARCHITECTURE-SPINE.md`, lines 1–394.
- Final LeadFlow PRD, especially FR-001–FR-025, FR-034–FR-037 and NFR-001–NFR-015.
- Existing brownfield Evolution webhook, Supabase privileged client, Compose topology and migrations `001`–`009` where needed to test compatibility claims.
- BMad good-spine checklist and the five requested certification probes.
- Deterministic lint: **PASS, 0 findings**.

The spine remained unmodified during this review.

## Critical findings

None.

## High findings

None.

## Required certification probes

### 1. Exact Push lifecycle postcondition — PASS

**Contract evidence:** AD-9 defines one delivery identity with a database unique key `(follow_up_action_id, action_version, subscription_id, subscription_generation)` and requires exactly one canonical delivery plus one AD-7 effect for each current open action × active current subscription generation (`ARCHITECTURE-SPINE.md:113`). The identity satisfies the postcondition throughout scheduled, claimed, generated and provider-result states; repair is explicitly forbidden to reset or recreate it. Missing current identities are inserted, while stale pre-I/O identities are canceled. Terminal actions never materialize replacements, and attempts that crossed `request_started_at` remain immutable evidence whose late result cannot mutate a terminal or newer action.

Generation is also located at one exact boundary: materialization emits only `push_delivery_scheduled`; a due `SCHEDULED` identity emits `push_generated` only when `begin_effect_io_v1` commits after revalidating current owner, action version/source and subscription generation (`ARCHITECTURE-SPINE.md:115`). Provider outcomes advance that same canonical effect and delivery projection.

**Divergence challenge:**

- An implementation that treats an existing `GENERATED`, `ACCEPTED`, `UNKNOWN` or terminal-result identity as satisfying materialization is compliant.
- An implementation that creates a replacement `SCHEDULED` identity, regresses the existing identity, cancels a started attempt, or lets its late result mutate a terminal/newer action is not compliant: it violates the unique identity, no-reset/no-recreation and started-evidence clauses.

The prior impossible “exactly one `SCHEDULED` row after generation” interpretation no longer exists. This contract preserves the PRD's one notification per action and backend retry deduplication requirements (FR-022 and FR-024) while retaining pending actions after Push failure (NFR-001).

### 2. Push endpoint uniqueness — PASS

**Contract evidence:** `push_subscriptions` has a database-enforced unique constraint on `(user_id, endpoint_digest)`, normatively yielding one row and one current lifecycle for one exact endpoint (`ARCHITECTURE-SPINE.md:113`). The same rule fixes generation semantics: key-material change or reactivation of an inactive endpoint increments `subscription_generation`; unchanged active material does not satisfy either condition. Every lifecycle RPC uses the shared lock order and repairs action × current-generation materialization before commit.

Endpoint and key material are encrypted/decrypted only by scoped PostgreSQL RPCs with versioned Vault keys; neither Next.js nor Edge receives the decryption key (`ARCHITECTURE-SPINE.md:115`). Thus encryption randomness cannot become subscription identity.

**Divergence challenge:** inserting a second active row for the same endpoint is not a compliant alternative because it violates the unique constraint and the “one exact endpoint has one row” postcondition. Implementations may differ internally in conflict-handling mechanics, but they must converge to the same row, lifecycle and generation, so no observable duplicate-delivery contract remains.

### 3. Effect-version event mappings — PASS

**Contract evidence:** every logical `external_effects` state mutation must increment `effect_version` and append its canonical AD-10 transition event in the same transaction (`ARCHITECTURE-SPINE.md:101`). The registry classifies claim, provider result, retry scheduling, cancellation and reconciliation as `TRANSITION` events (`ARCHITECTURE-SPINE.md:148–153`). The canonical mapping binds all five to:

- `aggregate_type = EXTERNAL_EFFECT`;
- `aggregate_id = external_effects.id`;
- `aggregate_version =` the resulting `effect_version`;
- the owning Effects state-transition RPC (`ARCHITECTURE-SPINE.md:159–167`).

The pre-I/O fence is correctly separate: `external_effect_io_started` is an `ATTEMPT` fact keyed by `(effect_id, attempt_no, BEGIN_IO)` because it writes the attempt's once-only `request_started_at` without representing a second effect-state transition (`ARCHITECTURE-SPINE.md:169–183`). Push delivery projection transitions independently use the resulting `delivery_version`.

**Divergence challenge:** an implementation that emits only attempt-level claim/result events, omits the resulting effect version, invents another aggregate, or mutates effect state without its same-transaction transition event is no longer compliant. Different internal SQL layouts cannot change the canonical aggregate identity/version or split the audit contract.

### 4. One provider request per fence — PASS

**Contract evidence:** `claim_effect_v1` creates one immutable attempt and returns its raw claim token once. `begin_effect_io_v1` locks the effect and attempt, validates the latest attempt, token digest, lease, payload digest and null write-once `request_started_at`, then commits that fence; any failed validation is a hard prohibition on provider I/O (`ARCHITECTURE-SPINE.md:99–101`).

After the fence, the adapter may make **exactly one** provider HTTP/SDK request for that attempt. Automatic retries and non-GET redirect replay are explicitly disabled. Any additional physical request needs a newly authorized attempt and, after uncertain acceptance, a proven reusable provider idempotency key or definitive query-by-key evidence. If begin wins before lease reaping, expiry yields only `UNKNOWN`, never automatic resend; `UNKNOWN -> READY` requires proof that no effect occurred or a provider guarantee for the same remote idempotency key (`ARCHITECTURE-SPINE.md:101`). Push capability preparation is digest-bound to that same attempt and `begin_effect_io_v1` cannot commit without the exact complete set (`ARCHITECTURE-SPINE.md:214`).

**Divergence challenge:** a transport or SDK that performs two physical requests under one committed fence is expressly non-compliant. A worker that resends after timeout/connection loss without the required proof is also non-compliant. The only compliant implementations therefore share one irreversible request boundary and the same uncertain-result behavior.

### 5. Webhook-preserving Auth/RLS cutover — PASS

**Brownfield evidence:** the current Evolution webhook is a live provider-token-authenticated Node Route Handler and performs message/status mutations before returning success (`app/api/webhooks/evolution/route.ts:165–192`). The current schema contains anonymous private-table policies and RPC grants, so a one-step RLS revocation would break or lose behavior rather than constitute a safe migration.

**Contract evidence:** AD-3 makes `leadflow_installation.advisor_user_id` the single identity authority and requires privileged provider RPCs to derive that owner internally with no caller-supplied owner (`ARCHITECTURE-SPINE.md:67–71`). Phase A deploys the authenticated UI and a dual-compatible privileged Evolution webhook while anonymous compatibility remains, and assigns the singleton owner to every new private write (`ARCHITECTURE-SPINE.md:73`).

Phase B keeps the webhook HTTP route live while advisor UI writes are in maintenance. Each webhook mutation takes the shared `leadflow_auth_cutover` transaction advisory lock; the bounded cutover takes the exclusive form, waits for in-flight callbacks, performs and verifies the complete ownership backfill/RLS/grant change atomically, and causes new callbacks to wait and process under the committed rule set. Its lock budget must expire and roll back before the webhook request timeout, so a waiting callback is not acknowledged and discarded. Login/read/write/Realtime/webhook smoke tests precede `AUTH_REQUIRED` enablement and UI reopening; provider-message uniqueness remains the deduplication boundary throughout (`ARCHITECTURE-SPINE.md:73–75`). AD-6 separately preserves provider-token authentication and singleton-owner privileged RPCs instead of applying advisor cookies to callbacks (`ARCHITECTURE-SPINE.md:89–93`).

**Divergence challenge:** returning success while discarding a callback, shutting the route during cutover, letting a callback bypass the shared lock, or revoking anonymous compatibility before the privileged dual path is deployed each violates an explicit rule. Both callback arrival orders—before the exclusive lock or while it is held—have one prescribed preserving outcome.

## Full good-spine checklist

| Criterion | Result | Evidence |
| --- | --- | --- |
| Real feature-level divergence points fixed | PASS | AD-1–AD-15 bind module direction, state ownership, mutation paths, provider effects, Push, audit, Auth and deployment. The five requested high-risk seams are closed above. |
| Every AD rule prevents its stated divergence | PASS | Rules are enforceable through database uniqueness, versioned RPCs, compare-and-set versions, lock ordering, write-once fields, RLS/grants and release gates. |
| Deferred items cannot silently fork current implementation | PASS | Corporate automation, browser target, technical-sheet source, retention, escalation, ingress product/RPO/RTO and expansion scope each have a present prohibition/boundary plus a revisit condition (`ARCHITECTURE-SPINE.md:379–394`). |
| Brownfield ratified rather than rewritten | PASS | AD-2 mandates additive migrations and regression checks; existing routes/capabilities remain structural seed, while direct Realtime access is explicitly bounded as a temporary exception. |
| PRD capability coverage | PASS | The capability map accounts for FR-001–FR-037 and NFR concerns; corporate synchronization is safely discovery-gated instead of being prematurely implemented (`ARCHITECTURE-SPINE.md:364–377`). |
| Shared-data ownership and cross-runtime authority | PASS | PostgreSQL/versioned RPCs are the sole mutable policy seam; Next.js and Edge have distinct entrypoint duties and cannot mutate governed tables directly. |
| Security and trust boundaries | PASS | One immutable advisor authority, authenticated RLS, privileged provider/scheduler entry modes, one-use Push capabilities, server-only secrets and payload/log constraints are explicit. |
| Operational/environmental envelope | PASS | Headless Ubuntu deployment, private networking/TLS, immutable production images, isolated environments, feature flags, scheduler monitoring, timing tests, backup/restore and go-live gates are covered by AD-13 and the environment table. |
| Mechanical quality | PASS | `lint_spine.py` reports zero placeholders, duplicate AD IDs, missing Binds/Prevents/Rule sections or version-pin findings. |

## Non-blocking implementation proofs

These are acceptance-test obligations already implied or explicitly required by the spine; they do not reopen architecture decisions:

1. SQL concurrency tests should force both commit orders for action/subscription lifecycle operations and assert one endpoint row, one current delivery/effect identity, no recreation after generation and no terminal-action mutation from late provider results.
2. Effects tests should assert that each resulting `effect_version` has its canonical `EXTERNAL_EFFECT` transition event and that `external_effect_io_started` remains unique per attempt without becoming a substitute for that transition.
3. Provider-adapter tests should use a transport with retries and non-GET redirect replay disabled, inject a post-fence timeout and prove that no second physical request occurs.
4. The Auth cutover rehearsal should inject callbacks before, during and after the exclusive advisory lock and prove that every acknowledged provider message is persisted once under the correct owner.
5. The required real-device and timing gates remain necessary before enabling Push; architectural certification does not claim those selected capabilities are already implemented.

## Final certification

The architecture spine is suitable to move from reviewer gate to finalization. No CRITICAL or HIGH correction remains from this rubric. The document may be finalized after the other configured reviewer lenses, if any, also report no blocking residuals.
