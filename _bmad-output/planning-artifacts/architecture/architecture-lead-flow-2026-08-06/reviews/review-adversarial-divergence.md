# Adversarial Architecture Review — Independent-Unit Divergence

**Target:** `ARCHITECTURE-SPINE.md`
**Lens:** construct two implementation units one level down that obey every current AD yet remain incompatible
**Verdict:** **FAIL — do not finalize.** The spine is directionally strong, but two critical and six high-severity divergence holes still permit duplicate external effects, contradictory authorization, incompatible shared state, or unsafe brownfield cutover.

## Critical findings

### C-1 — Direct Push commands have two contradictory authorization contracts

**Disposition:** Autofix before finalization.

**Evidence:** AD-6 requires interactive mutations to enter through authenticated Server Actions or Route Handlers (`ARCHITECTURE-SPINE.md:83-87`), while AD-9 permits a one-use capability from a notification (`:101-105`). AD-3/AD-12 allow service-role access but do not define its row scope (`:65-69`, `:119-123`).

**Constructible incompatible pair:**

- Unit A implements `/api/push/actions` as a normal authenticated route and rejects a notification click when the Supabase session cookie has expired.
- Unit B treats the capability as bearer authorization, accepts the request without a Supabase session, and uses the service role to update any action named by the token payload.

Both can claim literal compliance: A follows AD-6/AD-12; B follows AD-9 and keeps the service role server-side. They disagree on the public contract and B can become an object-authorization vulnerability if token contents or action IDs are trusted.

**Exact enforceable wording:** add a dedicated AD:

> **Rule:** Direct notification commands are a separate capability-authenticated mutation path, not a session-authenticated interactive path. The URL carries an opaque random secret of at least 128 bits; PostgreSQL stores only its digest. The stored capability is bound to exactly one `user_id`, `follow_up_action_id`, `push_delivery_id`, action command, action schedule version, and expiry. A single security-definer RPC validates the digest, expiry, ownership, command, current action version and unused state, then atomically consumes the capability, performs the idempotent transition and appends its event. The Route Handler may not use a request-supplied entity ID or general service-role table mutation. Evolution webhook and scheduler credentials are separate principals and cannot invoke this RPC. Session-authenticated commands continue to use `auth.uid()` and RLS.

Also amend AD-6 from “interactive mutations” to explicitly enumerate **session-authenticated commands**, **capability-authenticated Push commands**, **provider-authenticated webhooks**, and **scheduler-authenticated jobs**.

### C-2 — AD-7 has no claim lease or unknown-outcome retry protocol

**Disposition:** Autofix before finalization.

**Evidence:** AD-7 requires a “claimable state” and reuse of an idempotency key but does not define claim ownership, lease expiry, request-start boundary, or which outcomes may retry (`:89-93`). A local unique key cannot make an external provider exactly-once.

**Constructible incompatible pair:**

- Unit A resets every expired `CLAIMED` row to `READY` and sends again, including after a worker died immediately after Evolution or the Push service accepted the request.
- Unit B marks every expired claim `UNKNOWN` and never retries, including when the worker died before any network request began.

Both persist first, claim before calling, and reuse the key. A can duplicate WhatsApp/Push; B can permanently suppress effects that were never attempted.

**Exact enforceable wording:** tighten AD-7:

> **Rule:** Every effect row follows `READY -> CLAIMED -> ACCEPTED | REJECTED_TERMINAL | RETRYABLE | UNKNOWN | CANCELED`. Claiming is a database compare-and-set that writes an unguessable `claim_token`, `claimed_by`, `lease_expires_at`, and incremented `attempt_no`; only that token may record the result. The worker records `request_started_at` immediately before provider I/O. An expired claim with no `request_started_at` may return to `READY`; an expired claim after request start becomes `UNKNOWN`. `UNKNOWN` is never retried automatically unless the provider accepts the same idempotency key or exposes a reliable query-by-key that proves no effect occurred. Every claim, result, retry decision and matching audit event commits through one RPC. No provider adapter may implement its own retry-state interpretation.

