# LeadFlow operations

## Current environment model

LeadFlow currently uses one environment: `development`. The project identity is
`SUPABASE_PROJECT_REF`; there is no separate integration project variable.

## Configuration

- Browser Supabase: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server/CLI Supabase: `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, and
  `SUPABASE_DB_PASSWORD`.
- Evolution: HTTP API plus authenticated webhook using the `EVOLUTION_API_*`
  and `EVOLUTION_WEBHOOK_*` variables. `EVOLUTION_DATABASE_URL` is consumed by
  the local Evolution container, not by LeadFlow application code.
- Push runtime is implemented locally but remains unvalidated on a physical
  device. Secrets are local or managed by the platform; never print or commit them.

## Push runtime

The real Push runtime uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the browser and
`VAPID_PRIVATE_KEY` only in the `dispatch-push` Edge Function. `036_epic5_push_runtime.sql`
adds owned subscriptions and delivery projections while E1 remains the only
action state machine. The dispatcher is intended to be invoked by the
platform scheduler at a bounded cadence; exact-second delivery is not
guaranteed. Physical Android/PWA notification acceptance is required before
calling Push runtime complete.

Use `.env` as the single local configuration file. `.env.local` may remain for
the existing Next.js developer workflow, but new configuration belongs in
`.env`; both are gitignored.

## Auth bootstrap and database releases

Migration 010 is historical and requires its approved Auth identity to exist
before that migration runs on a new database. Run
`scripts/assert-auth-bootstrap.sh` after the target guard and before a first
install. The script only verifies the target, migration history and Auth row;
it never creates or deletes users. The current production database already
passed migration 010 and must not be re-run.

Application releases and database releases are separate:

```text
Application: main -> CI checks -> application deploy
Database: new migration -> target guard -> dry-run/history check
          -> explicit approval -> forward migration -> verification
          -> application deploy
```

Never run an automatic blind `supabase db push` on every main push.

`dispatch-push` uses a server-only `PUSH_DISPATCH_SECRET` for the single
platform scheduler boundary. The secret is stored in the platform secret
manager/Vault and is never sent to the browser. The current remote scheduler
is the single active job `leadflow-dispatch-push-every-minute` with cadence
`* * * * *`; it invokes the function through Vault-backed authorization.

## Target guard

Run `scripts/assert-supabase-target.sh` before any remote mutation. It verifies
that `LEADFLOW_ENVIRONMENT` and `SUPABASE_PROJECT_REF` exist and that a local
Supabase project identity, when present, matches the configured ref. Identity
uncertainty fails closed. The guard does not authorize mutation: remote
mutating operations require explicit user authorization.

## Supabase CLI workflow

The standard workflow is:

```sh
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase migration new <name>
supabase db push
supabase gen types typescript --linked > lib/supabase/database.generated.ts
supabase functions new <function>
supabase functions serve <function>
supabase functions deploy <function>
supabase secrets set NAME=value
supabase secrets list
```

These commands are not run automatically. Remote mutations, deploys and secret
changes require explicit authorization.

## Edge Functions and Evolution

Edge Functions read secrets from environment variables and must not hardcode
service-role keys, Evolution keys or webhook tokens. Evolution remains an HTTP
integration; LeadFlow must not access its internal database directly. Provider
smoke tests and physical Push acceptance remain deferred.
