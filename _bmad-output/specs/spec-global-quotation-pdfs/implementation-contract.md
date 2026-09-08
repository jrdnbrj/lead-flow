# Implementation contract

## Product flow

### Global calculation

La cuarta bottom tab `Cotización` abre la herramienta sin contexto. El
formulario muestra sólo `Normal`/`Corporativo`, los plazos válidos de la
modalidad y el monto manual. Los resultados reactivos son factor, interés,
total y cuota. Una combinación no soportada muestra `No aplica` sin cuota
válida. No existe botón de cálculo obligatorio.

El cotizador puede conservar una entrada contextual discreta desde un lead,
pero debe reutilizar el mismo componente/lógica global y no exigir vehículo
para calcular. Si el lead tiene varios modelos, el asesor debe escoger
explícitamente el modelo antes de generar PDF; no se elige silenciosamente.

### Generate PDF

`Generar PDF` es la acción secundaria. Exige cotización válida, lead y modelo.
El lead/modelo aportan contexto documental; el monto nunca se infiere del
catálogo. El servidor:

1. valida sesión, ownership, lead y modelo real;
2. valida nuevamente modalidad, plazo y monto con `card-quote.ts`;
3. construye el snapshot normalizado;
4. genera un PDF nuevo y no sobrescribe otro;
5. sube el binario al Storage privado;
6. inserta metadata de `quote_files`;
7. devuelve una referencia interna para `Ver PDF` y `Descargar`.

La UI muestra `Cotización generada`, `Ver PDF` y `Descargar` sin exponer
hashes, paths, IDs o versiones técnicas.

### Send preparation

`Enviar cotización` es la acción principal, pero la fase de implementación
posterior debe mostrar primero una confirmación humana:

```text
Enviar cotización
Cliente: <nombre>
Teléfono: <teléfono>
Modelo: <modelo>

<monto> · <plazo> · <cuota>

[Ver PDF que se enviará] [Cancelar] [Enviar por WhatsApp]
```

El servidor reconstruye el snapshot desde la solicitud y no confía en el
estado React. Si no existe un PDF equivalente, genera el actual antes de
mostrar la confirmación; jamás envía un histórico desactualizado. En esta
spec no se confirma ni se ejecuta el efecto externo.

## PDF contract

Documento para cliente, moderno, minimalista, imprimible, legible en celular y
preferiblemente de una página cuando el contenido quepa. No es una copia del
Excel ni un HTML print. Contiene, como mínimo:

- título de cotización/simulación;
- fecha de generación;
- nombre del cliente;
- modelo;
- tipo `Tarjeta de crédito`;
- monto;
- modalidad;
- plazo;
- interés;
- total;
- cuota mensual destacada;
- disclaimer breve: simulación referencial, no aprobación crediticia.

El factor puede permanecer visible en la UI, pero sólo va al PDF si aporta
valor al cliente. Nunca imprimir `rules_version`, IDs, hashes, Storage paths,
secretos, cédula ni email. Usar sólo assets de marca existentes/autorizados.

`pdf-lib` es la opción recomendada para un renderer server-only determinista y
pequeño. La preview se sirve desde una route autenticada same-origin y se
renderiza con el `PdfViewer` existente; la route soporta `inline` y
`attachment` con filename seguro como `cotizacion-<modelo>-<fecha>.pdf`.

## Minimal data model

### `quote_files`

Nueva tabla provisional para documentos efectivamente generados, no para
drafts. Campos conceptuales:

- `id uuid` primary key;
- `lead_id uuid` foreign key a `leads`, con ownership y `on delete restrict`;
- `generated_by uuid`/owner conforme al patrón vigente;
- `quote_type text` con valor `TARJETA_CREDITO` en v1;
- `model_id` nullable sólo si las convenciones del catálogo lo requieren,
  pero obligatorio para esta generación;
- `model_name_snapshot text`;
- `storage_path text`;
- `file_name text` y `mime_type text`;
- `snapshot jsonb` con constraint de objeto/no nulo;
- `rules_version text` estable, derivada de las reglas de Tarjeta;
- `generated_at timestamptz`;
- `sent_at timestamptz null` sólo si el envío futuro se registra de manera
  fiable;
- timestamps/metadata mínima según las convenciones del schema.

No crear `lead_quotes`, drafts o historial de revisiones en v1.

### `quote_file_sends` (slice de envío)

Para evitar doble click y permitir que un PDF histórico se envíe de manera
auditable sin convertirlo en una entidad de workflow, usar un ledger aislado
si el envío se implementa:

- `quote_file_id`, `lead_id`, `generated_by`;
- `idempotency_key` única por solicitud explícita;
- estado `CLAIMED | ACCEPTED | FAILED | UNKNOWN`;
- attempt/timestamps, provider message ID y resultado sanitizado.

La clave no debe permitir enviar a otro lead ni usar otra instancia. Un
`ACCEPTED` nunca se reenvía por reintento de la misma solicitud. `UNKNOWN` no
se reintenta automáticamente. La tabla no reemplaza `external_effects` de
First Contact.

## Storage contract

Preferir bucket privado dedicado `quotations`, pendiente de preflight. Path:

```text
quotations/{lead_id}/{quote_file_id}.pdf
```

La generación reserva el UUID antes del upload, no sobreescribe paths y sólo
inserta metadata después de validar el archivo. Las policies deben limitar
lectura/listado a los leads del asesor y bloquear inserts/updates directos del
navegador; alternativamente, las actions server-only con cliente admin deben
hacer la misma comprobación de ownership explícita. La route de preview/
descarga valida sesión y ownership antes de leer el objeto. No usar el bucket
público `vehiculos`.

## Snapshot and freshness

