# Reglas financieras y evidencia de brownfield

Este companion es parte de `SPEC.md`. Resume lo que debe preservarse y lo que
debe verificarse antes de convertir los workbooks en código. Los valores son
los de los archivos inspeccionados; no representan autorización de aprobación.
Estado: tarjeta conceptualmente aprobada; NovaCredit bloqueada por el
significado comercial del `+75`.

## Fuentes y estado actual

- Diners: `/Users/jrdnbrj/Downloads/Simulador Diners Vehiculos.xlsx`.
- NovaCredit: `/Users/jrdnbrj/Downloads/SIMULADOR NOVACREDIT.xlsx`.
- Existe otra copia NovaCredit en `/Users/jrdnbrj/Documents/SIMULADOR NOVACREDIT.xlsx`; no es byte-identical. La copia de Downloads tiene cachés completos para la cadena visible; la de Documents deja varios resultados dependientes sin caché. Antes de implementar debe conservarse un único identificador de fuente/versionado.
- LeadFlow no tiene ruta, componente, función, migration, tabla ni API de cotizador. `car_models` sólo tiene identidad, orden, estado y assets; no tiene precio.
- El dominio ya distingue `CREDITO` de `TARJETA_CREDITO`; el score de tarjeta es neutral y queda fuera del cálculo financiero.

## Diners: contrato mínimo

Hojas visibles: `DIFERIDO PROPIO NORMAL` y `DIFERIDO PROPIO CORPORATIVO`. `Hoja3`
está vacía. En ambos, `F7` es plazo y `F9` es monto.

### Modalidad Normal (`K5:M14`)

| Plazo meses | Factor |
|---:|---:|
| 3 | 0.0268 |
| 6 | 0.0473 |
| 9 | 0.0681 |
| 12 | 0.0891 |
| 15 | 0.1103 |
| 18 | 0.1319 |
| 24 | 0.1758 |
| 36 | 0.2667 |
| 48 | 0.3618 |
| 60 | 0.4610 |

### Modalidad Corporativo (`K5:M13`)

| Plazo meses | Factor |
|---:|---:|
| 3 | 0.0187 |
| 6 | 0.0330 |
| 9 | 0.0473 |
| 12 | 0.0618 |
| 15 | 0.0764 |
| 18 | 0.0912 |
| 24 | 0.1211 |
| 36 | 0.1825 |

La hoja muestra 48 meses en `K13`, pero `M13` está vacío; su fórmula devuelve
`NO APLICA`. No debe tratarse como una tasa cero ni rellenarse por analogía.

### Fórmulas y precisión

En ambas hojas (`F8`, `F11:F13`):

```text
factor = lookup(plazo, tabla_de_la_modalidad)
interes = factor * monto
total = monto + interes
cuota = total / plazo
```

El workbook no usa `ROUND` en estas fórmulas. `F11`/`F12` y la interfaz muestran
dos decimales; se conserva precisión interna y se redondea sólo la presentación
(o se guarda valor bruto más valor mostrado, si el snapshot lo necesita).

## NovaCredit: inputs observados

La hoja visible es `SIMULADOR CONCESIONARIO`; la cadena de cálculo está en
`SIMULADOR`, `CALCULOS`, `VALIDACIONES`, `DATOS` y `TABLA DE AMORTIZACION`.

### Inputs de asesor en v1

- `E11`: valor del vehículo.
- `E12`: accesorios y otros; el workbook lo trata como cero si está vacío.
- `E13`: entrada real.
- `E14`: plazo del crédito, limitado en v1 a 12, 18, 24, 36 o 48 meses. La validación de `SIMULADOR!C34` acepta 6–60, pero eso no prueba una cadena financiera válida.
- `E15`: valor del dispositivo. El default de la aplicación será 731, visible y editable; el 575 del ejemplo sólo es un valor del workbook y no se copia como default.

El precio del vehículo no existe en `car_models`: en v1 lo introduce el asesor
explícitamente. Un lead con varios modelos exige seleccionar uno para el
escenario; no se suman precios ni se elige uno silenciosamente.

### Configuración financiera versionada

Tasa de crédito, tasa y selección de aseguradora, ciudad/región, clase,
destino/plan, gastos legales, reglas de seguro, estructura de pagos, límites y
parámetros auxiliares se mantienen como configuración versionada del motor. No
se exponen todos al asesor. El default de dispositivo `731` se versiona como
parte de esta configuración, con el valor del escenario separado si el asesor
lo edita.

No se permite interpolar tasas ni habilitar un término fuera de la tabla
completa aprobada.

### Derivados visibles o directamente vinculados

En `SIMULADOR!C16:C20`, `C36`, `D36`, `C38`, `D38`, `H27:H33`, `H38`, `H40`,
`H53` y `CALCULOS!C67:D105`:

