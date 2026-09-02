# LeadFlow production operations

This is the operator runbook for the single-advisor production pilot. It is
intentionally small: Supabase remains managed, and one VPS runs only the web
ingress, LeadFlow, Evolution API, and Redis.

For the incident-prevention contract and First Contact diagnosis, start with:

- [`project-context.md`](./project-context.md) — compact BMAD context and
  non-negotiable boundaries;
- [`architecture-spine-production-safety.md`](./architecture-spine-production-safety.md)
  — invariants that must survive future changes;
- [`whatsapp-first-contact-runbook.md`](./whatsapp-first-contact-runbook.md) —
  safe diagnosis and recovery;
- [`production-release-checklist.md`](./production-release-checklist.md) —
  pre-release and post-deploy gates.

## Topology

```text
Internet :80/:443
        -> Caddy -> leadflow:3000
                         -> Supabase (managed HTTPS)
                         -> evolution-api:8080
                                -> Redis:6379
                                -> Evolution PostgreSQL (external)
```

Only Caddy publishes host ports. Docker service names are used inside the
private application network. Never publish 3000, 8080, or 6379.

Production artifacts:

- `docker-compose.production.yml`
- `deploy/caddy/Caddyfile`
- `scripts/deploy-production.sh`
- `scripts/rollback-production.sh`
- `scripts/migration-release-preflight.sh`
- `scripts/backup-production-database.sh`
- `.github/workflows/production-deploy.yml`

The development `docker-compose.yml` remains separate and still exposes its
local development ports.

## First VPS bootstrap

The VPS should run Ubuntu 24.04 LTS, Docker Engine, Docker Compose v2, Git, and
an unprivileged deploy user. Allow inbound 80/tcp, 443/tcp (and optionally
443/udp for HTTP/3); restrict SSH/22 to the operator network when practical;
deny other inbound traffic by default. This document does not configure the
host firewall or provision the VPS.

Clone the repository into an application directory such as `/opt/leadflow`,
then create root-owned, mode-0600 files outside Git:

```text
/etc/leadflow/leadflow.env
/etc/leadflow/evolution.env
/etc/leadflow/caddy.env
/etc/leadflow/ghcr.env
/etc/leadflow/backup.env
```

Use the corresponding `deploy/env/*.env.example` files as templates. The
deployment script loads these files only for Compose interpolation and passes
an explicit environment allowlist to each service. It never passes Supabase
CLI credentials, database passwords, or VAPID private material to LeadFlow.

Required public origin:

```text
https://leadflow.jrdnbrj.com
https://leadflow.jrdnbrj.com/api/webhooks/evolution
```

LeadFlow calls Evolution internally at `http://evolution-api:8080`.

## Deployment and rollback

Application deployment is separate from database migration. From the VPS:

```sh
DEPLOY_COMMIT=<known-main-commit> ./scripts/deploy-production.sh
./scripts/rollback-production.sh <known-good-commit>
```

The production workflow builds LeadFlow outside the VPS and publishes an
immutable image tagged with the exact Git commit SHA to GHCR. The deploy script
fetches `origin/main`, requires a clean server worktree, checks out the
requested commit detached, pulls that exact image, starts the four services,
waits for container health, then checks `/api/health` and `/api/ready`. It never
runs `npm ci`, `next build`, or `docker compose build` on the VPS. It is
idempotent and does not prune images automatically, so the previous image
remains available for rollback. A failed health gate returns a failure; it does
not silently roll back or destroy the previous version.

For a private GHCR package, create `/etc/leadflow/ghcr.env` outside Git with
mode `0640`, readable by `deploy`, containing only:

```text
GHCR_USERNAME=<read-only package account>
GHCR_READ_TOKEN=<read-only package token>
```

The token is used only for `docker pull`; it is never passed to LeadFlow,
Evolution, Compose interpolation, or the browser. The image repository is
`ghcr.io/jrdnbrj/lead-flow` and the deployment tag is an immutable commit SHA.

Application rollback does not roll back Supabase or Evolution database
migrations. Database changes are forward-only and require their own release.

## Health and readiness

- `/api/health` is a cheap LeadFlow liveness check.
- `/api/ready` checks a read-only Supabase installation query and whether the
  internal Evolution API responds with the configured API key.
- Readiness returns only generic dependency states; it never returns keys,
  database URLs, provider payloads, or connection errors.

Useful VPS commands:

```sh
docker compose -p leadflow-production -f docker-compose.production.yml ps
docker compose -p leadflow-production -f docker-compose.production.yml logs --tail=100 leadflow
docker compose -p leadflow-production -f docker-compose.production.yml logs --tail=100 evolution-api
docker compose -p leadflow-production -f docker-compose.production.yml logs --tail=100 caddy
```

Inspect logs for functional failures only. Do not copy raw provider payloads or
environment values into tickets or chat.

## Backups and recovery

