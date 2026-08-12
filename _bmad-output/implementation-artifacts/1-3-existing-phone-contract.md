# E1-S3: Contrato de detección de teléfono existente

Status: done

## Acceptance Criteria

- El lookup excluye leads eliminados y el lead recién creado.
- La selección es determinista por `created_at DESC, id DESC`.
- El contrato devuelve nombre, modelos, estado e identidad del lead existente.
- No fusiona leads ni implementa matching inbound de Epic 2.

## Validation

- `npm run typecheck`: PASS
- `npm run lint`: PASS con warning preexistente no relacionado
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: Auth/RLS remoto y datos reales.
