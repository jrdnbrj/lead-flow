---
title: "PRD: LeadFlow"
status: final
created: 2026-08-05
updated: 2026-08-05
---

# PRD: LeadFlow

## 0. Propósito del documento

Este PRD es el contrato de producto para mejorar una aplicación brownfield ya operativa durante el piloto de LeadFlow. Está dirigido al propietario del producto y a los trabajos posteriores de UX, arquitectura y desarrollo. Los requisitos funcionales y no funcionales describen comportamiento observable; las decisiones sobre proveedores, persistencia, colas, Service Worker y mecanismos de integración quedan explícitamente separadas como trabajo posterior. Este documento se basa en el Product Brief, su addendum, `docs/product-input.md`, `README.md`, `project-context.md`, el código y las migraciones existentes.

## Resumen ejecutivo

LeadFlow es un asistente móvil-first para que un único asesor de ventas de vehículos Changan capture prospectos, ejecute el primer contacto y cumpla el siguiente paso comercial sin depender de su memoria. El sistema existente ya opera con captura, scoring, seguimiento, WhatsApp, catálogo, mensajes y Realtime; este PRD define la evolución incremental del primer bloque del proceso, no una reescritura.

El piloto se ejecutará del 5 de agosto al 31 de diciembre de 2026 y se enfocará en Android con PWA antes que aplicación nativa. El asesor parte de aproximadamente 10 ventas mensuales y busca observar 16–17, pero esa cifra no será una garantía ni un criterio suficiente de aceptación del producto.

El núcleo funcional es la próxima acción: qué debe hacer el asesor, cuándo debe hacerlo y cómo puede marcarlo como hecho, posponerlo o ignorarlo sin carga administrativa innecesaria. El primer contacto por WhatsApp seguirá siendo explícito, único e idempotente. La automatización conversacional avanzada, el CRM multiusuario/SaaS y el proceso completo desde la decisión de compra hasta la entrega quedan fuera del MVP.

## 1. Propósito y límites del piloto

LeadFlow es un asistente de captura, primer contacto y seguimiento para un único asesor de ventas de vehículos Changan en Ecuador. Este PRD define el primer bloque del proceso comercial: atraer y registrar al prospecto, mantener el contexto, ejecutar el primer contacto y cumplir las próximas acciones.

El piloto ocurre del 5 de agosto al 31 de diciembre de 2026. El asesor trabaja principalmente desde un Android y la solución prioriza una PWA antes que una aplicación nativa. El objetivo de 16–17 ventas mensuales es un resultado empresarial observado, no una garantía de LeadFlow.

El segundo bloque comienza cuando el asesor registra que el cliente decidió comprar. Incluye, fuera de este PRD, los procesos de pago, financiación, promociones, accesorios, documentos, matrícula y entrega. El piloto solo podrá registrar esa frontera como una señal de descubrimiento cuando el asesor tenga tiempo de hacerlo; no intentará inferir automáticamente el momento de decisión a partir de una conversación.

### Usuario y trabajo a resolver

El usuario es un único asesor de ventas que atiende al primer cliente disponible en el concesionario. Necesita registrar rápidamente una oportunidad, mantener el contexto, recordar el siguiente paso y responder cuando la carga laboral se lo permita. El sistema debe reducir olvidos y trabajo duplicado sin pedirle una segunda plataforma de registro.

No son usuarios del MVP otros asesores, coordinadores, administradores de equipos ni clientes finales. El CRM multiusuario, el SaaS y la facturación permanecen fuera del alcance.

## 2. Jornada principal: del contacto a la próxima acción

