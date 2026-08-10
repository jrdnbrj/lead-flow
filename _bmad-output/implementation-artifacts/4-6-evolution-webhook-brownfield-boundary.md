# Story 4.6: Boundary brownfield autenticado del webhook Evolution

Status: ready-for-dev

## Story

Como boundary de integración de LeadFlow,
quiero autenticar y normalizar el webhook Evolution conservando su comportamiento existente,
para que el cutover privado no rompa mensajes, estados ni respuestas del proveedor.

## Dependencies

- E4-S3: contrato de autenticación de webhook disponible.
- E4-S5b: append/event rejection y auditoría canónica disponibles.

## Acceptance Criteria

1. El Route Handler corre en Node, valida `EVOLUTION_WEBHOOK_TOKEN` server-side y no usa cookies, sesión humana ni acceso anónimo directo para autorizar el callback.
2. El boundary conserva los eventos brownfield actuales: `MESSAGES_UPSERT`/`MESSAGES_SET` para entrada y salida, `MESSAGES_UPDATE`/`SEND_MESSAGE` para salida; conserva `fromMe`, `remoteJidAlt`, exclusión de grupos/broadcast, normalización de teléfono, extracción de cuerpo/fecha y progresión de estados sin aplicar estados antiguos sobre estados más avanzados.
3. La identidad de deduplicación de un mensaje es exactamente `(evolution_instance, provider_message_id)`. `evolution_instance` se obtiene de la configuración/contexto confiable de la instancia autenticada, no de un valor arbitrario no validado del payload. La restricción, lookup y update usan ambos valores.
4. Un payload de mensaje sin `provider_message_id` estable es rechazado antes de insertar/actualizar `lead_messages`, resolver matching, clasificar, converger acciones o cambiar estado del lead. El rechazo autenticado queda auditado como `inbound_message_rejected` con fingerprint seguro y el response conserva el contrato de webhook sin afirmar procesamiento.
5. Los eventos con token ausente/inválido, JSON inválido, JID no asociable o evento no soportado no mutan datos privados; los errores no exponen token, cookies, payload crudo ni respuesta cruda del proveedor.
6. El boundary delega matching por teléfono, clasificación, convergencia de `Responder al cliente` y cualquier actualización de acciones al contrato dueño de Epic 2/Epic 1. No reimplementa esas políticas en el handler.
7. Se preservan la persistencia y respuestas brownfield existentes cuando el payload es válido: mensaje entrante/saliente, actualización de estado, `remoteJidAlt`, dirección `fromMe`, status rank, y el comportamiento de leads no encontrados quedan cubiertos por pruebas de compatibilidad.
8. Los callbacks durante Phase A pueden operar con token y owner singleton sin sesión humana. Durante Phase B todos los writers del callback toman el lock compartido definido por E4-S8; no se crea un bypass para evitarlo.

## Tasks / Subtasks

- [ ] Extraer un adapter/boundary fino sin duplicar la lógica de dominio existente.
- [ ] Incorporar `evolution_instance` a dedupe, lookup y migración/índice de mensajes.
- [ ] Añadir rechazo seguro y evidencia `inbound_message_rejected` para IDs faltantes.
- [ ] Mantener contrato HTTP y respuestas funcionales brownfield para casos válidos/rechazados.
- [ ] Añadir fixtures de todos los eventos y estados actuales, incluido replay y fuera de orden.

## Dev Notes

- El handler actual está en `app/api/webhooks/evolution/route.ts`: ya valida header, aplanamiento, `remoteJidAlt`, grupos/broadcast, `fromMe`, status rank y operaciones de repositorio.
- La migración 003 tiene hoy un índice único parcial solo sobre `provider_message_id`; el índice/constraint debe evolucionar de forma aditiva al par canónico.
- Mantener runtime `nodejs`, `dynamic = 'force-dynamic'` y secretos server-side.
- El audit fingerprint puede usar la instancia normalizada y provider ID válido; si el ID no existe, usa el digest del cuerpo normalizado según AD-10. Nunca guardar el payload completo en el evento.

### Testing Requirements

- Token ausente/inválido, JSON inválido, `MESSAGES_UPSERT`, `MESSAGES_SET`, `MESSAGES_UPDATE`, `SEND_MESSAGE`, inbound/outbound, `remoteJidAlt`, grupos, broadcast, ID faltante, duplicate composite key y estados fuera de orden.
- Verificar que payload sin ID deja cero inserciones/updates en mensaje, lead y acción.
- Verificar que dos instancias con el mismo provider ID no colisionan y que la misma instancia no produce dos filas.

### Scope Guardrails

- No decidir ni implementar allowlist/clasificación, matching múltiple, convergencia o acciones de respuesta.
- No implementar Push, primer contacto, sincronización corporativa, pagos, hitos posteriores ni Android target.

### References

- [Source: app/api/webhooks/evolution/route.ts]
- [Source: supabase/migrations/003_leadflow_follow_up_and_messages.sql]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-10]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
