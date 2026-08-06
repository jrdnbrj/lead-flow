# Final adversarial divergence certification

## Verdict

**FAIL — 0 critical, 6 high residual holes.** The spine is materially stronger and its broad boundaries converge, but it still permits independently built child units to satisfy every stated AD while disagreeing on shared effect ownership, beginning external I/O, Push materialization under concurrency, notification-command transport, event versioning, and advisor-identity replacement. Those disagreements can produce duplicate sends, missed notifications, unusable direct actions, lost audit transitions, or split ownership.

The spine must remain `status: draft` until the six high findings below are closed and the adversarial gate is rerun.

## Review method

This review was performed from the spine itself, without using earlier review conclusions. For each shared boundary, it attempted to construct two child units that:

1. obey every applicable `AD` literally;
2. make a locally reasonable choice left open by the spine; and
3. become incompatible when merged or when their transactions interleave.

The tested surfaces were ownership, data shape, mutation/versioning, out-of-order and late effects, subscription lifecycle, Push commands, the Node/Deno runtime seam, and production deployment.

## High findings

### H1 — No single owner or canonical relational shape exists for the AD-7 effect ledger

**Evidence:** `ARCHITECTURE-SPINE.md:89`, `ARCHITECTURE-SPINE.md:95`, `ARCHITECTURE-SPINE.md:101`, `ARCHITECTURE-SPINE.md:107`, and the structural ERD at `ARCHITECTURE-SPINE.md:269-287`.

**Two compliant child units:**

- The WhatsApp unit creates shared `external_effects` and `external_effect_attempts` tables, makes `lead_contact_operation_items.effect_id` a foreign key, and implements generic `claim_effect_v1` / `record_effect_result_v1` RPCs.
- The Push unit treats each `push_deliveries` row as the logical effect, creates `push_delivery_attempts`, and implements provider-specific `claim_push_delivery_v1` / `record_push_delivery_result_v1` RPCs. It still persists one logical row before I/O, uses every AD-7 state, and exposes the delivery RPCs required by AD-6.

Both obey the text, but they disagree about the owner of effect state, attempt identity, cancellation, reconciliation, and generic claim/reap contracts. The ERD omits both a canonical external-effect aggregate and attempt relation, while AD-8 says an item stores AD-7 state and AD-9 gives deliveries their own lifecycle. A later corporate adapter could choose a third shape.

**Impact:** incompatible migrations/RPC signatures, duplicate state projections, and no unique place from which to enforce or test AD-7 uniformly across providers.

**Required closure:** select exactly one model. Either define a shared `external_effects` + immutable `external_effect_attempts` aggregate owned by one capability, with provider resources referencing it, or explicitly declare each provider resource to be its own effect aggregate and define a mandatory common RPC/state contract that does not presume one shared table. Name the owner, required keys, source-resource relationship, and cancellation/reconciliation authority.

### H2 — A reclaimed attempt can race an old worker into duplicate provider I/O

**Evidence:** `ARCHITECTURE-SPINE.md:95` defines claim and reap behavior but does not define an atomic begin-I/O transition guarded by the current claim token, current attempt number, logical state, and unexpired lease. AD-9's “immediate pre-I/O validation” at line 107 checks business freshness but does not require that claim guard for every provider.

**Compliant interleaving:**

1. Worker A claims attempt 1; `request_started_at` is null.
2. Its lease expires while A is paused.
3. The reaper sees no request start and makes the effect retryable; worker B claims attempt 2.
4. A resumes, records `request_started_at` or simply begins the request, and sends.
5. B also begins attempt 2 and sends.

One worker implementation can treat a matching historical token as sufficient because AD-7 explicitly permits the original worker to append evidence after lease expiry. Another can correctly reclaim an expired, apparently unstarted attempt. Nothing says a worker that lost current ownership is forbidden from beginning I/O, or gives it a required atomic RPC whose failure forbids the send.

