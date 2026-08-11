# Story 4.3: Modos de entrada autenticados y contrato AUTH_REQUIRED

Status: done

## Story

Como sistema privado de un solo asesor,
quiero separar la autenticación humana de los entrypoints de proveedor y scheduler,
para que cada escritura tenga una frontera de confianza verificable y falle cerrada.

## Dependencies

- E4-S2: singleton de identidad y owner de configuración disponible.

## Entrypoint and AUTH_REQUIRED Matrix

| Superficie | Modo de confianza | `AUTH_REQUIRED=false` en Phase A | `AUTH_REQUIRED=true` |
| --- | --- | --- | --- |
| `/login` | Público | Disponible sin sesión | Disponible sin sesión |
| `/api/health` | Público/operativo, sin datos privados | Disponible sin sesión | Disponible sin sesión |
| `/dashboard` | Sesión humana del asesor para datos privados | Puede conservar únicamente la lectura brownfield anónima ya existente de filas legacy `user_id IS NULL`; no expone filas privadas del singleton ni habilita código nuevo | Requiere `requireAdvisor()`; sin sesión redirige a `/login` y nunca usa fallback anónimo |
| `/nuevo` | Sesión humana del asesor para escrituras privadas | Puede conservar únicamente la captura brownfield anónima ya existente de filas legacy sin ownership privado; no atribuye la escritura al singleton por conocer su UUID ni extiende la excepción a código nuevo | Requiere `requireAdvisor()`; sin sesión redirige a `/login` y no persiste |
| `/whatsapp` | Sesión humana del asesor | Requiere `requireAdvisor()` también en Phase A; sus settings, acciones y efectos no son una excepción anónima | Requiere `requireAdvisor()`; sin sesión redirige a `/login` y no muta |
| `/qr` | Sesión humana del asesor para la superficie de la PWA | Puede abrirse sin sesión solo como utilidad brownfield sin datos privados ni mutaciones privadas | Requiere `requireAdvisor()`; sin sesión redirige a `/login` |
| Loaders privados y Server Actions privadas | Sesión humana del asesor | Requieren `requireAdvisor()` salvo únicamente las operaciones brownfield anónimas enumeradas arriba; el flag no autoriza código nuevo | Requieren `requireAdvisor()`; devuelven resultado funcional `AUTH_REQUIRED` sin datos ni mutación |
| Webhook Evolution (`/api/webhooks/evolution`) | Token `EVOLUTION_WEBHOOK_TOKEN` server-side | No usa cookies ni depende del flag | No usa cookies ni depende del flag |
| Scheduler, en el entrypoint server/Edge definido por Architecture | `LEADFLOW_SCHEDULER_SECRET` server-side | No usa cookies ni depende del flag | No usa cookies ni depende del flag |
| `/api/ready` | Interno | No es superficie pública ni se expone por el proxy | No es superficie pública ni se expone por el proxy |

La compatibilidad `false` está limitada a las excepciones brownfield enumeradas y a su comportamiento legacy observable; no se aplica automáticamente a nuevas rutas, loaders, Server Actions ni escrituras privadas. El conocimiento del singleton de E4-S2 nunca sustituye la autorización del entrypoint.

## Acceptance Criteria

1. La sesión humana usa `/login` con email/password para el usuario provisionado; no existe signup público. `proxy.ts`/su implementación Supabase solo refresca cookies y redirige, mientras cada superficie humana privada de la matriz llama `requireAdvisor()` usando `getClaims()`. `requireAdvisor()` exige que `claims.sub` exista, sea un UUID válido y coincida exactamente con `leadflow_installation.advisor_user_id`; no basta cualquier usuario autenticado.
2. Ante sesión ausente o expirada, claims inválidos, singleton ausente o inválido, o UUID Auth distinto del singleton, `requireAdvisor()` devuelve el resultado funcional `AUTH_REQUIRED`, no devuelve datos privados y no realiza mutaciones privadas. Las páginas/loaders redirigen a `/login`; las Server Actions/Route Handlers privados devuelven el resultado funcional sin `401 Unauthorized` crudo ni detalles de proveedor. La UI muestra el mensaje funcional de sesión vencida.
3. El webhook Evolution es un modo separado: se autentica con `EVOLUTION_WEBHOOK_TOKEN` server-side, no usa cookies ni `AUTH_REQUIRED` como sustituto del token y delega en una operación/RPC privilegiada que deriva el owner desde `leadflow_installation`.
4. El scheduler es un tercer modo separado: valida `LEADFLOW_SCHEDULER_SECRET` en su entrypoint server/Edge, no usa cookies ni acepta un owner enviado por el caller y delega en contratos/RPCs que derivan el singleton internamente.
5. Las credenciales del webhook y scheduler no llegan a componentes cliente, logs, URLs, payloads de Push ni repositorio. El cliente admin/privilegiado solo se crea en superficies server-side.
6. Con `AUTH_REQUIRED=false`, solo las excepciones brownfield enumeradas en la matriz permanecen compatibles sin sesión; las nuevas superficies, loaders, Server Actions y escrituras privadas no heredan esa excepción. Ninguna compatibilidad anónima puede convertir ownership singleton en bypass de autorización. Con `AUTH_REQUIRED=true`, toda superficie humana privada sin sesión devuelve `AUTH_REQUIRED` o redirige a `/login` según la matriz, no existe fallback anónimo y webhook/scheduler continúan con sus mecanismos propios. Activar `AUTH_REQUIRED=true` antes de cumplir E4-S8/E4-S9 falla cerrado y nunca restaura acceso anónimo privado.
7. Las pruebas distinguen explícitamente los tres modos: sesión humana válida/ausente/expirada y usuario distinto del singleton, token Evolution válido/ausente/inválido y secreto scheduler válido/ausente/inválido; ningún modo puede impersonar a otro ni depender de `AUTH_REQUIRED` de un modo diferente.