The production Supabase database has an independent logical backup in the
private Cloudflare R2 bucket `leadflow-backups`. The VPS job backs up the
application `public` schema and PostgreSQL role definitions; it does not back
up Supabase Storage objects, vehicle files, Evolution state, Redis, or VPS
volumes. Supabase-managed backups remain the recovery path for managed Auth and
other Supabase-managed schemas. Supabase's CLI dump behavior also excludes
managed schemas by default, so this boundary is intentional.

The R2 S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, and the
bucket remains private. `/etc/leadflow/backup.env` is root-owned with mode
`0600`; it contains the verified production PostgreSQL URL without an embedded
password, the database password separately, and the bucket-scoped R2 access
keys. Never copy its values into GitHub, Docker containers, tickets, or chat.

`leadflow-db-backup.timer` runs at 06:00, 09:00, 12:00, 15:00, 18:00, and
21:00 in `America/Guayaquil`. Each run creates one compressed archive under
`database/`, validates it locally, uploads it, verifies the remote size and
checksum sidecar, and only then rotates older successful backups. The latest
two successful archives are retained. A failed run never deletes an older
verified archive.

Install the repository-managed files on the VPS as root:

```sh
sudo install -o root -g root -m 0750 scripts/backup-production-database.sh /usr/local/sbin/leadflow-db-backup
sudo install -o root -g root -m 0644 deploy/systemd/leadflow-db-backup.service /etc/systemd/system/leadflow-db-backup.service
sudo install -o root -g root -m 0644 deploy/systemd/leadflow-db-backup.timer /etc/systemd/system/leadflow-db-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now leadflow-db-backup.timer
```

Check the timer and run one controlled manual backup:

```sh
sudo systemctl list-timers leadflow-db-backup.timer
sudo systemctl start leadflow-db-backup.service
sudo journalctl -u leadflow-db-backup.service -n 100 --no-pager
```

The same service is used by the timer and manual run, so the lock prevents
overlapping executions. It uses the pinned PostgreSQL 17 client image for
`pg_dump`/`pg_dumpall` and `rclone`; the PostgreSQL image is a short-lived
utility container and does not restart application services or build LeadFlow.

### Backup restore runbook

1. List private objects from the VPS with the root-only R2 configuration. The
   command creates a short-lived rclone config and removes it automatically;
   it does not print credentials:

   ```sh
   sudo bash -c 'set -Eeuo pipefail; tmp=$(mktemp); trap '\''rm -f "$tmp"'\'' EXIT; chmod 600 "$tmp"; . /etc/leadflow/backup.env; { printf "[r2]\\ntype = s3\\nprovider = Other\\nenv_auth = false\\naccess_key_id = %s\\nsecret_access_key = %s\\nendpoint = %s\\nregion = auto\\nno_check_bucket = true\\n" "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" "$R2_ENDPOINT"; } >"$tmp"; rclone lsl --config "$tmp" --log-level ERROR "r2:$R2_BACKUP_BUCKET/database"'
   ```

2. Download one archive and its `.sha256` sidecar into an isolated recovery
   directory, then verify `sha256sum -c` and `tar -tzf` before inspecting it.
3. Extract `roles.sql`, `schema.sql`, and `data.sql` only into a new isolated
   PostgreSQL/Supabase target. Apply schema before data, and review role/Auth
   compatibility for the target project first.
4. Validate tables, row counts, RLS/policies, login, and application behavior
   in the isolated target before considering any recovery action.

Never restore directly to production, overwrite an existing backup during
recovery, or treat a checksum/integrity failure as a usable backup. A
production restore requires explicit recovery authorization and a separately
reviewed downtime/data-loss decision.

- **Supabase managed recovery:** retain the managed backup/PITR capabilities of
  the selected Supabase plan for Auth and managed schemas. The independent R2
  copy is protection from accidental deletion or provider-console mistakes,
  not a replacement for Supabase's native recovery.
- **Evolution PostgreSQL:** the database referenced by the private
  `EVOLUTION_DATABASE_URL` is the responsibility of its database owner. Record
  its backup and restore procedure without copying its DSN into documentation.
- **Evolution sessions:** back up the `evolution_instances` Docker volume with
  a host snapshot or a controlled stopped-service archive. Losing it requires
  WhatsApp pairing again.
- **Redis:** AOF is enabled for operational continuity, but Redis is a cache;
  it is not the source of truth for LeadFlow or Evolution history.
- **Caddy:** keep `caddy_data` and `caddy_config` persistent. TLS state can be
  recreated by Caddy, but retaining it avoids unnecessary certificate churn.

Restore order is: VPS/Docker, external databases, Evolution session volume,
Redis if useful, Caddy volumes, then the application. Verify `/api/ready`,
Evolution instance state, login, dashboard, webhook, and Push after recovery.

## Database release policy

Normal app release:

```text
push main -> CI -> application deployment
```

Database release:

```text
manual workflow dispatch
-> target guard
-> migration history and dry-run
-> GitHub Environment approval
-> forward-only supabase db push
-> migration/schema verification
-> application deployment if needed
```

Use `scripts/migration-release-preflight.sh` for the read-only gate. Never add
an automatic `supabase db push` to the main application deployment workflow.

## DNS and TLS

