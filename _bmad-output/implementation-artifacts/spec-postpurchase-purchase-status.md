---
title: 'Postcompra: estado de compra y filtros de compradores'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: '797c7b906d86a4cbc4d4e227a693faa3ff156382'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** LeadFlow ya registra una decisión manual de compra, pero el asesor no puede filtrar compradores ni corregir una decisión registrada por error. El sistema debe distinguir de forma persistente la frontera comercial sin inferirla desde score, etapa, WhatsApp o cotizaciones.

**Approach:** Extender el milestone existente `lead_milestones.PURCHASE_DECISION` con un estado activo/revertido y exponer su proyección en el dashboard. Mantener una sola fila por lead, timestamp operativo, autorización server-side y una acción secundaria con confirmación; no crear un campo duplicado en `leads` ni un flujo postventa.

## Boundaries & Constraints

**Always:** `NOT_PURCHASED` significa ausencia de un milestone activo; `PURCHASED` significa milestone activo. La compra se marca sólo por acción explícita del asesor y se valida por ownership/RLS mediante RPC. El lead permanece visible y conserva detalle, WhatsApp, cotizaciones, First Contact y seguimientos. El filtro se combina con búsqueda, prioridad, estado y parte de pago. El timestamp mostrado usa `America/Guayaquil`. Reintentos no duplican el milestone.

**Ask First:** Ninguna decisión de producto pendiente; conservar la captura de cédula ya exigida por el RPC/UI existente durante esta extensión.

**Never:** No inferir compra; no modificar `leads.status`, score, payment methods, acciones, mensajes, First Contact, cotizador, catálogo, Push, reminders, Evolution o auth. No crear `purchase_case`, milestones posteriores, historial completo, event-sourcing nuevo ni migraciones remotas en este slice.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mark | Lead activo sin milestone PURCHASED | Una decisión persistida y timestamp; badge y filtro se actualizan | Error inline; no se simula éxito |
| Replay | Lead con milestone PURCHASED | Sin segunda fila ni nuevo efecto; respuesta idempotente | Mostrar que ya estaba registrado |
| Revert | Lead con milestone PURCHASED | Estado vuelve a NOT_PURCHASED y la fecha activa deja de mostrarse | Error inline; conserva datos del lead |
| Filter | Todos/Compró/No compró + búsqueda | Sólo coincide la proyección actual y se reinicia a página 1 | Sin resultados claros |
| Deleted/unowned | Lead eliminado, inexistente o de otro owner | No se modifica nada | Respuesta funcional autorizada |

</frozen-after-approval>

## Code Map

