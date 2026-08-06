---
name: LeadFlow
status: final
sources:
  - ../../prds/prd-lead-flow-2026-08-05/prd.md
  - ../../brief-lead-flow-2026-08-05/brief.md
  - ../../brief-lead-flow-2026-08-05/addendum.md
  - ../../../project-context.md
  - ../../../../README.md
updated: 2026-08-05
---

# LeadFlow — Experience Spine

Esta spine describe cómo funciona LeadFlow para un único asesor que trabaja principalmente desde Android, con una mano y alta carga. No define arquitectura técnica, proveedor Push, Service Worker, scraping, almacenamiento de sesión ni el modelado del proceso corporativo. DESIGN.md es la referencia visual; sus tokens se citan aquí por nombre.

## Foundation

LeadFlow es una PWA mobile-first, Android-first, responsive y de una sola cuenta operativa. La superficie primaria es el dashboard de trabajo. Se conservan el App Router, Tailwind, Lucide, las rutas actuales y los componentes útiles; las mejoras son de jerarquía, estado y flujo. Visualmente se heredan {colors.surface-base}, {colors.ink-primary}, {colors.accent-primary} y {rounded.lg} desde DESIGN.md.

Principios:

- Capturar lo esencial y permitir salir sin administración adicional.
- Mostrar qué hacer ahora antes que métricas, exportación o configuración.
- Resolver una acción crítica con un toque y una confirmación breve.
- Los fallos no borran acciones ni simulan éxito.
- Push, WhatsApp, Realtime y sincronización muestran evidencias separadas.
- No inferir compra, entrega ni resultado comercial desde una conversación.

### Auditoría brownfield

| Superficie actual | Lo que sirve | Fricción o estado faltante | Cambio incremental |
|---|---|---|---|
| /dashboard | Realtime, búsqueda, filtros, paginación, métricas, tarjetas expandibles, teléfono, WhatsApp, seguimiento y borrado lógico. | La próxima acción vive dentro de la tarjeta expandida; hay tres filas de filtros antes de la cola. | Mostrar próxima acción, vencimiento, último mensaje y CTA primario en la tarjeta cerrada. Ordenar activas, vencidas/hoy, sin acción y resto. |
| Lead card | Tiene estados de conversación, WhatsApp, temperatura, score, último mensaje y Hecha/+1 día/Ignorar. | Se confunden estado de conversación, canal y seguimiento; no hay Responder al cliente, sync ni compra. | Separar “qué pasa” de “qué hago”; añadir acciones contextuales. |
| /nuevo | Captura progresiva, multi-modelo, calificación, nota opcional y CTA sticky. | “Guardar y compartir contacto” redirige automáticamente a QR; el PRD no hace QR obligatorio. | Cambiar el cierre a Guardar lead; después mostrar Ver en resumen y Compartir mi contacto como opción. Mantener nota y acción próxima opcionales. |
| /whatsapp | QR Evolution, conexión, perfil, plantilla, preview y guardado persistente. | Es configuración de preparación; los errores técnicos pueden aparecer tarde. | Conservar ruta; si falta conexión, explicar bloqueo y enlazar a configuración. Mantener resultado parcial de texto/imagen. |
| /qr | vCard, compartir, copiar, descargar y abrir WhatsApp. | El título y paso final pueden hacer creer que siempre sigue a la captura. | Mantener como herramienta secundaria; no interponerla en el flujo principal. |
| Push | Requisito nuevo. | No existe permiso, suscripción inválida, compatibilidad ni acción observable. | Diseñar habilitación y recuperación sin prometer entrega física. |
| Sync corporativa | Requisito nuevo sin pantalla. | Riesgo de duplicar o enviar datos inciertos. | Vista previa, confirmación, progreso, sesión caducada, error detenido y resultado verificado. |
| Compra registrada | No existe. | Puede confundirse lead cerrado con decisión de compra. | Control breve manual, sin formulario ni inferencia. |

### Brechas de estado críticas