## High findings

### H-1 — Response-action convergence does not define event ordering or postponement precedence

**Disposition:** Discuss the product precedence, then autofix the AD.

**Evidence:** AD-5 says “latest inbound message” and sets the deadline one hour after it, but does not define latest, concurrent serialization, or what happens when a newer inbound message arrives after the advisor postponed the open action (`:77-81`). The current webhook processes batched items sequentially and falls back to ingestion time when the provider timestamp is absent (`app/api/webhooks/evolution/route.ts:72-81`, `:117-140`).

**Constructible incompatible pair:**

- Unit A orders messages by database arrival time and resets a `POSTPONED` action to message time plus one hour.
- Unit B orders by provider timestamp and preserves the advisor's postponed deadline while only updating the preview.

Both keep one open response action, deduplicate provider IDs and preserve unrelated actions. They produce different queue order, alert time and latest-message context under delayed/out-of-order webhooks.

**Exact enforceable wording:** amend AD-5 after confirming precedence:

> **Rule:** One RPC serializes inbound processing per lead. Provider-message identity is `(provider_instance_id, provider_message_id)`. “Latest” is the maximum `(provider_occurred_at, provider_message_id)` tuple; ingestion time is stored separately and is used as the occurred time only when the provider omits or supplies an invalid timestamp. An older replay may fill missing message data but may not regress `last_customer_message_*`, the response action's `source_message_id`, or its deadline. For a `PENDING` response action, a newer message sets `scheduled_for = provider_occurred_at + 1 hour`. For a `POSTPONED` response action, choose and state one rule explicitly: preserve the advisor deadline, or set it to `greatest(current scheduled_for, provider_occurred_at + 1 hour)`. The RPC returns whether the message, context and schedule were inserted, advanced or deduplicated.

### H-2 — Push identity is tied to a mutable timestamp, not an action revision

**Disposition:** Autofix before finalization.

**Evidence:** AD-9 identifies a delivery by `(follow_up_action_id, scheduled_for, subscription_id)` (`:101-105`), while postponing mutates `scheduled_for`. No AD defines cancellation of old claimed deliveries or the validity of commands from stale notifications.

**Constructible incompatible pair:**

- Unit A creates a new delivery for the new timestamp and leaves the old claimed delivery sendable; both notifications can appear.
- Unit B updates the existing delivery's timestamp in place; its idempotency identity changes and prior audit/event references no longer describe the sent occurrence.

Both can satisfy the current tuple and AD-7, but they conflict on history and can violate FR-022/FR-024.

**Exact enforceable wording:** replace the timestamp identity with an immutable revision:

> **Rule:** Every follow-up action has a monotonically increasing `schedule_version`, incremented atomically on every schedule or terminal-status transition. A logical Push delivery is unique on `(follow_up_action_id, schedule_version, subscription_id)` and stores an immutable `scheduled_for_snapshot`. The same transition cancels all `READY` deliveries for prior versions. The claim RPC returns only open, due, current-version deliveries; a claimed delivery found stale before provider I/O becomes `CANCELED`. Notification capabilities carry the same version, and a command from a stale version returns a successful idempotent `STALE_ACTION` outcome without mutating the current action. A provider call already in flight may finish as evidence, but cannot reopen or close the newer action version.

### H-3 — The Next.js and Edge Function runtimes have no single enforceable policy seam

**Disposition:** Autofix before finalization.

**Evidence:** The dependency diagram says the Edge Function calls capability use cases (`:37-48`), but the structural seed places those use cases under Next.js `lib/push` and the Edge Function under `supabase/functions` (`:177-198`). AD-6 says both must delegate to the same use case without specifying a cross-runtime package or database contract.

**Constructible incompatible pair:**

