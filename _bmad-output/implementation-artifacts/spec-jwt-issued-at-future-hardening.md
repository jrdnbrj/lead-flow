---
title: 'Contención transversal de JWT issued at future'
type: 'bugfix'
created: '2026-09-08'
status: 'done'
baseline_commit: 'f1b1bccf1bbac3b97ccf4c5fbbf48addc1147266'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Supabase puede rechazar temporalmente solicitudes al Data API con `PGRST303 / JWT issued at future` aunque el inicio de sesión haya sido correcto. LeadFlow ya tiene una contención parcial para algunos First Contact y seguimientos, pero otras rutas autenticadas pueden fallar o convertir el error en un mensaje genérico.

**Approach:** Centralizar la detección y el retry acotado de ese rechazo exclusivamente en el transporte HTTP de Supabase/PostgREST, aplicarlo a clientes browser, SSR, proxy y admin, y mantener los fallbacks server-side existentes sólo donde ya están explícitamente autorizados. No reintentar Evolution, Push externo ni llamadas cuyo resultado no sea un rechazo PGRST303 antes de ejecutar SQL.

## Boundaries & Constraints

**Always:** Mantener `getClaims()` y `requireAdvisor()` como límites de autorización; no exponer tokens; no loguear JWT, claves ni URLs con credenciales; reintentar sólo respuestas HTTP 401 de `/rest/v1/` cuyo cuerpo indique `PGRST303` o `JWT issued at future`; usar backoff finito; preservar idempotencia y orden de First Contact; registrar sólo marcador seguro, ruta funcional y número de intento; ejecutar y validar Docker local.

**Ask First:** Cambiar permisos SQL o crear una migración sólo si la revisión demuestra que una ruta necesita un fallback server-side adicional; nunca ampliar `service_role` por conveniencia.

**Never:** Desactivar validación JWT; aceptar tokens manipulados; corregir `iat` manualmente; usar service-role en browser; reintentar automáticamente Evolution, WhatsApp, webhooks, Push delivery o cualquier efecto externo; desplegar producción sin autorización explícita.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| PGRST303 | Request REST autenticada devuelve 401 con mensaje future | Reintenta la misma solicitud con backoff y límite fijo | Devuelve el error original sanitizado si persiste |
| Normal 401 | 401 sin PGRST303 | Una sola respuesta, sin retry | Conserva el contrato actual de auth |
| Write request | RPC/insert/update recibe PGRST303 antes de autorización SQL | Retry de transporte permitido | Nunca reintenta si la respuesta no es PGRST303 |
| Auth/Evolution | Endpoint fuera de `/rest/v1/` | Sin intervención del helper | Conserva comportamiento actual |
| Persistent failure | PGRST303 supera el límite | Falla de forma explícita y observable | No convertir en `NOT_AVAILABLE`, no llamar proveedor |

</frozen-after-approval>

## Code Map

- `lib/supabase/server.ts` -- cliente SSR usado por auth, Server Actions y Route Handlers.
- `lib/supabase/proxy.ts` -- cliente que refresca cookies en el proxy de Next.
- `lib/supabase/client.ts` -- cliente browser usado por Realtime y sesión del asesor.
- `lib/supabase/admin.ts` -- cliente server-only usado por lecturas/operaciones propietarias.
- `lib/leads/repository.ts` -- retry/fallback parcial actual; incluye RPC First Contact, seguimientos y varias consultas directas sin la misma política.
- `app/api/push/command/route.ts` y `app/api/push/subscription/route.ts` -- rutas autenticadas con acceso directo al cliente SSR.
- `scripts/ci-contract-checks.sh` -- registro de contratos que debe proteger la cobertura transversal.
- `docs/whatsapp-first-contact-runbook.md` -- runbook operativo donde debe quedar el diagnóstico y límite de la contención.

## Tasks & Acceptance

**Execution:**

- [x] Crear un helper server/browser-safe de retry de PostgREST y pruebas deterministas de detección, límite, backoff y no-intervención fuera de `/rest/v1/`.
- [x] Conectar el helper a los cuatro clientes Supabase y al transporte explícito de RPC que no pasa por esos clientes.
- [x] Reducir la detección duplicada en `lib/leads/repository.ts` sin alterar sus allowlists ni sus garantías de ownership/idempotencia.
- [x] Añadir contrato CI y actualizar el runbook con el diagnóstico PGRST303, evidencia segura y límites de recuperación.
- [x] Ejecutar typecheck, lint, build, contratos, pruebas enfocadas, `git diff --check` y Docker local; no tocar remoto.