1. El webhook actual persiste el mensaje entrante y marca la conversación activa, pero cancela pendientes sin crear la única acción Responder al cliente exigida por el PRD.
2. La tarjeta muestra el último mensaje y permite cerrar/reabrir, pero no ofrece respuesta verificable ni confirmación manual de respuesta hecha fuera de LeadFlow.
3. La captura redirige automáticamente a /qr; el PRD permite guardar sin próxima acción y no exige compartir contacto.
4. Dashboard distingue Realtime y refresh manual; la misma distinción debe conservarse cuando Push o sync fallen.

## Information Architecture

| Superficie | Entrada | Propósito | Salida |
|---|---|---|---|
| Resumen / cola | Abrir PWA o navegación | Ver qué requiere atención y actuar. | Acción hecha, pospuesta, ignorada, respuesta o detalle. |
| Captura express | Nuevo lead o Capturar lead | Guardar lead con contexto. | Confirmación, resumen o QR opcional. |
| Lead expandido | Toque en tarjeta | Ver contexto, mensajes y continuidad. | Llamada, WhatsApp, seguimiento, sync o compra. |
| Push | Notificación Android | Resolver una acción sin abrir lista. | Estado aplicado y confirmación. |
| WhatsApp | Navegación o bloqueo al enviar | Preparar canal, perfil y plantilla. | Canal listo o recuperación. |
| Mi QR | Navegación o elección explícita | Compartir vCard del asesor. | Compartir, copiar, descargar o regreso. |
| Vista previa corporativa | Sincronizar desde lead | Revisar datos antes de enviar. | Confirmar, cancelar o reautenticar. |
| Progreso/resultado | Confirmar sync | Mostrar etapa y evidencia. | ID verificado, error detenido o reintento seguro. |

La navegación inferior móvil conserva Resumen, Nuevo lead, Mi QR y WhatsApp. No se añade un menú global nuevo.

## Voice and Tone

La voz es directa, sobria y útil. Usa verbos, datos concretos y una sola idea por mensaje.

| Situación | Preferir | Evitar |
|---|---|---|
| Próxima acción | “Responder al cliente · hoy 10:30” | “Tienes una tarea pendiente” |
| Sin acción | “Sin próxima acción” / “Programar una” | “Lead incompleto” |
| Hecho | “Acción marcada como hecha.” | “¡Excelente trabajo!” |
| Posponer | “Pospuesta para mañana.” | “Snoozeado” |
| Ignorar | “Ignorada. No volverá a alertarte.” | “Eliminada” |
| Error | “No pudimos guardar la acción. Sigue pendiente; inténtalo de nuevo.” | Error técnico crudo |
| Push | “Responder a Laura · mensaje recibido” | “Alerta importante” |
| Sesión | “La sesión corporativa venció. Vuelve a entrar para continuar.” | “401 Unauthorized” |
| Sync verificada | “Lead sincronizado. ID corporativo: 12345.” | “Proceso exitoso” |
| Compra | “Cliente decidió comprar” | “Venta cerrada” |

## Component Patterns

| Componente | Comportamiento |
|---|---|
| App shell | Mantiene navegación inferior, header sticky y estado En línea/Modo offline. El estado de red no afirma que una mutación se haya guardado. |
| Work queue | Orden fijo: Conversaciones activas, Vencido/para hoy, Sin próxima acción y Todos los contactos. |
| Lead card | Contraída muestra nombre, modelo, prioridad, conversación, próxima acción o Sin próxima acción y acciones primarias. Usa el bloque visual {components.lead-card}. Toque abre detalle; controles internos detienen propagación. |
| Next-action block | Muestra tipo, fecha/hora y origen. Si vence, indica Vencida desde. Si no existe, CTA Programar una. |
| Inbound response block | Último mensaje, hora y estado. Ofrece Responder al cliente o Marcar respuesta hecha sin nota obligatoria. |
| Quick action group | Orden estable Hecho / Posponer / Ignorar. Usa {components.action-group}. Hecho aplica una vez; Posponer ofrece una hora o mañana para respuesta; Ignorar cierra solo la acción. |
| Schedule action | Tipo y fecha/hora son necesarios; nota opcional. Usa America/Guayaquil y confirma fecha. |
| Capture form | Mantiene nombre, celular, modelo y calificación actuales. Se puede guardar sin nota y sin próxima acción. |
| Capture result | Tras guardar, muestra Lead guardado y acciones Ver en resumen y Compartir mi contacto. QR no es automático. |
| First-contact action | Envío explícito, confirmación ligera, bloqueo de doble toque y resultado separado por texto, imagen y ficha. |
| WhatsApp gate | Sin sesión lista, explica Conecta WhatsApp para enviar y enlaza a /whatsapp. Un fallo deja el lead sin contactar. |
| Push permission/status | Explica valor antes de pedir permiso. Estados: no solicitado, permitido/suscrito, rechazado, inválido/vencido, incompatible y reactivable. |
| Push action | Hecho, Posponer e Ignorar son idempotentes. Si ya cambió, devuelve el estado actual sin duplicar. |
| Sync preview | Lectura y confirmación: datos, faltantes, Confirmar sincronización y Cancelar. La confirmación usa {components.button-primary}; abrir no envía. |
| Sync progress | Etapa única activa: preparando, enviando, verificando. Bloquea una segunda operación. |
| Sync recovery | Sesión caducada detiene; Reautenticar devuelve a preview y exige confirmar otra vez. |
| Sync result | Solo éxito con verificación e ID externo. Incertidumbre muestra revisión requerida y no permite reintento ciego. |
| Purchase marker | Control visible en detalle. Después muestra fecha operativa y no abre el proceso posterior. |
| Feedback | Éxitos breves junto al control; errores persistentes y accionables en contexto. |