**Impact:** duplicate WhatsApp or Push effects despite AD-7's stated prevention goal.

**Required closure:** require a `begin_effect_attempt` compare-and-set immediately before network I/O. It must atomically verify logical state `CLAIMED`, latest `attempt_no`, matching claim-token digest, unexpired lease, and null `request_started_at`, then set `request_started_at`. Failure is a hard prohibition on provider I/O. Late result recording may remain allowed after a successful begin, including after lease expiry. Apply this protocol to every adapter, not only Push.

### H3 — Action transitions and subscription changes can commit without a current Push delivery

**Evidence:** `ARCHITECTURE-SPINE.md:107` requires each action transition and each subscription-generation change to materialize the cross-product atomically inside its own RPC, but defines no shared serialization key, lock order, serializable retry rule, or repair invariant between those two RPC families.

**Compliant write-skew:**

1. Transaction A changes action version 1 to version 2 and reads subscriptions before transaction B's reactivation is visible, so it materializes no version-2 delivery for generation 2.
2. Concurrent transaction B reactivates the subscription to generation 2 and reads the action before A commits, so it materializes a version-1/generation-2 delivery.
3. Depending on statement order, A's cancellation does not see B's uncommitted version-1 row. Both transactions commit.
4. Pre-I/O validation later cancels the stale version-1 delivery, but no current version-2/generation-2 delivery exists.

Both child units performed their required local transaction and unique insert. The unique key prevents duplicates, not a missing cross-product row.

**Impact:** a due action can permanently miss Push after a concurrent subscription activation, reactivation, or key rotation.

**Required closure:** prescribe one concurrency protocol shared by action-transition and subscription-generation RPCs: for example, acquire the same transaction-scoped advisory lock keyed by singleton owner before either family reads or mutates, use one fixed row-lock order, then upsert the complete current action × active-generation postcondition. Add an idempotent reconciliation RPC/job and an invariant test that forces both commit orders.

### H4 — AD-15's capability handoff is not implementable literally across Service Worker restarts

**Evidence:** `ARCHITECTURE-SPINE.md:177` requires the Service Worker to receive the capability in the encrypted Push payload and later send it only in a POST body, while forbidding the capability in “browser storage.” It does not define when capabilities are created, their expiry relative to send time, or the closed command vocabulary and arguments for `POSTPONE`.

Persistent notifications survive an idle Service Worker. The Service Workers specification permits the user agent to terminate an idle worker, and the Notifications standard persists a notification's `data` using `StructuredSerializeForStorage` so it can be recovered for `notificationclick`. See [Service Worker lifetime](https://www.w3.org/TR/service-workers/#service-worker-lifetime) and [Notifications data/lifetime](https://notifications.spec.whatwg.org/#ref-for-dom-notificationoptions-data%E2%91%A0).

**Two incompatible implementations:**

- The Service Worker stores the opaque capability in `Notification.data`, so a later `notificationclick` works after worker restart; this conflicts with a literal ban on browser storage.
- The Service Worker keeps the capability only in memory to obey the ban; after termination it cannot execute the direct action and must fall back to opening the PWA.

A separate pair can create capabilities when future deliveries are materialized, causing them to expire before send, or create them while claiming a due delivery, producing a different payload and retry contract. `command` can likewise mean generic `POSTPONE`, `PLUS_ONE_HOUR`, or `TOMORROW`, all consistent with different portions of the spine.

**Impact:** direct notification actions can be unreliable or impossible, and server, Edge, and Service Worker units can disagree on token count, payload schema, expiry, and command semantics.

**Required closure:** explicitly permit or reject `Notification.data` as the durable handoff. If permitted, scope the exception to opaque, short-lived, one-use capabilities and continue forbidding URLs, logs, localStorage, IndexedDB, and Cache Storage. Define capability creation/expiry relative to delivery preparation or provider acceptance, one capability per exact command, the closed command enum and arguments (`DONE`, `IGNORE`, `POSTPONE_PLUS_ONE_HOUR`, `POSTPONE_TOMORROW` or another explicit set), and retry behavior for a delivery whose payload was already sealed.

