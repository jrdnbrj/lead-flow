---
id: SPEC-financial-quotation
companions:
  - financial-rules.md
  - ../../project-context.md
  - ../../planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md
sources:
  - ../../../lib/domain/lead.ts
  - ../../../components/leads/lead-capture-form.tsx
  - ../../../components/dashboard/dashboard-client.tsx
  - ../../../supabase/migrations/001_leadflow_core_schema.sql
  - ../../../supabase/migrations/065_multi_payment_methods.sql
  - /Users/jrdnbrj/Downloads/Simulador Diners Vehiculos.xlsx
  - /Users/jrdnbrj/Downloads/SIMULADOR NOVACREDIT.xlsx
---

> **Contrato canónico.** Esta mini-spec y `financial-rules.md` definen el incremento de cotización financiera; requieren aprobación antes de implementar.

# Cotizador financiero v1 para Crédito y Tarjeta de crédito

## Why

El asesor ya registra `CREDITO` y `TARJETA_CREDITO`, pero LeadFlow no puede mostrar una cuota basada en las reglas comerciales reales. Se necesita una cotización rápida, reproducible y entendible que use los simuladores aprobados sin convertir el resultado en aprobación crediticia ni enviar efectos externos.

## Capabilities

- **CAP-1**
  - **intent:** El asesor puede cotizar una compra con `TARJETA_CREDITO` escogiendo una modalidad Diners soportada, plazo y monto.
  - **success:** Normal y Corporativo aplican exactamente sus factores del workbook; un plazo no soportado se rechaza explícitamente y no produce cuota engañosa.

- **CAP-2**
  - **intent:** El asesor puede preparar un escenario `CREDITO` para un solo vehículo, usando precio y entradas explícitas y sólo plazos/configuración NovaCredit aprobados.
  - **success:** El sistema recalcula sin elegir silenciosamente entre varios modelos, rechaza términos no demostrados y muestra resultados informativos sin afirmar aprobación.

- **CAP-3**
  - **intent:** El asesor puede distinguir cálculo, validación comercial y resultado no calculable.
  - **success:** Las restricciones de plazo/entrada y los datos faltantes aparecen como mensajes accionables; no se muestran `PRE-APROBADO`, `RECHAZADO` ni score como resultado de cotización.

- **CAP-4**
  - **intent:** El escenario de cotización tiene una frontera preparada para snapshot versionado sin alterar el lead ni sus automatizaciones.
  - **success:** En v1 el cálculo es transitorio y no crea `lead_quotes`; si se persiste en un incremento posterior, conserva modalidad, entradas, configuración, versión de reglas, valores derivados y redondeos, sin efectos externos.

## Constraints

- Los libros `Simulador Diners Vehiculos.xlsx` y `SIMULADOR NOVACREDIT.xlsx` son la fuente comercial; cada regla debe quedar trazada a hoja y rango/celda en `financial-rules.md`.
- `CREDITO` y `TARJETA_CREDITO` son métodos distintos. Diners Normal/Corporativo son modalidades de tarjeta, no nuevos métodos.
- El catálogo actual `car_models` no tiene precio; la cotización debe recibir un precio explícito o una fuente aprobada antes de calcular. No se inventan precios.
- En v1 el precio lo digita explícitamente el asesor; no se crea catálogo maestro, sincronización, inventario ni fuente externa de precios.
- Un lead con varios modelos requiere que el asesor elija un vehículo por escenario; no se suman modelos ni se selecciona uno silenciosamente.
- Las entradas NovaCredit de v1 son valor del vehículo, accesorios/otros, entrada, plazo soportado y dispositivo. El dispositivo muestra default 731, es editable y queda versionado como default/configuración más override del escenario.
- Tasas, aseguradora, ciudad, clase, destino/plan, parámetros de seguros, gastos legales y demás auxiliares son configuración financiera versionada, no campos generales del asesor.
- El workbook demuestra seguro de vida opcional, pero v1 no lo expone ni lo incluye silenciosamente hasta contar con una fuente aprobada de edad/fecha de nacimiento y reglas exactas; no se exponen parámetros actuariales.
- NovaCredit v1 sólo habilita 12, 18, 24, 36 y 48 meses, presentes en las tablas financieras principales. La validación 6–60 del workbook no convierte los demás valores en cotizaciones válidas.
- El `+75` de `CALCULOS!D103` sigue siendo un `BLOCKING_BUSINESS_RULE`: no se nombra, elimina ni parametriza como cargo hasta aclarar su significado y aplicabilidad comercial.
- La app no lee Excel en runtime: la implementación debe usar funciones puras tipadas, configuración versionada y vectores dorados derivados del workbook.
- La cotización es informativa: no ejecuta aprobación, scoring, consultas externas, pagos, documentos, PDF, WhatsApp ni acciones de compra.
- Toda salida debe distinguir precisión interna de presentación y reproducir `ROUND`/`CEILING` sólo donde el workbook los usa.
- La implementación futura extiende la arquitectura actual y no cambia leads, formas de pago existentes, First Contact, colores, catálogo, Push, reminder WhatsApp, Evolution, Auth, backups ni producción.

