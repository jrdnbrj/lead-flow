# Story 4.10: Reapertura segura después de PASS

Status: ready-for-dev

## Story

Como responsable del release,
quiero reabrir la operación solo después de todas las precondiciones,
para que un fallo nunca vuelva a exponer datos privados anónimamente.

## Dependencies

- E4-S9: smoke brownfield completo con PASS.

## Acceptance Criteria

1. Antes de tocar flags o liberar writers, la reapertura exige el runbook versionado `supabase/verification/e4-s10-safe-reopen-runbook.md` con refs de evidencia PASS y fingerprints vigentes de E4-S1, E4-S4, E4-S7, E4-S8 y E4-S9, más health/readiness reproducible y comprobación del usuario Auth singleton. El runbook registra versión de migraciones, entorno, correlation ID y resultado por precondición; cualquier ref ausente, stale, finding aplicable, health/readiness no reproducible o singleton inválido produce FAIL y no inicia.
2. La secuencia es estricta y queda registrada paso a paso: confirmar todas las precondiciones; conservar la UI/escritura en mantenimiento y el lock/resultado reintentable de callbacks; verificar o habilitar `AUTH_REQUIRED=true` sin deshabilitarlo; ejecutar login, lectura privada y escritura autenticada reversible; repetir el mínimo de Realtime, webhook autenticado y soft delete definido por E4-S9; y sólo después de todos los PASS retirar el mantenimiento y liberar writers. Cada transición tiene estado observado, timestamp y correlation ID. No se reabre primero para comprobar después ni se libera un writer parcialmente.
3. Si una precondición, health check o probe falla, el reporte queda FAIL y las assertions obligatorias son: `AUTH_REQUIRED=true`, acceso anónimo privado cerrado, UI mutante en mantenimiento, policies/grants anónimos privados sin restaurar y callbacks sujetos al lock o a un resultado reintentable seguro. Se registra el paso fallido, observed state, correlation ID y cleanup; no se restaura una policy/grant anónima como rollback.
4. Si ocurre un fallo después de verificar o cambiar el flag pero antes de reabrir completamente, el runbook marca el release como FAIL, conserva `AUTH_REQUIRED=true`, el cierre privado y el mantenimiento, y dirige a fix-forward o a un build compatible preparado con el baseline/restore de E4-S1. La ruta de recuperación no relaja RLS/grants, no reabre datos privados y exige un nuevo PASS completo antes de liberar writers.
5. Tras una reapertura exitosa, `supabase/verification/e4-s10-safe-reopen-report.md` registra PASS por login/logout, lectura privada con negativo de usuario incorrecto/anónimo, escritura reversible, Realtime automático y fallback manual, webhook autenticado con destino controlado, soft delete con cancelación/conservación/no-rematching y fallback funcional ante sesión vencida. Cada paso contiene setup, acción, esperado, observado, cleanup, timestamp UTC, entorno, fixture/usuario y correlation ID; incluye una ventana de observación inicial y nunca persiste secretos ni afirma entrega física.
6. La story no añade funcionalidad de producto ni cambia el alcance de las épicas; únicamente ejecuta/documenta el estado operativo del cutover ya aprobado. No modifica migraciones, policies, grants, RPCs ni capabilities ajenas para fabricar un PASS; cualquier cambio de código o schema queda fuera de esta story y bloquea su cierre.

## Tasks / Subtasks

- [ ] Verificar artefactos PASS, fingerprints, health/readiness y singleton antes de tocar flags.
- [ ] Ejecutar la secuencia controlada de mantenimiento, `AUTH_REQUIRED=true`, probes autenticados reversibles y reapertura.
- [ ] Simular fallos de cada precondición y el punto entre flag y reapertura; verificar assertions fail-closed, callback reintentable y fix-forward.
- [ ] Generar `supabase/verification/e4-s10-safe-reopen-runbook.md` y `supabase/verification/e4-s10-safe-reopen-report.md` con evidencia final, ventana de observación y monitoreo inicial sin exponer secretos.

## Dev Notes

- AD-3 establece que un identity/RLS assertion fallido deja production en maintenance y que rollback nunca reabre acceso anónimo privado.
- `AUTH_REQUIRED` no sustituye RLS; ambos deben permanecer activos tras la reapertura.
- La PWA debe mostrar errores funcionales de sesión y conservar la lectura/fallback apropiado; no mostrar status HTTP crudo.
- El cierre de esta story no significa que gates locales de Android, ficha técnica o AD-14 estén resueltos.

### Testing Requirements

- Simular fallo en cada precondición y verificar en el reporte `AUTH_REQUIRED=true`, RLS/grants privados anónimos cerrados, mantenimiento, cleanup y callback reintentable sin restaurar `anon`.
- Simular fallo entre flag y reapertura y verificar que no quedan escrituras interactivas abiertas por accidente ni una transición parcial sin correlation ID.
- Ejecutar una reapertura controlada y repetir el smoke mínimo de login/logout, lectura privada correcta e incorrecta/anónima, escritura reversible, Realtime automático/fallback, webhook con fixture controlado y soft delete/no-rematching.
- Verificar la ventana de observación inicial y que los artefactos no contienen secretos ni status HTTP crudo para el usuario.

### Scope Guardrails

- No implementar navegador Android, fuente de ficha técnica, sincronización corporativa, pagos ni FR-036/FR-037.
- No modificar código de capabilities ajenas a la frontera Auth/RLS/eventos.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-13]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md#Voice-and-Tone]
- [Source: _bmad-output/implementation-artifacts/4-1-backup-and-restore-baseline.md]
- [Source: _bmad-output/implementation-artifacts/4-3-auth-entry-modes-and-required-auth.md]
- [Source: _bmad-output/implementation-artifacts/4-4-backfill-dry-run.md]
- [Source: _bmad-output/implementation-artifacts/4-7-rls-grants-target-matrix.md]
- [Source: _bmad-output/implementation-artifacts/4-8-phase-b-cutover-and-backfill.md]
- [Source: _bmad-output/implementation-artifacts/4-9-brownfield-readiness-smoke.md]
- [Source: app/api/webhooks/evolution/route.ts]
- [Source: app/dashboard/page.tsx]
- [Source: components/dashboard/dashboard-client.tsx]
- [Source: lib/leads/actions.ts]
- [Source: lib/leads/repository.ts]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
