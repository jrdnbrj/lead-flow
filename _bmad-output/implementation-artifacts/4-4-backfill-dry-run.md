# Story 4.4: Preparación y dry-run verificable del backfill

Status: done

## Story

Como responsable del cutover,
quiero preparar y validar el backfill sin modificar datos,
para saber antes de Phase B qué filas, relaciones y ownership requieren corrección.

## Dependencies

- E4-S1: backup/restore verificados.
- E4-S2: singleton y ownership actual preparados.

## Acceptance Criteria

1. Existe una receta versionada de dry-run con este inventario brownfield cerrado:
   - Ownership roots actuales: `leads.user_id` y `leadflow_settings.user_id` después de E4-S2.
   - Identidad de instalación: `leadflow_installation.advisor_user_id` es la autoridad esperada; no es una fila candidata a backfill.
   - Relaciones derivadas actuales: `lead_messages.lead_id -> leads.id` y `lead_follow_up_actions.lead_id -> leads.id`. No se agrega `user_id` a estas tablas.
   - Campo legacy: `leads.tenant_id` se conserva, se reporta como legacy y nunca es autoridad de ownership.
   - Roots o relaciones futuras de AD-3 que aún no existan, incluidos `push_subscriptions.user_id`, `external_effects.user_id`, `leadflow_events.user_id`, `lead_contact_operations`, `lead_contact_operation_items`, `lead_milestones` y `push_deliveries`, aparecen como `N/A`; su ausencia no produce `FAIL` y no autoriza crearlos en esta story.

   El inventario incluye, sin invocarlos desde el dry-run, los writers brownfield actuales que pueden crear o modificar estos datos: `lib/leads/actions.ts:createLeadAction`, `sendLeadWhatsappAction`, `scheduleLeadActionAction`, `updateFollowUpActionAction`, `clearLeadActionAction`, `updateLeadConversationAction` y `deleteLeadAction`; `lib/leads/repository.ts:createLead`, `updateLeadWhatsappStatus`, `markLeadAfterOutboundMessage`, `createFollowUpAction`, `updateFollowUpAction`, `clearLeadAction`, `softDeleteLead`, `markLeadCustomerReply`, `updateLeadConversationState`, `createLeadMessage`, `updateLeadMessage` y `updateLeadMessageByProviderId`; `app/api/webhooks/evolution/route.ts:POST` mediante `processIncomingMessage` y `processOutboundEvent`; `lib/config/actions.ts:saveSellerProfileOverrideAction` y `lib/config/message-actions.ts:saveWhatsappMessageTemplateAction`, ambos delegando en `lib/config/persistent-settings.ts:savePersistentSettings` como writer brownfield de `leadflow_settings`; `supabase/functions/send-whatsapp-welcome/index.ts:updateWhatsappStatus`; la función/trigger `supabase/migrations/004_leadflow_follow_up_actions.sql:sync_lead_next_action_summary`; y el RPC `supabase/migrations/008_soft_delete_lead_rpc.sql:soft_delete_lead`. El dry-run no invoca ninguno de estos writers ni modifica datos. No se inventan ni se incluyen writers de capabilities futuras. La receta no crea tablas ni capabilities futuras.

2. El dry-run calcula, por root y por relación derivada, conteos de filas, `NULL`, orphan, owner mismatch, relaciones inválidas, duplicados inválidos y filas soft-deleted relevantes, además del total de filas directas `NULL` candidatas al futuro backfill. Las filas derivadas no reciben un `user_id` inventado ni se cuentan como candidatas a asociación directa.

   El contrato de duplicados es limitado a estas invariantes del baseline: `lead_messages.provider_message_id` no nulo repetido dentro de la identidad canónica vigente, cuya implementación actual es el índice parcial `lead_messages_provider_id_idx`, y violación de la unicidad esperada de `leadflow_settings.id = 'default'` o su equivalente vigente. Teléfonos repetidos entre leads, múltiples oportunidades con el mismo teléfono, varios mensajes con `provider_message_id = NULL` y varias acciones válidas para un mismo lead no son duplicados inválidos por sí mismos. No se implementan checks de duplicación de reglas futuras.

   Un lead existente con `deleted_at` no nulo sigue siendo ownership root válido. Sus mensajes y acciones con `lead_id` válido participan en integridad y ownership, se identifican como soft-deleted por su lead padre y no son orphan. Solo se excluyen de métricas operativas activas. Un `lead_id` sin fila de lead existente es orphan y produce `FAIL`.

3. Para el baseline actual cubre `leads`, `leadflow_settings`, `lead_messages`, `lead_follow_up_actions`, sus constraints/FKs/índices aplicables y los writers brownfield enumerados arriba. `leadflow_settings` puede tener cero o una fila en el estado brownfield porque el lector actual usa `maybeSingle()` y fallback; si existe una fila, su identidad `default` y su `user_id` deben ser válidos y coincidir con el singleton. Más de una fila, una identidad inválida o un owner inválido produce `FAIL`. Los derivados validan ownership exclusivamente por `lead_id`.