- `supabase/migrations/074_reversible_purchase_decision.sql` -- nueva migración forward-only para estado del milestone y RPC de reversión/reactivación.
- `lib/supabase/database.ts` -- tipos de `lead_milestones` y funciones RPC generadas/manuales.
- `lib/domain/lead.ts` -- proyección de estado de compra manteniendo `purchaseDecisionAt` compatible.
- `lib/leads/repository.ts` -- lectura del milestone activo, registro existente y adaptación de reversión.
- `lib/leads/actions.ts` -- Server Actions autorizadas para marcar y desmarcar.
- `lib/leads/validation.ts` -- validación de IDs y comandos de compra.
- `components/dashboard/dashboard-client.tsx` -- filtro combinado, badge discreto, confirmación y acción reversible.
- `scripts/e6-purchase-status-contract-check.mjs` -- contrato estático del estado, filtros y límites de alcance.

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/074_reversible_purchase_decision.sql` -- agregar estado `PURCHASED/REVERTED` al milestone existente, backfill seguro de filas actuales, RPCs owner-checked e idempotentes -- soportar reversión sin tabla ni booleano duplicado.
- [ ] `lib/supabase/database.ts`, `lib/domain/lead.ts`, `lib/leads/repository.ts`, `lib/leads/actions.ts`, `lib/leads/validation.ts` -- conservar el camino actual de registro y agregar la proyección/acción de reversión -- separar dominio, autorización y persistencia.
- [ ] `components/dashboard/dashboard-client.tsx` -- agregar filtro `Todos/Compró/No compró`, mantener `Todos` por defecto, mostrar `Compró`, y permitir `Desmarcar compra` con confirmación y feedback -- completar la UX sin rediseñar tarjetas.
- [ ] `scripts/e6-purchase-status-contract-check.mjs` -- cubrir persistencia, ownership, idempotencia, compatibilidad y ausencia de mutaciones fuera de alcance -- evitar regresiones estáticas.
- [ ] Tests dirigidos -- verificar P1–P10, incluido mark/revert, búsqueda combinada, lead histórico y conservación de detalle/WhatsApp/cotizaciones -- ejecutar sin writes remotos.

**Acceptance Criteria:**
- Given un lead activo sin compra, when el asesor confirma `Marcar como compró`, then queda un único milestone activo, se persiste el timestamp y aparece en `Todos` y `Compró`.
- Given un lead comprado, when se aplica `No compró`/`Desmarcar compra` y se confirma, then deja de aparecer en `Compró`, aparece en `No compró` y el read model no expone fecha activa.
- Given una repetición o doble click, when se ejecuta el mismo comando, then no se crean filas duplicadas ni se modifican seguimientos, estado comercial, score o mensajes.
- Given una búsqueda por nombre, número o modelo y un filtro de compra, when cambian ambos, then el resultado satisface ambas condiciones y la paginación vuelve a la primera página.
- Given leads históricos con o sin `PURCHASE_DECISION`, when se carga el dashboard, then se proyectan correctamente sin backfill externo ni expansión de operaciones previas.
- Given un lead comprado, when el asesor abre su tarjeta, then conserva detalle, WhatsApp, cotizaciones, First Contact y acciones existentes.
- Given una falla de autorización, RPC o red, when se marca o revierte, then se muestra error contextual y el estado visual no se adelanta al estado persistido.

## Design Notes

La arquitectura actual ya usa `lead_milestones` como fuente de la compra y `purchaseDecisionAt` como proyección; no se añadirá `purchase_status` a `leads`. La migración agregará un estado al único milestone existente: filas actuales se consideran `PURCHASED`; revertir marcará la fila como `REVERTED`, por lo que la fecha activa será `null` en la proyección. Esto conserva la referencia de auditoría existente sin introducir un sistema de historial nuevo y permite reactivar la misma fila de forma idempotente.

La lectura derivará `isPurchased` de `purchaseDecisionAt !== null`; el filtro será local sobre los leads ya cargados, antes de ordenar/paginar, y no cambiará el límite ni la consulta de leads. La cédula y el RPC v2 actuales permanecen intactos como contrato existente.

## Verification

**Commands:**
- `node scripts/e6-purchase-status-contract-check.mjs` -- expected: PASS.
- `npm run typecheck` -- expected: PASS.
- `npm run lint` -- expected: PASS, salvo warnings históricos conocidos.
- `npm run build` -- expected: PASS.
- `bash scripts/ci-contract-checks.sh` -- expected: PASS.
- `git diff --check` -- expected: PASS.
- `docker compose up -d --build leadflow` -- expected: local container healthy; no Evolution service or remote write.

**Manual checks:**
- Desktop y mobile: marcar, filtrar, combinar búsqueda y revertir; confirmar badge/fecha y que la tarjeta siga mostrando sus acciones existentes.
- No ejecutar QA mutante contra Supabase PROD si Docker local conserva esa configuración; usar contratos, UI o fixture técnico seguro.

## Suggested Review Order

**Persistencia y autorización**

- El estado reversible se añade a la única fila existente y conserva la fecha histórica.
  [`074_reversible_purchase_decision.sql:5`](../../supabase/migrations/074_reversible_purchase_decision.sql#L5)

- Las RPCs mantienen ownership server-side, replay y reactivación sin efectos adicionales.
  [`074_reversible_purchase_decision.sql:223`](../../supabase/migrations/074_reversible_purchase_decision.sql#L223)

- El adaptador rechaza respuestas incompletas y mantiene compatibilidad durante el rollout.
  [`repository.ts:331`](../../lib/leads/repository.ts#L331)

**Dashboard y experiencia del asesor**

- El filtro combina estado de compra con filtros existentes y reinicia la página.
  [`dashboard-client.tsx:184`](../../components/dashboard/dashboard-client.tsx#L184)

- La confirmación sólo actualiza la interfaz después de persistir marcar o desmarcar.
  [`dashboard-client.tsx:448`](../../components/dashboard/dashboard-client.tsx#L448)

**Contratos y soporte**

- Las Server Actions validan y delegan las transiciones al repositorio autorizado.
  [`actions.ts:39`](../../lib/leads/actions.ts#L39)

- El contrato E6 cubre compatibilidad, filtros, ownership y límites de alcance.
  [`e6-purchase-status-contract-check.mjs:13`](../../scripts/e6-purchase-status-contract-check.mjs#L13)

- Los tipos de Supabase reflejan la nueva columna y RPC sin cambiar el dominio de leads.
  [`database.ts:959`](../../lib/supabase/database.ts#L959)