```text
valor_total_vehiculo = valor_vehiculo + accesorios
entrada_minima = CEILING(valor_total_vehiculo * porcentaje_minimo, 10)
porcentaje_entrada = entrada_real / valor_total_vehiculo
gastos_legales = fiducia/prenda + notario + matrícula
valor_concesionario = valor_total_vehiculo - entrada_real
valor_financiar_sin_vida = valor_concesionario + dispositivo + gastos_legales + otros_incluidos
valor_seguro_vida = seguro de vida opcional
valor_financiar_total = valor_financiar_sin_vida + valor_seguro_vida
cuota_normal = ROUND(PMT(tasa_anual / 12, plazo, -capital_imponible), 2)
cuota_final = (seguro_vehiculo / plazo) + cuota_normal, cuando aplica
```

El detalle exacto de `otros_incluidos`, capital imponible y las variantes de
cuota depende de los interruptores ocultos del workbook. No se debe sustituir
por una fórmula “financiera estándar”.

### Seguros y gastos

- Seguro de vehículo: `CALCULOS!C5:C8`, `C15:C20`, `E21:E28`. Usa depreciación anual, tasa por aseguradora/ciudad/clase y suma prima, 3.5% superintendencia, emisión, 0.5% campesino e IVA 12%; `E24` y `E27` tienen `ROUND(...,2)`, el total `E28` suma los componentes.
- Seguro de vida: `CALCULOS!C34:C60`, `G46:G58`. Usa 0.0034 en el ejemplo, edad/fecha de nacimiento, saldo por plazo, `CEILING(...,2000)`, 3.5% y 0.5%; es opcional en el flujo del workbook y afecta materialmente el financiado. Como el lead actual no aporta una fuente aprobada de edad/fecha de nacimiento, v1 no lo muestra ni lo incluye silenciosamente; no se exponen parámetros actuariales. Se reabrirá como incremento separado cuando exista esa fuente y sus reglas aprobadas.
- Gastos legales: `CALCULOS!C76:C79`, con fiducia/prenda/reserva según configuración, notario y matrícula. Ejemplo visible: 198.6 + 68.8 + 300.2 = 567.6.
- El `+75` de `CALCULOS!D103` es real en la fórmula, pero no tiene un nombre comercial inequívoco en el workbook. Es un `BLOCKING_BUSINESS_RULE` y no puede codificarse como cargo, quitarse o convertirse en configuración sin confirmación comercial.

### Restricciones observadas

- La entrada mínima actual para `LIVIANOS` es 25% (`DATOS!D46`); el valor se redondea hacia arriba a múltiplos de 10 (`CALCULOS!C70`). La clase y el porcentaje deben ser configuración explícita si se amplía el alcance.
- Las tablas de tasas/subsidio usan 12, 18, 24, 36 y 48 meses (`DATOS!B103:B107`, `B115:B119`). V1 soporta únicamente esos cinco términos. Los demás valores 6–60 aceptados por validación quedan explícitamente no soportados hasta demostrar toda la cadena financiera; no se interpolan tasas ni factores.
- `VALIDACIONES` contiene edad 18–75, codeudor 18–24, dispositivo, seguro mínimo de 2 años, plazo del seguro, entrada y reglas de plazo máximo. Son reglas de underwriting/operación; no deben convertirse automáticamente en “aprobado/rechazado”.
- La cuota normal visible usa `ROUND(PMT(...),2)` (`CALCULOS!D143`) y la cuota final puede sumar el componente de seguro (`SIMULADOR!H53`).

## Ajuste `+75`: impacto y pregunta bloqueante

La fórmula inspeccionada es:

```text
CALCULOS!D103 = D102 + D101 + 75
```

En el caso N-1 (`D102=9142.6`, `D101=176.8`), el resultado es `D103=9394.4`.
Si se elimina sólo el `+75`, el resultado sería `9319.4`.

`D103` alimenta `TABLA DE AMORTIZACION!C2`; por eso cambia la cuota base
`C5` de `259.0783203` a `257.0099738`, y también los valores presentes `D5`,
`E5` y `F5` (`7526.756633/5369.562517/2877.92705` a
`7466.666925/5326.694725/2854.951179`). Esos valores alimentan la cadena de
seguro de vida en `CALCULOS!E46:E49` y `G46:G58`.

En el N-1 inspeccionado, ambos caminos permanecen en las mismas bandas de
`CEILING(...,2000)` (`10000/8000/6000/4000`), por lo que los outputs visibles
cacheados parecen no cambiar; esto es una observación de ese caso, no una
equivalencia comercial ni autorización para eliminar el ajuste. Otros inputs
podrían cruzar una banda y cambiar el resultado.

Pregunta obligatoria: ¿qué concepto comercial representa el `+75`, debe
financiarse y aplica a todas las modalidades, planes y plazos o sólo al caso
del workbook? Hasta responderla, NovaCredit queda bloqueada.

## Vectores dorados

### Diners

Los tres vectores se calculan directamente con las tablas y fórmulas visibles;
el primero coincide con los valores cacheados del workbook.

