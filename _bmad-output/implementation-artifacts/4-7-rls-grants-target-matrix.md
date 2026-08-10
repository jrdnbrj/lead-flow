# Story 4.7: Matriz objetivo de RLS, grants y actores

Status: ready-for-dev

## Story

Como responsable de seguridad del piloto,
quiero definir y verificar una matriz cerrada de actores y tablas,
para que Phase B pueda aplicar el enforcement sin permisos implícitos ni accesos anónimos privados.

## Dependencies

- E4-S2: ownership roots actuales identificados.
- E4-S3: modos de entrada y privilegios definidos.
- E4-S5b: enforcement de eventos y transacciones disponible.

## Acceptance Criteria

1. Existe una matriz versionada, con versión y fecha, en `supabase/verification/e4-s7-rls-grants-target-matrix.md`, que lista por tabla, función/RPC y operación los actores `anon`, `authenticated`, server privilegiado, webhook autenticado por token y scheduler autenticado. La matriz separa permisos observados en Phase A de permisos objetivo de Phase B.
2. Para datos privados, la matriz objetivo establece: `anon` no tiene select/insert/update/delete; `authenticated` opera únicamente sobre el grafo del singleton mediante `auth.uid()`; car_models y car_model_images conservan sólo la lectura pública de catálogo definida en AC3 y no mutaciones fuera de ese grafo; los RPC privilegiados no son ejecutables por `public`, `anon` ni `authenticated`; webhook y scheduler no pasan owner en el payload y derivan el owner internamente.
3. `car_models` y `car_model_images` son las únicas tablas que pueden conservar lectura pública, conforme a AD-3. `leads`, `lead_messages`, `lead_follow_up_actions`, `leadflow_settings`, singleton, events y cualquier ownership root presente quedan privados.
4. La matriz cubre explícitamente el RPC de soft delete y sus efectos sobre leads/acciones, Realtime autenticado y los clientes server/admin. Registra el grant actual de `soft_delete_lead(uuid)` a `anon, authenticated` como permiso temporal observado de Phase A, incompatible con el objetivo Phase B, no lo aprueba como target ni lo revoca en esta story; E4-S8 es el único lugar que corrige ese grant sin eliminar el borrado lógico. No crea permisos para la lógica de futuras capabilities.
5. Una suite SQL/RPC versionada en `supabase/verification/e4-s7-rls-grants-verification.sql` ejecuta la matriz en modo de preparación y produce `supabase/verification/e4-s7-rls-grants-verification-report.md` con PASS/FAIL por actor, tabla, operación, owner match/mismatch y función. Toda policy/grant/operación no listada produce FAIL o queda marcada como fuera de alcance explícito. La suite no revoca todavía políticas/grants de Phase A ni activa el enforcement final.
6. La matriz se entrega como precondición de E4-S8. E4-S8 es el único lugar donde se aplican RLS/grants finales, revocación de anon y cierre de la ventana compatible.
7. Cualquier operación no incluida en la matriz falla cerrada o queda explícitamente fuera del alcance; no se resuelve con una policy amplia `public`.

## Tasks / Subtasks

- [ ] Inventariar policies, grants y RPCs de las migraciones 001–009.
- [ ] Definir la tabla de actores/operaciones y el grafo de ownership exacto.
- [ ] Crear queries de verificación en local/preview y un reporte PASS/FAIL.
- [ ] Verificar el caso de usuario autenticado equivocado y callbacks sin sesión pero con token/secret válido.
- [ ] Preparar el diff de enforcement final para E4-S8 sin aplicarlo aquí.

## Dev Notes

- Esta story define y verifica el objetivo; no ejecuta el cutover. La diferencia es intencional para que el reviewer pueda comprobar la matriz antes de revocar acceso.
- RLS no reemplaza `requireAdvisor()` y `proxy.ts` no reemplaza RLS.
- Los roles server-side no deben exponerse a componentes cliente. El scheduler/Edge usa sus secretos de entrypoint y RPCs versionados.
- El RPC existente `soft_delete_lead` concede hoy ejecución a `anon, authenticated`; la matriz debe identificarlo como permiso temporal incompatible con Phase B y E4-S8 debe corregirlo sin eliminar el comportamiento de borrado lógico.

### Testing Requirements

- Comprobar cada celda con consultas de permiso y al menos un owner correcto/incorrecto.
- Comprobar que una policy/grant no listado causa FAIL, no una aprobación por ausencia de evidencia.
- Verificar que los eventos siguen insert-only y que Realtime no abre lectura anónima.

### Scope Guardrails

- No ejecutar `REVOKE` final, backfill, lock de cutover ni reapertura.
- No agregar tablas Push/corporativas ni instrumentar capabilities futuras.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#Consistency-Conventions]
- [Source: supabase/migrations/001_leadflow_core_schema.sql]
- [Source: supabase/migrations/002_leadflow_anonymous_dashboard_and_whatsapp.sql]
- [Source: supabase/migrations/003_leadflow_follow_up_and_messages.sql]
- [Source: supabase/migrations/004_leadflow_follow_up_actions.sql]
- [Source: supabase/migrations/005_leadflow_backfill_contacted_status.sql]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: supabase/migrations/007_changan_catalog_and_multi_car_leads.sql]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]
- [Source: supabase/migrations/009_complete_car_model_images.sql]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