## Non-goals

- Aprobación automática, scoring bancario, buró, ingresos, patrimonio, codeudor o respuesta de riesgo.
- Cotización en PDF, envío por WhatsApp, correo, firma, consulta de bancos, pagos, tarjeta por franquicia o integración externa.
- Precio maestro/inventario por modelo, cotización de varios vehículos como una sola operación, simulador completo de tarjetas o purchase journey.
- Persistencia histórica/comparación de escenarios y control visible de seguro de vida en v1; se reservan para incrementos posteriores cuando existan las entradas y reglas aprobadas.
- Cambiar `payment_method`/`payment_methods`, First Contact, Push, reminders, catálogo o diseño fuera del punto de entrada autorizado.

## Success signal

Desde un lead con método de pago elegible, el asesor abre el cotizador, elige explícitamente un vehículo si hay varios, introduce el precio y obtiene resultados que coinciden con los vectores dorados de ambos workbooks cuando el término y las reglas están aprobados. Las combinaciones no soportadas o el `+75` no resuelto se bloquean de forma explícita; todos los flujos actuales permanecen sin cambios.

## Assumptions

- La primera versión cotiza un vehículo por escenario; si un lead tiene varios modelos, no suma precios ni elige uno silenciosamente.
- La copia de `/Users/jrdnbrj/Downloads/SIMULADOR NOVACREDIT.xlsx` se toma como referencia calculada: la copia en `Documents` no es idéntica y conserva cachés incompletos en parte de la cadena, aunque sus fórmulas son equivalentes en lo inspeccionado.
- Mientras no exista precio en catálogo, el precio será un input explícito del asesor y formará parte del escenario; no se persiste en v1.
- El seguro de vida del workbook se trata como opcional, pero queda fuera de la cotización v1 hasta resolver la fuente de edad/fecha de nacimiento y su configuración aprobada.
- `731` es el default inicial del dispositivo; se versiona junto con la configuración y puede sobrescribirse en el escenario.

## Open Questions

- ¿Qué concepto comercial representa exactamente el `+75` de `CALCULOS!D103`, en qué modalidades/planes/plazos aplica y debe entrar al capital financiado, al cálculo de seguro u otro componente? Hasta resolverlo, NovaCredit no está aprobado para implementación completa.

## Decision status

- Tarjeta de crédito/Diners: conceptualmente aprobada con modalidades Normal/Corporativo y sólo factores/periodos documentados.
- NovaCredit: bloqueada únicamente por el significado y aplicabilidad comercial de `+75`; las demás decisiones de v1 están cerradas.
- Persistencia: fuera del primer corte; no se requiere `lead_quotes` ni migration para el cálculo transitorio.