El snapshot normalizado debe incluir todos los valores que determinan lo
impreso, al menos:

```text
quote_type
lead_id
client_name
client_phone
model_id
model_name
amount
modality
term
factor
interest
total
installment
rules_version
generated_at_or_document_date
```

El servidor calcula `factor`, `interest`, `total` e `installment`; nunca acepta
esos outputs como autoridad desde el navegador. La comparación actual vs.
snapshot usa serialización/canonicalización determinista y compara todos los
campos relevantes. Cambiar monto, modalidad, plazo, lead, teléfono/nombre,
modelo o fecha de documento invalida la reutilización del PDF como documento
actual; el histórico permanece intacto. El PDF seleccionado para confirmar se
identifica por `quote_file_id` y vuelve a validarse server-side.

Si un lead o modelo cambia después, el PDF histórico conserva su snapshot.
Las operaciones anteriores no se actualizan retroactivamente.

## Future Evolution integration

El futuro `send` debe:

1. validar advisor, lead y teléfono actual;
2. reconstruir el snapshot actual y obtener/generar el PDF equivalente;
3. crear/claimar un `quote_file_send` con key idempotente;
4. revalidar que el archivo y destino pertenecen al lead;
5. llamar únicamente a `sendWhatsappDocument` con
   `EVOLUTION_API_INSTANCE_NAME` de clientes;
6. registrar provider message ID y resultado;
7. registrar outbound en el ledger de mensajes conforme al patrón vigente.

No aceptar `instance`, `recipient`, `storage_path`, provider URL o message
content arbitrarios desde el browser. No usar `lead_contact_operations` ni
`external_effects` como si fuera First Contact; si se comparte infraestructura
de bajo nivel, conservar boundaries y business keys separadas.

## Failure and idempotency behavior

- PDF inválido, datos incompletos o Storage fallido: no se crea un histórico
  visible y no hay efecto externo.
- Fallo después de subir antes de metadata: el cleanup debe ser seguro y no
  borrar otro `quote_file`; la metadata se puede reconciliar en operación
  posterior.
- Doble click de generación: puede producir dos históricos si son dos acciones
  explícitas, pero cada archivo tiene ID/path propio y no se sobreescribe.
- Doble click de envío: una key única/claim evita dos envíos de la misma
  solicitud.
- Evolution acepta: `ACCEPTED` y provider ID obligatorio.
- Rechazo definitivo: `FAILED`.
- Timeout después de IO: `UNKNOWN`, sin retry automático.
- Error de Evolution no debe alterar First Contact, Push, reminders ni el
  cálculo local.

## Migration plan

No ejecutar ahora. Tras verificar el último número remoto, crear migrations
forward-only, probablemente:

1. siguiente migration disponible (localmente sería 068 si remoto coincide):
   `quote_files`, índices, FK, RLS y bucket/policies privadas si ese mecanismo
   es compatible con las convenciones actuales;
2. migration posterior sólo si se implementa el envío: `quote_file_sends`,
   constraints, índices, funciones de claim y grants server-only.

No modificar migrations históricas, leads, First Contact operations ni datos
remotos.

## Implementation slices

### Slice A — navegación y cálculo global

- Cambiar la cuarta tab a `/cotizacion`.
- Agregar WhatsApp al menú de usuario actual.
- Crear página protegida y reutilizar `card-quote.ts`.
- Separar contexto documental del cálculo; conservar la entrada contextual si
  la UX actual la necesita, sin duplicar reglas.

### Slice B — documentos e histórico

- Crear `quote_files`, bucket privado y policies tras preflight.
- Crear renderer PDF server-only, action de generación y route autenticada de
  preview/descarga.
- Agregar lead/model picker explícito para el subflujo documental e histórico
  simple dentro del cotizador.

### Slice C — confirmación y envío preparado

- Agregar comparación server-side y UI de confirmación.
- Agregar `quote_file_sends`, claim/idempotencia y auditoría.
- Reutilizar `sendWhatsappDocument` sólo después de aprobación/QA de una fase
  posterior; esta spec no envía nada.

## Tests and acceptance

- Mantener golden D-1 a D-4 y tests actuales de validación, modalidad, plazo,
  monto y precisión.
- Global: sin lead/vehículo calcula; sólo tarjeta es funcional; no se cambia
  `payment_method`, scoring o NovaCredit.
- Navegación: cuatro tabs, WhatsApp en menú, rutas protegidas, logout intacto.
- Documento: lead/modelo obligatorios sólo para PDF; monto manual; PDF tiene
  campos mínimos; preview y descarga usan el archivo correcto; ausencia o
  error de Storage no rompe el dashboard.
- Histórico: cada generación crea un archivo nuevo, listar no depende sólo de
  Storage, ownership impide cruzar leads y un PDF conserva su snapshot.
- Frescura: iguales permiten reutilización; cambios en monto/modalidad/plazo/
  cliente/modelo impiden enviar el histórico; servidor ignora outputs falsos
  del cliente.
- Futuro envío: confirmación humana, sólo instancia customer, key/claim
  concurrente, provider ID, FAILED/UNKNOWN, sin retry automático de UNKNOWN.
- Regression: First Contact multi-vehicle/color, Push/Service Worker,
  reminders, inbound/outbound cliente, Auth, catálogo, creación/edición de
  leads y purchase quedan sin cambios funcionales.

## Runtime QA for implementation

Local, sin Supabase remoto ni WhatsApp real: desktop y móvil con la cuarta tab;
calcular sin lead; escoger lead con uno y varios modelos; generar, abrir,
descargar y volver a abrir históricos; cambiar valores y comprobar aviso de
PDF actualizado; probar errores de Storage y sesión. Si se requiere QA remoto,
debe ser una autorización posterior separada.