4. La receta produce un reporte reproducible con timestamp y metadatos de ejecución, versión de migración, identidad esperada, queries o mecanismos verificables, umbrales y un resultado por check. Cada resultado contiene como mínimo `check_id`, nombre, mecanismo/query, conteo, umbral, filas candidatas `NULL`-owned y estado `PASS`, `FAIL` o `N/A`.

   `PASS` exige que todos los checks aplicables pasen y que no exista ningún finding aplicable. `FAIL` se produce si falta un objeto brownfield requerido, una FK/índice/constraint requerida del baseline, un ownership root actual es inválido, existe orphan, mismatch, relación inválida, duplicado inválido, inconsistencia de `leadflow_settings` o cualquier otro finding aplicable distinto de cero. `N/A` se usa únicamente para una tabla, capability o root futuro aún inexistente o para un check que no aplica al baseline actual; no cuenta como `FAIL`.

   Repetir el dry-run sobre el mismo estado produce resultados funcionalmente idénticos, incluidos conteos, findings, umbrales y estados; solo pueden variar el timestamp y otros metadatos de ejecución. Un dry-run con cualquier null/orphan/mismatch, duplicado inválido o finding aplicable no pasa silenciosamente.
5. El dry-run no ejecuta `UPDATE`, `DELETE`, `INSERT`, `ALTER`, cambios de policy/grant ni llamadas a efectos externos. Debe ejecutarse en local/preview y contra producción únicamente en modo estrictamente lectura para preparar E4-S8.
6. E4-S8 recibe el artefacto de dry-run como precondición y es el único lugar donde se permite ejecutar el backfill modificante.

## Tasks / Subtasks

- [ ] Inventariar el esquema real y resolver la lista de roots presentes.
- [ ] Implementar la receta de conteo y validación sin sentencias mutantes.
- [ ] Validar la asociación de `leadflow_settings` creada por E4-S2.
- [ ] Generar fixtures aislados de null/orphan/mismatch, relación inválida, duplicado de `provider_message_id` y lead soft-deleted; comprobar que los findings fallan y que las multiplicidades válidas no fallan.
- [ ] Comprobar que los roots futuros ausentes se reportan como `N/A` y que un objeto brownfield requerido ausente produce `FAIL`.
- [ ] Verificar que repetir el dry-run no cambia datos ni resultados funcionales.
- [ ] Guardar un ejemplo PASS reproducible y documentar cómo transferirlo a E4-S8.

## Dev Notes

- La arquitectura exige backfill y verificación antes de retirar políticas o columnas antiguas; la preparación no debe adelantar el cutover.
- Si un root arquitectónico futuro aún no existe en el brownfield, reportarlo en el inventario como `N/A`, no crear la capability dentro de Epic 4 y excluirlo del resultado PASS/FAIL.
- Los objetos actuales requeridos por el baseline que falten —tabla, columna, FK, índice o constraint aplicable— producen `FAIL`; no se reparan ni se crean durante el dry-run.
- La receta debe ser idempotente en lectura y no depender de datos mock como fuente de verdad.
- Las filas `NULL` directas de ownership se reportan como candidatas para el futuro backfill; orphan, mismatch y duplicados inválidos son findings y no se convierten silenciosamente en candidatos.
- No normalizar ni reparar teléfonos, clasificar mensajes ni converger acciones: son ownership de Epic 2/1.

### Testing Requirements

- Probar que el dry-run no cambia conteos ni `updated_at`.
- Probar casos PASS, null, orphan, mismatch, relación inválida, duplicado inválido, lead soft-deleted con relaciones válidas, tabla/índice/FK/constraint requerido ausente y root futuro ausente como `N/A`.
- Probar que teléfonos repetidos, múltiples oportunidades con el mismo teléfono, mensajes con `provider_message_id = NULL` y varias acciones válidas por lead no fallan como duplicados.
- Probar dos ejecuciones sobre el mismo estado y comparar resultados funcionales, excluyendo timestamp y metadatos de ejecución.
- El reporte debe ser suficiente para que un operador diferente reproduzca el resultado.

### Scope Guardrails

- No ejecutar backfill modificante; no congelar escrituras; no instalar RLS final.
- No tomar locks de cutover, revocar policies/grants ni ejecutar cutover o reapertura.
- No implementar sincronización corporativa, Push, primera contacto ni compra.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#Environment-Isolation]
- [Source: supabase/migrations/001_leadflow_core_schema.sql]
- [Source: supabase/migrations/003_leadflow_follow_up_and_messages.sql]
- [Source: supabase/migrations/004_leadflow_follow_up_actions.sql]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]
- [Source: lib/leads/actions.ts]
- [Source: lib/leads/repository.ts]
- [Source: app/api/webhooks/evolution/route.ts]
- [Source: lib/config/actions.ts]
- [Source: lib/config/message-actions.ts]
- [Source: lib/config/persistent-settings.ts]
- [Source: supabase/functions/send-whatsapp-welcome/index.ts]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
