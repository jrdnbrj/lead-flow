# Story 4.8: Cutover Phase B, lock, backfill y enforcement final

Status: ready-for-dev

## Story

Como responsable del cutover privado,
quiero ejecutar el backfill y el enforcement final dentro de una ventana bloqueada y reversible,
para que ninguna escritura concurrente deje ownership, RLS o auditoría en un estado mixto.

## Dependencies

- E4-S1, E4-S2, E4-S3, E4-S4, E4-S5a, E4-S5b, E4-S6 y E4-S7, todos con PASS verificable.

## Acceptance Criteria

1. La ejecución exige como precondiciones PASS verificable de E4-S1, E4-S2, E4-S3, E4-S4, E4-S5a, E4-S5b, E4-S6 y E4-S7, además de la existencia del usuario Auth singleton y del reporte PASS vigente de E4-S4 como input inmutable; si falta cualquier evidencia, el usuario Auth o el reporte, no inicia.
2. Antes de tomar el lock exclusivo se ponen en mantenimiento todas las escrituras interactivas de la PWA. El artefacto versionado `supabase/verification/e4-s8-cutover-writers.md`, derivado del inventario cerrado de E4-S4, enumera cada writer que puede tocar un ownership root y su modo `FROZEN` o `SHARED_LOCK`. También se congelan o coordinan todas las escrituras no interactivas incompatibles con el backfill: webhook, scheduler, callbacks/provider jobs y cualquier job server-side que toque un ownership root; no se congela solo el navegador. Un writer no listado o sin cobertura produce FAIL y bloquea el cutover.
3. Cada writer que pueda modificar un ownership root adquiere el lock transaccional compartido `leadflow_auth_cutover` antes de mutar. El cutover toma la forma exclusiva del mismo lock, espera callbacks en vuelo y respeta un presupuesto menor al timeout del webhook. La contención, espera, timeout y resultado quedan en evidencia.
4. El backfill modificante ocurre únicamente en esta story, dentro de la transacción/ventana protegida y usando el reporte PASS vigente de E4-S4. Sólo actualiza los ownership roots directos presentes definidos por ese inventario —`leads.user_id` y `leadflow_settings.user_id`— asociando los candidatos `NULL` al `leadflow_installation.advisor_user_id`; `lead_messages` y `lead_follow_up_actions` conservan ownership derivado exclusivamente por `lead_id`, `tenant_id` permanece legacy y los roots futuros reportados como `N/A` no se crean ni se actualizan. Un reporte ausente, stale o con cualquier finding aplicable aborta antes de mutar. No normaliza, elimina, fusiona ni altera datos de negocio.
5. Después del backfill, la transacción comprueba cero `NULL`, orphan o owner mismatch en todos los ownership roots presentes y cero referencias derivadas incompatibles. Si falla cualquier aserción, hace rollback completo antes de liberar writers y mantiene el sistema en mantenimiento.
6. En la misma fase se aplican únicamente los artefactos versionados y PASS de E4-S7: `supabase/verification/e4-s7-rls-grants-target-matrix.md` y su suite/reporte de verificación. El target instala RLS autenticado por el grafo exacto, revoca policies/grants privados anónimos y deja los RPCs privilegiados sin execute público/anon/authenticated; revoca también el grant temporal Phase A de `soft_delete_lead(uuid)` sin eliminar el comportamiento de borrado lógico, y limita Realtime a sesiones autenticadas. Ningún permiso no listado en E4-S7 se introduce durante el cutover.
7. La inmutabilidad del singleton queda protegida para todos los roles runtime; no existe ruta de reemplazo durante el piloto. La comprobación de identidad Auth, owner y grants se registra como evidencia de cutover.
8. Un callback que llega durante el lock espera y procesa bajo las reglas nuevas después del commit; si el presupuesto se excede, el cutover aborta/rollback antes de liberar el callback con error y no confirma una mutación parcial. No se pierde un callback que el provider considere aceptado.
9. El evento/auditoría que corresponda a cada mutación gobernada se confirma atómicamente; el cutover no declara éxito si la infraestructura de E4-S5b no puede verificar esa propiedad. Para el UPDATE masivo de ownership, la evidencia obligatoria queda en el reporte operacional versionado `supabase/verification/e4-s8-cutover-verification.md` con `correlation_id`, conteos pre/post, raíces afectadas, referencias de eventos o auditoría, assertions y resultado de rollback. E4-S8 no inventa un `event_type`: si una mutación requiere evento de producto, usa únicamente uno habilitado por el registry de E4-S5a; si no existe uno aplicable, el registro operacional es obligatorio y cualquier fallo aborta.
10. Este es el único archivo/story que ejecuta `UPDATE`/backfill de ownership de Phase B. E4-S4 solo prepara dry-run; ninguna otra story ejecuta el backfill modificante.

## Tasks / Subtasks

- [ ] Verificar precondiciones y congelar todos los writers incompatibles.
- [ ] Implementar/usar el lock compartido de callbacks y el lock exclusivo de cutover.
- [ ] Ejecutar el backfill a partir del reporte dry-run y capturar conteos pre/post.
- [ ] Aplicar RLS/grants finales y guard de singleton.
- [ ] Ejecutar aserciones de cero null/orphan/mismatch y preparar rollback/fix-forward seguro.
- [ ] Liberar writers solo hacia E4-S9, nunca reabrir acceso anónimo.

## Dev Notes

- El lock es transaccional y debe cubrir el writer real, no solo un flag UI. UI, webhook, scheduler y callbacks deben compartir el orden establecido por Architecture.
- Las callbacks nuevas deben quedar esperando o recibir un resultado reintentable seguro; no se debe confirmar una respuesta de éxito antes del commit de la mutación.
- Si la transacción aborta, el estado seguro es mantenimiento con acceso anónimo privado cerrado. Rollback nunca significa restaurar las policies anónimas privadas.
- Production no es la primera ejecución: usar local/preview y un plan de restore de E4-S1 antes del entorno real.

### Testing Requirements

- Forzar callback antes, durante y después del lock; probar commit de callback antes/después del cutover.
- Forzar null/orphan/mismatch, timeout del lock, falla de RLS/grants, fallo de evento y fallo de restore; todos deben dejar evidencia y rollback/maintenance seguro.
- Verificar que no hay escritura mutante paralela fuera del lock mediante una matriz de writers, no solo tests de la UI.

### Scope Guardrails

- No implementar capacidades futuras, clasificación/matching, Push, primer contacto, compra ni corporativo.
- No reabrir todavía; la reapertura y el cambio final de `AUTH_REQUIRED` son E4-S10 después del smoke.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-10]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]
- [Source: _bmad-output/project-context.md#Development-Workflow-Rules]
- [Source: _bmad-output/implementation-artifacts/4-1-backup-and-restore-baseline.md]
- [Source: _bmad-output/implementation-artifacts/4-2-singleton-identity-and-settings-ownership.md]
- [Source: _bmad-output/implementation-artifacts/4-3-auth-entry-modes-and-required-auth.md]
- [Source: _bmad-output/implementation-artifacts/4-4-backfill-dry-run.md]
- [Source: _bmad-output/implementation-artifacts/4-5a-event-registry-and-append-infrastructure.md]
- [Source: _bmad-output/implementation-artifacts/4-5b-event-enforcement-and-atomicity.md]
- [Source: _bmad-output/implementation-artifacts/4-6-evolution-webhook-brownfield-boundary.md]
- [Source: _bmad-output/implementation-artifacts/4-7-rls-grants-target-matrix.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
