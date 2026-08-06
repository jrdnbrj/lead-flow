---
name: LeadFlow
description: Identidad visual incremental para un asistente móvil-first de seguimiento comercial automotriz.
status: final
colors:
  surface-base: '#F6F3ED'
  surface-raised: '#FFFFFF'
  surface-soft: '#FAF9F6'
  ink-primary: '#101828'
  ink-secondary: '#697386'
  accent-primary: '#C9F36A'
  accent-primary-ink: '#101828'
  focus-blue: '#1D5C9C'
  whatsapp-green: '#25D366'
  success: '#18733A'
  warning: '#B94910'
  error: '#B33A2C'
  border-subtle: '#E3E0D9'
typography:
  display:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '36px'
    fontWeight: '900'
    lineHeight: '0.98'
    letterSpacing: '-0.06em'
  heading:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '20px'
    fontWeight: '900'
    lineHeight: '1.1'
    letterSpacing: '-0.03em'
  body:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '16px'
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '12px'
    fontWeight: '900'
    lineHeight: '1.2'
    letterSpacing: '0.08em'
  meta:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '11px'
    fontWeight: '700'
    lineHeight: '1.35'
  action:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '14px'
    fontWeight: '900'
    lineHeight: '1.2'
rounded:
  sm: '12px'
  md: '16px'
  lg: '20px'
  xl: '28px'
  full: '9999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '24px'
  '6': '32px'
  margin-mobile: '20px'
components:
  button-primary:
    minHeight: '48px'
    radius: '{rounded.md}'
    background: '{colors.accent-primary}'
    foreground: '{colors.accent-primary-ink}'
  button-secondary:
    minHeight: '48px'
    radius: '{rounded.md}'
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
  lead-card:
    radius: '{rounded.lg}'
    background: '{colors.surface-raised}'
  action-group:
    minHeight: '48px'
    radius: '{rounded.md}'
sources:
  - ../../prds/prd-lead-flow-2026-08-05/prd.md
  - ../../brief-lead-flow-2026-08-05/brief.md
  - ../../brief-lead-flow-2026-08-05/addendum.md
  - ../../../project-context.md
  - ../../../../README.md
updated: 2026-08-05
---

# LeadFlow — Design Spine

LeadFlow conserva su identidad visual actual. Esta spine define solo el ajuste necesario para que la interfaz ayude al asesor a actuar con una mano y con poca atención disponible; no crea una marca nueva ni reemplaza los componentes útiles del brownfield. La spine gana ante cualquier mockup o implementación visual posterior.

## Brand & Style

LeadFlow debe sentirse como una herramienta de piso: clara, rápida y con energía controlada. La tinta profunda y la lima ya presentes construyen reconocimiento; las superficies cálidas y los bordes suaves reducen la sensación de sistema corporativo pesado. La prioridad visual es el trabajo que requiere atención ahora, no la decoración.

La jerarquía visual es: acción inmediata; identidad y contexto; estado operativo; información secundaria. La energía proviene de contraste y ritmo, no de gradientes, animaciones o nuevas ilustraciones. En móvil, cada pantalla se lee en una mirada vertical y las acciones principales se distinguen sin hover.

## Colors

| Token | Valor | Uso |
|---|---|---|
| surface-base | #F6F3ED | Canvas global y fondo de la PWA. |
| surface-raised | #FFFFFF | Tarjetas, formularios y diálogos. |
| surface-soft | #FAF9F6 | Campos, agrupadores y bloques de contexto. |
| ink-primary | #101828 | Texto principal, navegación activa y acción de alto compromiso. |
| ink-secondary | #697386 | Texto auxiliar, fechas y estados neutros. |
| accent-primary | #C9F36A | Acción primaria y foco de trabajo; no decoración. |
| accent-primary-ink | #101828 | Texto e iconos sobre la lima. |
| focus-blue | #1D5C9C | Llamada, enlaces y posposición. |
| whatsapp-green | #25D366 | Identificación reconocible del canal. |
| success | #18733A | Éxito confirmado y acción hecha. |
| warning | #B94910 | Vencido, pendiente de atención o recuperación. |
| error | #B33A2C | Error accionable o bloqueo. |
| border-subtle | #E3E0D9 | Separación estructural de baja intensidad. |

La lectura primaria usa ink-primary sobre surface-base o surface-raised. Todo estado cromático lleva texto explícito o icono con nombre; el color nunca es la única señal. La lima significa actuar ahora o guardar. El verde WhatsApp identifica el canal; success comunica resultado, aunque ambos puedan convivir.

## Typography

