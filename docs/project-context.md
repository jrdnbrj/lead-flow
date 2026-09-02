# LeadFlow project context

## Purpose

LeadFlow is a single-advisor CRM for automotive leads. It stores leads and
follow-up actions in Supabase, uses Evolution API for customer WhatsApp, and
uses Web Push plus a separate WhatsApp reminder instance for reminders.

This file is the compact BMAD context for future agents. It records the
runtime boundaries and the production rules that are easy to miss in a
brownfield codebase.

## Runtime topology

```text
Browser/PWA
  -> Caddy HTTPS
  -> LeadFlow Next.js
       -> Supabase Auth/PostgREST/Realtime/Storage
       -> Evolution customer instance (customer conversations)
       -> Evolution reminder instance (advisor reminders only)
  -> Supabase scheduler/Edge Functions for Push and WhatsApp reminders
```

Production runs on AWS Lightsail with Docker Compose. LeadFlow images are
built outside the VPS and pulled from GHCR by immutable Git commit tag. The
VPS must not build the application.

## Ownership and boundaries

| Concern | Authoritative boundary | Must not be bypassed |
| --- | --- | --- |
| Lead ownership | Supabase Auth + RLS/owner RPCs | Browser-controlled user IDs |
| Follow-up schedule | `lead_follow_up_actions` | A second reminder state machine |
| First Contact operation | E3 operation/effect tables and RPCs | Direct provider calls from the browser |
| Customer WhatsApp | `EVOLUTION_API_INSTANCE_NAME` | Reminder instance fallback |
| Advisor reminder WhatsApp | `WHATSAPP_REMINDER_EVOLUTION_INSTANCE` | Customer instance |
| Catalog availability | Successful catalog query | Treating query failure as missing asset |
| Application release | GitHub CI + immutable GHCR image | Building on the VPS |
| Database release | Explicit migration workflow | Blind migration on every app deploy |

## Non-negotiable production invariants

1. Saving a lead never sends WhatsApp. First Contact requires an explicit
   advisor command.
2. E1 remains the only scheduling authority. Push and WhatsApp reminders are
   independent projections of the same action.
3. Every outbound First Contact effect is identified, claimed, fenced and
   recorded. An accepted effect is never resent automatically.
4. `ACCEPTED` requires provider evidence, including a provider message ID.
   `FAILED` and `UNKNOWN` remain visible and recoverable according to the
   current retry contract.
5. `NOT_AVAILABLE` is valid only after a successful catalog lookup proves the
   resource is absent. A database/auth/RPC/query error is a preparation
   failure, never resource absence.
6. First Contact sends the message before resources. Resource/model retries
   are independent and model-scoped.
7. Customer and reminder Evolution instances are distinct. No code path may
   silently fall back from the reminder instance to the customer instance.
8. Evolution webhook events are accepted only from the customer instance;
   reminder-instance events must not create lead messages or RESPONSE actions.
9. `/api/health` proves liveness and `/api/ready` proves dependency readiness;
   neither alone proves that a real First Contact provider send succeeded.
10. Migrations are forward-only and released separately from the application
    image. An app rollback does not roll back Supabase or Evolution data.
11. Production changes require explicit operator authorization. Local Docker
    validation comes before any production deployment.

## Incident lessons encoded here

- A valid-looking UI can still fail before Evolution if Supabase rejects an
  authenticated JWT because the issuing clock is ahead. Host time sync is a
  release precondition.
- Server-only RPC fallback and its `service_role` grants are part of the
  deployed contract, not optional cleanup.
- Catalog resolution must fail closed with a retryable technical error. It
  must never silently manufacture a business-level `NOT_AVAILABLE` result.
- Generic UI errors hide the business state. Logs and persisted effects must
  identify whether the failure was authentication/RPC, catalog preparation,
  provider rejection or an ambiguous provider outcome.

## Change discipline

Before changing First Contact, Evolution, Push or migrations, read:

- [`architecture-spine-production-safety.md`](./architecture-spine-production-safety.md)
- [`whatsapp-first-contact-runbook.md`](./whatsapp-first-contact-runbook.md)
- [`production-release-checklist.md`](./production-release-checklist.md)
- [`PRODUCTION_OPERATIONS.md`](./PRODUCTION_OPERATIONS.md)

Do not infer that a documentation idea is implemented. Verify current code,
migrations and runtime separately.
