# Story 4.5b: Enforcement del registry y atomicidad de eventos

Status: ready-for-dev

## Story

Como autoridad transaccional de PostgreSQL,
quiero impedir eventos no registrados y exigir append atómico con las mutaciones que los declaran,
para que una mutación no quede completa cuando su evidencia canónica falló.

## Dependencies

- E4-S5a: registry, envelope y append port disponibles.

## Acceptance Criteria

1. Un `event_type` ausente del registry, una categoría inválida, un payload fuera de contrato o una receta de `event_key` incompatible son rechazados antes de confirmar el append.
2. Los callers no pueden elegir libremente `stable_fact_id`, `aggregate_type`, `aggregate_id` o `aggregate_version`; el owning RPC deriva esos valores de la fila y transición que posee.
3. Cuando una mutación gobernada declara un evento canónico, mutación y evento confirman en una misma transacción; si el append falla, la mutación se revierte y el resultado observable es un error funcional con `correlation_id`.
4. La unicidad de `event_key` hace idempotente el replay: el mismo comando no crea una segunda fila ni una segunda transición. Un conflicto de versión devuelve el resultado funcional establecido por el owning RPC, no una mutación parcial.
5. `leadflow_events` no admite update/delete desde roles de aplicación; las correcciones se agregan como `audit_correction` y no reescriben evidencia histórica.
6. La prueba de enforcement usa una transacción controlada y contratos existentes; no instrumenta capabilities futuras ni crea eventos ficticios de Push, WhatsApp o corporativos para declarar Epic 4 completa.
7. El contrato de cancelación se limita a que `CANCELED` sea una transición de `lead_follow_up_actions` y `next_action_canceled` su evento registry canónico; no se crea una segunda state machine.

## Tasks / Subtasks

- [ ] Añadir foreign key/check y funciones de validación contra `leadflow_event_registry`.
- [ ] Encapsular append y key construction en el contrato de infraestructura.
- [ ] Probar rollback mutación+evento, replay y conflictos de versión.
- [ ] Revocar update/delete y validar `audit_correction` como única corrección append-only.
- [ ] Mantener fuera de scope la instrumentación de capabilities futuras.

## Dev Notes

- Esta story es deliberadamente separada de E4-S5a: S5a entrega vocabulario/port; S5b impone los límites transaccionales y de integridad.
- La arquitectura exige que los eventos de transición y la mutación se comprometan juntos, pero los operational tables siguen siendo la fuente de estado.
- Si PostgreSQL no está disponible durante una falla previa al commit, solo se conserva el fallback estructurado de stdout previsto por AD-10; no se inventa una segunda base de eventos.
- `next_action_canceled` no debe ser usado para eliminar físicamente acciones ni para cancelar por sí mismo Push; esas consecuencias pertenecen al owning RPC de acciones y a Epic 5.

### Testing Requirements

- Casos mínimos: evento desconocido, payload inválido, key incorrecta, append fallido, replay, conflicto de versión, update/delete directo y corrección auditada.
- Cada caso debe registrar PASS/FAIL, efecto en filas y ausencia/presencia de evento esperada.

### Scope Guardrails

- No instrumentar todas las capabilities ni generar historias de otras épicas.
- No alterar el comportamiento de Push, primer contacto, clasificación, matching o milestones.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-10]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]
- [Source: supabase/migrations/004_leadflow_follow_up_actions.sql]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