Se conserva la familia actual: Arial, Helvetica, sans-serif. No se introduce una fuente de marca durante el piloto.

| Token | Definición | Uso |
|---|---|---|
| display | 36px, 900, line-height 0.98, letter-spacing -0.06em | Títulos de superficie. |
| heading | 20px, 900, line-height 1.1, letter-spacing -0.03em | Secciones y nombre de lead. |
| body | 16px, 400, line-height 1.5 | Explicación y lectura. |
| label | 12px, 900, line-height 1.2, letter-spacing 0.08em | Categorías breves. |
| meta | 11px, 700, line-height 1.35 | Fecha y estado secundario. |
| action | 14px, 900, line-height 1.2 | Texto de botones. |

La información operativa usa frases cortas y verbos. No hay titulares promocionales dentro de la cola de trabajo. El texto admite zoom y tamaños grandes sin truncar controles críticos.

## Layout & Spacing

Se conserva una escala basada en 4/8: spacing.1 a spacing.6. El margen lateral móvil es spacing.margin-mobile; el contenido principal queda en una sola columna hasta que una vista amplia justifique dos columnas.

La navegación inferior y el CTA sticky respetan el área segura de Android. Ninguna acción flotante oculta el botón primario, el último campo o una tarjeta vencida. El dashboard usa bloques verticales: conversaciones activas, recordatorios para hoy, sin próxima acción y resto filtrado.

## Elevation & Depth

La profundidad se comunica con tono de superficie y bordes sutiles. Las tarjetas existentes conservan sombras suaves; diálogos y hojas de recuperación usan una sombra de overlay. No se añaden sombras grandes a métricas que no requieren acción.

Un estado prioritario puede usar un borde warning o success y un halo leve. El borde no compite con el texto ni crea una segunda jerarquía.

## Shapes

| Token | Valor | Uso |
|---|---|---|
| rounded.sm | 12px | Inputs y controles compactos. |
| rounded.md | 16px | Botones, chips y agrupadores. |
| rounded.lg | 20px | Tarjetas de lead y bloques de trabajo. |
| rounded.xl | 28px | Secciones de formulario y paneles grandes. |
| rounded.full | 9999px | Estados tipo píldora y navegación compacta. |

Las esquinas existentes se conservan, pero no se mezclan radios arbitrarios en una misma jerarquía.

## Components

| Componente | Especificación visual |
|---|---|
| App shell | Header sticky ligero, marca LeadFlow con tinta y lima, navegación inferior móvil y navegación horizontal amplia. |
| Primary action | Fondo accent-primary, texto accent-primary-ink, mínimo 48dp y radio rounded.md. |
| Secondary action | Fondo surface-raised, borde border-subtle y texto ink-primary. |
| Work queue | Lista vertical de tarjetas blancas; success para activo, warning para vencido y texto explícito para sin próxima acción. |
| Lead card | Radio rounded.lg, padding móvil spacing.4. Cabecera con nombre, modelo, próxima acción o excepción, conversación y canal. |
| State badge | rounded.full, texto breve y contraste suficiente; color más etiqueta. |
| Action group | Tres acciones de igual altura y orden estable: Hecho, Posponer, Ignorar. |
| Capture form | Secciones blancas existentes, selección táctil y CTA sticky. |
| First-contact result | Panel con resumen y lista enviado/faltó; success completo, warning parcial, error fallido. |
| Inbound response block | Último mensaje, hora y CTA Responder al cliente o Marcar respuesta hecha. |
| Push notification | Nombre del lead, tipo y contexto mínimo; acciones Hecho, Posponer e Ignorar. |
| Sync preview/result | Una columna, campos a enviar, confirmación explícita, etapa, ID externo verificado o error funcional. |
| Purchase marker | Acción textual Cliente decidió comprar; después Compra registrada con fecha. |
| Feedback | Inline junto al control; toast solo para confirmaciones breves. |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Conservar lima, tinta, superficies cálidas y radios existentes. | Crear una paleta nueva por feature. |
| Hacer visible la próxima acción en la tarjeta cerrada. | Obligar a expandir para descubrir qué hacer. |
| Usar verde WhatsApp para reconocer canal y success para resultado. | Usar color o logo como sustituto de estado textual. |
| Mantener una mano, una columna y botones de 48dp o más. | Esconder acciones críticas en hover o menú de tres puntos. |
| Mostrar resultados parciales honestos. | Presentar enviado si faltó un recurso o solo se aceptó una solicitud. |
| Mantener QR y configuración útiles. | Convertir /qr o /whatsapp en pasos obligatorios de captura. |
