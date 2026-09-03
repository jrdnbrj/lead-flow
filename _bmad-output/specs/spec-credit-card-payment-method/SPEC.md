---
id: SPEC-credit-card-payment-method
companions:
  - brownfield.md
  - ../../project-context.md
  - ../../planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md
sources:
  - ../../../lib/domain/lead.ts
  - ../../../lib/leads/validation.ts
  - ../../../lib/leads/actions.ts
  - ../../../lib/leads/repository.ts
  - ../../../components/leads/lead-capture-form.tsx
  - ../../../components/leads/lead-capture-summary.tsx
  - ../../../components/dashboard/dashboard-client.tsx
  - ../../../supabase/migrations/001_leadflow_core_schema.sql
  - ../../../supabase/migrations/018_epic6_purchase_decision.sql
  - ../../../supabase/migrations/043_lead_details_and_catalog_refresh.sql
---

> **Contrato canónico.** Esta mini-spec y `brownfield.md` definen el incremento propuesto; requieren aprobación antes de implementar.

# Agregar Tarjeta de crédito como método de pago

## Why

LeadFlow ya registra una sola forma de pago en cada lead y la usa para score,
captura, edición y resumen. El asesor necesita distinguir el uso de tarjeta de
crédito sin construir todavía el cotizador ni mezclar esta preferencia con el
milestone manual de compra.

## Capabilities

- **CAP-1**
  - **intent:** El asesor puede registrar `Tarjeta de crédito` junto a las opciones de pago que ya existen.
  - **success:** La opción aparece en creación, edición y lectura; un lead nuevo o editado conserva el valor tras recargar.

- **CAP-2**
  - **intent:** LeadFlow mantiene un valor explícito para una forma de pago todavía no definida.
  - **success:** `Por definir` sigue siendo seleccionable y no se convierte en null, texto libre ni bloqueo del formulario.

- **CAP-3**
  - **intent:** La nueva forma de pago participa en el score de manera consistente entre la lógica de aplicación y el trigger de PostgreSQL.
  - **success:** Crear y editar un lead con tarjeta produce el mismo score en dominio y base de datos, sin alterar los scores de los valores existentes.

- **CAP-4**
  - **intent:** El método de pago queda preparado para que un futuro cotizador lo use como entrada estable, sin crear todavía reglas financieras.
  - **success:** El valor se representa con una identidad estructurada y el incremento no agrega tasas, bancos, plazos, cuotas, escenarios ni efectos externos.

## Constraints

- El owner recomendado es `leads.payment_method`, porque es el dato existente; `lead_milestones` sólo registra la decisión manual, fecha, origen y cédula del comprador.
- `CREDITO` significa crédito vehicular/financiamiento tipo NovaCredit; `TARJETA_CREDITO` significa pago o financiamiento mediante tarjeta. Son valores distintos.
- Conservar `CREDITO`, `CONTADO`, `LEASING` y `POR_DEFINIR`, y agregar `TARJETA_CREDITO` como quinto valor estructurado.
- No cambiar el default actual de creación (`Crédito`) dentro de este incremento; `Por definir` sigue siendo la elección explícita de ausencia de decisión.
- `TARJETA_CREDITO` aporta 0 puntos de score inicialmente: no se presume equivalencia comercial con `CREDITO` ni se agregan reglas de tarjeta, simulador o franquicia.
- `payment_method` sigue representando la intención/método actual del lead y permanece editable; no se congela ni se copia a la decisión de compra en este incremento.
- No hacer backfill de leads ni modificar milestones/operaciones históricas; la migración debe ser forward-only y conservar los valores existentes.
- Mantener RLS/ownership, First Contact, colores, catálogo, Push, reminders, Evolution, Auth, backups e infraestructura sin cambios funcionales.

## Non-goals

- Cotizador, simuladores de tarjetas o NovaCredit.
- Tasas, factores, cuotas, entrada, plazos, bancos o franquicias.
- Pagos mixtos, tarjeta Visa/Mastercard/Diners como reglas, órdenes o integración de pagos.
- Cambiar `lead_milestones`, crear `purchase_case` o historizar el método en la decisión de compra.
- Cambiar First Contact, WhatsApp, Push, catálogo, navegación o diseño existente fuera de los controles de pago ya presentes.

## Success signal

El asesor puede seleccionar y guardar `Tarjeta de crédito` en los mismos controles
actuales de forma de pago, verla en el resumen/detalle y mantener el lead tras
recargar. Los cuatro métodos existentes siguen funcionando y ningún flujo de
compra, WhatsApp o seguimiento cambia.

## Assumptions

- La necesidad inmediata representa la intención de pago actual del lead; no una condición contractual capturada al momento de comprar.
- El aporte inicial de 0 puntos para `TARJETA_CREDITO` es una decisión conservadora y temporal de priorización, no una equivalencia con `POR_DEFINIR` ni una regla financiera; deberá calibrarse cuando existan resultados o reglas del simulador.
- La evidencia revisada no documenta por qué `CREDITO` recibe exactamente 20 puntos; código y trigger sólo contienen ese peso como constante, mientras producto indica que el score debe validarse con resultados reales.
- El esquema remoto sigue alineado con el repositorio; antes de implementar se volverá a verificar la constraint real de `payment_method` y la alineación de migraciones.

## Open Questions

- Ninguna para este incremento. La semántica, editabilidad, etiqueta y aporte inicial de score quedan definidos; el método contractual confirmado en una futura compra y su recalibración comercial pertenecen a incrementos posteriores.