| Caso | Modalidad | Plazo | Monto | Factor | Interés | Total | Cuota visible |
|---|---|---:|---:|---:|---:|---:|---:|
| D-1 | Normal | 60 | 3000 | 0.4610 | 1383.00 | 4383.00 | 73.05 |
| D-2 | Normal | 3 | 1000 | 0.0268 | 26.80 | 1026.80 | 342.27 |
| D-3 | Corporativo | 36 | 5000 | 0.1825 | 912.50 | 5912.50 | 164.24 |

También debe existir un caso negativo: Corporativo, 48 meses → `NO APLICA`, sin
cuota.

### NovaCredit

El workbook sólo contiene una solicitud completa poblada. Dado que no se debe
inventar una segunda solicitud comercial, los casos N-2/N-3 son límites
derivados de las fórmulas exactas y deben cotejarse contra una copia controlada
del workbook antes de implementación.

| Caso | Inputs relevantes | Salida esperada |
|---|---|---|
| N-1 | Vehículo 23000; accesorios 0; entrada 15000; plazo 48; dispositivo 575; tasa 14.5%; seguro 4.3%; vida activa | Mínimo 5750; legales 567.60; seguro vehículo 3901.255036; vida 99.008; valor financiado 9241.608; cuota normal 254.86; cuota final 336.1361466. Coincide con `SIMULADOR CONCESIONARIO!D18:D22,G18:G19` y celdas enlazadas. Es evidencia del workbook, no un vector final de v1: usa dispositivo 575 y seguro de vida activo. |
| N-2 | Igual a N-1, entrada exactamente 5750 | `entrada_minima = 5750`, validación pasa; con los mismos cargos la cadena base produce valor financiado 18491.608 y cuota normal visible 509.96. |
| N-3 | Igual a N-1, entrada 5749 | Entrada menor que 5750; `VALIDACIONES!B62` debe mostrar `Valor inferior a entrada mínima` y no debe presentarse una cuota como válida. |

Los vectores de NovaCredit deben versionarse junto a las reglas; no deben
derivarse en runtime desde el Excel ni mezclarse con el score de LeadFlow. Los
vectores que incluyen vida activa sólo sirven para validar la fuente hasta que
existan la entrada de edad/fecha de nacimiento y la decisión correspondiente.

## UX y arquitectura propuesta para v1

- Entrada: botón/punto contextual desde el lead, respetando la navegación y
  densidad existentes; no nueva bottom tab.
- Método `TARJETA_CREDITO`: modalidad Normal/Corporativo, plazo soportado y
  monto. Mostrar factor, interés, total y cuota.
- Método `CREDITO`: seleccionar un único vehículo del lead, precio explícito,
  accesorios/otros, entrada, plazo soportado, dispositivo (default visible 731)
  y sólo variables NovaCredit aprobadas. Mostrar resultado, advertencias de
  datos faltantes y restricciones; no aprobación. No calcular mientras `+75`
  carezca de definición aprobada.
- Recalcular localmente con funciones puras. V1 no guarda snapshot; si una
  persistencia posterior se aprueba, el servidor validará todos los inputs y no
  aceptará una cuota calculada por el navegador como autoridad.
- Snapshot sólo si un incremento posterior lo aprueba. V1 mantiene el cálculo
  transitorio y no crea `lead_quotes` ni una migration; si se persiste después,
  el snapshot debe incluir precio, vehículo elegido, inputs, configuración y
  `rules_version`, precisión interna y valores de presentación.
- Si se persiste, RLS/ownership será igual que leads, sin exposición de
  secretos y sin triggers que creen efectos externos.

## Separación obligatoria

Excluir del cotizador: `SIMULADOR NOVACREDIT` scoring de buró, `AQ`/segmentación,
ingresos, patrimonio, edad/codeudor como decisión, respuesta `CUMPLE/NO CUMPLE`,
mensajes `PREVIO A LA FACTURACION`, `RECHAZADA`, y cualquier consulta o
aprobación externa. Pueden ser futuras validaciones separadas, nunca una cuota
con apariencia de aprobación.

## Tests y QA antes de implementación

- Estáticos: fórmulas, tablas, plazos, `ROUND`, `CEILING`, `NO APLICA`, falta de
  precio y prohibición de score/aprobación.
- Unitarios: todos los vectores D-1..D-3, NovaCredit N-1..N-3, selección de un
  vehículo entre varios, precio explícito, dispositivo 731 editable, campos
  faltantes, entrada mínima, términos 12/18/24/36/48, términos no soportados,
  cero y precisión sin acumulación de redondeos. El `+75` debe tener una prueba
  de bloqueo hasta que exista decisión comercial.
- Integración local: iniciar desde lead con cada método, cambiar inputs,
  recargar snapshot y comprobar ownership; no leer Excel en runtime.
- QA móvil/desktop: apertura contextual, formularios rápidos, mensajes de
  validación, valores visibles, no desbordamiento y accesibilidad.
- Regresión: lead CRUD, score existente, compra, First Contact, Push,
  reminders, catálogo, Auth y logout sin cambios.