- Unit A imports or copies TypeScript policy from `lib/push` into the Supabase Edge runtime.
- Unit B bypasses it and directly mutates `push_deliveries` from the Edge Function, while Next.js uses repository methods.

Both appear to follow the diagram, but claim eligibility, transitions and event emission can drift between runtimes.

**Exact enforceable wording:** tighten AD-1/AD-6:

> **Rule:** Stateful policy shared by Next.js and Supabase Edge Functions lives in versioned PostgreSQL RPC contracts. At minimum, claim-due-deliveries, record-delivery-result and consume-notification-command are database functions that own compare-and-set validation, ownership checks and same-commit events. `lib/push` and `supabase/functions/dispatch-push` both call those RPCs and may not write governed tables directly. The Edge Function owns only bounded orchestration and provider I/O; it does not duplicate action or retry policy. Database-function signatures and returned status codes are the cross-runtime contract and change additively.

### H-4 — Private-row ownership is stated, but the ownership graph is not fixed

**Disposition:** Autofix before finalization.

**Evidence:** AD-3 allows ownership “directly or transitively” without selecting one path per table (`:65-69`). The ERD shows some links but not operation items or the ownership consistency required between a Push subscription and action (`:201-215`). Events may have neither lead nor action under the AD-10 envelope (`:107-111`).

**Constructible incompatible pair:**

- Unit A adds `user_id` to every table and treats it as authoritative.
- Unit B derives ownership through `lead_id`/`follow_up_action_id`, except standalone events and subscriptions; a mixed deployment permits duplicated or contradictory owner values.

Both satisfy “directly or transitively.” They cannot share RLS, insert contracts or reassignment behavior, and a delivery could pair one advisor's subscription with another advisor's action in a future expansion.

**Exact enforceable wording:** add an ownership-map AD:

> **Rule:** `leads.user_id` and `push_subscriptions.user_id` are direct ownership roots. `lead_messages`, `lead_follow_up_actions`, `lead_contact_operations`, operation items and `lead_milestones` derive ownership only through their required `lead_id`; they do not duplicate `user_id`. `push_deliveries` derives through both its required action and subscription, and a constraint/RPC must prove both resolve to the same owner before insert or claim. `leadflow_events` always stores required `user_id`; when it references a lead/action/delivery, the event writer RPC verifies the same owner. Every private table enables RLS; authenticated policies follow this exact graph. Service-principal entrypoints receive their owner from trusted server configuration or credential mapping, never from request JSON.

### H-5 — First-contact aggregate and resource-result shapes are still incompatible

**Disposition:** Autofix before finalization.

**Evidence:** AD-4 assigns execution ownership to `lead_contact_operations` and provider status to `lead_messages`; AD-8 says child messages record text and each available resource, but missing resources must also be reported (`:71-75`, `:95-99`). The ERD models at most one contact operation per lead even though uniqueness is per operation type (`:203-210`).

**Constructible incompatible pair:**

- Unit A stores requested resources and partial outcomes as JSON on `lead_contact_operations`, creating `lead_messages` only for accepted sends.
- Unit B creates placeholder `lead_messages` with `UNAVAILABLE`/`FAILED` statuses for resources never sent and derives operation status from those rows.

Both fit the words “child `lead_messages` rows record” yet disagree on what a message means, status vocabulary and source of aggregate truth.

**Exact enforceable wording:** tighten AD-8 and the ERD:

> **Rule:** `lead_contact_operations` is the aggregate root and is unique on `(lead_id, operation_type)`. `lead_contact_operation_items` owns the immutable requested-resource snapshot and one row per stable `item_key` (`TEXT`, `PHOTO:<asset_id>`, `TECH_SHEET:<asset_version>`), unique within the operation. Each item records availability and effect state; unavailable resources never create fake provider messages. An actual provider send creates or links exactly one `lead_messages` row through `lead_message_id`; that message alone owns provider acknowledgement/delivery/read status. The operation's aggregate result is a database-maintained projection of item states. Change the ERD to `LEAD ||--o{ LEAD_CONTACT_OPERATION`, then add operation-to-items and optional item-to-message relationships.

