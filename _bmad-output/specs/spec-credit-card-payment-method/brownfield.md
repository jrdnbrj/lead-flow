# Brownfield: evidencia y frontera de implementación

Este companion contiene la evidencia técnica y el plan mínimo. Debe leerse junto
con `SPEC.md`; no autoriza cambios remotos ni ejecución.

## Estado actual comprobado

- `lib/domain/lead.ts` define `paymentMethods` con `CREDITO`, `CONTADO`, `LEASING` y `POR_DEFINIR`; `PaymentMethod` se deriva de esa lista. El score asigna 20, 15, 18 y 5 puntos respectivamente.
- `CreateLeadInput`, `UpdateLeadInput` y `Lead.paymentMethod` son lead-level. El formulario `/nuevo` captura la forma en la sección `03 · Forma de pago`; el detalle del dashboard la edita; el resumen y la vista de información la muestran.
- `supabase/migrations/001_leadflow_core_schema.sql` define `leads.payment_method` como `text not null` con cuatro valores permitidos y el trigger `calculate_lead_score` calcula el score con esos mismos valores.
- `lead_milestones` nace en migration 018 como un milestone único `PURCHASE_DECISION`; migration 043 agrega `buyer_national_id` y `record_purchase_decision_v2` sólo registra la decisión manual y la identidad del comprador. No existe `payment_method` en ese milestone.
- No existe `purchase_case`, tabla de pagos, simulador, banco, franquicia, pago mixto ni histórico de métodos por compra.
- En datos remotos agregados, los leads activos observados son 23 `CONTADO` y 12 `CREDITO`; no se observaron `LEASING` ni `POR_DEFINIR` activos. Esto no justifica eliminarlos: schema, dominio y fixtures los soportan.
- La base remota consultada tiene `payment_method` obligatorio en `leads`; `lead_milestones` mantiene sólo `lead_id`, fecha, origen, cédula y metadatos propios del milestone. No se alteró ningún dato.
- No existe `TARJETA_CREDITO` en el dominio ni en la constraint actual; debe agregarse sólo mediante una migración nueva.

## Owner de dominio y semántica

El dato pertenece hoy a `leads.payment_method`: expresa la preferencia/intención
de pago del prospecto y ya participa en captura, edición, lectura y scoring. La
decisión de compra no es el owner actual. Por eso el incremento debe extender el
lead-level existente y no crear un campo en `lead_milestones` por conveniencia.

`CREDITO` representa crédito vehicular/financiamiento tipo NovaCredit.
`TARJETA_CREDITO` representa pago o financiamiento mediante tarjeta; no son
sinónimos y tendrán identidades internas separadas. El valor sigue describiendo
la intención actual del lead y permanece editable.

Esta elección no representa todavía el método contractual final de una venta.
Si el negocio exige conservar qué método se confirmó al comprar, se necesita un
incremento posterior con `purchase_case` o una extensión explícita del
milestone; no debe ocultarse esa diferencia en este cambio pequeño.

## Opciones iniciales propuestas

| Valor | Etiqueta | Estado |
| --- | --- | --- |
| `CREDITO` | Crédito | existente |
| `TARJETA_CREDITO` | Tarjeta de crédito | nuevo |
| `CONTADO` | Contado | existente |
| `LEASING` | Leasing | existente |
| `POR_DEFINIR` | Por definir | existente |

No agregar más opciones. El orden visual recomendado conserva `CREDITO` primero
y coloca `TARJETA_CREDITO` inmediatamente después para mantener cercanía
semántica sin mezclar valores.

## UX mínima

1. Reutilizar los mismos `ChoiceCard` de la sección de forma de pago en `/nuevo`.
2. Agregar la opción a `paymentMethods`; conservar el default actual `Crédito`
   para no cambiar el comportamiento de leads existentes ni la puntuación por
   omisión.
3. Reutilizar el selector de forma de pago ya presente en edición del detalle.
4. Hacer que resumen de lead y detalle resuelvan la nueva etiqueta mediante la
   lista compartida; no crear copy paralelo.
5. Mostrar `Por definir` sólo cuando ese valor esté guardado; no convertirlo en
   null. No añadir un modal, ruta ni pantalla nueva.

## Modelo y migración mínima

Si se aprueba el valor independiente, una migración posterior a la última actual
debe:

- reemplazar la constraint de `leads.payment_method` para permitir los cinco
  valores, sin eliminar los cuatro existentes ni hacer backfill;
- actualizar el trigger `calculate_lead_score` para incluir explícitamente
  `TARJETA_CREDITO` con 0 puntos;
- preservar `NOT NULL`, ownership, RLS, `updated_at`, índices y todos los datos;
- no tocar `lead_milestones`, eventos de compra, operaciones E3 o tablas de
  catálogo.

La lógica TypeScript debe usar el mismo aporte 0. Esta es una neutralidad
conservadora por falta de evidencia comercial, no una equivalencia con
`POR_DEFINIR` ni una regla del futuro simulador.

No se necesita una tabla de referencia ni un enum PostgreSQL: el proyecto ya usa
una columna estructurada con constraint y una lista TypeScript compartida. El
tipo generado de Supabase actualmente declara `payment_method: string`, por lo
que probablemente no requiere cambio; verificarlo durante implementación.

