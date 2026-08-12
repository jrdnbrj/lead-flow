# E1-S7: RPC de transición y cancelación de acciones

Status: done

## Acceptance Criteria

- `transition_lead_follow_up_action_v1` exige `expected_action_version` e idempotency key.
- Versiones stale devuelven `STALE_ACTION` sin mutación.
- Soporta `DONE`, `IGNORED`, `POSTPONED` y `CANCELED`.
- Cada transición abierta incrementa `action_version` y actualiza la proyección dentro de la transacción.
- `IGNORED` no altera el estado comercial del lead.
- `next_action_done`, `next_action_ignored`, `next_action_postponed` y `next_action_canceled` son eventos atómicos.
- Doble comando y replay no generan una segunda transición.
- No incluye Push ni adapters de E1-S8.

## Validation

- Contract/static assertions: PASS
- Typecheck: PASS
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: ejecución SQL, Auth/RLS remoto y pruebas reales de concurrencia.
