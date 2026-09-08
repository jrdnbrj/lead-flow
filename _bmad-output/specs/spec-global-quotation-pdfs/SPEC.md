---
id: SPEC-global-quotation-pdfs
companions:
  - brownfield.md
  - implementation-contract.md
  - ../../project-context.md
sources:
  - ../../../components/layout/app-shell.tsx
  - ../../../components/leads/card-quote-tool.tsx
  - ../../../lib/financial/card-quote.ts
  - ../../../components/catalog/pdf-viewer.tsx
  - ../../../lib/whatsapp/service.ts
  - ../../../lib/auth/advisor.ts
  - ../../../lib/domain/lead.ts
---

# Cotizador global + PDFs de cotización + histórico de archivos

## Why

El asesor necesita calcular una cotización de Tarjeta de crédito sin crear o
abrir un lead, y convertir sólo las cotizaciones que realmente entrega en
documentos profesionales, recuperables y verificablemente actuales. El cálculo
de Tarjeta ya está cerrado; el incremento añade contexto documental e higiene
de envío sin alterar First Contact ni los canales existentes.

## Capabilities

- **CAP-1**
  - **intent:** El asesor puede abrir un cotizador global y calcular Tarjeta de crédito usando monto, modalidad y plazo, sin lead ni vehículo.
  - **success:** La cuarta bottom tab abre el cotizador y reproduce las funciones y golden tests actuales sin exigir contexto adicional.
- **CAP-2**
  - **intent:** El asesor puede generar un PDF profesional para un cliente y un modelo seleccionados, usando el cálculo actual y el monto digitado.
  - **success:** Sólo una cotización válida con lead y modelo produce un PDF consultable y descargable con los datos definidos en el contrato.
- **CAP-3**
  - **intent:** El asesor puede consultar cada PDF generado anteriormente desde el contexto del cliente, sin que un archivo histórico sea sobrescrito.
  - **success:** El histórico muestra fecha, tipo, modelo, monto y plazo, y cada elemento abre o descarga su propio archivo.
- **CAP-4**
  - **intent:** El sistema evita que una cotización enviada corresponda a valores distintos de los que el asesor está viendo al confirmar.
  - **success:** Si cambia cualquier dato determinante después de generar un PDF, el envío prepara un PDF nuevo y nunca reutiliza el anterior.
- **CAP-5**
  - **intent:** El asesor puede confirmar el envío de una cotización vigente por el WhatsApp de clientes cuando exista la implementación posterior del envío.
  - **success:** La confirmación muestra cliente, teléfono, modelo, monto, plazo, cuota y PDF a enviar; la operación futura tendrá auditoría e idempotencia aisladas de First Contact y reminders.

## Constraints

- Mantener sin cambios factores, fórmulas, precisión y golden tests de `lib/financial/card-quote.ts`.
- Mantener exactamente cuatro bottom tabs: Resumen, Nuevo lead, Mi QR y Cotización; WhatsApp pasa al menú de usuario existente.
- Calcular sin lead, cliente o vehículo; exigir lead y modelo sólo para generar un documento porque aparecen en él.
- El monto siempre lo digita el asesor; no inferir precios desde `car_models` ni crear catálogo de precios.
- PDFs privados, históricos e inmutables; el navegador no recibe secretos ni escribe directamente metadata/Storage.
- La frescura se valida en servidor a partir de un snapshot normalizado, no sólo desde el estado React.
- Reutilizar el canal Evolution de clientes para el futuro envío; no usar la instancia de reminders ni tocar Evolution.
- No tocar NovaCredit, First Contact, colores, Push, reminders, scoring, purchase journey, infraestructura, producción ni datos remotos.

## Non-goals

- NovaCredit y el blocker comercial `+75`.
- Cotizaciones persistentes como drafts, revisiones, comparaciones, aprobación o catálogo maestro de precios.
- Cálculo multi-modelo, selección automática de vehículo, inventario o stock.
- Envío real de WhatsApp en esta especificación; el envío queda preparado para una fase posterior con autorización.
- Cambios en First Contact, colores, Push, recordatorios, Evolution, Auth o infraestructura fuera de los límites descritos.

## Success signal

Desde la cuarta tab el asesor calcula una tarjeta sin lead. Al seleccionar un
lead y un modelo puede generar un PDF profesional, verlo, descargarlo y
consultar sus históricos. Si modifica monto, modalidad, plazo, cliente o
modelo, una futura confirmación de envío sólo puede usar un PDF regenerado que
coincida con el snapshot actual.

## Assumptions

- El modelo se resolverá contra el catálogo real y el PDF guardará nombre e
  identidad snapshot para que un renombrado posterior no cambie un histórico.
- Se usarán únicamente assets de marca ya existentes y autorizados; si no hay
  logo aprobado, el documento será tipográfico y no inventará una marca.
- La implementación futura podrá agregar `pdf-lib` como dependencia server-only
  mínima, porque hoy el repositorio no tiene un renderer PDF de servidor.

## Open Questions

- En el preflight de implementación, ¿existe un bucket privado reutilizable o se
  autoriza crear uno dedicado llamado `quotations`? No debe inventarse ni
  modificarse un bucket remoto sin esa verificación.
- ¿El nombre comercial final del documento será “Cotización” o “Simulación”, y
  se conserva el disclaimer propuesto? El contenido funcional mínimo ya está
  definido; sólo resta confirmar copy si se desea otro.