**Acceptance Criteria:**

- Given cualquier consulta/RPC Supabase a `/rest/v1/`, when PostgREST responde 401 con `PGRST303`, then se realizan sólo los retries acotados definidos y el resultado final conserva el contrato del caller.
- Given una respuesta 401 normal, auth endpoint, Storage, Functions, Evolution o Push provider, when termina la petición, then no se aplica este retry.
- Given First Contact, follow-ups, leads, catálogo, cotizador y Push, when ocurre PGRST303, then no se envía WhatsApp duplicado, no se cambia un estado a `NOT_AVAILABLE` y no se salta `requireAdvisor()`/RLS.
- Given el error persiste, when se agota el backoff, then la UI recibe un error funcional reintentable y los logs no contienen secretos.
- Given una nueva instancia de cliente o un proceso concurrente, when se hacen solicitudes, then no se comparte estado de sesión ni se crea un bucle global de retries.

## Verification

**Commands:**

- `npm run typecheck` -- expected: SUCCESS.
- `npm run lint` -- expected: SUCCESS or only pre-existing warnings.
- `npm run build` -- expected: SUCCESS.
- `bash scripts/ci-contract-checks.sh` -- expected: SUCCESS.
- `node --experimental-strip-types scripts/jwt-clock-skew-contract-check.mjs` -- expected: SUCCESS.
- `git diff --check` -- expected: SUCCESS.
- `docker compose config --services` and local health probe -- expected: only local LeadFlow and HTTP 200, with no Evolution service.

## Design Notes

La causa externa debe quedar separada de la contención: el status de Supabase reportó una incidencia de rechazos de JWT por caché temporal del validador. LeadFlow puede hacer que el fallo sea transitorio y observable, pero no puede corregir el reloj/caché administrado por Supabase. El fallback `service_role` sólo permanece para RPCs con grants y verificación de ownership ya existentes.

## Spec Change Log

## Suggested Review Order

**Detección y retry de PostgREST**

- Detecta exclusivamente 401 de `/rest/v1/` con PGRST303 o mensaje de reloj futuro.
  [`fetch-with-jwt-clock-skew-retry.ts:19`](../../lib/supabase/fetch-with-jwt-clock-skew-retry.ts#L19)

- Reintenta solicitudes completas con body clonable y backoff finito, sin estado compartido.
  [`fetch-with-jwt-clock-skew-retry.ts:34`](../../lib/supabase/fetch-with-jwt-clock-skew-retry.ts#L34)

- Expone únicamente un marcador seguro cuando el límite se agota.
  [`fetch-with-jwt-clock-skew-retry.ts:51`](../../lib/supabase/fetch-with-jwt-clock-skew-retry.ts#L51)

**Cobertura de clientes y rutas**

- Conecta el transporte al cliente SSR que usan acciones y route handlers.
  [`server.ts:20`](../../lib/supabase/server.ts#L20)

- Mantiene cookies y auth del proxy mientras cubre sus llamadas Supabase.
  [`proxy.ts:26`](../../lib/supabase/proxy.ts#L26)

- Aplica la misma política al cliente browser sin alterar Realtime ni la sesión.
  [`client.ts:10`](../../lib/supabase/client.ts#L10)

- Cubre operaciones server-only y el REST de base de datos del dispatcher.
  [`admin.ts:11`](../../lib/supabase/admin.ts#L11)
  [`route.ts:82`](../../app/api/internal/whatsapp-reminders/dispatch/route.ts#L82)

**RPC autenticado y compatibilidad**

- Conserva allowlists, fallback explícito y refresco de sesión sin flag global.
  [`repository.ts:137`](../../lib/leads/repository.ts#L137)

**Verificación y operación**

- Prueba éxito, agotamiento, body de POST y exclusiones Auth/Storage/provider.
  [`jwt-clock-skew-contract-check.mjs:32`](../../scripts/jwt-clock-skew-contract-check.mjs#L32)

- Ejecuta el contrato de prevención junto con el gate existente.
  [`ci-contract-checks.sh:55`](../../scripts/ci-contract-checks.sh#L55)

- Documenta diagnóstico, límites y recuperación sin exponer secretos.
  [`whatsapp-first-contact-runbook.md:21`](../../docs/whatsapp-first-contact-runbook.md#L21)