1. Un cliente llega al concesionario y conversa con el primer asesor disponible.
2. Si la conversación supera una consulta simple, el asesor registra los datos del formulario actual: nombre, teléfono, información de contacto disponible, interés en uno o más vehículos y los datos de calificación que la aplicación ya solicita.
3. El lead se guarda sin obligar al asesor a completar una próxima acción. Si no la configura, queda visible como **Sin próxima acción** y no genera notificaciones.
4. Cuando tiene tiempo, el asesor puede enviar el primer contacto mediante el botón existente. El envío intenta incluir mensaje, fotos y ficha técnica; si falta algún recurso, se envía lo disponible.
5. Según la conversación, el asesor puede programar una llamada, un mensaje, una cotización u otra acción para una fecha posterior.
6. Si el cliente responde, la respuesta debe generar una nueva próxima acción sugerida en lugar de dejar el trabajo futuro cancelado sin reemplazo.
7. El asesor ejecuta la llamada, cotización, mensaje u otra acción. La acción se marca como hecha según la regla de su tipo; si falla, permanece pendiente.
8. Cada mensaje entrante crea o actualiza como máximo una acción **Responder al cliente** para ese lead. La primera alerta vence una hora después si la acción sigue pendiente. La acción puede posponerse una o varias veces, inicialmente por una hora o para mañana, o cerrarse como **No requiere respuesta** sin cambiar el estado comercial del lead.

La definición provisional de **lead útil** es: teléfono válido o verificable, interés identificable en un vehículo y próxima acción definida. **[ASSUMPTION: esta definición representa calidad operativa suficiente para el piloto.]** Se validará con el asesor durante el piloto y no constituye una regla comercial definitiva.

## 3. Alcance del primer bloque

### Incluye

- estabilizar la captura y el uso actual sin añadir carga administrativa innecesaria;
- instrumentar automáticamente eventos de captura, contacto, respuesta, acciones y errores;
- ofrecer próxima acción visible, recordatorios Push en Android y acciones directas de completar, posponer o ignorar;
- conservar un primer contacto explícito, trazable e incremental por WhatsApp;
- observar de forma ligera cuándo el asesor registra que un cliente decidió comprar y qué retrasos aparecen hasta la entrega, sin implementar el segundo bloque;
- probar, cuando exista una ruta segura, una sola operación controlada de sincronización con el sistema corporativo.

### Fuera de alcance

- modelar o automatizar el proceso completo posterior a la decisión de compra;
- inferir automáticamente la decisión de compra desde chats o conversaciones;
- construir un CRM multiusuario o SaaS;
- reescribir la aplicación existente o migrar a una app nativa durante el piloto.

### Glosario

- **Lead:** prospecto registrado en LeadFlow.
- **Próxima acción:** actividad que el asesor debe realizar para avanzar o mantener el contacto con un lead.
- **Acción de seguimiento:** registro programado de una próxima acción con tipo, fecha/hora y estado.
- **Acción de respuesta:** próxima acción creada o actualizada para responder a un mensaje entrante.
- **Primer contacto:** envío explícito iniciado por el asesor con mensaje, fotos y ficha técnica disponible.
- **Push generado:** notificación que LeadFlow prepara para enviar al servicio Push.
- **Solicitud Push aceptada:** respuesta positiva del servicio Push al recibir la solicitud; no significa entrega física ni lectura.
- **Decisión de compra registrada:** marca manual del asesor que activa la frontera del segundo bloque; no representa necesariamente el momento real de decisión del cliente.
- **Sincronización corporativa:** una operación controlada para registrar un lead en el sistema de la empresa.

### No objetivos del MVP

- No garantizar 16–17 ventas mensuales ni atribuir causalidad automática a LeadFlow.
- No reemplazar el CRM oficial, inventario, facturación ni procesos corporativos.
- No construir CRM multiusuario, SaaS ni funcionalidades para otros vendedores.
- No inferir por IA o análisis de chat cuándo el cliente decidió comprar.
- No automatizar de forma abierta precios, cuotas, financiación, promociones, accesorios, documentos, matrícula o entrega.
- No migrar a una aplicación nativa mientras el piloto Android-first con PWA sea viable.

### Alcance operativo del MVP

**Incluye:** estabilización del uso existente; próxima acción y seguimiento; Push Android; primer contacto explícito por WhatsApp; instrumentación automática; una operación corporativa controlada; registro manual de decisión de compra; descubrimiento ligero de retrasos hasta la entrega.

**No incluye:** implementación completa del segundo bloque comercial, automatización conversacional avanzada, razones de pérdida obligatorias, gestión avanzada de catálogo, omnicanalidad completa ni reescritura de la aplicación.

