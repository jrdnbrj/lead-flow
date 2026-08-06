# Second-Round Adversarial Architecture Review — Independent-Unit Divergence

**Target:** `ARCHITECTURE-SPINE.md`
**Lens:** construct two child units that obey every current rule yet remain incompatible
**Verdict:** **FAIL — do not finalize.** The revision closes the first round's runtime seam, ownership graph, first-contact shape, network exposure and basic Auth cutover sequence. One critical and four high-severity residual holes still permit a stale advisor command to dismiss newer customer work, contradictory settlement of late provider results, incompatible Push click behavior, missed or invalid Push targets, and drift in the single-advisor identity across runtimes.

## Critical finding

### C-1 — Session-authenticated action commands are not bound to the action revision

**Disposition:** Autofix before finalization.

**Evidence:** AD-5 serializes inbound processing and advances response context (`ARCHITECTURE-SPINE.md:79-83`). AD-6 requires compare-and-set transitions but does not state what advisor commands compare (`:85-89`). AD-9 increments `schedule_version` only for schedule or terminal-state changes (`:103-107`). AD-15 binds Push capabilities to that version, but ordinary session-authenticated commands have no equivalent precondition (`:139-143`).

**Constructible incompatible pair:**

- Unit A implements `completeAction(id)` as `UPDATE ... WHERE id = ? AND status IN ('PENDING', 'POSTPONED')`. It is a compare-and-set and idempotent. If a new inbound message has just advanced the same response action, Unit A closes it.
- Unit B requires the version rendered in the advisor's UI and updates only `WHERE id = ? AND action_version = ? AND status IN (...)`. The same race returns `STALE_ACTION`, refreshes the queue and preserves the newer customer work.

Both obey AD-5 and AD-6 as written. They disagree on the meaning of the same advisor click, and Unit A can silently dismiss a message the advisor never saw. The hole also affects `IGNORE` and `POSTPONE`, and remains when the newer message preserves a later postponed deadline: because the schedule does not change, the current `schedule_version` need not advance even though `source_message_id` did.

**Required contract:** replace the schedule-only token with a monotonic action revision, or expand its definition so it increments on every command-relevant change: status, schedule, response `source_message_id`, response preview/context and terminal transition. Every advisor command—session or Push—must carry `expected_action_version`; its RPC compares owner, open state and version atomically. The first terminal transition wins. A mismatched version returns a successful functional `STALE_ACTION` without mutation and forces a fresh read. Push delivery identity and capabilities bind to this same revision.

## High findings

### H-1 — Lease expiry and a late definitive provider result have no single settlement rule

**Disposition:** Autofix before finalization.

**Evidence:** AD-7 says an expired started claim becomes `UNKNOWN`, permits only the listed transitions, and requires the claim token to record a result (`ARCHITECTURE-SPINE.md:91-95`). AD-9 simultaneously says an in-flight result remains evidence (`:103-107`). The spine does not define whether lease expiry is effective at wall-clock expiry or only when a reaper commits, nor whether the original token may reconcile an `UNKNOWN` row.

**Constructible incompatible pair:**

- Unit A's result RPC requires `state = CLAIMED AND now() <= lease_expires_at`. A slow Push call returns a definitive `201` after lease expiry, but Unit A rejects it and the reaper records `UNKNOWN`; only a best-effort event preserves the acceptance.
- Unit B accepts the same token while the row still physically says `CLAIMED`, even after `lease_expires_at`, and commits `ACCEPTED` before the reaper. If the reaper wins first, Unit B stores the late result as separate evidence while leaving the logical effect `UNKNOWN`.

Both can claim compliance with token ownership, no automatic resend and preservation of in-flight evidence. They disagree on the operational source of truth and on whether a known accepted notification remains `UNKNOWN`.

**Required contract:** make attempts immutable and separate them from the logical effect projection. Each claim creates an attempt identified by `(effect_id, attempt_no, claim_token_digest)` with lease, `request_started_at` and result. Lease expiry prevents new I/O but never discards a definitive response from that attempt. The result RPC may settle the matching attempt after expiry; it may move the logical effect from `UNKNOWN` to a definitive terminal result only when no later attempt exists. Define this transition explicitly. Ambiguous late results remain `UNKNOWN`; old tokens can never alter an effect after a newer attempt exists.

### H-2 — Direct Push action transport and post-login behavior remain contradictory

**Disposition:** Autofix before finalization.

**Evidence:** AD-15 requires both a live session and a capability and says an expired session “routes through login before execution” (`ARCHITECTURE-SPINE.md:139-143`). The structural seed names `/api/push/actions` but does not fix method, token transport or what survives login (`:197-227`). The authentication convention's exhaustive public-route wording omits this endpoint (`:159`).

