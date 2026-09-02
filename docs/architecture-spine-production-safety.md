# LeadFlow production safety spine

This is the focused BMAD architecture spine for the recurring WhatsApp and
First Contact incidents. It fixes only the invariants that independently
built code could otherwise violate.

## AD-001 — E1 owns schedule state

**Binds:** `lead_follow_up_actions` is the only business authority for due,
postponed, completed and ignored follow-ups.

**Prevents:** Push and WhatsApp reminders drifting into separate schedules or
creating duplicate business actions.

**Rule:** Channels materialize independent deliveries from E1 and never mutate
E1 merely because delivery failed.

## AD-002 — First Contact is explicit and effect-based

**Binds:** Lead creation is persistence only. The advisor explicitly starts or
retries First Contact through server actions and E3 RPCs.

**Prevents:** An accidental WhatsApp send during lead creation and provider
calls that have no audit record.

**Rule:** No provider IO is allowed without an identified effect, a claim and
an execution fence.

## AD-003 — Provider outcomes are not UI guesses

**Binds:** The persisted effect result is the source of truth for the UI.

**Prevents:** Showing “sent” when Evolution did not accept the request, or
showing “not available” when the catalog query failed.

**Rule:** `ACCEPTED` requires provider message ID; `FAILED` means a definitive
rejection; `UNKNOWN` means provider/network ambiguity; `NOT_AVAILABLE` means a
successful lookup proved the asset absent.

## AD-004 — Idempotency is per effect, model and resource

**Binds:** The E3 business key, item key, operation version and effect version
identify one external side effect.

**Prevents:** Resending accepted effects and collisions such as
`PHOTO:model-A` versus `PHOTO:model-B`.

**Rule:** Claims are atomic, attempts are numbered, accepted effects are
immutable, and retries target only the requested non-accepted effect.

## AD-005 — Technical failure must remain retryable

**Binds:** Supabase auth, RPC, permissions and catalog errors are technical
failures with sanitized diagnostics.

**Prevents:** Turning a transient database/auth error into permanent business
absence.

**Rule:** A catalog lookup error raises a preparation failure. Only a
successful lookup returning no active asset can produce `NOT_AVAILABLE`.

## AD-006 — Evolution instance identity is explicit

**Binds:** Customer sends use `EVOLUTION_API_INSTANCE_NAME`; advisor reminder
sends use the separately configured reminder instance.

**Prevents:** Internal reminders being sent to customers or a customer session
being disturbed by a second runtime.

**Rule:** Missing or equal/prohibited reminder configuration fails closed. No
browser request may choose an instance or recipient.

## AD-007 — Webhook ingress is instance-filtered

**Binds:** Webhook authentication and instance normalization happen before
lead matching or persistence.

**Prevents:** Reminder WhatsApp messages creating customer `lead_messages`,
mutating leads or generating RESPONSE actions.

**Rule:** Non-customer instance events are ignored safely.

## AD-008 — Readiness is necessary, not sufficient

**Binds:** Health/readiness gates prove process and dependency availability;
functional effect tests prove send-path behavior.

**Prevents:** A green deploy being interpreted as proof that First Contact can
complete.

**Rule:** Release checks must include code contracts, migration alignment,
host clock synchronization and post-deploy health. A real WhatsApp smoke test
requires explicit operator authorization.

## AD-009 — Database and image releases are separate

**Binds:** Forward-only Supabase migrations run through the migration workflow;
application deployment consumes an immutable GHCR image.

**Prevents:** Application/schema drift and unsafe destructive rollback.

**Rule:** Migration preflight precedes migration apply; application rollback
does not reverse database or Evolution state.

## AD-010 — Production changes have a human gate

**Binds:** Local Docker validation is the default feedback loop; production
deploy requires an explicit user instruction.

**Prevents:** An otherwise valid local change changing production without an
operator decision.

**Rule:** This repository may validate and prepare release artifacts locally,
but it does not deploy production implicitly.

## Failure classification

| Class | Meaning | Operator action |
| --- | --- | --- |
| `AUTH/RPC` | JWT, clock, session, grant or RPC contract issue | Check server time, migration alignment and sanitized LeadFlow logs |
| `CATALOG_LOOKUP` | Catalog query failed or returned invalid data | Do not alter assets; retry after dependency recovery |
| `MISSING_RESOURCE` | Successful lookup proved no active photo/sheet exists | Add/repair catalog asset, then retry that item |
| `EVOLUTION_REJECTED` | Evolution definitively rejected provider request | Check instance state, destination and provider response class |
| `UNKNOWN` | IO may have started but outcome is ambiguous | Do not auto-resend; require controlled reconciliation/retry |

## Deferred

- Automated alerting to an external incident channel is not defined here.
- Physical-device delivery confirmation remains a separate QA concern.
- This spine does not authorize schema, DNS, Evolution or production changes.