## 4. Decisiones aún abiertas y supuestos controlados

- La selección del proveedor Push, Service Worker, programación server-side, persistencia de suscripciones y estrategia de reintentos pertenece a arquitectura.
- La automatización corporativa se resolverá en arquitectura entre navegador y solicitudes HTTP internas; el PRD fija la operación segura, no el mecanismo.
- **[ASSUMPTION: la ficha técnica estará disponible para la mayoría de los modelos.]** La fuente, formato y vigencia de la ficha técnica son una dependencia de contenido; el producto debe enviar lo disponible sin bloquear el primer contacto.
- La respuesta sugerida del bot, cálculos de financiación y condiciones comerciales requieren reglas verificadas y quedan fuera de este PRD.

## 5. Requisitos funcionales de seguimiento

### Acciones y alertas

- **FR-001 — MUST:** El sistema debe permitir guardar un lead sin próxima acción. Debe mostrarlo como **Sin próxima acción** y no debe generar Push mientras no exista una acción programada.
- **FR-002 — MUST:** El sistema debe permitir programar acciones de llamada, WhatsApp, cotización u otra acción con fecha y hora exactas, respetando la zona horaria `America/Guayaquil`.
- **FR-003 — MUST:** Un mensaje entrante debe crear o actualizar una única acción abierta **Responder al cliente** para el lead correspondiente.
- **FR-004 — MUST:** La acción **Responder al cliente** debe generar su primera alerta una hora después del mensaje entrante si permanece pendiente.
- **FR-005 — MUST:** El asesor debe poder marcar una acción como **Hecho**, **Posponer** o **Ignorar/No requiere respuesta** desde el flujo de seguimiento y, cuando el dispositivo lo permita, desde la notificación.
- **FR-006 — MUST:** Posponer debe conservar la acción, permitir repetición y ofrecer inicialmente **una hora** y **mañana** como opciones rápidas.
- **FR-007 — MUST:** Ignorar o **No requiere respuesta** debe cerrar únicamente la acción actual, retirar sus recordatorios y no cambiar el lead a Perdido o Cerrado.
- **FR-008 — MUST:** La llegada de varios mensajes mientras existe una acción abierta de respuesta no debe crear acciones ni notificaciones duplicadas para el mismo lead.
- **FR-009 — SHOULD:** La acción de respuesta debe mostrar el mensaje entrante más reciente y conservar el historial de cambios relevante sin pedir una nota manual obligatoria.

### Estados y errores

- **FR-010 — MUST:** Una llamada, cotización u otra acción manual puede marcarse como hecha sin nota obligatoria; una acción de WhatsApp enviada desde LeadFlow se resuelve cuando Evolution acepta el envío; una respuesta enviada desde el WhatsApp nativo se resuelve mediante confirmación manual. Un rechazo, fallo o resultado incierto mantiene la acción pendiente y muestra un error accionable.
- **FR-011 — MUST:** Las acciones repetidas desde una notificación o por reintentos de red no deben producir dos cambios de estado ni dos reprogramaciones.
- **FR-012 — SHOULD:** El sistema debe distinguir una acción cerrada como hecha de una acción ignorada o pospuesta para que las métricas no las mezclen.
- **FR-013 — MUST:** El asesor debe poder marcar manualmente como hecha una acción de respuesta realizada desde el WhatsApp nativo, sin nota obligatoria; esa confirmación debe distinguirse de una respuesta verificada por Evolution.

### Primer contacto por WhatsApp

- **FR-014 — MUST:** Guardar un lead no debe enviar automáticamente el primer contacto. El asesor debe iniciar explícitamente el envío.
- **FR-015 — MUST:** El primer contacto debe intentar enviar el mensaje configurado, las fotos del vehículo y la ficha técnica disponible; si un recurso falta, debe enviarse lo disponible sin bloquear todo el contacto.
- **FR-016 — MUST:** Un envío aceptado por Evolution debe registrar el resultado y no debe poder repetirse accidentalmente por doble toque, reintento o recarga.
- **FR-017 — SHOULD:** El resultado del primer contacto debe mostrar qué recursos se enviaron y cuáles no estaban disponibles.