**Constructible incompatible pair:**

- Unit A has the Service Worker send a credentialed `POST` with the capability in the body. On `401`, it opens `/login` and does not execute; the advisor acts from the refreshed PWA.
- Unit B opens a navigable URL containing the capability in a query/return parameter, preserves it across login and automatically executes afterward.

Both mutate only with a current session plus the one-use capability. They conflict on whether one click eventually executes after reauthentication, and Unit B can expose the bearer secret through browser history, request logs or referrers.

**Required contract:** `/api/push/actions` accepts mutation only by same-origin `POST`; the opaque capability is carried in the request body, never a URL, query string, fragment persisted to storage or log field. The Service Worker uses `credentials: include`. A missing/expired session returns `AUTH_REQUIRED`, opens login without carrying the capability and performs no deferred or automatic mutation; after login, the advisor completes the action in the authenticated PWA. `GET` is non-mutating. Define whether `STALE_ACTION`, `EXPIRED_CAPABILITY` and already-consumed replay consume or merely report the token, and return the same functional result on replay.

### H-3 — Push delivery materialization does not cover subscription lifecycle races

**Disposition:** Autofix before finalization.

**Evidence:** AD-9 says scheduling materializes one delivery per active subscription and defines subscription reactivation, but not what happens when a subscription becomes active or inactive after the action was scheduled (`ARCHITECTURE-SPINE.md:103-107`). Its claim rule filters due/open/current-version deliveries, not explicitly active subscriptions.

**Constructible incompatible pair:**

- Unit A snapshots subscriptions only when the action schedule changes. A phone that grants permission or reactivates its endpoint after that transition receives no delivery for the already-open action; a previously materialized delivery remains claimable after the subscription is disabled locally.
- Unit B's subscription-upsert RPC backfills current open action revisions, cancels `READY` rows on deactivation and makes the claim RPC join `push_subscriptions.status = ACTIVE`.

Both keep uniqueness on `(action, version, subscription)` and send only materialized rows, yet they disagree on which device is entitled to the reminder.

**Required contract:** the action-transition RPC materializes current active targets in the same transaction. The subscription activate/reactivate RPC materializes missing deliveries for every still-open current action; already-due rows become immediately due. Deactivate/invalidate/unsubscribe atomically cancel that subscription's `READY` deliveries. Claim and pre-I/O validation require both current action revision and `ACTIVE` subscription. A claim whose subscription became inactive before I/O becomes `CANCELED`; an already-started call records evidence under AD-7 but creates no new work.

### H-4 — The fixed advisor identity can drift between Next.js, Edge and database migrations

**Disposition:** Autofix before finalization.

**Evidence:** AD-3 tells provider and scheduler entrypoints to obtain `ADVISOR_USER_ID` from trusted configuration (`ARCHITECTURE-SPINE.md:67-71`). Those entrypoints run in separate deployment environments, while phase B independently chooses the UUID used for backfill. No invariant establishes one canonical identity record or a readiness assertion across all three.

**Constructible incompatible pair:**

- Unit A treats the Ubuntu `ADVISOR_USER_ID` environment variable as authoritative for Evolution webhook RPC calls.
- Unit B treats an Edge Function secret as authoritative for scheduled work, while the migration uses the UUID manually supplied at deployment.

All three values are trusted rather than request-controlled, so all units obey AD-3. A typo or partial rotation can nevertheless attribute webhook work to a different Auth UUID, produce scheduler no-ops or fail ownership checks only after production traffic arrives.

**Required contract:** store the sole pilot advisor UUID once in a database-owned singleton configuration established and asserted by the Auth migration. Privileged provider/scheduler RPCs derive it internally and do not accept an owner parameter. `requireAdvisor()` compares `auth.uid()` with that singleton. If an environment copy is retained as a deployment assertion, `/api/ready`, the Edge startup path and the migration must fail closed when it differs; it is never an independent authority.

## Medium findings

### M-1 — The next-action projection is nondeterministic on equal timestamps

**Disposition:** Autofix.

**Evidence:** AD-4 defines `leads.next_action_*` as the earliest open action but provides no total ordering (`ARCHITECTURE-SPINE.md:73-77`).

**Constructible incompatible pair:** Unit A breaks ties by `created_at, id`; Unit B prioritizes `RESPONSE` over a manual action. Both project the earliest timestamp, but the dashboard displays different action types for the same persisted state.

