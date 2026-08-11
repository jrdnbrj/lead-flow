# Story 4.1: Línea base de backup y restore antes del cutover

Status: done

## Story

Como responsable operativo del piloto,
quiero contar con un backup verificable antes de tocar identidad, ownership o acceso,
para poder recuperar los datos sin reabrir el acceso anónimo privado.

## Dependencies

- Proyecto Supabase gestionado del entorno objetivo identificado en el artefacto de evidencia, con acceso administrativo al mecanismo de backup y restore.
- Destino aislado local o preview, con proyecto/keys separados, sin efectos externos y sin usar producción como destino del restore drill.
- Acceso al schema `evolution_api` mediante el session pooler previsto por AD-13 cuando el entorno objetivo lo exponga; si no está expuesto, la evidencia debe registrar `N/A` y la razón verificable.
- Almacenamiento operativo protegido para el backup y la evidencia, fuera del repositorio, de imágenes y de logs.

## Acceptance Criteria

1. Antes de cualquier migración de identidad o ejecución de Phase B existe un reporte operativo versionado con `status: PASS|FAIL`, timestamp UTC, backup ID y digest, entorno/proyecto de origen, destino, responsable, revisión de migraciones/esquema, alcance exacto, checks ejecutados, postcondiciones y referencias de evidencia. Solo `PASS` satisface el gate de E4-S1.
2. El backup cubre todas las tablas persistentes actuales de las migraciones 001–009: `leads`, `lead_messages`, `lead_follow_up_actions`, `leadflow_settings`, `car_models` y `car_model_images`; además inventaría las funciones, triggers, RPCs, políticas, grants, estado RLS, publicación `supabase_realtime`, identidad Supabase vigente y tablas de auditoría/eventos disponibles. Las tablas o capabilities futuras se registran como `N/A` y no se crean. La conectividad y restauración del schema `evolution_api` se incluyen cuando el entorno objetivo lo expone mediante el session pooler de AD-13; si no lo expone, se registra `N/A` con evidencia y razón.
3. El backup se restaura realmente en un destino aislado; una verificación de integridad del backup puede complementar, pero no sustituir, el restore drill. La primera ejecución de la receta y de cualquier cambio de esquema ocurre en local/preview; producción puede ser origen del backup, pero nunca destino del restore drill ni primera ejecución de migraciones. La evidencia post-restore compara, para cada objeto incluido, esquema/columnas/tipos, claves, constraints, índices, funciones/triggers/RPCs, estado RLS, políticas/grants, publicación Realtime, conteos de filas y un digest determinista de claves y campos de ownership.
4. La evidencia del restore demuestra la lectura de datos privados en el destino aislado mediante acceso privilegiado o usuario autenticado aprobado, sin incluir filas privadas crudas en el reporte. Compara fingerprints pre/post de policies, grants y estado RLS para demostrar que no aparece acceso `anon` adicional sin ejecutar la revocación final de E4-S8; además demuestra que `user_id` y `tenant_id` conservan presencia, tipos, constraints, valores y distribución `NULL`. Backup, restore y evidencia no exponen secretos, tokens, credenciales, cookies ni payloads crudos, y permanecen fuera del repositorio, imágenes, manifests y logs.
5. El reporte marca `FAIL` si falta el backup, el restore, el destino aislado, cualquier objeto o postcondición obligatoria, si existe un mismatch de esquema/datos/ownership/policies/grants, si un pooler expuesto no es verificable, si se detecta acceso `anon` nuevo o si se filtra un secreto. Un `FAIL` bloquea E4-S2, E4-S4, Phase B y cualquier story posterior que declare E4-S1 como precondición; no se ejecuta una migración de identidad, un backfill modificante ni un cutover parcial.

## Tasks / Subtasks

- [ ] Inventariar las tablas actuales de las migraciones 001–009, funciones, triggers, RPCs, policies, grants, estado RLS, publicación Realtime, identidad Supabase y tablas de auditoría/eventos presentes, distinguiendo objetos existentes de objetos futuros.
- [ ] Ejecutar el backup mediante el mecanismo administrado disponible para el entorno y registrar mecanismo/versión, backup ID, digest y revisión de esquema sin guardar secretos.
- [ ] Ejecutar el restore drill real en local/preview aislado, sin efectos externos, y comparar esquema, claves, constraints, índices, funciones/triggers/RPCs, policies/grants, publicación, conteos, ownership y digests.
- [ ] Verificar el acceso privado restaurado y comparar fingerprints pre/post de RLS, policies y grants sin aplicar Auth/RLS final ni revocar compatibilidad anónima.
- [ ] Ejecutar los casos negativos de backup incompleto/corrupto, objeto faltante, mismatch, destino no aislado, pooler no verificable, acceso `anon` nuevo y secreto expuesto; cada caso debe producir `FAIL`.
- [ ] Guardar el reporte consumible `PASS|FAIL`, con postcondiciones, checks, razones `N/A` y referencias de evidencia reproducible.
- [ ] Documentar el procedimiento de recuperación sin restaurar políticas anónimas privadas ni convertirlo en un runbook de cutover/reapertura.

## Dev Notes

- Esta story es un gate operativo; no crea el singleton, no cambia RLS y no ejecuta backfill.
- El backup debe preceder a la creación/validación de `leadflow_installation` y a Phase B, conforme a AD-3 y AD-13.
- El restore debe preservar la separación entre estado operativo, auditoría y evidencia de proveedor. No purgar, reescribir, normalizar ni fusionar mensajes, acciones, leads, catálogo o imágenes.
- El reporte compara el estado actual pre/post; no aplica la matriz final de RLS, no revoca grants anónimos y no ejecuta backfill. Es evidencia de recuperabilidad, no una implementación de Auth/RLS.
- No fijar producto de ingress, RPO/RTO ni navegador Android: permanecen en sus gates/deferred correspondientes.

### Project Structure Notes

- Usar migraciones/operación versionadas y documentación reproducible; no añadir una persistencia paralela.
- El reporte y sus evidencias son artefactos operativos protegidos, no una persistencia paralela ni una nueva fuente de verdad de runtime.
- Si se crea un script auxiliar, debe quedar fuera de rutas de runtime, no contener secretos y no escribir filas privadas, credenciales o payloads crudos en logs/evidencias.

### Testing Requirements

- PASS requiere el reporte `status: PASS`, backup identificable, restore drill real, checks objetivos y postcondiciones satisfechas; un log de comando sin postcondiciones no basta.
- Cada tabla/objeto incluido debe tener resultado verificable de esquema, integridad, ownership, acceso y conteo/digest; cada `N/A` debe incluir una razón comprobable.
- Verificar `git diff --check`, `npm run lint`, `npm run typecheck`, `npm run build` y `docker compose config --quiet` cuando la implementación toque el repositorio.

### Scope Guardrails

- No implementar Auth/RLS, webhook, scheduler, Push, clasificación, matching, WhatsApp, compra ni sincronización corporativa.
- No crear adapter, worker, Playwright, credenciales ni mutación corporativa antes de AD-14.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-13]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#Environment-Isolation]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]
- [Source: _bmad-output/planning-artifacts/prds/prd-lead-flow-2026-08-05/prd.md#Requisitos-no-funcionales]
- [Source: _bmad-output/planning-artifacts/prds/prd-lead-flow-2026-08-05/prd.md#Estado-brownfield-y-capacidades-existentes]
- [Source: _bmad-output/project-context.md#Testing-Rules]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
