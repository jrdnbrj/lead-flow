# Technology Reality-Check Review — LeadFlow Architecture Spine

**Lens:** current versions, continued existence and fit of every named technology, and current defaults/conventions of the brownfield stack
**Reviewed:** `ARCHITECTURE-SPINE.md` draft dated 2026-08-06
**Method:** local `package.json`, `package-lock.json`, installed packages/docs, Docker assets, Supabase assets, and current primary vendor/standards sources. No starter is claimed or used by this brownfield spine, so there are no starter defaults to verify.

## Verdict

**CONDITIONAL PASS — the selected technologies exist and are broadly compatible, and every exact JavaScript dependency version in the Stack matches the lockfile and installed package. Four high-severity reality gaps should be fixed before the spine is finalized: two Ubuntu/Docker deployment contradictions and two current Supabase Auth/key conventions.**

No critical finding requires changing the overall modular-monolith, Supabase, Evolution API, or Web Push direction.

## Confirmed current and fitting

| Commitment | Evidence and conclusion |
| --- | --- |
| Next.js 16.2.12, React 19.2.4, TypeScript 5.9.3, Tailwind CSS 4.3.3, Zod 4.4.3, `@supabase/supabase-js` 2.110.9, `@supabase/ssr` 0.12.3 | Exact versions match `package-lock.json` and the installed package metadata. Next.js requires Node `>=20.9.0`; installed Supabase JS requires Node `>=22.0.0`; the selected Node 22 line satisfies both. |
| Next.js standalone on Docker | `next.config.ts` sets `output: "standalone"`; the Dockerfile copies `.next/standalone`, `public`, and `.next/static` and starts `server.js`. This matches the installed Next.js 16.2.12 documentation for [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) and current [self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting). |
| Server Actions and Route Handlers as public entrypoints | Current installed Next.js docs explicitly require authentication and authorization inside every directly reachable Server Function and Route Handler. AD-6 and AD-12 fit that model. |
| Ubuntu Server 24.04 LTS | Still supported through May 2029 under standard maintenance. Ubuntu 26.04 is now the newest LTS, but 24.04 remains a supported, conservative production choice. See Canonical's [release cycle](https://ubuntu.com/about/release-cycle). |
| Node.js 22 | Still supported LTS and compatible with the installed packages, although Node 24 is the latest LTS. See the official [Node.js release schedule](https://nodejs.org/en/about/previous-releases). |
| Evolution API 2.3.7 | The Compose tag is present in the local Docker image store, and v2.3.7 is the current official release in the [Evolution API release feed](https://github.com/evolution-foundation/evolution-api/releases). The existing webhook custom-header setup is also present in local code. |
| Supabase Cron invoking an Edge Function every minute | This is a documented managed pattern using `pg_cron`, `pg_net`, and Vault. `cron.job_run_details` is the documented run-history table. See [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) and [Cron](https://supabase.com/docs/guides/cron). |
| Supabase Edge Functions | Exists and is GA, uses a Deno-compatible TypeScript runtime, and supports pinned npm dependencies and Node built-ins. See [Edge Functions](https://supabase.com/docs/guides/functions) and [dependency management](https://supabase.com/docs/guides/functions/dependencies). |
| Web Push/VAPID and Service Worker delivery | The Push API remains broadly available and delivers messages to a Service Worker; the protocol is standardized by Push API plus RFC 8030/8291/8292. Notification action buttons remain limited-availability, but the spine correctly treats them as progressive enhancement with an authenticated PWA fallback. See the [Push API](https://www.w3.org/TR/push-api/), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), and [Notification actions](https://developer.mozilla.org/en-US/docs/Web/API/Notification/actions). |

## High findings

### H1 — The documented callback address is not portable to the selected Ubuntu Server deployment

**Affected spine:** AD-13 and production topology (`ARCHITECTURE-SPINE.md:125-129`, `217-235`).
**Local evidence:** `.env.example:10` sets `EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000/...`; `docker-compose.yml` provides neither `extra_hosts` nor an ingress service. Both `leadflow` and `evolution-api` already share Compose's default network.

On Docker Engine for Linux, `host.docker.internal` needs an explicit `host-gateway` mapping; Docker Desktop supplies it automatically. Compose already provides the more reliable answer: every service is discoverable by service name on the default network. Current Docker documentation confirms both behaviors in [Networking in Compose](https://docs.docker.com/compose/how-tos/networking/).

**Impact:** the Evolution webhook can work on Docker Desktop yet fail after the same assets are moved to the promised headless Ubuntu host. Inbound message/status processing would then silently stop reaching LeadFlow.

**Exact fix:** amend AD-13 or its deployment convention so the production in-Compose callback is `http://leadflow:3000/api/webhooks/evolution`; add `EVO --> NEXT` to the topology. Keep `host.docker.internal` only as an explicitly mapped development alternative (`extra_hosts: host.docker.internal:host-gateway`) or use the public HTTPS URL only when the caller is genuinely outside the Compose network.

**Disposition:** autofix in the spine before finalization.

### H2 — The current Compose port mapping bypasses the committed HTTPS-ingress boundary

**Affected spine:** AD-13 says HTTPS ingress is a release precondition and the topology makes ingress the only route to Next.js (`ARCHITECTURE-SPINE.md:125-129`, `217-235`).
**Local evidence:** `docker-compose.yml:11-12` publishes `3000:3000` without a host IP. Docker documents that this binds all interfaces and can expose the container directly to the internet; Next.js currently recommends a reverse proxy in front of a self-hosted server.

**Impact:** on a public Ubuntu host, clients can reach plain HTTP port 3000 and bypass TLS termination, ingress rate limits, malformed-request handling, and any ingress-only policy.

**Exact fix:** make AD-13 enforce that ingress is the sole public service. In the production Compose projection, either remove the app's published port and connect ingress through a shared internal network, or bind it to `127.0.0.1:3000:3000`; expose only ingress ports 80/443. Name the chosen ingress implementation when the deployment story is written and verify the direct `:3000` path is unreachable externally. Docker's relevant warning is in the [Compose ports reference](https://docs.docker.com/reference/compose-file/services/#ports), and Next.js guidance is in [Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting#reverse-proxy).

**Disposition:** autofix the invariant; the exact proxy product can remain a deployment-story choice.

### H3 — The spine commits to Supabase's legacy `anon`/`service_role` key model just before its deprecation deadline

**Affected spine:** AD-3 and AD-12 name browser public/service-role access (`ARCHITECTURE-SPINE.md:65-69`, `119-123`); the local application uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.example`, Docker build args, and Supabase clients.

Supabase's current official guidance says legacy `anon` and `service_role` API keys are deprecated by the end of 2026 and new deployments should use publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys. Secret keys are not JWTs and must not be sent as `Authorization: Bearer`; this matters for `pg_net`/Cron-to-Edge-Function calls. See [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) and [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).

**Impact:** future stories following the spine could deepen a legacy convention that must be removed within the pilot's operating horizon, or configure the scheduled function with an invalid bearer credential.

**Exact fix:** change the target convention to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and a server-only `SUPABASE_SECRET_KEY`, while allowing the existing names only as temporary compatibility aliases under AD-2. For Cron invocation, put the publishable key in the `apikey` header and authenticate the scheduler independently inside the function (for example, a separate rotating scheduler secret); if the caller has no user JWT, set that function's `verify_jwt = false` and perform explicit code-level authentication. Never put an `sb_secret_...` value in a bearer header.

**Disposition:** discuss only the migration timing; the spine's target convention itself should be updated now.

### H4 — The new Supabase Auth boundary omits the current Next.js SSR session-refresh primitive

**Affected spine:** AD-3 and AD-6 require authenticated browser/server mutations, but the Structural Seed only adds `lib/auth/` and does not bind the SSR cookie-refresh path (`ARCHITECTURE-SPINE.md:65-69`, `83-87`, `173-199`).
**Local evidence:** `@supabase/ssr` 0.12.3 is installed; `lib/supabase/server.ts` reads and writes cookies, but the repository has no `proxy.ts` or `lib/supabase/proxy.ts` session-refresh implementation.

Current Supabase Next.js SSR guidance requires a Proxy-based refresh path because Server Components cannot write refreshed cookies. It also says to use `auth.getClaims()` to protect pages/data and not trust `getSession()` for authorization. See [Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and the [SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

**Impact:** independently built login, page protection, Server Actions, and Realtime work can choose incompatible session-refresh approaches; sessions may expire or appear inconsistently between browser and server even though RLS is correct.

**Exact fix:** add `proxy.ts` plus `lib/supabase/proxy.ts` to the Structural Seed and bind AD-3/AD-6 to one cookie-refresh implementation. Require `getClaims()` (or `getUser()` when a fresh user record is necessary) for authorization, preserve the `@supabase/ssr` `setAll` cache headers, and forbid caching authenticated refresh responses. Keep authorization checks inside each mutation as AD-12 already requires.

**Disposition:** autofix before the first Auth story is generated.

## Medium findings

### M1 — “Managed project baseline, verified” overstates what is present in the current Supabase project assets

**Affected spine:** Stack row and AD-9/AD-13 (`ARCHITECTURE-SPINE.md:101-105`, `125-129`, `153-169`).
**Local evidence:** there are no `push_subscriptions`, `push_deliveries`, `dispatch-push`, Service Worker, `pg_cron`, `pg_net`, or Vault assets in the repository. `supabase/config.toml` only declares `send-whatsapp-welcome`.

The services exist and fit, but the repository proves only that they are selected future capabilities, not that Cron/Edge Push is enabled in the linked project.

**Exact fix:** split the stack wording into “current brownfield baseline” and “selected additions.” Mark Cron, `dispatch-push`, and Web Push as selected/not yet enabled. Add a release preflight that queries the linked project's Postgres and extension versions, enables/verifies `pg_cron`, `pg_net`, and Vault, deploys the function, and exercises one real subscription. Give `dispatch-push` its own `deno.json` with exact dependency versions and run `deno check`/local function tests before deployment, per current Supabase dependency guidance.

**Disposition:** autofix wording; defer the live preflight to the Push implementation story.

### M2 — Container aliases are supported but not reproducible pins

**Affected spine:** Stack rows `22-alpine` and `7-alpine`, plus the production images (`ARCHITECTURE-SPINE.md:153-169`).
**Local evidence:** the Dockerfile and Compose use mutable aliases `node:22-alpine` and `redis:7-alpine`; Evolution has an exact application tag but no image digest. The local Docker store currently has `redis:7-alpine` and `evoapicloud/evolution-api:v2.3.7`, but the Node base image is not cached locally.

Node 22 is still supported and compatible, but Node 24 is now the latest LTS. Rebuilding aliases later can silently change Alpine, Node, Redis, or transitive OS packages.

**Exact fix:** keep Node 22 if stability is preferred, but record a revisit before its EOL and pin release images to a full patch/variant plus OCI digest after multi-architecture verification. Apply the same digest rule to Redis and Evolution. Treat digest updates as deliberate dependency maintenance, not incidental rebuilds.

**Disposition:** defer exact digests to the deployment story, but add the pinning convention/revisit condition to the spine.

### M3 — The production topology omits Evolution API's real Postgres dependency

**Affected spine:** production topology (`ARCHITECTURE-SPINE.md:217-235`).
**Local evidence:** `docker-compose.yml:45-49` configures Evolution with `DATABASE_PROVIDER=postgresql` and a Supabase pooler URL using the `evolution_api` schema, but the diagram only shows Next.js connecting to Supabase Postgres.

**Impact:** an operator reading the spine can omit Evolution's database connectivity, pool limits, schema backup/restore checks, or outage dependency from deployment planning.

**Exact fix:** add `EVO --> DB` to the topology, labelled `evolution_api schema via session pooler`, and include that schema in the backup/restore verification required by AD-13.

**Disposition:** autofix diagram and release precondition.

## Low finding

### L1 — The standards row is too vague to be rechecked deterministically

**Affected spine:** `Web Push API and Push Service protocol | W3C/RFC standards baseline` (`ARCHITECTURE-SPINE.md:169`).

**Exact fix:** name the baseline explicitly: W3C Push API + Notifications API and RFC 8030 (Web Push), RFC 8291 (message encryption), RFC 8292 (VAPID), with the verification date. Keep browser-specific action support under the existing device/browser Deferred item.

**Disposition:** autofix.

## Gate recommendation

After H1-H4 are reflected, this lens recommends **PASS**. The technology direction itself does not need replacement: Next.js standalone on a headless Ubuntu host, managed Supabase, Evolution API, Redis, and server-scheduled Web Push remain coherent for the one-advisor pilot. The required changes are compatibility/security boundaries and honest current-versus-planned labeling.