## State Patterns

### Estados globales

| Estado | Tratamiento |
|---|---|
| Carga inicial | Skeletons con la estructura real; no mostrar ceros definitivos. |
| Sin conexión | “Sin conexión. Las acciones no confirmadas siguen pendientes.” Mantener lectura y deshabilitar solo lo que necesita servidor. |
| Realtime activo | “Actualización automática activa”. |
| Realtime no disponible | “Actualización automática no disponible; usa Actualizar datos.” |
| Refresh manual | Botón “Actualizando”; no cambia el estado Realtime. |
| Cola vacía | “No hay pendientes para hoy.” CTA Capturar lead. |

### Seguimiento y lead

| Estado | Visibilidad y acción |
|---|---|
| Nuevo sin acción | Nuevo, Sin próxima acción y Programar una; nunca Push. |
| Acción futura | Tipo y fecha visibles en tarjeta. |
| Vencida | Primera sección, borde warning, Hecho/Posponer/Ignorar; permanece hasta resolver. |
| Conversación activa | Primera sección, último mensaje visible y Responder al cliente. |
| Esperando cliente | Último envío y Esperando respuesta del cliente; permitir otra acción. |
| Cerrada | Estado de conversación; no significa compra ni elimina lead. |
| Hecha | Sale de pendientes y queda en historial; no genera Push nuevo. |
| Pospuesta | Conserva acción y nueva fecha. |
| Ignorada | Cierra solo acción, retira recordatorios y no cambia estado comercial. |
| Error de mutación | Conserva estado anterior y ofrece reintento. |

### WhatsApp y mensajes

| Estado | Tratamiento |
|---|---|
| Listo para enviar | CTA Enviar primer contacto; nunca automático al guardar. |
| Enviando | Bloquear doble toque y conservar contexto. |
| Completo | Texto, imágenes y ficha disponibles y aceptados; listar recursos. |
| Parcial | Indicar qué se envió y qué faltó; ofrecer revisión o reintento seguro. |
| Fallido | “No se envió el primer contacto. El lead sigue sin contactar.” Reintentar o abrir WhatsApp. |
| Mensaje entrante | Crear/actualizar una sola acción Responder al cliente; mensajes adicionales actualizan preview. |
| Respuesta manual | Marcar respuesta hecha; diferenciar de confirmación Evolution. |

### Push

| Estado | Tratamiento |
|---|---|
| Permiso no solicitado | Explicar recordatorios y pedir activación desde un momento de valor. |
| Rechazado | No bloquear app; explicar cómo reactivar permisos. |
| Suscripción válida | Recordatorios Push activos. |
| Inválida/vencida | Mantener acciones y mostrar recuperación. |
| Generado/aceptado | Registrar evidencia interna; nunca decir entregado o leído. |
| Acción desde Push | Confirmar estado y reconciliar al volver a la PWA. |
| Doble toque | Devolver estado actual sin doble aplicación. |