### H-6 — The authentication migration has no executable zero-downtime or fail-safe cutover

**Disposition:** Autofix before finalization.

**Evidence:** AD-2 requires compatibility and verification (`:59-63`); AD-3 removes anonymous policies in a “controlled rollout” (`:65-69`); AD-13 requires rollback and smoke checks (`:125-129`). The current app still intentionally reads/writes `user_id is null` when there is no session (`lib/leads/repository.ts:124-130`, `:169-176`, `:198-204`, `:222-228`), and current migrations grant anonymous access.

**Constructible incompatible pair:**

- Unit A deploys login-required code first; existing anonymous rows disappear until backfill.
- Unit B applies the migration first; the current production UI loses access before the login path is live.

Both follow additive migration and eventually remove anonymous access, but either sequence can break proven behavior.

**Exact enforceable wording:** append to AD-3/AD-13:

> **Rule:** Authentication is a coordinated cutover: (1) create and verify the designated advisor Auth UUID; (2) deploy login/session UI and auth-aware server code behind `AUTH_REQUIRED=false`; (3) enter write maintenance; (4) in one migration transaction backfill all ownership roots, assert zero null/orphan/mismatched private rows, install authenticated RLS and revoke private anonymous grants; (5) set `AUTH_REQUIRED=true`, refresh generated database types, smoke-test login, one read, one reversible write, Realtime and the provider webhook; then reopen writes. A failed security cutover remains in maintenance and rolls application code forward/fixes forward; it must never restore public private-data policies as an automatic rollback.

## Medium findings

### M-1 — Event names and payload versions are not a stable shared contract

**Disposition:** Autofix.

**Evidence:** AD-10 fixes the envelope but not controlled values or payload versioning (`:107-111`). The PRD defines concrete event names and minimum payloads (`prd.md:144-164`).

**Constructible incompatible pair:** one unit emits `next_action_done` with `result="manual"`; another emits `action_completed` with `source="manual"`. Both fit the envelope, but success metrics and audit queries split silently.

**Exact enforceable wording:**

> **Rule:** `event_type` uses the PRD's canonical snake-case vocabulary; `source` and `result` use centrally defined controlled values. Add required `schema_version smallint` defaulting to `1`. Each event type has one versioned payload schema containing at least the PRD minimum fields. Producers may add nullable payload fields within a version but may not rename/retype/remove fields or mint synonyms; breaking changes add a schema version and dual-read migration.

### M-2 — Public network exposure is not an invariant

**Disposition:** Autofix.

**Evidence:** AD-13 requires HTTPS ingress but does not say which services are public (`:125-129`). Current Compose publishes Next.js on all interfaces and Evolution only on loopback; Redis is internal (`docker-compose.yml:1-21`, `:23-32`, `:67-80`).

**Constructible incompatible pair:** Unit A publishes Evolution's API/QR endpoint through the HTTPS proxy; Unit B exposes only Next.js and keeps Evolution/Redis private. Both have HTTPS ingress and encrypted secrets, but their attack surfaces are incompatible.

**Exact enforceable wording:**

> **Rule:** The Ubuntu host exposes only TCP 443 (and administratively restricted SSH). HTTPS ingress routes public application/webhook traffic only to Next.js. Next.js, Evolution API and Redis communicate on a private Compose network; Evolution and Redis must not bind a public host interface or be routed by the public ingress. Any temporary Evolution administration access uses an authenticated SSH tunnel or an explicitly time-bounded private channel. Supabase outbound connections use TLS.

## Gate result

The spine should not be marked `final` until C-1 and C-2 are resolved and the six high findings are incorporated or explicitly decided. M-1 and M-2 are safe autofixes. After amendment, rerun the deterministic lint and this divergence lens, with special attention to whether the chosen response-postponement rule and capability-token contract are now singular and testable.
