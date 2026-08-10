# Story 4.9: Readiness y smoke brownfield completo

Status: ready-for-dev

## Story

Como responsable de release,
quiero demostrar el flujo brownfield completo después de Phase B y antes de reabrir escrituras,
para detectar regresiones de acceso, captura, WhatsApp, Realtime y borrado lógico.

## Dependencies

- E4-S8: cutover Phase B, backfill y enforcement final completados.

## Acceptance Criteria

1. El smoke se ejecuta después del PASS de E4-S8 y con `AUTH_REQUIRED=true`: las rutas privadas siguen cerradas al usuario anónimo y no se reabre UI ni escritura anónima durante esta story. El resultado se entrega en `supabase/verification/e4-s9-brownfield-smoke-report.md`, con un registro por paso que contiene `step_id`, PASS/FAIL, entorno, fixture/usuario, timestamp UTC, correlation ID, setup, acción, esperado, observado y cleanup; la ausencia del reporte o de cualquiera de esos campos es FAIL.
2. En un entorno local/preview controlado y con fixtures aislados, el recorrido incluye obligatoriamente: login humano y logout; captura de un lead de prueba del singleton; lectura del dashboard; recepción/actualización de WhatsApp mediante el webhook autenticado; actualización Realtime de lead/mensaje/acción sin recarga; y soft delete del lead de prueba. Incluye probes con usuario incorrecto y anónimo, cleanup verificable y un destino WhatsApp mock o controlado por el entorno; nunca envía ni simula un PASS sobre clientes reales.
3. La captura conserva campos actuales y ownership singleton; el dashboard solo muestra datos privados del usuario correcto, rechaza la lectura con usuario incorrecto/anónimo y excluye el lead soft-deleted. El reporte prueba también que el fixture queda aislado y se limpia sin alterar datos de negocio ajenos.
4. WhatsApp verifica token sólo server-side, inbound/outbound brownfield, `remoteJidAlt`/phone válido cuando aplique, estados y dedupe por la clave exacta `(evolution_instance, provider_message_id)`. El reporte ejecuta fixtures inbound, outbound, duplicate y sin ID; el fixture sin ID demuestra rechazo sin mutación, el duplicate no duplica persistencia y ningún caso afirma entrega física ni contacta clientes reales.
5. Realtime verifica con sesión autenticada la actualización automática de lead, mensaje y acción sin recarga, registra explícitamente `automática activa` o `no disponible` y conserva el fallback `Actualizar datos`. Un fallo de Realtime no se presenta como pérdida de datos: el reporte separa el estado de transporte de la persistencia observada.
6. Soft delete usa el RPC existente/evolucionado, oculta el lead, cancela acciones abiertas según el contrato y evita que un inbound posterior del webhook vuelva a asociarlo; conserva mensajes/evidencia y verifica cada resultado en persistencia y en la vista privada.
7. Se verifican eventos canónicos y secretos únicamente server-side. `push_delivery_scheduled → push_generated → push_service_result` se comprueba sólo contra el contrato/registry aprobado cuando exista la capability Push; si no existe, se registra `NOT_APPLICABLE` con evidencia del registry y no se fabrica PASS instrumentando una capability futura. También se verifican mensajes funcionales ante Auth/error.
8. Un paso FAIL conserva `AUTH_REQUIRED=true`, la UI/escritura anónima cerrada y el sistema en mantenimiento, y bloquea E4-S10. El reporte queda FAIL con su correlation ID; no se reabre primero para comprobar después ni se relajan policies/grants para hacer pasar el smoke.

## Tasks / Subtasks

- [ ] Preparar fixtures aislados y destino seguro de WhatsApp/mock según el entorno.
- [ ] Ejecutar login/logout, captura, dashboard y Realtime.
- [ ] Ejecutar fixtures webhook inbound/outbound/duplicate/rejected y verificar persistencia.
- [ ] Ejecutar soft delete y verificar exclusión, cancelación y no rematching.
- [ ] Validar eventos/secretos/errores y generar reporte objetivo de PASS/FAIL.

## Dev Notes

- La cobertura exigida por AD-13 es login, capture, dashboard, WhatsApp, Realtime y soft delete; no sustituirla por smoke de health/build.
- El test de WhatsApp debe usar un destino controlado o mock aprobado por el entorno; nunca filtrar credenciales ni enviar a clientes reales por accidente.
- El mensaje de sesión debe ser funcional (“La sesión ... venció. Vuelve a entrar...”), nunca `401 Unauthorized`.
- El escenario de Realtime debe distinguir `Actualización automática activa/no disponible` de `Actualizar datos`.

### Testing Requirements

- Cada paso tiene setup, acción, esperado, observado, evidencia y cleanup en `supabase/verification/e4-s9-brownfield-smoke-report.md`; el reporte incluye el estado `AUTH_REQUIRED`, entorno, fixture/usuario, timestamp UTC y correlation ID. Un reporte “smoke passed” sin artefactos, negativos de privacidad o cleanup no cierra la story.
- Verificar que los datos privados no son visibles con un usuario incorrecto/anónimo, que no se reactivan policies anónimas al fallar y que ningún fixture de WhatsApp usa un destino real.
- Ejecutar las validaciones base del proyecto cuando el cambio toque código/migraciones.

### Scope Guardrails

- No probar ni implementar hitos FR-036/FR-037, pagos, financiación, entrega, corporativo, navegador Android objetivo ni ficha técnica.
- No generar historias de otras épicas.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-13]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md#State-Patterns]
- [Source: _bmad-output/implementation-artifacts/4-8-phase-b-cutover-and-backfill.md]
- [Source: _bmad-output/implementation-artifacts/4-10-safe-reopen-and-final-verification.md]
- [Source: app/api/webhooks/evolution/route.ts]
- [Source: app/dashboard/page.tsx]
- [Source: app/nuevo/page.tsx]
- [Source: app/whatsapp/page.tsx]
- [Source: components/dashboard/dashboard-client.tsx]
- [Source: components/leads/lead-capture-form.tsx]
- [Source: lib/leads/actions.ts]
- [Source: lib/leads/repository.ts]
- [Source: supabase/migrations/003_leadflow_follow_up_and_messages.sql]
- [Source: supabase/migrations/004_leadflow_follow_up_actions.sql]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
