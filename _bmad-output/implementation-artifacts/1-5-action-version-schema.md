# E1-S5: Evolución del esquema de acciones y proyecciones

Status: done

## Acceptance Criteria

- La migración `014_leadflow_action_versions.sql` es aditiva.
- Añade `action_version` y `origin` con defaults compatibles.
- Añade constraints positivas y un índice de versión.
- Mantiene la proyección de próxima acción con desempate por `id`.
- No ejecuta migración remota ni incorpora Push o inbound de Epic 2.

## Validation

- Revisión SQL estática: PASS
- Tipos TypeScript actualizados: PASS
- `npm run typecheck`: PASS
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: migración, RLS/grants, backfill y Supabase remoto.
