# Technology reality check — Round 2

**Reviewed:** 2026-08-06
**Target:** `ARCHITECTURE-SPINE.md` draft, lines 1–304
**Method:** fresh comparison against the checked-out code, exact installed packages, bundled Next.js 16 documentation, container registries, and current primary vendor/specification sources. No spine changes were made.

## Verdict

**CONDITIONAL PASS.** The revised spine is technologically coherent and has no critical feasibility blocker. Ubuntu Server, the existing containerized Next.js/Evolution/Redis stack, Supabase Auth SSR, managed Cron-to-Edge invocation, and standards-based Web Push are all viable. Before finalization, two high residual contracts should be made unambiguous: runtime-specific Supabase key handling and a reproducible production Compose/ingress path that cannot expose the current development port mappings.

## High residual findings

### H1 — The new Supabase key contract conflates the self-hosted Next.js runtime with hosted Edge Functions

**Spine evidence:** AD-12 and the configuration convention name singular `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` as canonical across the architecture (`ARCHITECTURE-SPINE.md:121-125`, `:159-161`).

**Repository evidence:**

- Browser and SSR clients still read `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`lib/supabase/client.ts:5-9`, `lib/supabase/server.ts:6-19`).
- The isolated admin client still reads `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts:5-12`).
- The existing hosted Edge Function also reads `SUPABASE_SERVICE_ROLE_KEY` (`supabase/functions/send-whatsapp-welcome/index.ts:56-62`).
- No `dispatch-push` function exists, and `supabase/config.toml` configures only the current WhatsApp function.

**Reality check:** The browser/Next.js naming is current: Supabase's SSR guide uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `proxy.ts`, cookie-backed browser/server clients, and `getClaims()` for authorization. The migration guide also recommends replacing backend `service_role` usage with a secret key. Hosted Edge Functions, however, receive named new keys through `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` JSON objects; singular `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` are documented as local CLI/runtime fallbacks. Supabase currently recommends `@supabase/server` for new hosted functions, or explicit parsing of the plural managed variables. [SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [API-key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [securing Edge Functions](https://supabase.com/docs/guides/functions/auth)

**Why this remains high:** Two compliant implementers could make `dispatch-push` read different variables; the Node path would work while the hosted function could fail at runtime or remain on the legacy key indefinitely.

**Required resolution before final:** Split the convention by runtime:

- Browser and cookie-scoped Next.js SSR client: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Self-hosted privileged Next.js client: server-only `SUPABASE_SECRET_KEY`, with the legacy service-role name only during migration.
- Hosted Edge Function: either the pinned `@supabase/server` `auth`/admin context or named `SUPABASE_SECRET_KEYS` parsing; singular key only as a local fallback.
- Keep the privileged client separate from the cookie SSR client in every runtime.

### H2 — The secure Ubuntu topology is selected correctly but is not yet reproducible from the repository

**Spine evidence:** AD-13 requires headless Ubuntu 24.04 LTS, only TCP 443 exposed publicly, an HTTPS ingress, Compose service DNS, and immutable production image references (`ARCHITECTURE-SPINE.md:127-131`, `:251-273`). The ingress product and recovery objectives remain explicitly deferred until the deployment story (`:301`).

**Repository evidence:**

- Current `docker-compose.yml` publishes Next.js as `3000:3000`, which binds on all host interfaces unless overridden (`docker-compose.yml:11-12`).
- Evolution is correctly limited to host loopback (`docker-compose.yml:33-34`), and Redis has no published port.
- No HTTPS ingress service or production override/profile exists.
- `.env.example` still presents `host.docker.internal` for the Evolution callback (`.env.example:10`), although AD-13 correctly requires Compose DNS for Ubuntu.
- `node:22-alpine`, `evoapicloud/evolution-api:v2.3.7`, and `redis:7-alpine` are mutable tags in the current files. Registry inspection confirmed current Linux `amd64` and `arm64` manifests for all three, but no production digest is pinned yet.

**Reality check:** Docker Engine officially supports Ubuntu Noble 24.04 LTS and requires no desktop UI. Compose service-name DNS is supported on its default bridge network. Docker also warns that published container ports can bypass `ufw`/`firewalld`, so the current `3000:3000` mapping cannot coexist with the spine's “only 443” production claim. Digest references are the supported mechanism for immutable images. [Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Compose networking](https://docs.docker.com/compose/how-tos/networking/), [port publishing](https://docs.docker.com/engine/network/port-publishing/), [image digests](https://docs.docker.com/engine/containers/run/#image-digests)

**Why this remains high:** An operator can currently follow the repository's only Compose path on Ubuntu and violate AD-13 while believing the architecture has been followed.

**Required resolution before production implementation:** Bind the deployment story to a checked-in production Compose override/profile or equivalent deployment manifest that:

- removes direct publication of ports 3000, 8080/8081 and 6379;
- publishes only the chosen ingress on 443 and routes internally to `leadflow:3000`;
- uses `leadflow:3000` and `evolution-api:8080` service DNS, never `host.docker.internal` in production;
- pins base/runtime images and the deployable LeadFlow image by verified target-architecture digest;
- installs host firewall rules in the Docker-aware path and proves the result with an external port scan.

The spine already blocks go-live on these conditions, so this is a reproducibility gap rather than a rejected technology choice.

## Medium and low residual findings

### M1 — Cron-to-Edge is valid, but its custom authentication path must be tested as a custom path

Supabase officially supports `pg_cron` + `pg_net` + Vault and documents invoking an Edge Function every minute with a publishable key in `apikey`. Current Edge authorization documentation also states that with `verify_jwt = false`, the platform does not authenticate a publishable `apikey`; the handler must authenticate the request. AD-12 correctly adds a distinct scheduler secret and explicit handler validation, so the design is viable. The implementation acceptance test must prove that the scheduler secret is rejected before an admin client is created or any claim RPC runs, and must cover current/next values during rotation. `supabase/config.toml` must add `[functions.dispatch-push] verify_jwt = false`. [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Edge authorization headers](https://supabase.com/docs/guides/functions/auth-headers)

Supabase currently labels Cron as Beta; the spine's Beta statement is therefore accurate, and its one-advisor scope, durable database claims, monitoring and fallback constraints are proportionate. [Supabase Cron](https://supabase.com/features/supabase-cron)

### L1 — The Web Push stack should preserve standards maturity in wording

The selected standards are the correct ones: RFC 8030 for HTTP Web Push, RFC 8291 for payload encryption, RFC 8292 for VAPID, the W3C Push API, and the Notifications API. The W3C Push API is currently a Working Draft on the Recommendation track, while Notifications is a WHATWG Living Standard. This does not block implementation, but the stack row should not imply that both browser APIs are finalized W3C Recommendations. [W3C Push API](https://www.w3.org/TR/push-api/), [WHATWG Notifications](https://notifications.spec.whatwg.org/), [RFC 8030](https://www.rfc-editor.org/info/rfc8030/), [RFC 8291](https://www.rfc-editor.org/info/rfc8291/), [RFC 8292](https://www.rfc-editor.org/info/rfc8292/)

The actual advisor device/browser remains correctly deferred. HTTPS plus a Service Worker is compatible with a headless server; the server itself does not need a GUI.

## Verified claims matrix

| Claim | Evidence checked | Result |
| --- | --- | --- |
| Next.js 16.2.12, React 19.2.4, TypeScript 5.9.3, Tailwind 4.3.3, Zod 4.4.3, Supabase JS 2.110.9 and SSR 0.12.3 exist in the project | `node_modules`, `package-lock.json`, `package.json`; Docker build uses `npm ci` | **Pass** |
| `proxy.ts` is the current Next.js 16 convention | Bundled `node_modules/next/dist/docs/.../proxy.md` says `middleware` is deprecated/renamed and requires root-level `proxy.ts` | **Pass** |
| Supabase SSR should refresh cookies in Proxy and authorize with `getClaims()` | Current Supabase SSR guide and bundled `@supabase/ssr` cookie API (`getAll`/`setAll`) | **Pass** |
| Publishable/secret keys replace legacy anon/service-role keys | Current Supabase key and migration guides | **Pass with H1 runtime clarification** |
| Supabase Cron can invoke Edge Functions every minute through `pg_net` with Vault | Current scheduling guide and Cron product page | **Pass; selected, not present** |
| Ubuntu Server 24.04 LTS can host this stack without a desktop UI | Docker Engine's supported Ubuntu list; existing standalone Node container | **Pass** |
| Compose DNS names work between services | Docker Compose networking docs; current services share the default project network | **Pass** |
| Only HTTPS 443 is exposed in production | Valid target, but current Compose still publishes 3000 and has no ingress | **Conditional; H2** |
| Production images can be pinned immutably and support common Ubuntu server architectures | Docker digest docs; live OCI manifests for Node 22 Alpine, Evolution 2.3.7 and Redis 7 Alpine include Linux `amd64`/`arm64` | **Pass; pinning not yet implemented** |
| Evolution API 2.3.7 is a real existing baseline | Current Compose, live image manifest and official release record | **Pass** — [official releases](https://github.com/evolution-foundation/evolution-api/releases) |
| Web Push can be emitted server-side and displayed by a Service Worker | W3C/WHATWG APIs plus IETF Web Push, encryption and VAPID RFCs | **Pass; selected, not present** |
| Existing-vs-selected labels are accurate | No login/proxy, Push code, Cron migration or `dispatch-push` function exists; current WhatsApp/Realtime/Supabase and containers do exist | **Pass** |
| Playwright/corporate automation is excluded from the committed stack | No Playwright dependency/runtime; AD-14 and Deferred keep the mechanism discovery-gated | **Pass** |

## Gate recommendation

Resolve H1 in the spine before final status. H2 may be closed either by binding an explicit production deployment artifact/profile in AD-13 now or by retaining it as a hard deployment-story gate with unmistakable wording that the current `docker-compose.yml` is not production-safe. M1 and L1 can be folded into implementation acceptance criteria and wording without changing the selected architecture.
