---
title: "Product Brief: LeadFlow"
status: draft
created: 2026-08-05
updated: 2026-08-05
---

# Product Brief: LeadFlow

## Resumen ejecutivo

LeadFlow es un asistente móvil-first para un único asesor de ventas de vehículos Changan en Ecuador. Ya permite capturar prospectos, priorizarlos, enviar mensajes por WhatsApp, programar seguimientos y consultar el trabajo pendiente. El piloto busca mejorar el uso diario de esas capacidades, no reemplazar el CRM oficial ni crear una plataforma SaaS.

El piloto se ejecutará del 5 de agosto al 31 de diciembre de 2026. El asesor lo usará durante toda la jornada, principalmente desde Android. El problema prioritario es que algunos prospectos no reciben el siguiente contacto a tiempo porque el seguimiento depende de la memoria, la carga laboral y múltiples pasos manuales.

La aplicación intentará aumentar la capacidad comercial del asesor. Parte de aproximadamente 10 ventas mensuales y aspira a sostener al menos 16, idealmente 17. Esa cifra es un resultado empresarial observado, no una garantía del software ni una prueba automática de causalidad.

## Hechos confirmados

- El usuario inicial es un solo asesor; no se busca resolver todavía el trabajo de otros vendedores.
- El asesor trabaja principalmente desde el celular y puede tener jornadas con muy poco tiempo disponible.
- Actualmente existen captura de prospectos, scoring determinista, dashboard, acciones de seguimiento, catálogo Changan, imágenes de vehículos, WhatsApp, mensajes entrantes/salientes y actualización en tiempo real.
- El primer mensaje de WhatsApp se envía hoy mediante un botón explícito y solo una vez; no se activa automáticamente al registrar el cliente.
- Hay muchos prospectos curiosos y muchos casos sin seguimiento posterior.
- El sistema corporativo es lento para algunas tareas; la empresa ya autorizó probar automatización del navegador y web scraping, y no existe una API oficial.
- Después de que el cliente decide comprar existe un proceso largo hasta la entrega del vehículo, con estados adicionales aún no modelados y oportunidades de descubrimiento todavía no instrumentadas.

## Problema y oportunidad

Durante ferias y jornadas de alta afluencia, el asesor necesita registrar lo esencial sin convertir la captura en una entrevista larga. Después debe decidir qué hacer con cada prospecto: llamar, escribir, cotizar o esperar. Cuando esa próxima acción no queda definida o no aparece en el momento oportuno, la oportunidad puede perderse aunque el prospecto fuera valioso.

LeadFlow debe reducir esa carga mental: capturar lo necesario, dejar una próxima acción clara y recordarla fuera de la aplicación. El producto debe ayudar al asesor a actuar, no pedirle que mantenga otra plataforma mediante registros manuales extensos.

Como definición provisional, un lead útil tiene al menos un teléfono válido o verificable, interés identificable en un vehículo y una próxima acción definida. Esta es una hipótesis que debe validarse con el asesor durante el piloto, no una regla comercial definitiva.

## Solución para el piloto

LeadFlow conservará y mejorará la aplicación existente con esta secuencia incremental:

1. Instrumentar automáticamente captura, primer contacto, acciones programadas, acciones resueltas, fallos y duplicados sin exigir formularios adicionales.
2. Implementar y validar notificaciones PWA en el Android real, con acciones directas para completar, posponer o ignorar.
3. Probar un único flujo controlado de sincronización con el sistema corporativo, después de estabilizar los ajustes prioritarios de LeadFlow y tan pronto exista una ruta segura.
4. Mejorar el seguimiento y el primer contacto, manteniendo el envío actual de WhatsApp como acción explícita y trazable; cualquier automatización posterior se probará con límites y posibilidad de detenerla.
5. Observar e instrumentar el proceso desde la decisión de compra hasta la entrega del vehículo.
6. Consolidar los aprendizajes y decidir el siguiente alcance antes del 31 de diciembre.

La sincronización corporativa inicial se limitará a una operación: sincronizar un lead con vista previa, confirmación humana, manejo de sesión caducada, idempotencia y prevención de duplicados, validación de que el registro se creó correctamente, y registro del resultado y del identificador externo.