### Web Push

- **FR-018 — MUST:** El sistema debe generar el Push desde el servidor cuando una acción alcance su fecha y hora, aunque la PWA no se haya abierto ese día.
- **FR-019 — MUST:** La notificación debe ofrecer acciones directas de **Hecho**, **Posponer** e **Ignorar/No requiere respuesta** cuando el Android y navegador objetivo las soporten.
- **FR-020 — MUST:** El sistema debe registrar por separado la notificación generada, la solicitud Push aceptada o rechazada por el servicio, la suscripción inválida o vencida, la acción realizada desde la notificación, el tiempo entre envío y acción, los duplicados y los errores.
- **FR-021 — MUST:** Una solicitud Push aceptada por el servicio no debe presentarse como evidencia de entrega física al dispositivo ni como evidencia de lectura.
- **FR-022 — MUST:** Reintentos de backend, doble toque o reconexión no deben generar notificaciones duplicadas ni aplicar dos veces la misma acción.
- **FR-023 — SHOULD:** La notificación debe incluir el contexto mínimo para que el asesor identifique el lead y la acción sin abrir una lista general.
- **FR-024 — MUST:** Cuando varias acciones distintas venzan al mismo tiempo, el sistema debe generar una notificación separada por acción, sin duplicar una misma acción.
- **FR-025 — COULD:** El sistema podrá escalar una acción prioritaria por WhatsApp al asesor cuando no exista una suscripción Push utilizable o se defina una regla posterior de escalamiento; no será el canal principal del piloto.

## 6. Instrumentación sin carga administrativa

La instrumentación debe ejecutarse automáticamente a partir de eventos que el sistema ya conoce. No debe exigir al asesor llenar formularios adicionales ni registrar manualmente cada actividad.

### Eventos MUST

| Evento | Cuándo se registra | Datos mínimos |
|---|---|---|
| `lead_created` | El lead se guarda correctamente. | `lead_id`, fecha/hora, fuente disponible, modelos y resultado de validación del teléfono. |
| `lead_capture_failed` | La captura no se puede guardar. | fecha/hora, etapa y código de error funcional. |
| `next_action_created` | Se programa una próxima acción. | `lead_id`, tipo, fecha/hora objetivo y origen manual o sugerido. |
| `next_action_done` | La acción se cierra como hecha. | `lead_id`, `action_id`, tipo, origen automático o confirmación manual. |
| `next_action_postponed` | La acción se reprograma. | `lead_id`, `action_id`, fecha anterior y nueva fecha. |
| `next_action_ignored` | La acción se cierra como ignorada o no requerida. | `lead_id`, `action_id`, tipo y fecha/hora. |
| `inbound_message_received` | Se persiste un mensaje entrante asociado a un lead. | `lead_id`, identificador del proveedor, fecha/hora y estado de asociación. |
| `response_action_upserted` | Se crea o actualiza la única acción de respuesta. | `lead_id`, `action_id`, fecha/hora objetivo y si fue deduplicada. |
| `first_contact_requested` | El asesor solicita el primer envío. | `lead_id`, recursos solicitados y configuración utilizada. |
| `first_contact_result` | El proveedor acepta, rechaza o falla el envío. | `lead_id`, resultado, identificador del proveedor, recursos enviados y error funcional. |
| `push_generated` | Se genera una notificación para una acción. | `lead_id`, `action_id`, tipo y fecha/hora objetivo. |
| `push_service_result` | El servicio Push acepta o rechaza la solicitud. | `action_id`, resultado, proveedor y código de error si existe. |
| `push_subscription_invalid` | Una suscripción no puede usarse o vence. | identificador técnico de suscripción, fecha/hora y causa disponible. |
| `push_action_taken` | El asesor actúa desde la notificación. | `action_id`, acción elegida y fecha/hora. |
| `push_duplicate_suppressed` | Se evita generar una notificación duplicada. | `action_id`, motivo y fecha/hora. |
| `corporate_sync_*` | Se inicia, confirma, rechaza, expira, duplica, valida o falla la operación controlada. | `lead_id`, resultado, identificador externo si existe, etapa y código de error. |
| `purchase_decision_recorded` | El asesor registra manualmente que el cliente decidió comprar. | `lead_id`, fecha/hora del registro y origen manual. |

