# Story 4.10: Reapertura segura después de PASS

Status: ready-for-dev

## Story

Como responsable del release,
quiero reabrir la operación solo después de todas las precondiciones,
para que un fallo nunca vuelva a exponer datos privados anónimamente.

## Dependencies

- E4-S9: smoke brownfield completo con PASS.

## Acceptance Criteria

1. La reapertura exige artefactos PASS de E4-S1, E4-S4, E4-S7, E4-S8 y E4-S9, además de health/readiness y comprobación del usuario Auth singleton.
2. La secuencia es estricta: confirmar precondiciones, habilitar `AUTH_REQUIRED=true`, verificar una lectura/escritura autenticada reversible y solo entonces retirar el mantenimiento de UI. No se cambia `AUTH_REQUIRED` ni se reabre primero para comprobar después.
3. Si una precondición, health check o probe falla, el sistema queda en estado seguro: `AUTH_REQUIRED=true`, acceso anónimo privado cerrado, UI mutante en mantenimiento y callbacks sujetos al lock/resultado reintentable; no se restaura una policy/grant anónima como rollback.
4. Si ocurre un fallo después del cambio de flag pero antes de reabrir completamente, el runbook marca el release como FAIL, conserva el cierre privado y dirige a fix-forward o a un build compatible preparado por E4-S1; no intenta un rollback que reabra datos.
5. Tras una reapertura exitosa, se registra evidencia de login, lectura privada, escritura reversible, Realtime, webhook y soft delete, y se conserva el fallback funcional ante sesión vencida.
6. La story no añade funcionalidad de producto ni cambia el alcance de las épicas; únicamente cambia el estado operativo del cutover ya aprobado.

## Tasks / Subtasks

- [ ] Verificar artefactos y health/readiness antes de tocar flags.
- [ ] Ejecutar la secuencia de flag, probe autenticado reversible y reapertura.
- [ ] Implementar/validar el estado seguro de fallo y el runbook fix-forward.
- [ ] Registrar evidencia final y monitoreo inicial sin exponer secretos.

## Dev Notes

- AD-3 establece que un identity/RLS assertion fallido deja production en maintenance y que rollback nunca reabre acceso anónimo privado.
- `AUTH_REQUIRED` no sustituye RLS; ambos deben permanecer activos tras la reapertura.
- La PWA debe mostrar errores funcionales de sesión y conservar la lectura/fallback apropiado; no mostrar status HTTP crudo.
- El cierre de esta story no significa que gates locales de Android, ficha técnica o AD-14 estén resueltos.

### Testing Requirements

- Simular fallo en cada precondición y verificar estado seguro sin restaurar `anon`.
- Simular fallo entre flag y reapertura y verificar que no quedan escrituras interactivas abiertas por accidente.
- Ejecutar una reapertura controlada y repetir el smoke mínimo de login/lectura/escritura/Realtime/webhook/soft delete.

### Scope Guardrails

- No implementar navegador Android, fuente de ficha técnica, sincronización corporativa, pagos ni FR-036/FR-037.
- No modificar código de capabilities ajenas a la frontera Auth/RLS/eventos.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-13]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md#Voice-and-Tone]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