## Boundaries y archivos probables

- `lib/domain/lead.ts`: opción, tipo derivado y puntos de score.
- `lib/leads/validation.ts`: aceptar el nuevo valor en creación/edición.
- `components/leads/lead-capture-form.tsx`: la lista compartida ya renderiza las opciones.
- `components/leads/lead-capture-summary.tsx`: etiqueta compartida ya resuelve la lista.
- `components/dashboard/dashboard-client.tsx`: selector de edición y lectura en detalle; reemplazar sólo la lista inline si el nuevo valor no entra por el catálogo compartido.
- `lib/leads/repository.ts`: normalmente no requiere lógica nueva porque ya persiste `paymentMethod`; revisar sólo tipos/lectura.
- `lib/supabase/database.ts`: verificar si el tipo generado necesita regenerarse; no inventar cambios.
- `supabase/migrations/<siguiente>_credit_card_payment_method.sql`: constraint y trigger forward-only.
- `scripts/e6-*` o un contrato de dominio acotado: preservar opciones, validación, score y no mutación de purchase decision.

No tocar `lib/first-contact`, `lib/push`, `lib/whatsapp`, catálogo, Evolution,
reminder scheduler, workflows ni dependencias.

## Comportamiento de crear, editar y ver

- Crear: el usuario elige una de las opciones actuales o la nueva; guardar sólo
  persiste el lead, nunca compra ni envía WhatsApp.
- Editar: el selector del detalle permite cambiar la forma de pago respetando
  ownership; el trigger recalcula score como hoy. `Por definir` es válido.
- Ver: resumen `/nuevo`, tarjeta/detalle y cualquier exportación que ya consuma
  `paymentMethod` deben mostrar la etiqueta, sin mostrar código interno.
- Histórico: valores existentes permanecen iguales; no convertir `CREDITO` en
  tarjeta ni inferir la nueva opción desde notas o milestones.

## Edge cases y riesgos

- **Semántica Crédito vs tarjeta:** si se implementan como el mismo concepto se
  crearían datos incompatibles con el futuro cotizador; resolver antes de migrar.
- **Score sin evidencia comercial:** `TARJETA_CREDITO` inicia con 0 puntos para
  no atribuirle el peso 20 de `CREDITO` sin respaldo; recalibrar con evidencia
  posterior sin cambiar retroactivamente leads en este incremento.
- **Score divergente:** actualizar aplicación y trigger en el mismo incremento;
  probar ambos con los cinco valores.
- **Constraint remota:** confirmar el nombre/forma real de la constraint antes
  de escribir la migración; no asumir que la migration histórica se puede editar.
- **Default:** cambiar el default visual a `Por definir` alteraría score y leads
  nuevos; queda fuera salvo aprobación explícita.
- **Compra ya registrada:** este incremento no modifica ni reabre un milestone;
  cambiar la forma del lead después no reescribe el histórico de compra.
- **Pagos mixtos:** no representarlos con strings combinados; no hay evidencia
  actual que los requiera.
- **Compatibilidad:** lectores desconocidos deben conservar un fallback visible
  seguro si aparece un valor futuro, sin exponer el código como etiqueta ideal.

## Acceptance criteria

1. Con la opción independiente aprobada, `Tarjeta de crédito` aparece en crear y editar y se persiste como `TARJETA_CREDITO`.
2. Resumen, detalle y datos recargados muestran la etiqueta correcta.
3. Los cuatro valores existentes y `Por definir` siguen siendo válidos y no cambian de significado.
4. La constraint remota y el trigger aceptan el valor nuevo; la app y PostgreSQL calculan el mismo score, con aporte 0 para `TARJETA_CREDITO` y pesos existentes intactos.
5. No se modifican leads históricos, `lead_milestones`, First Contact, Push, reminders, Evolution, catálogo ni Auth.
6. Guardar/editar sólo cambia el lead y nunca crea compra, notificación o efecto WhatsApp.
7. La migración es forward-only, no requiere backfill y queda alineada local/remoto antes de cualquier deploy.

## Tests y QA

- **Dominio/contrato:** lista completa, semántica distinta, código/etiqueta, `POR_DEFINIR`, validación acepta tarjeta y rechaza valores desconocidos, score para cada método y 0 para tarjeta.
- **Persistencia:** create/update con tarjeta, reload, ownership/RLS, constraint y trigger; valores históricos intactos.
- **Compra:** registrar decisión sigue exigiendo cédula y no cambia ni recibe el método en este incremento.
- **Regresión:** First Contact manual, Push, reminders, Evolution, catálogo y creación sin envío permanecen sin cambios.
- **Runtime móvil/desktop:** seleccionar tarjeta en `/nuevo`, guardar, revisar resumen; editar en detalle, guardar, recargar y confirmar etiqueta/score; probar `Por definir` y las opciones existentes.
- **Gates:** `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/ci-contract-checks.sh`, `docker compose config --quiet`, `git diff --check`, dry-run de migraciones y revisión remota read-only.

## Fuera de alcance operativo

No ejecutar migración, deploy, cambios Supabase, cambios de producción ni
acciones de WhatsApp como parte de esta mini-spec.