La ausencia de interacción con una notificación no debe registrarse como “no entregada”. El sistema solo puede afirmar que la generó, que el servicio aceptó o rechazó la solicitud, que la suscripción era válida o inválida y que el usuario ejecutó o no una acción observable.

## 7. Sincronización corporativa controlada

La empresa autorizó probar automatización del navegador y web scraping, y no existe una API oficial. El PRD define el resultado seguro que debe lograr la operación; no fija si la implementación usará automatización de navegador o reproducción de solicitudes HTTP internas. Esa selección pertenece a arquitectura.

- **FR-026 — MUST:** El piloto debe limitarse a una sola operación controlada para sincronizar un lead.
- **FR-027 — MUST:** Antes de ejecutar, el asesor debe ver una vista previa de los datos que se enviarán y confirmar explícitamente.
- **FR-028 — MUST:** El sistema debe detectar una sesión caducada antes o durante la operación, detenerse sin enviar un registro incompleto y mostrar una recuperación controlada.
- **FR-029 — MUST:** Después de reautenticar, el asesor debe revisar y confirmar nuevamente la vista previa; no debe existir un reintento automático que pueda duplicar el registro.
- **FR-030 — MUST:** La operación debe ser idempotente y prevenir que el mismo lead se sincronice dos veces por doble toque, reintento o recuperación de red.
- **FR-031 — MUST:** El sistema debe validar que el registro se creó correctamente en el sistema corporativo y conservar el identificador externo cuando exista.
- **FR-032 — MUST:** El sistema debe registrar el resultado, la etapa en la que falló, la fecha/hora, el lead involucrado y el identificador externo, sin almacenar credenciales en el repositorio ni exponerlas al navegador de LeadFlow.
- **FR-033 — SHOULD:** Ante cambios inesperados en la interfaz o respuesta del sistema corporativo, la operación debe detenerse y requerir revisión humana en lugar de continuar con datos inciertos.

## 8. Registro ligero del proceso de compra y entrega

- **FR-034 — MUST:** El asesor debe poder marcar manualmente **Cliente decidió comprar** desde la tarjeta del lead, sin que el sistema intente inferirlo desde chats.
- **FR-035 — MUST:** El registro debe guardar la fecha y hora en que el asesor lo marcó, entendida como fecha de registro operativo y no necesariamente como momento real de decisión del cliente.
- **FR-036 — SHOULD:** El sistema debe permitir registrar, con carga mínima, hitos o bloqueos relevantes del proceso posterior y el momento de entrega cuando el asesor tenga esa información.
- **FR-037 — COULD:** El piloto podrá calcular el tiempo entre el registro de decisión de compra y el registro de entrega cuando existan ambos datos.

La optimización completa de pagos, financiación, promociones, accesorios, documentos, matrícula y entrega permanece fuera del MVP.

## 9. Requisitos no funcionales

### Confiabilidad y consistencia

- **NFR-001 — MUST:** El sistema debe conservar una acción pendiente hasta que se marque como hecha, pospuesta o ignorada; un fallo de Push no debe hacerla desaparecer.
- **NFR-002 — MUST:** Las operaciones de acciones, notificaciones y sincronización corporativa deben ser idempotentes frente a reintentos, doble toque, recarga y reconexión.
- **NFR-003 — MUST:** El sistema debe distinguir notificación generada, solicitud Push aceptada/rechazada, suscripción inválida y acción observable del asesor. No debe afirmar entrega física ni lectura cuando no existe esa evidencia.
- **NFR-004 — MUST:** La solicitud Push debe generarse dentro de un margen de un minuto respecto a la hora programada; este criterio no afirma una precisión equivalente de entrega o visualización en el dispositivo.

### Seguridad y trazabilidad

