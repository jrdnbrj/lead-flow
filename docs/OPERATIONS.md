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
- Push remains deferred. Secrets are local or managed by the platform; never
  print or commit them.

Use `.env` as the single local configuration file. `.env.local` may remain for
the existing Next.js developer workflow, but new configuration belongs in
`.env`; both are gitignored.

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
integration; LeadFlow must not access its internal database directly. Push,
provider smoke tests and other real-infrastructure checks are deferred.