### Sync corporativa

| Estado | Tratamiento |
|---|---|
| Disponible | Acción Sincronizar visible en detalle. |
| Preview | Datos y faltantes; Confirmar explícito. |
| Confirmada/en progreso | Botón bloqueado y etapa visible. |
| Sesión caducada | Detener, explicar, Reautenticar; sin registro incompleto. |
| Reautenticada | Preview nueva y confirmación nueva; nunca reintento automático. |
| Error/cambio inesperado | Detener, mostrar etapa, no afirmar creación, reintentar desde preview. |
| Verificado | ID externo, fecha y Verificado. |
| Incierto/duplicado | Necesita revisión o mostrar registro existente; no repetir a ciegas. |

### Compra

| Estado | Tratamiento |
|---|---|
| No registrado | CTA Cliente decidió comprar. |
| Confirmación | “Registrar esta decisión con fecha y hora de ahora?” Registrar/Cancelar. |
| Registrado | Compra registrada con fecha de registro; no cambia a Cerrado ni crea entrega. |
| Error | Mantener disponible y reintentar sin duplicar. |

## Interaction Primitives

- Tap es principal; controles críticos tienen al menos 48dp.
- La tarjeta se expande por su contenido; botones internos detienen propagación.
- Orden de foco: lead, próxima acción, último mensaje, acciones, información secundaria.
- Navegación y CTA sticky respetan área segura.
- Hecho directo. Posponer ofrece inicialmente una hora y mañana para respuesta; la convergencia con acciones generales se valida con el asesor.
- Ignorar nombra el efecto: no volverá a alertar y no cambia el estado comercial.
- No usar swipe obligatorio, hover, carrusel, drag-and-drop ni modal sobre modal.
- Push abre el estado o el lead expandido si requiere contexto.
- Esc cierra la capa superior y devuelve foco.

## Accessibility Floor

- WCAG 2.2 AA mínimo; estados visuales llevan texto.
- TalkBack anuncia nombre, próxima acción, fecha, estado y label de botón.
- Campos y errores están asociados; el error no borra lo escrito.
- Foco visible con contraste equivalente a ink-primary sobre surface-raised.
- Zoom y texto grande no ocultan Hecho, Posponer, Ignorar, Confirmar o Reautenticar.
- Respeto a reduced motion; no comunicar éxito solo con animación.
- Diálogos y hojas tienen título, foco inicial y retorno de foco.

## Responsive & Platform

| Contexto | Comportamiento |
|---|---|
| Android estrecho | Una columna, navegación inferior, CTA sticky y próxima acción visible. |
| Android ancho/tablet | Mantener columna de trabajo; ampliar respiración, no añadir paneles innecesarios. |
| Escritorio | Navegación superior y más ancho; acciones disponibles sin hover. |
| PWA instalada | Push externo; al volver, reconciliar estado y mostrar si ya se resolvió. |
| Navegador sin acciones Push | Recordatorios en dashboard y estado de compatibilidad; no bloquear captura ni WhatsApp manual. |

## Validation with the real advisor

1. ¿Cuál es el mínimo real de captura en feria: nombre, celular, modelo y qué calificación puede esperar?
2. ¿Sin próxima acción debe verse siempre o revisarse al cierre de jornada?
3. ¿Qué mensajes son realmente no accionables y no necesitan Responder al cliente?
4. ¿Para respuestas sirven una hora y mañana o hace falta otra opción?
5. ¿Ignorar se entiende mejor como No requiere respuesta?
6. ¿El primer contacto parcial debe reintentar solo el recurso faltante?
7. ¿Qué datos necesita ver antes de confirmar la sync corporativa?
8. ¿Qué Android y navegador real soportan acciones Push, incluida pantalla bloqueada?
9. ¿Qué hitos posteriores a Cliente decidió comprar aportan valor sin crear otro CRM?
10. ¿Qué texto genera confianza en resultado verificado sin confundirlo con una venta?

## Key Flows

Los protagonistas son escenarios de validación; no crean reglas comerciales nuevas.

### Flow 1 — Captura rápida: Andrés en una feria

