---
project_name: 'lead-flow'
document_type: 'current-state-roadmap'
date: '2026-09-03'
status: 'active'
source: 'product input supplied by Jordan and current repository contracts'
---

# LeadFlow — estado actual y roadmap compacto

Este documento es la referencia breve de producto para BMAD. El código,
migraciones y runtime verificado tienen prioridad si contradicen este resumen.

## Regla de trabajo

LeadFlow es un brownfield pequeño en producción. El ciclo normal es:

```text
discovery corta (si hace falta) -> mini-spec -> implementación
-> regresión dirigida -> Docker local -> QA runtime -> producción con autorización explícita
```

El diseño visual y el comportamiento existente permanecen congelados salvo que
la especificación del incremento autorice el cambio. No hacer refactors,
upgrades o cleanup incidental.

## Hecho

| Capacidad | Estado actual |
| --- | --- |
| Leads y dashboard | Captura, edición, borrado lógico, score, estados, acciones y Realtime sobre Supabase. |
| Auth y ownership | Login protegido, ownership del asesor, RLS/RPC y secretos sólo server-side. |
| Seguimientos E1 | Acciones múltiples, fecha/hora `America/Guayaquil`, postpone, done/ignore, versionado y stale protection. |
| WhatsApp cliente | Evolution `chat-instance`; inbound, outbound, webhook autenticado, deduplicación y estados. |
| First Contact | Manual; mensaje antes de recursos; hasta 3 modelos; recursos secuenciales; retry/idempotencia por recurso; operaciones históricas no se expanden. |
| First Contact por color | Selector opcional por vehículo para los primeros 3 modelos; color específico, default actual, fallback legacy; snapshot persistido para retries. |
| Recordatorio WhatsApp | Canal compañero de Push mediante instancia separada `leadflow-reminders`; E1 sigue siendo la autoridad; sin fallback a la instancia cliente. |
| Push | Suscripciones, scheduler/dispatcher, deliveries, acciones desde notificación y Service Worker. |
| Catálogo | Ruta `/catalogo`, orden comercial, fotos, fichas PDF, colores, visor, descarga y métrica persistida de leads por modelo. |
| Colores de catálogo | `car_model_colors` y assets por color para consulta; terminología visible normalizada según el catálogo. |
| Formas de pago | Crédito, Tarjeta de crédito, Contado y Por definir se pueden seleccionar juntos; `Leasing` permanece compatible sólo para datos históricos. Se persiste `payment_methods` y se conserva `payment_method` como alias legacy. |
| Notificaciones pendientes | Sección completa contraíble, cerrada por defecto, con resumen de cantidad/contexto sin alterar la semántica E1. |
| Menú de usuario | Catálogo, Push Diagnostics y logout desde header responsive; el acceso también existe en móvil. |
| Producción | Docker/Caddy/Evolution/Redis en Lightsail 2 GB; imagen inmutable en GHCR; migraciones separadas del deploy. |
| Backups | Backup lógico de base de datos a bucket R2 privado con retención de dos archivos, según el runbook operativo. |
| Seguridad operativa | Contexto, invariantes, runbook, checklist y gates para evitar regresiones de First Contact/JWT/Evolution. |

## Parcial / siguiente incremento

### Evolución reciente ya implementada

La selección de color para First Contact ya está implementada y no se realiza
durante la creación del lead. En cada envío nuevo, el asesor puede elegir el
color por vehículo dentro del flujo actual; el catálogo y el estado persistido
de la operación conservan la resolución exacta usada para retries.

Contrato de resolución:

```text
lead -> vehículo seleccionado -> color seleccionado
modelo -> color -> PHOTO
```

El resolver usará, en orden, foto modelo+color, foto genérica del modelo,
fallback legacy y `NOT_AVAILABLE`. La ficha técnica no depende del color.
No se modifican leads ni operaciones First Contact históricas por backfill.

Otros cambios recientes relevantes: endurecimiento de RPC/autenticación y
fallos de consulta de catálogo para no convertir errores técnicos en
`NOT_AVAILABLE`; preferencia persistida de color default; recuperación de
recursos faltantes; mejoras de UX del catálogo y del resumen de notificaciones;
incorporación de `Tarjeta de crédito` y selección múltiple de formas de pago.

## Pendiente definido