- **NFR-005 — MUST:** Las credenciales, tokens y estado sensible de sesión deben permanecer fuera del repositorio y no exponerse al navegador de LeadFlow.
- **NFR-006 — MUST:** La sincronización corporativa debe operar únicamente con una sesión autorizada, vista previa, confirmación humana, recuperación de sesión caducada y validación posterior.
- **NFR-007 — MUST:** Los eventos de auditoría deben permitir reconstruir qué lead se intentó procesar, qué etapa ocurrió, qué resultado se obtuvo y qué identificador externo se recibió, sin registrar secretos.
- **NFR-008 — SHOULD:** Los mensajes de error deben ser funcionales para el asesor y no exponer respuestas crudas de proveedores, tokens, cookies o datos de sesión.

### Experiencia y carga operativa

- **NFR-009 — MUST:** Las acciones críticas del piloto deben poder resolverse desde el Android con interacción breve y sin nota obligatoria.
- **NFR-010 — MUST:** La captura y el seguimiento deben seguir siendo utilizables con una mano y no exigir una plataforma adicional de registro manual.
- **NFR-011 — MUST:** Las fechas y horas de seguimiento deben interpretarse en `America/Guayaquil`.
- **NFR-012 — SHOULD:** El sistema debe mostrar el contexto mínimo del lead en la notificación para evitar que el asesor tenga que buscarlo antes de decidir.

### Instrumentación y operación

- **NFR-013 — MUST:** La instrumentación debe generarse automáticamente desde las operaciones de la aplicación y no depender de que el asesor complete un formulario de analítica.
- **NFR-014 — MUST:** Los errores de captura, WhatsApp, Push y sincronización corporativa deben quedar asociados a una etapa y un código funcional que permita medirlos.
- **NFR-015 — SHOULD:** Una suscripción Push inválida o vencida debe identificarse, conservar las acciones pendientes y permitir un flujo de reactivación explícito; el WhatsApp de escalamiento permanece como capacidad COULD.

Los umbrales de tiempo concretos, retención de eventos, proveedor Push, almacenamiento de suscripciones, mecanismo de programación, estrategia de Service Worker, mecanismo de automatización corporativa y manejo técnico de sesiones son decisiones de arquitectura/operación; este PRD solo fija el comportamiento observable y los resultados que deben garantizarse.

## 10. Métricas de éxito y contramétricas

### Éxito

- **SM-001:** Al menos 90% de los leads activos debe tener próxima acción definida. Valida FR-001, FR-002 y FR-003.
- **SM-002:** El porcentaje de acciones cumplidas en fecha debe mejorar frente a la línea base de las primeras dos semanas. Valida FR-005, FR-006 y FR-007.
- **SM-003:** Debe medirse el tiempo entre captura y primer contacto por percentiles, sin imponer una meta única mientras existan leads curiosos y oportunidades reales mezclados. Valida FR-014 y FR-015.
- **SM-004:** Deben medirse las acciones de respuesta realizadas o cerradas como no requeridas, junto con el tiempo hasta la decisión. Valida FR-003 a FR-009 y FR-013.
- **SM-005:** Deben medirse solicitudes Push aceptadas/rechazadas, suscripciones inválidas y acciones realizadas desde notificación, sin inferir entrega física. Valida FR-018 a FR-025 y NFR-003.
- **SM-006:** El primer contacto no debe producir duplicados aceptados; deben medirse envíos aceptados, fallidos, parciales y bloqueados por duplicación. Valida FR-014 a FR-017.
- **SM-007:** La operación corporativa controlada debe dejar evidencia de vista previa, confirmación, resultado, postcondición e identificador externo, sin duplicar el lead. Valida FR-026 a FR-033.
- **SM-008:** Deben medirse tiempo y pasos manuales empleados por lead y el momento en que se registra la decisión de compra. Valida FR-034 a FR-037 y NFR-010.
- **SM-009:** Las ventas, cotizaciones y cierres mensuales se observarán como resultados empresariales y no como efecto demostrado de LeadFlow.

### Contramétricas

