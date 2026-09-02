# LeadFlow production release checklist

This checklist is the operational companion to the BMAD safety spine. It is
not a substitute for CI or migration review.

## Before merge

- [ ] Scope is limited to the requested behavior; no unrelated refactor.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes; pre-existing warnings are identified, not hidden.
- [ ] `bash scripts/ci-contract-checks.sh` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` passes.
- [ ] No credentials, dumps, runtime artifacts or customer data are included.
- [ ] First Contact tests prove message-before-resources, idempotency and
      independent retry behavior when that area changed.

## If a migration changed

- [ ] Migration is new and forward-only; historical migrations were not edited.
- [ ] Target guard identifies the intended Supabase project.
- [ ] Migration preflight (`migration list` + dry-run) passes.
- [ ] Migration is applied through the explicit migration workflow before the
      application version that requires it.
- [ ] Remote migration history is verified after apply.
- [ ] The application rollback plan does not assume the migration is reversed.

## Before production deployment

- [ ] The user explicitly authorized production deployment.
- [ ] Local Docker has been updated and the relevant path was checked locally.
- [ ] Production `/api/health` and `/api/ready` are currently passing.
- [ ] Customer Evolution instance is connected; no QR or logout is needed.
- [ ] Reminder Evolution instance is distinct and connected when enabled.
- [ ] Host clock synchronization is confirmed.
- [ ] Required server env variable names are present; values are never printed.
- [ ] Current known-good image commit and rollback commit are recorded.

## After deployment

- [ ] Immutable image tag matches the intended commit.
- [ ] LeadFlow, Redis, Evolution and Caddy are healthy.
- [ ] `/api/health` = 200.
- [ ] `/api/ready` = 200.
- [ ] HTTPS, login, dashboard, `/sw.js` and the relevant route work.
- [ ] No restart loop, OOM or error spike is present.
- [ ] Customer Evolution remains `open`.
- [ ] Reminder Evolution remains `open` and is not used for customer inbound.
- [ ] Push and E1 remain unchanged from the user's perspective.
- [ ] No real WhatsApp message is sent as a smoke test unless explicitly
      authorized for a controlled recipient.

## If a release fails

1. Stop repeated retries and capture the failure class and image commit.
2. Keep the current persisted effect evidence; do not delete the lead or
   operation to make the UI look clean.
3. If application-only, roll back to the known-good immutable image.
4. If schema/config/provider-related, stop before destructive changes and use
   [`whatsapp-first-contact-runbook.md`](./whatsapp-first-contact-runbook.md).
5. Re-run health/readiness and confirm both Evolution instances before closing.