**Required contract:** define one total order in the projection RPC/trigger, for example `(scheduled_for ASC, created_at ASC, id ASC)`, or explicitly adopt a type priority before those stable tie-breakers. All reads use that stored projection/order contract rather than re-sorting independently.

### M-2 — Event idempotency is represented but not enforced

**Disposition:** Autofix.

**Evidence:** AD-10 includes nullable `idempotency_key` and a closed event registry but no uniqueness rule (`ARCHITECTURE-SPINE.md:109-113`).

**Constructible incompatible pair:** Unit A inserts one product event per successful logical transition using `ON CONFLICT`; Unit B appends the same canonical event again whenever an idempotent command or effect result is replayed. Both preserve append-only history and use the same key, but success metrics diverge.

**Required contract:** the event registry must assign each event either a deterministic logical `event_key` with a unique constraint or explicit attempt semantics. Transition events are unique per `(event_type, aggregate_id, aggregate_version)`; attempt events include `attempt_no`. Replays return the existing event identity. Correlation IDs remain non-unique tracing values.

### M-3 — Secret storage and rotation on the Ubuntu host have two allowed authorities

**Disposition:** Decide or move explicitly to Deferred with a go-live gate.

**Evidence:** AD-12 allows server-only storage “or” Supabase Vault, while AD-13 requires a rollback runbook without selecting the host secret source, file permissions, rotation ownership or restart behavior (`ARCHITECTURE-SPINE.md:121-131`).

**Constructible incompatible pair:** Unit A injects root-readable Compose environment files during deployment; Unit B fetches secrets from a remote vault at startup. Both keep secrets out of the browser and image, but their backup, rotation and outage behavior are incompatible.

**Required contract:** choose one production secret authority per runtime and define the injection boundary. A minimal compatible choice is root-owned `0600` host secret files injected into Compose for Next.js/Evolution, and Supabase project secrets/Vault for Edge/Cron; secrets never enter Git, image layers or Compose manifests. Rotation is replace-secret, restart one dependent service, verify readiness, then revoke old material. If another manager is desired, defer the product but retain this interface and go-live gate.

## First-round regression matrix

| First-round class | Round-two result | Residual |
| --- | --- | --- |
| Push authorization contract | **Partial** | Dual session + capability is fixed; transport and post-login execution remain open (H-2). |
| Claims, leases and `UNKNOWN` | **Partial** | Pre-I/O versus uncertain retry is fixed; lease-expiry/late-result settlement remains open (H-1). |
| Inbound ordering and postpone precedence | **Partial** | Provider order and postpone precedence are fixed; stale advisor commands are not revision-bound (C-1). |
| Push schedule identity | **Partial** | Immutable action revision identity is fixed for Push; subscription activation/invalidation races remain open (H-3). |
| Next.js versus Edge mutation authority | **Closed** | Versioned PostgreSQL RPCs are the singular cross-runtime state-policy seam. |
| Private ownership graph | **Partial** | Table ownership paths are fixed; the sole advisor UUID still has multiple configuration authorities (H-4). |
| First-contact aggregate/items/messages | **Closed** | Requested items, unavailable resources, provider messages and aggregate projection have singular owners. |
| Auth/RLS cutover order and webhook survival | **Closed for sequencing** | Two-phase maintenance/fix-forward cutover is explicit; canonical advisor identity still needs H-4. |
| Exact date/time scheduling | **Closed** | UTC instants, `America/Guayaquil`, date+time and response shortcuts are explicit. |
| Local/production isolation | **Closed** | Data, effects and migration-first environment behavior are explicit. |
| Ubuntu networking/public exposure | **Closed** | Public ports, Compose DNS and private Evolution/Redis boundaries are explicit. |
| Current SSR Auth/key conventions | **Closed** | `proxy.ts`, `getClaims()`, publishable/secret precedence and no-public-signup are explicit. |
| Event vocabulary/versioning | **Partial** | Names and payload schemas are fixed; logical event uniqueness remains open (M-2). |
| Deployment release pins and selected additions | **Closed for release identity** | OCI pinning and selected-versus-existing status are explicit; host secret authority remains open (M-3). |

## Gate result

The spine must remain `draft`. Resolve C-1 and H-1 through H-4 before finalization; they are not safe Deferred items because the first implementation units would otherwise encode incompatible mutation and effect semantics. M-1 and M-2 are deterministic autofixes. M-3 may be decided now or moved to Deferred only with an explicit deployment-story go-live gate. Then rerun lint and the full configured gate, with direct race tests for inbound-versus-command, lease-reaper-versus-late-result, subscription-upsert-versus-dispatch and Next/Edge advisor identity.