## Tasks / Subtasks

- [ ] Implementar login/logout y el refresco SSR de cookies con los clientes existentes.
- [ ] Implementar `requireAdvisor()` contra el singleton: obtener claims server-side, validar `claims.sub` como UUID y compararlo exactamente con `leadflow_installation.advisor_user_id`; ante ausencia/expiración, claims inválidos, singleton ausente/inválido o mismatch devolver `AUTH_REQUIRED` sin datos ni mutación.
- [ ] Centralizar validación server-side del token Evolution y del secreto scheduler.
- [ ] Aplicar la matriz de entrypoints y `AUTH_REQUIRED`: conservar solo las excepciones brownfield anónimas enumeradas cuando el flag es `false`, exigir `requireAdvisor()` en nuevas superficies privadas y no usar cookies para webhook/scheduler; mantener `/api/ready` interno.
- [ ] Añadir pruebas de autorización y revisión de secretos en superficies browser/server.

## Dev Notes

- AD-6 define cuatro modos en total porque Push añade sesión + capability; esta story solo establece los tres modos relevantes para Epic 4 y no implementa comandos Push.
- `proxy.ts` nunca es la única autorización. La decisión real ocurre en loaders, actions, handlers o RPCs. La matriz de arriba es el contrato operativo de rutas y no debe sustituirse por una regla global basada solo en el proxy.
- `requireAdvisor()` compara el UUID validado de `claims.sub` con el único `advisor_user_id` de `leadflow_installation`; un usuario Auth válido pero distinto del singleton es rechazado como `AUTH_REQUIRED`.
- El webhook y scheduler usan clientes/contratos privilegiados, pero no pueden mutar tablas gobernadas directamente desde el runtime.
- `AUTH_REQUIRED` es un guard de autorización; no es una respuesta para callbacks que carezcan de token ni una forma de aceptar escrituras anónimas.

### Current Brownfield Context

- `lib/supabase/server.ts` crea actualmente un cliente SSR con `NEXT_PUBLIC_SUPABASE_ANON_KEY` y cookies.
- `lib/supabase/admin.ts` crea el cliente admin con `SUPABASE_SERVICE_ROLE_KEY`; la migración de nombres legacy es server-side y compatible.
- `app/api/webhooks/evolution/route.ts` ya valida `x-evolution-webhook-token`; E4-S6 conserva la conducta del webhook y usa este contrato.

### Testing Requirements

- Verificar para las superficies de la matriz `AUTH_REQUIRED=false` y `AUTH_REQUIRED=true`, incluyendo las excepciones brownfield `/dashboard`, `/nuevo` y `/qr`, y que `/whatsapp` siempre exige sesión en Phase A.
- Verificar `requireAdvisor()` con sesión válida del singleton, sesión ausente/expirada, `claims.sub` malformado, singleton ausente/inválido y usuario Auth válido pero distinto; cada caso negativo debe devolver `AUTH_REQUIRED`, sin datos privados ni mutaciones.
- Verificar que cada modo rechaza credenciales de otro modo y que todas las respuestas de rechazo no producen escrituras: webhook solo acepta su token, scheduler solo acepta su secreto y ninguno acepta cookies o `AUTH_REQUIRED` como sustituto.
- Verificar que el error para la PWA es funcional y que no se filtran cookies, headers, tokens o payloads de proveedor.
- No probar aquí las acciones de otras épicas ni asumir que Push directo está soportado por el navegador.

### Scope Guardrails

- No modificar clasificación/matching/convergencia de mensajes.
- No instrumentar capabilities futuras ni implementar sincronización corporativa antes de AD-14.
- No activar el cutover ni revocar anon; eso es E4-S8.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-12]
- [Source: lib/supabase/server.ts]
- [Source: lib/supabase/admin.ts]
- [Source: app/api/webhooks/evolution/route.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md#Voice-and-Tone]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
