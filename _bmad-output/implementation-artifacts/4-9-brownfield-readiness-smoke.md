# Story 4.9: Readiness y smoke brownfield completo

Status: ready-for-dev

## Story

Como responsable de release,
quiero demostrar el flujo brownfield completo después de Phase B y antes de reabrir escrituras,
para detectar regresiones de acceso, captura, WhatsApp, Realtime y borrado lógico.

## Dependencies

- E4-S8: cutover Phase B, backfill y enforcement final completados.

## Acceptance Criteria

1. El smoke se ejecuta con `AUTH_REQUIRED` aún sin reabrir la UI anónima y registra PASS/FAIL por paso, entorno, usuario/fixture, timestamp y correlation ID.
2. El recorrido incluye obligatoriamente: login humano y logout; captura de un lead de prueba; lectura del dashboard; recepción/actualización de WhatsApp mediante el webhook autenticado; actualización Realtime de lead/mensaje/acción sin recarga; y soft delete del lead de prueba.
3. La captura conserva campos actuales y ownership singleton; el dashboard solo muestra datos privados del usuario correcto y excluye el lead soft-deleted.
4. WhatsApp verifica token server-side, inbound/outbound brownfield, `remoteJidAlt`/phone válido cuando aplique, dedupe composite y estados; no afirma entrega física. El fixture sin ID demuestra rechazo sin mutación.
5. Realtime verifica actualización automática autenticada y conserva el fallback de refresh manual; un fallo de Realtime no se presenta como pérdida de datos.
6. Soft delete usa el RPC existente/evolucionado, oculta el lead, cancela acciones abiertas según el contrato y evita que el webhook vuelva a asociarlo; conserva mensajes/evidencia.
7. Se verifican eventos canónicos, `push_delivery_scheduled → push_generated → push_service_result` solo como contrato/registry si no existe la capability Push, secretos únicamente server-side y mensajes funcionales ante Auth/error; no se instrumentan capabilities futuras para fabricar PASS.
8. Un paso FAIL mantiene el sistema en mantenimiento y bloquea E4-S10. No se reabre primero para comprobar después.

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

- Cada paso tiene setup, acción, evidencia esperada y cleanup; un reporte “smoke passed” sin artefactos no cierra la story.
- Verificar que los datos privados no son visibles con un usuario incorrecto/anónimo y que no se reactivan policies anónimas al fallar.
- Ejecutar las validaciones base del proyecto cuando el cambio toque código/migraciones.

### Scope Guardrails

- No probar ni implementar hitos FR-036/FR-037, pagos, financiación, entrega, corporativo, navegador Android objetivo ni ficha técnica.
- No generar historias de otras épicas.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-13]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md#State-Patterns]
- [Source: app/api/webhooks/evolution/route.ts]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
