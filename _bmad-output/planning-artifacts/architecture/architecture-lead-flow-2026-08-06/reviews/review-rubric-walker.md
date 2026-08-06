# Reviewer Gate — Rubric walker independiente

- **Objeto:** `ARCHITECTURE-SPINE.md`
- **Altitud:** feature
- **Fecha:** 2026-08-06
- **Veredicto:** **NO PASA — requiere cambios antes de `status: final`**
- **Conteo:** 1 crítico, 7 altos, 4 medios, 2 bajos

El spine es sólido en propiedad transaccional, convergencia de la acción de respuesta, límites de secretos, Push server-side y aplazamiento de la automatización corporativa. El lint determinista pasa sin hallazgos. Sin embargo, todavía permite implementaciones incompatibles o inseguras en la identidad de los entrypoints privilegiados, la separación de runtimes Next/Deno, la recuperación de efectos externos inciertos, el corte a Auth y el entorno de validación. Esos huecos contradicen la promesa brownfield de no romper lo que ya funciona.

## Evidencia revisada

- Spine completo y lint con `lint_spine.py`: 0 hallazgos mecánicos.
- PRD final, especialmente FR-001–FR-037, NFR-001–NFR-015 y SM-001–SM-009.
- `DESIGN.md` y `EXPERIENCE.md`, incluidas las brechas brownfield y los ocho flujos.
- `package.json`, paquetes instalados, `Dockerfile`, `docker-compose.yml`, `README.md`, `supabase/config.toml` y `project-context.md`.
- Migraciones `001`–`009`, tipos Supabase, repositorios, Server Actions, webhook Evolution, Realtime y configuración persistente.
- Documentación local de Next.js 16 sobre autenticación de Server Functions y la convención `proxy.ts`.
- Verificación primaria: [Next.js 16.2](https://nextjs.org/blog/next-16-2), [Supabase Cron](https://supabase.com/docs/guides/cron), [programación de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [runtime Deno de Edge Functions](https://supabase.com/docs/guides/functions), [Evolution API v2.3.7](https://github.com/evolution-foundation/evolution-api/releases), [Node.js releases](https://nodejs.org/en/about/previous-releases), [Ubuntu release cycle](https://ubuntu.com/about/release-cycle) y [RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030).

## Resultado por criterio

| Criterio | Resultado | Nota |
| --- | --- | --- |
| Fija los puntos reales de divergencia | Falla | Faltan identidad privilegiada, seam entre runtimes, semántica de `UNKNOWN`, matching de lead y aislamiento de entornos. |
| Cada Rule es ejecutable y previene su divergencia | Falla | AD-3, AD-6, AD-7, AD-9 y AD-13 dejan decisiones incompatibles. |
| Deferred no permite divergencia | Parcial | Corporate, browser, ficha, retención y tenancy tienen límites suficientes; la reparación de primer contacto parcial no está decidida ni diferida. |
| Tecnología nombrada verificada y vigente | Pasa con observación | Las versiones existen y encajan con el brownfield; Node 22 sigue soportado durante el piloto. Cron está disponible, pero su estado Beta y el SLO de un minuto requieren aceptación operativa explícita. |
| Ratifica el brownfield | Falla | La eliminación de `anon` rompe el webhook actual si no se cambia su cliente; AD-1 también declara una regla que el Realtime actual no cumple sin reconocer la transición. |
| Cubre el PRD impulsor | Falla | Cubre las áreas, pero no fija fecha/hora exacta, snooze de una hora, matching de inbound ni contrato cerrado de eventos. |
| Cubre despliegue, entornos, infra, proveedores y operación | Falla | Hay topología, pero no aislamiento de datos, corte Auth, ingress concreto o bloqueante, readiness, alertas, RPO/RTO ni restore drill. |

## Crítico

### RW-C1 — El webhook y el scheduler no tienen una identidad de datos compatible con AD-3

**Evidencia**

- AD-3 elimina las políticas y grants privados de `anon` y exige ownership por `auth.uid()` (`ARCHITECTURE-SPINE.md:65-69`).
- AD-6 autoriza el webhook por token y el scheduler por secreto, pero no fija qué cliente Supabase usan ni a qué propietario quedan acotados (`ARCHITECTURE-SPINE.md:83-87`).
- El webhook actual llama repositorios que construyen `createSupabaseServerClient()` desde cookies. Evolution no envía una sesión Supabase; después del corte de RLS, `findLeadByPhone`, inserts y updates quedarían denegados (`app/api/webhooks/evolution/route.ts:122-139`, `lib/leads/repository.ts:220-228`, `lib/supabase/server.ts:10-32`).

**Divergencia posible**

- Una historia conserva el cliente SSR y rompe mensajes entrantes tras Auth.
- Otra cambia todo el webhook a `service_role` y consulta globalmente, eludiendo RLS sin un límite de propietario verificable.

**Corrección exacta propuesta — autofix del spine**

Reemplazar el último enunciado de AD-3 y ampliar AD-6 con tres modos exclusivos de acceso:

1. **Interactivo:** cliente SSR con JWT del asesor; `requireAdvisor()` valida `getUser()` en cada Server Action/Route Handler y RLS aplica `user_id = auth.uid()`.
2. **Proveedor/scheduler:** cliente privilegiado solo después de validar token/secreto; no usa cookies. Toda operación recibe el `advisor_user_id` configurado server-side y lo verifica dentro de RPCs `security definer` con `search_path` fijo, `REVOKE` a `public/anon/authenticated` y ejecución exclusiva del rol de servicio.
3. **Catálogo:** cliente público de solo lectura limitado a las políticas de `car_models` y `car_model_images`.

Añadir a AD-6 que el webhook persiste mensaje, resuelve lead, converge la acción de respuesta y emite evento mediante un único RPC privilegiado y acotado al asesor. Cambiar el diagrama para mostrar `provider/scheduler adapter -> privileged RPC`, no un repositorio SSR compartido.

## Altos

### RW-H1 — AD-7 no decide qué ocurre después de un resultado externo `UNKNOWN`

**Evidencia**

AD-7 exige una clave local y estados separados, pero dice que los reintentos reutilizan la clave sin decidir si vuelven a llamar al proveedor (`ARCHITECTURE-SPINE.md:89-93`). Ni Evolution ni HTTP Web Push quedan declarados como proveedores que honren esa clave. RFC 8030 define aceptación, TTL y recibos opcionales; no concede al application server una garantía general de deduplicación por una clave propia.

**Divergencia posible**

- Un worker recupera un lease vencido y reenvía después de que el proveedor aceptó antes del timeout: duplica WhatsApp o Push.
- Otro nunca recupera el lease: la fila queda bloqueada indefinidamente y el recordatorio no vuelve a evaluarse.

**Corrección exacta propuesta — autofix del spine**

Añadir a AD-7 una máquina de estados común: `PENDING -> CLAIMED(lease_until) -> ACCEPTED | REJECTED | UNKNOWN`; solo `REJECTED_RETRYABLE` comprobado vuelve a `PENDING`. Si el proveedor no ofrece idempotencia o reconciliación verificable, `UNKNOWN` **no se reenvía automáticamente**: queda `REVIEW_REQUIRED`, conserva la acción abierta y exige reconciliación o reintento humano explícito. Un lease expirado solo se reclama si existe evidencia de que la llamada externa no comenzó. Registrar por capacidad si hay deduplicación remota real; la clave local nunca se describe como garantía del proveedor.

### RW-H2 — El diagrama exige compartir un use case Node con una Edge Function Deno sin definir un seam viable

**Evidencia**

- El diagrama y AD-6 hacen que la Edge Function delegue al “mismo capability use case” (`ARCHITECTURE-SPINE.md:41-48`, `83-87`).
- Los use cases actuales bajo `lib/` dependen de `next/headers`, cookies, Server Actions y servicios Node (`lib/supabase/server.ts`, `lib/leads/actions.ts`).
- Supabase Edge Functions usan un runtime compatible con Deno y despliegan un grafo propio de módulos.

**Divergencia posible**

- El equipo Push copia la política de vencimientos dentro de `supabase/functions/dispatch-push`.
- El equipo Next mantiene una política distinta bajo `lib/push`; ambos cumplen nominalmente “capability use case”, pero divergen en claims, estados y eventos.

**Corrección exacta propuesta — autofix del spine**

Hacer al RPC de Postgres el seam compartido entre runtimes:

- `claim_due_push_deliveries(batch_size, lease_seconds)` decide vencimiento, unicidad, claim y emite `push_generated`.
- La Edge Function solo autentica, invoca ese RPC, ejecuta el adaptador VAPID y finaliza cada resultado mediante otro RPC compare-and-set.
- Next.js consume los mismos RPCs para acciones manuales o reconciliación.
- Código compartido en `supabase/functions/_shared` se limita a DTOs y utilidades Deno-puras; no es segundo dueño de reglas.

Cambiar el diagrama de `EDGE -> USECASES` a `EDGE -> PUSH ADAPTER -> DATABASE RPC`, manteniendo `ENTRY -> USECASES -> PORTS` para Next.js.

### RW-H3 — El corte a Supabase Auth no tiene arquitectura de sesión ni secuencia sin interrupción

**Evidencia**

- AD-3 fija email/password y el corte de RLS (`ARCHITECTURE-SPINE.md:65-69`).
- El Structural Seed solo añade `lib/auth/`; no incluye `/login`, `proxy.ts`, logout ni una lista de rutas públicas (`ARCHITECTURE-SPINE.md:177-198`).
- El código actual redirige `/` directamente a `/dashboard`, AppShell siempre presenta navegación privada y no existe guard de sesión.
- La documentación local de Next.js 16 exige autenticar cada Server Function y renombró `middleware` a `proxy`; el cliente Supabase SSR actual no tiene un renovador global de cookies.

**Divergencia posible**

- Un equipo confía solo en `proxy.ts`; otro solo en RLS; un tercero devuelve listas vacías cuando la sesión expira. La UX, los códigos de error y la seguridad no convergen.
- Aplicar la migración antes del build autenticado deja la app inutilizable; desplegar el build antes del backfill puede mostrar cero filas al usuario autenticado.

**Corrección exacta propuesta — autofix del spine**

Añadir a AD-3 y al Structural Seed:

- `app/login/`, acción de sign-in email/password, logout y `proxy.ts` para refresh/redirect de sesión.
- Rutas públicas exhaustivas: `/login`, `/api/health` y `/api/webhooks/evolution`; catálogo solo mediante RLS pública. Todo lo demás requiere sesión.
- `proxy.ts` mejora navegación, pero **cada** page loader, Server Action y Route Handler privado llama `requireAdvisor()`; no se usa Proxy como autorización única.
- Cutover con ventana de mantenimiento: cerrar tráfico público en ingress, verificar backup, crear/verificar cuenta, ejecutar backfill + checks + retirada de `anon`, desplegar build autenticado, smoke test con la cuenta y reabrir. Rollback restaura build y política compatible desde scripts preparados, no cambios manuales improvisados.

### RW-H4 — “Local usa el workflow existente” permite probar migraciones y efectos sobre el proyecto remoto real

**Evidencia**

- AD-13 no distingue base de datos local/dev de producción (`ARCHITECTURE-SPINE.md:125-129`).
- `README.md:19` y `README.md:40-47` dicen que Supabase es remoto y que el flujo aplica migraciones con `db push --linked`.
- El repositorio aún no tiene suite propia; el usuario exige conservar comportamiento probado.

**Divergencia posible**

- Una historia usa Supabase local; otra usa el proyecto vinculado de producción; ambas consideran que siguieron “el workflow existente”.
- Migraciones de Auth, RLS, RPC o Push se validan por primera vez contra datos reales.

**Corrección exacta propuesta — discutir y luego fijar**

Añadir una matriz de entornos vinculante:

| Entorno | Datos | Efectos externos | Migraciones |
| --- | --- | --- | --- |
| local | Supabase local con fixtures sin PII | mocks; Push/Evolution deshabilitados por defecto | reset completo y pruebas SQL/RLS |
| preview/dev, si se mantiene remoto | proyecto Supabase separado y cuenta de prueba | destinos de prueba explícitos | dry-run + apply antes de producción |
| production | clientes reales | flags server-side y credenciales reales | expand/backfill/verify/enable; nunca primera ejecución |

Si no se financiará un proyecto dev, el spine debe declarar Supabase local como gate obligatorio para schema/RLS/RPC y una ventana controlada para la única promoción a producción. Corporate permanece sin ejecución hasta AD-14.

### RW-H5 — FR-002 y FR-006 no quedan protegidos contra la semántica brownfield de “día a medianoche”

**Evidencia**

- El spine solo exige `timestamptz` y zona horaria (`ARCHITECTURE-SPINE.md:143`).
- El código actual acepta `days`, calcula 00:00 de Ecuador y ofrece `+1 día`, no fecha/hora exacta ni `+1 hora` (`lib/leads/follow-up.ts:16-23`, `lib/leads/actions.ts:88-109`, `lib/leads/validation.ts:10-25`).
- PRD FR-002 exige fecha y hora exactas; FR-006 exige inicialmente una hora y mañana para la respuesta.

**Divergencia posible**

- Una historia conserva recordatorios por día a 00:00; otra introduce instantes exactos. Las dos escriben `scheduled_for`, pero Push y orden de cola discrepan.

**Corrección exacta propuesta — autofix del spine**

Añadir una Rule de tiempo a AD-4/AD-5: `scheduled_for` siempre representa el instante exacto de ejecución en UTC derivado server-side de una fecha/hora interpretada en `America/Guayaquil`. Las acciones generales aceptan fecha y hora; la respuesta usa comandos semánticos `PLUS_ONE_HOUR` y `TOMORROW`, resueltos server-side a un instante explícito. El helper actual basado solo en días queda como compatibilidad temporal y no puede usarse en nuevas escrituras después de la migración.

### RW-H6 — La identidad “lead correspondiente” para mensajes entrantes sigue indeterminada

**Evidencia**

- AD-5 parte de que existe un lead correspondiente y un `provider_message_id` único (`ARCHITECTURE-SPINE.md:77-81`).
- El webhook actual normaliza el teléfono en memoria, trae hasta 500 leads y elige el primer match de una lista ordenada por creación descendente (`lib/leads/repository.ts:220-235`). No hay columna canónica indexada ni regla si existen varios leads con el mismo teléfono.
- El índice de mensaje usa solo `provider_message_id`; el spine no define instance/tenant scope ni comportamiento si el proveedor omite el ID.

**Divergencia posible**

- Un equipo asocia al lead más nuevo; otro al que tiene conversación `ACTIVE`; otro hace único el teléfono y bloquea capturas legítimas.

**Corrección exacta propuesta — autofix brownfield-compatible**

Añadir a AD-5:

- Persistir `phone_e164` normalizado y crear índice `(user_id, phone_e164, deleted_at, created_at desc)`.
- Para el piloto, resolver de forma determinista al lead no eliminado más reciente del asesor (`created_at desc, id desc`), que ratifica el comportamiento actual; cuando haya más de uno, emitir `inbound_lead_match_ambiguous`.
- La identidad de deduplicación es `(evolution_instance, provider_message_id)`. Si un evento de mensaje no trae ID estable, no puede mutar acciones hasta obtener una clave determinista documentada; debe registrarse como error funcional, no insertarse como evento reintentable sin identidad.

### RW-H7 — El envelope operativo no alcanza para desplegar y recuperar el host de producción

**Evidencia**

- AD-13 menciona “HTTPS ingress”, backups y logs, pero no decide quién termina TLS, qué puertos son públicos, readiness, alertas, RPO/RTO ni restauración (`ARCHITECTURE-SPINE.md:125-129`, `217-235`).
- El Compose actual publica Next en `0.0.0.0:3000`, Evolution solo en loopback y no contiene ingress. `/api/health` solo responde un JSON estático y no comprueba dependencias (`docker-compose.yml`, `app/api/health/route.ts:1-3`).
- NFR-004 exige generar Push dentro de un minuto; inspección manual de logs no detecta a tiempo un Cron detenido o backlog.

**Divergencia posible**

- Dos despliegues eligen Nginx, Caddy o exposición directa con reglas distintas; solo uno renueva TLS o mantiene Evolution privado.
- Un contenedor “healthy” puede llevar horas sin acceso a Supabase o con entregas vencidas sin reclamar.

**Corrección exacta propuesta — discutir/fijar antes de producción**

Crear una Rule operacional o un Deferred bloqueante que establezca:

- El proveedor concreto de ingress/TLS o, si aún no se elige, que producción no puede abrirse hasta elegirlo y verificar renovación automática. Solo 80/443 son públicos; Next, Evolution y Redis permanecen en red privada/loopback.
- `/api/health` es liveness; añadir readiness con timeouts para Supabase y Evolution sin exponer secretos.
- Alerta por Cron sin ejecución, `push_deliveries` vencidas sin claim durante más de un umbral compatible con NFR-004, tasa de `UNKNOWN/REJECTED` y disco/containers unhealthy.
- RPO/RTO, alcance de backup (Supabase + configuración cifrada; decisión explícita sobre volúmenes Evolution/Redis) y restore drill documentado antes del go-live.
- Runbook de rollback por migración/build/flag, responsable y smoke checks de captura, dashboard, WhatsApp, Realtime y soft delete.

## Medios

### RW-M1 — Falta el ciclo de vida y la deduplicación de `push_subscriptions`

**Evidencia**

AD-9 define ownership y deliveries, pero no la identidad ni rotación de una suscripción (`ARCHITECTURE-SPINE.md:101-105`). FR-020 y NFR-015 exigen distinguir inválida/vencida y reactivarla.

**Corrección exacta propuesta — autofix del spine**

Fijar que una suscripción se hace upsert por `(user_id, endpoint_digest)`; almacena endpoint, claves necesarias, `status`, `last_seen_at`, `invalidated_at` y código seguro. `404/410` la marcan `INVALID` atómicamente y excluyen envíos; una nueva suscripción reactiva o crea una identidad sin duplicar el mismo endpoint. La UI nunca borra una acción porque su suscripción cambió.

### RW-M2 — El contrato de eventos no es cerrado ni completamente durable

**Evidencia**

AD-10 fija un envelope, pero no obliga los nombres/datos mínimos de la tabla del PRD, no incluye `stage` de forma estructurada y no declara grants insert-only (`ARCHITECTURE-SPINE.md:107-111`; PRD §6). Además, `lead_capture_failed` no puede compartir transacción con una captura que hizo rollback y no puede persistirse en la misma base durante una caída total.

**Corrección exacta propuesta — autofix del spine**

- Declarar los nombres de PRD §6 como registro cerrado/versionado de `event_type`; cada tipo tiene payload mínimo validado por emisor central o RPC.
- Añadir `stage` y `actor_kind/actor_id` al envelope o exigirlos por evento cuando apliquen.
- Revocar update/delete para roles de aplicación; solo migraciones administrativas pueden corregir por append compensatorio.
- Éxitos y transiciones se emiten en la misma transacción. Fallos previos o rollbacks se registran en una segunda escritura best-effort con el mismo `correlation_id`; si Postgres está indisponible, stdout estructurado debe ir a un sink retenido y monitoreado. Si no se adoptará un sink, documentar esa limitación en vez de prometer durabilidad imposible.

### RW-M3 — El primer contacto parcial no decide ni difiere la reparación de recursos faltantes

**Evidencia**

AD-8 crea una operación única y resultados por recurso, pero no decide si un texto aceptado con imagen/ficha fallida puede reintentar solo el recurso (`ARCHITECTURE-SPINE.md:95-99`). `EXPERIENCE.md:219` deja esa validación pendiente con el asesor.

**Corrección exacta propuesta — mover a Deferred**

Añadir “reparación de primer contacto parcial” a Deferred. Boundary inmediato: recursos `ACCEPTED` nunca se reenvían; la operación queda `PARTIAL`; no hay reintento automático. Revisit condition: validación con el asesor de si se permite un comando manual, idempotente por `(contact_operation_id, resource_kind, resource_version)`, solo para recursos faltantes/fallidos.

### RW-M4 — AD-1 se presenta como realidad adoptada, pero el Realtime brownfield aún cruza la frontera

**Evidencia**

AD-1 prohíbe que componentes llamen Supabase directamente (`ARCHITECTURE-SPINE.md:53-57`). `components/dashboard/dashboard-client.tsx` importa el browser client y crea suscripciones Realtime. AD-2 exige evolución incremental, pero el spine no marca esta transición concreta.

**Corrección exacta propuesta — autofix del spine**

Añadir una cláusula de transición: el Realtime actual es una excepción brownfield conocida y no un patrón para código nuevo; la primera historia que toque esa suscripción la encapsula en un adaptador/hook de `lib/leads` que solo emite invalidaciones. Hasta entonces se preserva su comportamiento y el estado separado de refresh manual. Esto hace compatibles AD-1 y AD-2 sin exigir una reescritura previa.

## Bajos

### RW-L1 — Los tags de contenedor son compatibles, pero no reproducibles

`node:22-alpine` y `redis:7-alpine` ratifican el Dockerfile, pero son tags móviles; el stack los presenta como si fueran versiones cerradas (`ARCHITECTURE-SPINE.md:155-169`). Node 22 está soportado durante el piloto, aunque ya no es la línea LTS más nueva.

**Corrección exacta propuesta:** mantener los tags mayores como baseline brownfield, pero exigir lock por digest en producción o una política mensual de actualización + rollback. No es necesario migrar a Node 24 dentro de esta arquitectura si Next/build siguen validados.

### RW-L2 — La cardinalidad del ERD contradice el nombre genérico de operaciones

El ERD permite como máximo un `LEAD_CONTACT_OPERATION` por lead (`ARCHITECTURE-SPINE.md:209`), mientras AD-8 usa unicidad por `(lead_id, operation_type)`, lo que conceptualmente permite una por tipo.

**Corrección exacta propuesta:** cambiar a `LEAD ||--o{ LEAD_CONTACT_OPERATION` y conservar la unicidad por tipo, o renombrar la tabla a una entidad exclusiva de first contact y mantener `o|`. La primera opción es coherente con el nombre actual.

## Verificación de tecnología nombrada

- **Next.js 16.2.12 / React 19.2.4 / TypeScript 5.9.3 / Tailwind 4.3.3 / Zod 4.4.3 / Supabase JS 2.110.9 / SSR 0.12.3:** coinciden con los paquetes instalados y el lockfile. Next.js 16.2 está publicado oficialmente.
- **Evolution API 2.3.7:** existe como release oficial y coincide con Compose.
- **Ubuntu 24.04 LTS:** mantiene soporte estándar hasta 2029; es una elección vigente aunque exista Ubuntu 26.04 LTS.
- **Node 22:** permanece soportado durante el piloto 2026; el tag es móvil, no inexistente ni EOL.
- **Supabase Cron + Edge Functions:** la integración oficial existe y documenta ejecución cada minuto, Vault y `cron.job_run_details`; Edge Functions usan runtime Deno. Supabase presenta Cron como Beta, por lo que AD-13 debe aceptar ese riesgo y monitorearlo o dejar otro scheduler como fallback explícito.
- **Web Push/VAPID:** el estándar existe; RFC 8030 no convierte una clave idempotente local en deduplicación remota garantizada.

## Decisión del gate

No cambiar a `status: final` hasta resolver RW-C1 y RW-H1–RW-H7 dentro del spine. RW-M1, RW-M2 y RW-M4 tienen autofix claro y deberían entrar en la misma revisión. RW-M3 debe quedar explícitamente en Deferred. RW-L1 y RW-L2 pueden corregirse durante el polish final.