Do not create DNS records from this repository. In Porkbun, after the VPS has
an address, create only:

```text
Type: A
Host: leadflow
Answer: <VPS_IPV4>
TTL: default/reasonable
```

Add an AAAA record only if IPv6 is configured and tested. Do not create an
Evolution subdomain, wildcard, or unnecessary `www` record. Caddy obtains and
renews HTTPS for `leadflow.jrdnbrj.com` after DNS resolves.

## Secret matrix

| Name | Location | Used by | Rotation consideration |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | VPS `leadflow.env` | LeadFlow server | Rotate in Supabase, update file, redeploy LeadFlow |
| `EVOLUTION_API_KEY` | VPS `evolution.env` | LeadFlow + Evolution | Rotate together, then restart both dependent services |
| `EVOLUTION_WEBHOOK_TOKEN` | VPS `leadflow.env` and Evolution webhook configuration | LeadFlow webhook | Rotate with a controlled webhook update |
| `EVOLUTION_DATABASE_URL` | VPS `evolution.env` | Evolution only | Rotate at the database/pooler owner and restart Evolution |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | VPS `leadflow.env` | Browser build | Public key; rotate only with coordinated client rebuild |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VPS `leadflow.env` | Browser build | Must match the Edge VAPID pair |
| `VAPID_PRIVATE_KEY` | Supabase Edge secrets | `dispatch-push` only | Rotate as a pair with the public key |
| `PUSH_DISPATCH_SECRET` | Supabase secrets/Vault | Cron -> `dispatch-push` | Rotate scheduler and function boundary together |
| `SUPABASE_ACCESS_TOKEN` | GitHub migration environment/local operator | Supabase CLI only | Never put it on the VPS application container |
| `SUPABASE_DB_PASSWORD` | GitHub migration environment/local operator | Supabase CLI only | Never put it on the VPS application container |
| `VPS_SSH_PRIVATE_KEY` | GitHub production environment | Deploy workflow only | Dedicated deploy user key; rotate independently |
| `GHCR_USERNAME` | VPS `/etc/leadflow/ghcr.env` | Docker pull on VPS | Use a package-read identity; rotate independently |
| `GHCR_READ_TOKEN` | VPS `/etc/leadflow/ghcr.env` | Docker pull on VPS | Revoke and replace without changing app secrets |
| `SUPABASE_DB_URL` | VPS `/etc/leadflow/backup.env` | Database backup service only | Keep password-free; use verified IPv4-reachable connection |
| `SUPABASE_DB_PASSWORD` | VPS `/etc/leadflow/backup.env` | `pg_dump`/`pg_dumpall` only | Rotate in Supabase, update secure file, test one manual backup |
| `R2_ACCOUNT_ID` | VPS `/etc/leadflow/backup.env` | Backup service only | Non-secret endpoint identifier; verify if account changes |
| `R2_ACCESS_KEY_ID` | VPS `/etc/leadflow/backup.env` | `rclone` upload only | Revoke/reissue bucket-scoped credential |
| `R2_SECRET_ACCESS_KEY` | VPS `/etc/leadflow/backup.env` | `rclone` upload only | Revoke/reissue bucket-scoped credential |

Public seller values and `CADDY_HOSTNAME`/`ACME_EMAIL` are configuration, not
secrets. No `.env` or device-specific file belongs in Git or a Docker image.

## CI/CD

`.github/workflows/ci.yml` runs Node 22, install, typecheck, lint, current
blocking contracts, build, and diff check. The two known legacy contract checks
that do not match the accepted current E2/E6 UX are intentionally tracked
separately until updated; they are not silently reported as passing.

`.github/workflows/production-deploy.yml` receives a successful `main` CI
commit, builds the production image on GitHub-hosted infrastructure, publishes
the immutable SHA tag to GHCR, then deploys that same SHA through SSH using a
dedicated non-root user and pinned known hosts. Configure the `production`
GitHub Environment before enabling it.

`.github/workflows/supabase-migrations.yml` is manual only. The
`production-migrations` Environment should require explicit reviewers. It
performs the target guard and dry-run before the approved apply job.

Required GitHub secrets are listed by the workflow and should be scoped to the
smallest repository/environment:

```text
VPS_HOST
VPS_USER
VPS_APP_DIR
VPS_SSH_PORT (optional; defaults to 22)
VPS_SSH_PRIVATE_KEY
VPS_SSH_KNOWN_HOSTS
SUPABASE_PROJECT_REF
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD

# production environment secrets used only while building the public browser bundle
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

## Monitoring and final acceptance

Start with one external HTTPS uptime check for
`https://leadflow.jrdnbrj.com/api/health` or `/api/ready`, plus a basic alert
when it is unavailable. A simple free/low-cost uptime monitor is sufficient;
do not add an observability platform for this pilot.

Before calling the VPS production-ready, perform manual checks for DNS/TLS,
login, capture, dashboard, Evolution webhook, WhatsApp connection, Push
desktop delivery, and HTTPS Android Push. Push action buttons remain a
separate physical-device acceptance check.