- **SM-C001:** Aumento de acciones pospuestas o ignoradas sin mejora del seguimiento; contrarresta SM-002.
- **SM-C002:** Incremento de mensajes duplicados, errores o contactos enviados sin necesidad; contrarresta SM-006.
- **SM-C003:** Aumento de carga manual o tiempo de captura; contrarresta SM-001 y SM-008.
- **SM-C004:** Push generados sin acciones posteriores que saturen al asesor; contrarresta SM-005.
- **SM-C005:** Registros corporativos duplicados o sincronizaciones no verificadas; contrarresta SM-007.
- **SM-C006:** Deterioro de la respuesta del cliente o de la confianza del asesor por automatización excesiva; contrarresta SM-009.

La primera línea base se establecerá durante las primeras dos semanas de uso estable después de desplegar la instrumentación necesaria. El objetivo de 16–17 ventas mensuales se observará como resultado empresarial y no como criterio suficiente de aceptación del producto.

## 11. Decisiones fuera del PRD

Estas decisiones deben resolverse en arquitectura, UX o implementación después de aprobar el comportamiento del producto:

- proveedor y protocolo concreto de Web Push;
- implementación del Service Worker y programación server-side;
- mecanismo de persistencia y rotación de suscripciones;
- automatización corporativa por navegador o solicitudes HTTP internas;
- almacenamiento y protección de la sesión corporativa;
- estructura técnica del registro de eventos;
- estrategia de reintentos, colas y observabilidad;
- diseño visual detallado de las notificaciones y pantallas de recuperación.

## 12. Estado brownfield y capacidades existentes

Este PRD se apoya en una aplicación operativa. No redefine ni reemplaza sus capacidades actuales:

- `/nuevo` captura nombre, teléfono, correo, ciudad, uno o más modelos, vehículo como parte de pago, forma de pago, momento estimado de compra, notas y prioridad calculada.
- `/dashboard` muestra leads, estados, prioridad, búsqueda, seguimientos, paginación, Realtime y borrado lógico.
- `/whatsapp` permite revisar la conexión, gestionar el QR de Evolution, configurar el perfil y la plantilla, y enviar mensajes de texto o imágenes desde una acción explícita.
- El dominio existente ya distingue estados comerciales, estados de conversación, tipos de acción, estados de seguimiento, dirección de mensajes y estados del proveedor WhatsApp.
- Las migraciones existentes mantienen `leads`, `lead_messages`, `lead_follow_up_actions`, configuración persistente, catálogo Changan, imágenes y borrado lógico; incluyen RLS y Realtime para las entidades actuales.
- El modo operativo actual es de un solo vendedor, sin autenticación multiusuario ni aislamiento de equipos como requisito del MVP; las columnas preparatorias existentes no se convierten en alcance de producto.

Las capacidades nuevas o ampliadas que este PRD define son Push server-side para Android, acciones desde notificaciones, instrumentación automática, una frontera manual de decisión de compra, descubrimiento ligero del proceso de entrega y una operación corporativa controlada. La implementación debe extender los patrones existentes y conservar compatibilidad con el flujo actual.

## 13. Preguntas abiertas

Estas preguntas no bloquean el alcance del primer bloque, pero deben resolverse antes de la arquitectura o de las historias de implementación:

1. ¿Cuál será la fuente autorizada y la vigencia de la ficha técnica que acompaña al primer contacto?
2. ¿Qué navegador Android será el objetivo de la validación de acciones directas en Push?
3. ¿Qué regla de prioridad usará el futuro escalamiento por WhatsApp al asesor, si se decide activarlo?
4. ¿Qué hitos mínimos del proceso de entrega se pueden registrar sin aumentar la carga del asesor?
5. ¿Qué política de retención de mensajes y eventos aplica al entorno real de clientes?

## 14. Índice de supuestos

- **[ASSUMPTION] §2:** Un lead con teléfono válido o verificable, interés identificable y próxima acción definida representa calidad operativa suficiente para el piloto; se validará con el asesor.
- **[ASSUMPTION] §4:** La ficha técnica estará disponible para la mayoría de los modelos; si falta, el primer contacto se enviará parcialmente.
