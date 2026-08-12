# E1-S1: Auditoría UX brownfield de superficies Epic 1

Status: done

## Acceptance Criteria

- `/nuevo` no presenta guardar como compartir QR automáticamente.
- `/qr` se presenta como herramienta opcional.
- Se conservan rutas, navegación y comportamiento brownfield fuera del alcance de captura.
- No se introduce copy de CRM multiusuario, SaaS o sincronización corporativa ejecutable.

## Validation

- `npm run typecheck`: PASS
- `npm run lint`: PASS con warning preexistente no relacionado
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: Android/PWA y revisión visual real.