| Incremento | Cómo se hará | Bloqueo o límite |
| --- | --- | --- |
| Cotizador | Parámetros explícitos, cálculo determinista, preview y documento; enviar sólo después de confirmar. | Fórmula, tasas, bancos, plazos, impuestos y formato real. No inferirlos. |
| Compradores + filtro | Reutilizar `lead_milestones.PURCHASE_DECISION`; agregar indicador y filtros derivados del hito, sin booleano duplicado. | Definir copy final; la decisión manual ya existe. |
| Purchase Journey | Crear un `purchase_case` y una colección de hitos con tipo, fecha, actor, evidencia y observación; bloqueos como dimensión aparte. | Validar la secuencia real con el negocio antes de automatizarla. |
| Reserva con vencimiento | Campos propios `reserved_at` y `reservation_expires_at`; scheduler y recordatorio idempotente. | Confirmar duración real; no depender de memoria del asesor. |
| Modelo documental | `lead -> purchase_case -> documents`, con tipo, origen, estado e identidad; archivo en proveedor aprobado. | Elegir fuente operativa inicial y política de acceso. |
| Facturas | OCR/Document AI sólo extrae; reglas deterministas validan; humano confirma antes de guardar/enviar. | Campos obligatorios y documentos reales. |
| Fondo Vial | Automatización controlada de navegador con sesión autorizada, preview, confirmación, verificación y parada ante cambios. | No hay API oficial confirmada; nunca reintentar externamente a ciegas. |
| RAMV interno | Plantilla determinista desde datos estructurados, preview y confirmación; canal interno separado del WhatsApp cliente. | Confirmar destinatarios y proceso interno. |
| Correo/Outlook | Plantilla determinista y OAuth autorizado; suma de facturas hecha por software, no por IA. | Tenant, permisos y formato corporativo. |
| Órdenes de pago | Identificar documentos, mostrar preview, confirmar destinatario y enviar por el canal cliente con efecto auditable. | Reglas para seleccionar documentos y comprobantes. |
| Pagos, matrícula, accesorios y entrega | Primero tracking confiable de hitos/bloqueos; luego automatizaciones pequeñas con confirmación. | Procedimiento operativo validado. |
| Bot/IA conversacional | Sólo después de estabilizar datos y reglas; fuentes verificadas, escalamiento e incertidumbre visible. | No inventar precios, tasas, stock ni financiación. |

## Fuera de alcance actual

No implementar por ahora: multi-asesor/SaaS, cotización sin reglas, pagos
automáticos, matrícula automática, escritura autónoma en sistemas corporativos,
bot comercial autónomo, inventario/stock por color, cambios de Evolution,
rediseños generales o reemplazo de Push por WhatsApp.

## Contratos que todo futuro incremento debe respetar

- Crear o editar un lead nunca envía WhatsApp; los envíos requieren acción
  explícita del asesor.
- E1 es la única autoridad de scheduling; Push y WhatsApp son proyecciones
  independientes.
- Cada efecto externo tiene identidad, claim, fence, intento y resultado
  persistido; `ACCEPTED` exige evidencia del proveedor.
- Un error técnico de Supabase/RPC/catálogo nunca se convierte en
  `NOT_AVAILABLE`; debe quedar como error recuperable.
- `ACCEPTED` no se reenvía automáticamente; `FAILED`/recurso recuperable se
  reintenta de forma acotada; `UNKNOWN` no entra en loop automático.
- `chat-instance` es sólo para clientes y `leadflow-reminders` sólo para el
  asesor; nunca hay fallback silencioso entre instancias.
- Los webhooks de la instancia interna no crean mensajes de leads ni acciones
  `RESPONSE`.
- Una migración nueva es forward-only y se valida antes de desplegar la imagen;
  un rollback de aplicación no revierte la base de datos.
- Toda modificación se valida primero en Docker local; producción requiere
  autorización explícita.
- La migración `065_multi_payment_methods.sql` es forward-only: añade y
  valida el array `payment_methods`, rellena leads existentes desde el valor
  escalar y mantiene `LEASING` sólo para compatibilidad histórica. Antes del
  deploy que la consume, el dry-run remoto debe mostrar únicamente esa
  migración pendiente.

## Preguntas de producto realmente abiertas

1. ¿La secuencia y los responsables de Purchase Journey son exactamente los
   descritos en el análisis, o hay pasos/estados corporativos adicionales?

Las demás decisiones técnicas de bajo riesgo quedan definidas en los
documentos operativos y no requieren volver a un ciclo BMAD completo.
