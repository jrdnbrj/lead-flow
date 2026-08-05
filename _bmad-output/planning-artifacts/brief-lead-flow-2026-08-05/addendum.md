# Addendum: restricciones y decisiones de diseño del piloto

## Notificaciones Android

El piloto usará Web Push con Service Worker en una PWA instalada en Android. El Push debe originarse en el servidor, no depender de que el dashboard esté abierto y registrar el resultado de cada acción en el backend. Las acciones propuestas son:

- `Hecho`: resuelve la acción de seguimiento.
- `Posponer`: reprograma con una opción rápida, inicialmente un día.
- `Ignorar`: cierra la acción sin presentarla como cumplida.

La entrega Push no es una garantía absoluta de tiempo real: depende de conexión, permisos, batería y políticas del sistema operativo. Por eso el diseño debe incluir reintentos limitados, control de duplicados, estado de suscripción y un escalamiento opcional por WhatsApp para casos críticos. La notificación debe identificarse con el `lead_id` y el `action_id`; cada acción debe ser idempotente.

Las métricas de Web Push no afirmarán el porcentaje de notificaciones físicamente entregadas al dispositivo. Se registrarán: notificaciones generadas; solicitudes Push aceptadas o rechazadas por el servicio; suscripciones inválidas o vencidas; acciones realizadas desde la notificación; tiempo entre envío y acción del usuario; duplicados y errores. La ausencia de interacción no demuestra que la notificación no haya sido recibida.

Las acciones web están disponibles de forma limitada entre navegadores. La decisión Android-first evita convertir la falta de paridad de iPhone en motivo de migración durante este piloto. Si el dispositivo real del asesor cambia a iPhone o los botones directos fallan en Android, se hará una prueba técnica antes de decidir una aplicación nativa.

Fuentes técnicas consultadas:

- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN: Notification actions](https://developer.mozilla.org/en-US/docs/Web/API/Notification/actions)
- [WebKit: Web Push for Home Screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Automatización de WhatsApp

El estado actual conserva un botón explícito de envío único. La automatización de un mensaje al registrar un lead no se considera una activación automática ya aprobada; será una fase controlada posterior, con número válido, modelo e imagen disponibles, plantilla revisable, registro de resultado y apagado inmediato ante fallos.

Las fases futuras de precios, cuotas, bancos y cotizaciones requieren una fuente de reglas vigente, validaciones de entrada, límites de respuesta y escalamiento humano. No deben iniciarse como conversación abierta ni tomar decisiones comerciales no verificadas.

## Sincronización corporativa

La empresa ya autorizó probar automatización del navegador y web scraping. No existe una API oficial. La primera prueba se realizará después de estabilizar los ajustes prioritarios de LeadFlow, tan pronto exista una ruta segura, sin fijarla a un mes arbitrario.

El alcance inicial será una sola operación controlada: sincronizar un lead; mostrar una vista previa antes de ejecutar; exigir confirmación humana; manejar la sesión caducada; aplicar idempotencia y prevención de duplicados; validar que el registro se creó correctamente; y registrar el resultado junto con el identificador externo.

## Descubrimiento del proceso de entrega

El proceso desde la decisión de compra hasta la entrega permanece dentro del piloto como línea de descubrimiento e instrumentación, no como implementación completa. Se medirá el tiempo entre decisión y entrega, se identificarán pasos, bloqueos y trabajo manual, se registrarán los principales retrasos con la menor carga posible y después se decidirá si merece una épica propia. La optimización completa sigue fuera del MVP.

## Auditoría del memlog

Las decisiones del memlog de esta ejecución se consolidan así:

- **Capturado en `brief.md`:** ventana y usuario del piloto, objetivo empresarial sin garantía causal, alcance Android/PWA, métricas, límites del MVP, flujo corporativo controlado, estados iniciales, exclusiones y visión futura.
- **Capturado en `addendum.md`:** restricciones técnicas de Push, idempotencia, escalamiento por WhatsApp, límites de acciones web y controles del bot.
- **Pendiente explícito:** fijar umbrales numéricos definitivos después de las primeras dos semanas de uso estable tras desplegar la instrumentación necesaria y verificar el dispositivo Android y navegador objetivo.
- **Proceso descartado:** detalles de instalación del entorno y pasos de activación del workflow que no afectan la decisión de producto.
