# First Contact / WhatsApp incident runbook

Use this runbook when the dashboard says First Contact cannot be prepared,
when a message is not sent, or when a photo/ficha appears unavailable.

The runbook is intentionally non-destructive. Do not logout, delete an
Evolution instance, delete session volumes, re-pair WhatsApp or restore a
database as a first response.

## 1. Classify the symptom

| Dashboard symptom | Most likely boundary | Do not conclude yet |
| --- | --- | --- |
| “No pudimos preparar el primer contacto” | Supabase Auth/RPC or catalog preparation | That Evolution rejected the send |
| Message `FAILED` | Provider request was definitively rejected | That photos/sheets should be marked absent |
| Message `UNKNOWN` | Network/provider outcome is ambiguous | That it is safe to resend automatically |
| Photo/sheet `No disponible aún` | Resource was unavailable at operation creation or awaits recovery | That the file does not exist unless lookup was successful |
| App loads but send fails after a release | Schema/grant/JWT/config drift | That server capacity is the cause |

## 2. Safe production checks

Run from the operator machine, without printing environment files or tokens:

```sh
curl -fsS https://leadflow.jrdnbrj.com/api/health
curl -fsS https://leadflow.jrdnbrj.com/api/ready
```

On the production VPS, inspect only status and recent sanitized logs:

```sh
docker compose -p leadflow-production -f /opt/leadflow/docker-compose.production.yml ps
docker compose -p leadflow-production -f /opt/leadflow/docker-compose.production.yml logs --since=15m --tail=200 leadflow
docker compose -p leadflow-production -f /opt/leadflow/docker-compose.production.yml logs --since=15m --tail=200 evolution-api
```

Check the host clock because Supabase rejects JWTs whose issued time appears
to be in the future:

```sh
date -u
timedatectl show --property=NTPSynchronized --value
timedatectl show --property=TimeUSec --value
```

If time synchronization is not confirmed, stop the release investigation and
repair host time before retrying authenticated operations. Do not work around
this by weakening JWT validation.

## 3. Read the evidence in order

1. Check `/api/health` and `/api/ready`.
2. Check container health, restart count, OOM and the image commit.
3. Search LeadFlow logs for the sanitized boundary marker:
   `first-contact`, `catalog`, `AUTH_REQUIRED`, `FIRST_CONTACT_CATALOG_LOOKUP_FAILED`
   or `invalid RPC response`.
4. Check Evolution connection state for the customer instance. Do not send a
   synthetic WhatsApp message as a readiness probe.
5. Check migration alignment with the approved migration workflow. Do not run
   `db push` from an incident shell without explicit authorization.
6. Only after the preparation boundary is healthy, inspect the persisted E3
   item result and retry the specific failed/recoverable item.

## 4. Recovery rules

- `AUTH/RPC` or `CATALOG_LOOKUP`: repair the dependency/configuration, then
  retry. Never convert the error into `NOT_AVAILABLE` manually.
- `MISSING_RESOURCE`: add or repair the catalog asset, then use the existing
  resource recovery/retry path. Do not recreate the lead just to obtain a new
  operation.
- `FAILED`: retry only the failed effect or the explicit top-level action,
  respecting the current idempotency contract.
- `UNKNOWN`: do not create an automatic loop. Reconcile provider evidence or
  make a controlled advisor-approved retry.
- `ACCEPTED`: never resend automatically, even if the dashboard is refreshed.
- Existing operations are not expanded automatically after a catalog change.

## 5. What to record in an incident

Record these non-secret fields:

- Ecuador local date/time (`America/Guayaquil`) and UTC timestamp;
- production image commit;
- `/api/health` and `/api/ready` results;
- container health/restart/OOM status;
- failure class;
- lead ID and operation/effect IDs only in the private incident system;
- action/resource kind and operation/effect versions;
- provider status and provider message ID when available;
- whether a retry was made and its resulting state.

Never record passwords, API keys, JWTs, database URLs, raw provider payloads or
full private secrets in chat, tickets or Git.

## 6. Escalation / rollback

Stop and escalate before any of these actions:

- deleting or recreating an Evolution instance;
- logging out or scanning a QR on the customer instance;
- changing DNS/static IP;
- applying or reverting a migration;
- rotating service credentials;
- restoring production data;
- sending repeated real-customer test messages.

For an application-only regression, use the known immutable GHCR image and
the existing rollback script. Do not attempt a destructive database rollback.

## 7. Success criteria

An incident is resolved only when:

1. The failure boundary is identified from evidence.
2. The persisted effect status matches the evidence.
3. The advisor can retry when the outcome is recoverable.
4. Accepted effects remain single-send.
5. `/api/health` and `/api/ready` pass after recovery.
6. Customer and reminder Evolution instances remain distinct and connected.
7. A prevention check or documentation rule is added for a new failure mode.