### H5 — Transition event keys depend on aggregate versions that several aggregates do not own

**Evidence:** `ARCHITECTURE-SPINE.md:113` mandates transition keys `(event_type, aggregate_id, aggregate_version)`. The registry classifies `first_contact_result`, `push_service_result`, `external_effect_retry_scheduled`, `external_effect_canceled`, and `external_effect_reconciled` as transitions at lines 130-143. AD-7 defines `attempt_no` but no monotonic `effect_version`; AD-8 defines a changing operation projection but no `operation_version`; AD-9 uses `action_version` for delivery identity but does not define a delivery-state version.

**Two compliant child units:**

- One uses `action_version` as `aggregate_version` for all Push delivery outcomes. `UNKNOWN` followed by reconciled `ACCEPTED` for the same action version collides with the first `push_service_result` key.
- Another adds an internal `delivery_version` and a third uses `(attempt_no, stage)` despite the registry class being `TRANSITION`. Equivalent divergence exists for successive item outcomes changing a first-contact operation projection.

All can claim to construct the required tuple, because the spine never maps each transition event to its aggregate or version source.

**Impact:** later definitive outcomes may be suppressed as duplicates, or event keys and metrics differ by capability implementation, defeating the canonical registry and atomic audit contract.

**Required closure:** give every mutable event-owning aggregate a monotonic version and map each `TRANSITION` event type to an exact aggregate ID and exact version column. State which RPC increments that version and appends the event in the same transaction. If a provider result is evidence rather than an aggregate transition, classify and key it consistently as an attempt/fact instead.

### H6 — The singleton advisor can be changed independently of direct ownership roots

**Evidence:** `ARCHITECTURE-SPINE.md:71` makes `leadflow_installation.advisor_user_id` the sole identity authority while also keeping `user_id` on four direct ownership roots. The cutover sequence is specified, but no invariant makes the singleton immutable afterward or defines account replacement.

**Two compliant child units after an administrative account change:**

- Auth and privileged webhook code immediately trust the updated singleton and create new rows for advisor B.
- Existing RLS and repositories continue enforcing the persisted `user_id` of advisor A on historical roots.

Both follow AD-3's declared authority graph. The database now contains two owner populations, `requireAdvisor()` rejects A, B cannot see A's rows, and the webhook can write a new disconnected population. A fail-closed environment assertion does not protect an in-database singleton update.

**Impact:** account replacement or accidental administrative mutation can split ownership and make proven data inaccessible.

**Required closure:** make the singleton immutable after Phase B through revoked direct update privileges and a database guard. Define account replacement as a maintenance-only, auditable transaction that validates the new Auth user, locks the installation, updates every direct ownership root, asserts zero mismatches, changes the singleton last, and invalidates old sessions; otherwise explicitly defer replacement and require fix-forward restoration of the original UUID.

## Surfaces that converged

- Action/source optimistic concurrency now blocks stale advisor commands from dismissing newer inbound context.
- Late definitive results for the latest already-started attempt can reconcile `UNKNOWN`, while ambiguous outcomes remain non-retryable.
- Provider and scheduler entrypoints have distinct trust modes; mutable cross-runtime policy is correctly centered in PostgreSQL RPCs rather than copied between Node and Deno.
- Production is explicitly headless, TLS-only, private-networked, digest-pinned, environment-isolated, and gated by operational evidence. The choice of ingress product is safely deferred because its required boundary and release checks are fixed.
- Corporate automation is properly discovery-gated and does not bind Playwright or production credentials prematurely.

## Certification condition

Close H1-H6 in enforceable Rules, preserve stable AD IDs, rerun deterministic lint, and repeat the independent adversarial/rubric/technology gate. Until then, do not mark the spine final.