El proceso entre la decisión de compra y la entrega no se implementará completo en este MVP. Se tratará como una línea de descubrimiento e instrumentación para medir el tiempo transcurrido, identificar pasos, bloqueos y trabajo manual, registrar los principales retrasos con la menor carga posible y decidir después si merece una épica propia.

## Métricas adelantadas

Las primeras dos semanas de uso estable después de desplegar la instrumentación necesaria servirán para establecer la línea base. Las métricas se calcularán automáticamente cuando sea posible:

| Métrica | Definición para el piloto |
|---|---|
| Próxima acción definida | Porcentaje de leads activos con una acción futura registrada el mismo día de la captura o del último contacto. |
| Seguimiento cumplido | Porcentaje de acciones resueltas como hechas antes o durante su fecha prevista. |
| Actividad de Web Push | Notificaciones generadas; solicitudes Push aceptadas o rechazadas por el servicio; suscripciones inválidas o vencidas; acciones realizadas desde la notificación; tiempo entre envío y acción del usuario; duplicados y errores. La ausencia de interacción no demuestra que la notificación no haya sido recibida. |
| Tiempo a primer contacto | Tiempo entre captura y primer mensaje o llamada registrada; se observará por percentiles, porque no todo prospecto es igualmente calificado. |
| Calidad del contacto | Teléfonos válidos, envíos aceptados, fallos y mensajes duplicados. Un envío fallido no debe marcar al lead como contactado. |
| Conversión observada | Ventas mensuales, cotizaciones y cierres por periodo, fuente, modelo y estado; se reportarán como resultados, no como efecto demostrado de LeadFlow. |
| Carga operativa | Acciones completadas desde la notificación, tiempo de uso y pasos manuales necesarios por prospecto. |

Metas iniciales a validar durante la línea base: al menos 90% de leads con próxima acción definida y una reducción sostenida de seguimientos vencidos. El tiempo de captura no tendrá una meta única hasta separar prospectos curiosos de oportunidades reales.

## Alcance y límites del MVP

**Incluye:** uso diario del sistema actual; captura rápida progresiva; próxima acción y recordatorios Push Android; acciones de completar/posponer/ignorar; trazabilidad del primer contacto; métricas operativas básicas; feedback incremental; una operación controlada de sincronización corporativa; y descubrimiento e instrumentación del proceso entre decisión de compra y entrega.

**No incluye:** CRM multiusuario, facturación, funcionalidades para otros vendedores, reemplazo del CRM oficial, inventario empresarial, omnicanalidad completa, una aplicación nativa, gestión avanzada del catálogo, transcripción automática, un score opaco, razones de pérdida obligatorias, optimización del proceso de entrega del vehículo, el modelado completo del proceso posterior a la compra, ni un bot que calcule precios, cuotas o financiación sin reglas verificadas.

## Hipótesis que deben probarse

- El mayor valor inmediato está en evitar seguimientos olvidados, no en capturar más datos.
- Las acciones directas de Push reducirán la fricción de mantener el seguimiento al día.
- El asesor usará una herramienta adicional si la interacción es breve y el sistema le recuerda qué hacer sin pedirle trabajo administrativo duplicado.
- La automatización controlada del primer contacto puede mejorar la velocidad, pero también puede afectar confianza o reputación; se debe medir antes de ampliarla.
- El score actual ayuda a priorizar; no se considerará válido hasta compararlo con resultados reales.

## Decisiones de seguridad y confianza

El bot de WhatsApp crecerá por etapas. Puede enviar información verificada y escalar a una persona; no puede inventar precios, cuotas, disponibilidad, condiciones bancarias ni compromisos de entrega. En caso de duda debe detenerse o derivar al asesor. La reputación del asesor y la protección de clientes reales tienen prioridad sobre la automatización.

## Visión futura, fuera del MVP

Si el piloto demuestra una mejora operativa sostenible, LeadFlow podría evolucionar hacia un asistente comercial más completo: automatización segura del primer contacto, respuestas verificadas sobre modelos y fichas técnicas, cotizaciones calculadas con reglas autorizadas, apoyo para financiación, sincronización corporativa robusta y eventualmente un producto para equipos. Esa visión no justifica construir ahora un CRM genérico ni una arquitectura multiusuario.
