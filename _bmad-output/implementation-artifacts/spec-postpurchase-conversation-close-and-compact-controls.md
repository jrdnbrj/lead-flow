---
title: 'Postcompra compacta y cierre de conversación confiable'
type: 'bugfix'
created: '2026-09-11'
status: 'done'
route: 'one-shot'
baseline_commit: '7868461'
review_loop_iteration: 0
context: []
---

## Intent

**Problem:** En móvil, cada etapa de Postcompra consume demasiado espacio y el cierre de conversación puede fallar porque usa una actualización protegida por el JWT de sesión.

**Approach:** Mostrar las etapas en dos columnas con acciones compactas de check/quitar check y ejecutar el cambio de conversación mediante el cliente server-side con ownership explícito.

## Boundaries & Constraints

**Always:** Mantener la persistencia y estados actuales de Postcompra, actualizar la UI sólo después de una respuesta exitosa, conservar etiquetas accesibles y limitar la mutación al lead del asesor instalado.

**Ask First:** Ninguna para este ajuste local.

**Never:** No cambiar el modelo de datos, RPCs, migraciones, estados comerciales, seguimientos, WhatsApp, Push, Evolution ni comportamiento de otras acciones.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| COMPLETE | Etapa pendiente, Postcompra activa | Check compacto en la segunda columna; persiste y actualiza tras respuesta | Conserva estado y muestra error si falla |
| REVERT | Etapa completada, Postcompra activa | Acción X compacta; vuelve a pendiente tras respuesta | Conserva estado y muestra error si falla |
| CONVERSATION_CLOSE | Lead propio, estado ACTIVE | Cambia a CLOSED sin depender del JWT para el UPDATE | Respuesta accionable sin excepción no manejada |
| CONVERSATION_REOPEN | Lead propio, estado CLOSED | Cambia a ACTIVE con la misma protección | Respuesta accionable sin excepción no manejada |

## Code Map

- `components/leads/post-purchase-panel.tsx` -- cuadrícula móvil de etapas y acciones iconográficas accesibles.
- `lib/leads/repository.ts` -- actualización server-side de `conversation_state` con filtro de ownership.
- `lib/leads/actions.ts` -- manejo consistente de errores de cierre/reapertura.
- `scripts/e1-s9-s11-ui-contract-check.mjs` -- contrato de ownership para la actualización de conversación.
- `scripts/pp-purchase-case-contract-check.mjs` -- contrato de cuadrícula y controles compactos de Postcompra.

## Tasks & Acceptance

**Execution:**
- [x] `components/leads/post-purchase-panel.tsx` -- convertir etapas a dos columnas y botones sólo de ícono con labels accesibles -- reducir espacio en móvil sin perder operación.
- [x] `lib/leads/repository.ts` -- usar contexto server-side del asesor y `.eq("user_id", ownerId)` -- evitar el fallo de JWT y preservar ownership.
- [x] `lib/leads/actions.ts` -- capturar fallos de persistencia -- mantener feedback estable para el asesor.
- [x] `scripts/e1-s9-s11-ui-contract-check.mjs`, `scripts/pp-purchase-case-contract-check.mjs` -- proteger ambos contratos -- evitar regresiones.

**Acceptance Criteria:**
- Given Postcompra visible en móvil, when se muestran sus etapas, then aparecen en dos columnas y el control ocupa sólo el espacio de un ícono.
- Given una etapa pendiente, when el asesor pulsa su control, then se solicita marcarla sin adelantar éxito visual.
- Given una etapa completada, when el asesor pulsa el control X, then se solicita revertirla sin modal adicional.
- Given un lead propio con conversación activa o cerrada, when el asesor cambia el estado, then el servidor persiste CLOSED/ACTIVE con ownership y responde un resultado manejable.
- Given una falla de red o persistencia, when termina la acción, then el estado no se falsifica como exitoso y queda un mensaje de reintento.

## Design Notes

El `UPDATE` se ejecuta con el cliente administrativo ya usado por mutaciones protegidas, pero conserva la defensa en profundidad: `requireAdvisorAction` autentica la sesión y el repositorio restringe por el `ownerId` de la instalación. Esto evita añadir una migración/RPC sólo para corregir el mismo problema de reloj.

## Verification

**Commands:**
- `node scripts/e1-s9-s11-ui-contract-check.mjs` -- PASS.
- `node scripts/pp-purchase-case-contract-check.mjs` -- PASS.
- `npm run typecheck` -- PASS.
- `npm run lint` -- PASS, con dos warnings históricos no relacionados.
- `npm run build` -- PASS.
- `bash scripts/ci-contract-checks.sh` -- PASS.
- `git diff --check` -- PASS.
- `docker compose up -d --build leadflow` -- contenedor local healthy.