1. Andrés abre Nuevo lead y el teclado se activa en nombre.
2. Escribe nombre y celular; elige modelo y calificación actual.
3. Deja nota y próxima acción vacías porque debe atender a otra persona.
4. Toca Guardar lead.
5. **Clímax:** ve Lead guardado, el resumen mínimo y Sin próxima acción; vuelve al resumen en un toque. Compartir QR es opcional.

Fallo: el formulario conserva todo y ofrece Reintentar; no redirige a QR ni finge guardado.

### Flow 2 — Próxima acción: Andrés al terminar la jornada

1. Resumen ordena activas, vencidas/hoy, sin acción y resto.
2. Andrés abre un lead sin acción, elige tipo y fecha y deja nota vacía.
3. Programa la acción y vuelve a la tarjeta.
4. **Clímax:** la tarjeta muestra Llamar · mañana sin volver a abrir detalle.

Fallo: si no guarda, conserva Sin próxima acción, no crea Push y muestra reintento.

### Flow 3 — Trabajo pendiente y vencido: Andrés en una mañana cargada

1. Atiende una conversación activa y marca la respuesta Hecha.
2. Toma el siguiente recordatorio vencido.
3. Lo pospone a mañana o lo ignora con el efecto explícito.
4. **Clímax:** la cola queda ordenada por decisiones pendientes, no por administración.

Fallo: una mutación fallida conserva el estado anterior y la acción permanece visible.

### Flow 4 — Push: Andrés fuera de la PWA

1. Recibe un Push con lead, tipo y contexto mínimo.
2. Usa Hecho en una acción, Posponer y elegir mañana en otra, e Ignorar en una tercera.
3. **Clímax:** resuelve trabajo sin abrir lista ni escribir notas.

Fallo: suscripción inválida no se presenta como entrega; la acción sigue en dashboard y se ofrece reactivación. Doble toque no duplica.

### Flow 5 — Mensaje entrante: Andrés recibe una consulta

1. El cliente responde mientras Andrés atiende a otra persona.
2. LeadFlow muestra conversación activa y una única acción Responder al cliente con el último mensaje.
3. Andrés abre WhatsApp, responde y vuelve a marcar respuesta hecha si no hubo confirmación Evolution.
4. **Clímax:** la acción queda cerrada como confirmación manual, distinta de una respuesta verificada.

Fallo: mensajes repetidos actualizan preview sin crear acciones duplicadas; si falla persistencia, la acción sigue abierta.

### Flow 6 — Primer contacto: Andrés contacta a Laura

1. Abre un lead nuevo y toca Enviar primer contacto.
2. Confirma el envío explícito.
3. Si texto, imagen y ficha se aceptan, ve resultado completo; si falta un recurso, ve resultado parcial.
4. **Clímax:** sabe qué se envió y qué debe reintentar; el lead solo pasa a contactado con envío aceptado.

Fallo: rechazo o incertidumbre deja el lead sin contactar y ofrece Reintentar o Abrir WhatsApp.

### Flow 7 — Sync corporativa: Andrés registra a Laura

1. Toca Sincronizar y revisa preview; abrir no envía.
2. Confirma y ve preparando, enviando y verificando.
3. Si la sesión caduca, la operación se detiene y ofrece Reautenticar.
4. Tras reautenticar, revisa preview y confirma de nuevo.
5. **Clímax:** resultado verificado muestra ID externo y evita repetir a ciegas.

Fallo: cambio inesperado o resultado incierto detiene, muestra etapa y exige revisión.

### Flow 8 — Cliente decidió comprar: Andrés cruza la frontera

1. Abre el lead cuando el cliente confirma su decisión.
2. Toca Cliente decidió comprar y confirma la fecha/hora operativa.
3. **Clímax:** la tarjeta muestra Compra registrada con la fecha, sin abrir pagos, financiación, matrícula, entrega ni otro CRM.

Fallo: si no confirma, sigue disponible; no cambia a Cerrado.

## Scope guardrails

- No CRM multiusuario, SaaS, chatbot avanzado, cotización automática, financiación, inventario, facturación ni proceso completo de entrega.
- No notas obligatorias, próxima acción obligatoria al capturar ni QR obligatorio.
- No inferir compra desde chat ni presentar score como verdad comercial.
- No fijar proveedor, scraping, sesión, Push o persistencia: son temas de arquitectura/operación.
