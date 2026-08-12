# E1-S4: Política pura de resolución de fechas

Status: done

## Acceptance Criteria

- Los cuatro atajos resuelven de forma determinista en `America/Guayaquil`.
- Los resultados se persisten conceptualmente como instantes UTC.
- La política no usa medianoche como sustituto de una hora elegida.
- La lógica permanece aislada de Supabase, providers y UI.

## Validation

- `npm run typecheck`: PASS
- `npm run lint`: PASS con warning preexistente no relacionado
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: reloj/dispositivo real y ejecución remota.
