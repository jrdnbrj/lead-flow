---
document_type: product_input
project_name: LeadFlow
owner: Jordan
primary_user: Asesor de ventas de vehículos Changan
status: draft_for_product_brief
date: 2026-08-05
source_confidence:
  confirmed_by_user: true
  confirmed_by_code_summary: true
  includes_hypotheses: true
---

# Product Input — LeadFlow

## 1. Propósito de este documento

Este documento reúne el contexto de negocio, producto, operación y tecnología necesario para crear el Product Brief y posteriormente el PRD de LeadFlow.

No debe interpretarse como una especificación cerrada. Separa:

- hechos observados o reportados;
- funcionalidades ya existentes;
- decisiones actuales;
- hipótesis pendientes de validar;
- visión futura;
- preguntas abiertas.

El objetivo inmediato no es diseñar un CRM genérico ni una plataforma SaaS completa. Es construir y validar una herramienta útil para un asesor real durante los próximos cinco meses, aprender de su operación diaria y usar esa evidencia para decidir qué producto comercial podría construirse después.

---

## 2. Contexto del negocio

El usuario inicial es un asesor de ventas de vehículos Changan en Ecuador. Actualmente se encuentra entre los mejores vendedores de su organización: ocupa el segundo puesto anual entre aproximadamente 40 vendedores y lleva alrededor de 70 ventas.

Su meta declarada es terminar el año con 150 ventas.

Para pasar de 70 a 150 necesita 80 ventas adicionales. Si quedan aproximadamente cinco meses, debe promediar unas 16 ventas mensuales. El producto no puede garantizar ese resultado por sí solo; debe enfocarse en mejorar los comportamientos y procesos que sí puede influir:

- captar más prospectos correctamente;
- responder más rápido;
- evitar seguimientos olvidados;
- identificar oportunidades con mayor probabilidad;
- reducir trabajo administrativo;
- aumentar la calidad y consistencia del contacto;
- registrar mejor la información para aprender qué convierte.

### Aclaración crítica sobre el objetivo

“Mejorar las ventas en 70 % o 100 %” es un objetivo empresarial aspiracional, no un criterio de aceptación del software. Las ventas también dependen de inventario, precios, financiamiento, demanda, campañas, tráfico, desempeño personal y condiciones del mercado.

LeadFlow debe evaluarse primero mediante indicadores que pueda afectar directamente.

---

## 3. Usuario principal y actores

### Usuario principal

**Asesor de ventas de vehículos**

Necesita captar prospectos rápidamente, recordar qué hacer después, comunicarse con ellos, registrar avances y evitar que las oportunidades se pierdan por falta de seguimiento.

### Usuario piloto

El hermano de Jordan será el primer usuario real y colaborador del piloto.

No debe tratarse solo como “objeto de pruebas”. Debe participar como experto de dominio, validar los flujos y reportar fricción, errores y resultados.

### Actor secundario futuro

- otros asesores de la misma empresa;
- coordinadores o jefes comerciales;
- concesionarios y empresas de venta de vehículos;
- administradores de una futura plataforma multiusuario.

### Cliente pagador futuro

Todavía no está validado si pagaría:

- el asesor individual;
- un jefe comercial;
- un concesionario;
- la empresa importadora o distribuidora;
- un tercero que administre equipos de ventas.

Esta decisión no debe asumirse todavía.

---

## 4. Problema actual

El asesor recibe prospectos en ferias, contactos directos y otros canales. En situaciones de alta afluencia necesita registrar información rápidamente.

El flujo actual puede incluir:

1. conversar con una persona interesada;
2. anotar nombre, número y vehículo en papel o en el teléfono;
3. guardar el contacto con información dentro del nombre;
4. enviar información o contactar después;
5. trasladar los datos al sistema interno de la empresa;
6. recordar manualmente cuándo hacer seguimiento.

Problemas reportados:

- el registro puede ser lento durante ferias;
- se producen errores al dictar o escribir números;
- algunas personas pueden proporcionar números falsos;
- pasar información del papel o celular al sistema corporativo genera trabajo duplicado;
- el sistema corporativo es robusto, pero antiguo y lento para ciertas tareas;
- el seguimiento depende demasiado de memoria, disciplina y trabajo manual;
- se pueden perder prospectos;
- enviar fotos, videos, información y mensajes repetitivos consume tiempo;
- no existe todavía evidencia suficiente para saber cuáles son las mayores causas de pérdida de ventas.

---

## 5. Oportunidad de producto inmediata

LeadFlow debe funcionar inicialmente como un:

> **Asistente personal de captura, seguimiento y comunicación comercial para un asesor de vehículos.**

No debe intentar reemplazar todavía:

- el CRM oficial de la empresa;
- el sistema de inventario;
- los procesos administrativos corporativos;
- una plataforma omnicanal empresarial;
- un CRM SaaS completo.

Su valor inmediato debe ser reducir fricción y aumentar disciplina comercial.

---

## 6. Objetivo del producto para los próximos cinco meses

### Objetivo principal

Ayudar al asesor a aumentar su capacidad comercial mediante una captura más rápida, una comunicación inicial consistente y un seguimiento más disciplinado.

### Resultados que LeadFlow debe intentar mejorar

- menor tiempo para registrar un prospecto;
- mayor porcentaje de números válidos;
- menor tiempo hasta el primer mensaje;
- mayor porcentaje de prospectos con una próxima acción definida;
- menor número de seguimientos vencidos;
- mayor tasa de respuesta;
- mayor número de cotizaciones;
- mayor conversión por fuente, modelo y nivel de interés;
- menos tiempo invertido en tareas administrativas repetitivas.

### Objetivo de aprendizaje

Entender con evidencia:

- cómo trabaja realmente un asesor;
- dónde pierde tiempo;
- qué información predice mejor una venta;
- qué automatizaciones ayudan;
- qué automatizaciones molestan o generan riesgo;
- qué parte del proceso podría convertirse en un producto para empresas.

---

## 7. Métricas propuestas

Estas métricas deben instrumentarse antes de añadir muchas funcionalidades.

### Métrica empresarial final

- ventas cerradas por mes;
- ventas acumuladas hasta fin de año.

### Métricas adelantadas del producto

- prospectos capturados por día, feria y fuente;
- tiempo medio de captura;
- porcentaje de teléfonos verificados;
- tiempo entre captura y primer contacto;
- porcentaje de prospectos con próxima acción;
- seguimientos pendientes, vencidos y completados;
- tasa de respuesta al primer mensaje;
- tasa de cotización;
- tasa de cierre;
- tiempo medio entre etapas;
- porcentaje de prospectos sin actividad durante X días;
- conversión por modelo, forma de pago, fecha estimada de compra y fuente;
- número de mensajes automáticos fallidos o duplicados;
- tiempo administrativo ahorrado por semana.

### Metas iniciales a validar con el asesor

No son hechos; son propuestas para el piloto:

- capturar un prospecto básico en menos de 30 segundos;
- lograr que al menos 90 % de los prospectos tenga una próxima acción;
- enviar o preparar el primer mensaje en menos de 5 minutos;
- reducir de forma sostenida los seguimientos vencidos;
- registrar el resultado de cada oportunidad ganada o perdida.

---

## 8. Funcionalidades existentes

LeadFlow ya tiene una base funcional.

### Captura de clientes — `/nuevo`

Permite registrar:

- nombre;
- teléfono;
- correo;
- ciudad;
- uno o varios modelos Changan;
- vehículo como parte de pago;
- forma de pago;
- momento estimado de compra;
- notas adicionales;
- prioridad calculada automáticamente.

El teléfono se normaliza para Ecuador y acepta números internacionales.

### Dashboard — `/dashboard`

Permite:

- ver contactos;
- filtrar por estados;
- identificar alta prioridad;
- ver seguimientos para hoy;
- filtrar clientes con vehículo como parte de pago;
- buscar;
- expandir tarjetas;
- ver quién envió el último mensaje;
- paginar;
- actualizar mediante Supabase Realtime;
- actualizar manualmente;
- eliminar contactos mediante borrado lógico.

### Seguimientos

Permite programar:

- llamada;
- WhatsApp;
- cotización;
- otra acción.

Estados:

- hecho;
- pospuesto;
- ignorado;
- pendiente.

Las fechas usan `America/Guayaquil`.

### WhatsApp — `/whatsapp`

Permite:

- consultar conexión;
- generar o regenerar QR de Evolution API;
- desvincular;
- configurar datos del vendedor;
- personalizar el mensaje automático;
- usar variables;
- enviar texto;
- enviar imagen del vehículo;
- registrar estados de entrega;
- registrar mensajes entrantes y salientes;
- actualizar el dashboard en tiempo real.

### Código QR — `/qr`

Permite compartir una tarjeta de contacto digital para que el cliente guarde los datos del vendedor.

No se usa para conectar WhatsApp.

### Estado operativo actual

- un solo vendedor;
- sin autenticación multiusuario;
- base limpia de leads, mensajes y seguimientos;
- funcionalidades existentes reportadas como operativas;
- todavía no existe una suite propia de pruebas automatizadas.

---

## 9. Alcance recomendado del MVP actual

### Prioridad 1 — Instrumentación y uso real

Antes de añadir automatizaciones complejas:

- usar la aplicación diariamente;
- medir tiempos;
- registrar errores;
- registrar pérdidas y cierres;
- observar el flujo real en ferias y fuera de ellas;
- entrevistar al asesor semanalmente;
- mantener un backlog basado en evidencia.

### Prioridad 2 — Captura ultrarrápida

- formulario optimizado para una mano;
- campos mínimos visibles;
- campos opcionales progresivos;
- valores rápidos y selecciones grandes;
- detección de duplicados;
- validación inmediata del teléfono;
- modo feria;
- guardado rápido;
- funcionamiento tolerante a conexión lenta;
- posibilidad de completar información después.

### Prioridad 3 — Verificación y primer contacto

- mensaje inicial configurable;
- confirmación del número;
- información del vehículo solicitado;
- imagen o enlace de catálogo;
- registro del resultado;
- prevención de duplicados;
- reintentos controlados;
- posibilidad de revisión humana antes de enviar.

### Prioridad 4 — Disciplina de seguimiento

- próxima acción obligatoria o sugerida;
- bandeja “qué hacer hoy”;
- recordatorios;
- acciones vencidas;
- posponer con motivo;
- historial;
- estados claros;
- razón de pérdida;
- cierre ganado/perdido.

### Prioridad 5 — Analítica básica

- embudo;
- tiempos;
- conversiones;
- fuentes;
- modelos;
- razones de pérdida;
- desempeño por periodo.

### Prioridad 6 — Sincronización con el sistema corporativo

- mapear los campos requeridos;
- automatizar primero un único flujo;
- vista previa antes de enviar;
- confirmación humana;
- registro del identificador externo;
- idempotencia;
- evidencia de éxito;
- manejo de sesión expirada;
- detección de cambios en la interfaz;
- cola de reintentos limitada.

---

## 10. Funcionalidades candidatas, pero no todas deben entrar ahora

### Notificaciones

Candidatas:

- notificación PWA;
- recordatorio dentro de la app;
- mensaje personal al asesor por WhatsApp;
- correo;
- resumen diario.

Debe elegirse un mecanismo principal. Implementar todos a la vez sería innecesario.

### Score dinámico

Debe empezar con reglas explicables, no con un modelo opaco.

Variables candidatas:

- fecha estimada de compra;
- forma de pago;
- vehículo como parte de pago;
- respuesta a mensajes;
- tiempo desde el último contacto;
- solicitud de cotización;
- interacción repetida;
- disponibilidad del modelo;
- fuente del prospecto.

El score debe compararse con ventas reales. Si no predice cierre, debe cambiarse o eliminarse.

### Contacto automático

Guardar automáticamente un contacto en el teléfono puede depender de permisos y limitaciones de iOS, Android, navegador o PWA.

Alternativas más realistas:

- generar una vCard;
- compartir contacto;
- abrir la pantalla de guardado;
- QR de contacto;
- exportación.

### Catálogo administrable

Puede aportar valor si reduce el tiempo de buscar y enviar información.

Debe incluir:

- modelos;
- versiones;
- imágenes;
- enlaces;
- disponibilidad, solo si existe una fuente confiable;
- vigencia;
- datos que no deban inventarse.

### Transcripción de conversaciones

No debe ser prioridad inicial.

Riesgos:

- consentimiento;
- ruido de feria;
- errores;
- privacidad;
- costo;
- almacenamiento;
- extracción incorrecta.

Una alternativa inicial es dictado manual voluntario al terminar la conversación.

---

## 11. WhatsApp y comunicación

### Uso inmediato

WhatsApp se usa para:

- validar el número;
- enviar un primer mensaje;
- compartir información;
- registrar respuestas;
- activar o ajustar seguimientos.

### Principios

- no enviar mensajes duplicados;
- no marcar como contactado si el envío falló;
- permitir revisión humana;
- mantener trazabilidad;
- distinguir mensaje entrante y saliente;
- no asumir que una respuesta implica intención de compra;
- respetar límites y políticas del canal;
- evitar automatizaciones agresivas que perjudiquen la cuenta o la confianza.

### Guardado del contacto del vendedor

No debe basarse únicamente en una recompensa artificial.

Opciones con valor real:

- enviar una tarjeta de contacto;
- QR;
- catálogo o lista de precios actualizable;
- beneficios reales autorizados;
- recordatorios o contenido útil;
- servicio posventa.

La motivación debe ser utilidad, no manipulación.

---

## 12. Automatización del sistema corporativo

La automatización del sistema corporativo forma parte del alcance inmediato, después de estabilizar los ajustes prioritarios de LeadFlow.

La empresa ya autorizó realizar pruebas mediante automatización de navegador y web scraping. No existe una API oficial disponible.

### Objetivo

Evitar que el asesor tenga que volver a ingresar manualmente en el sistema corporativo la información ya capturada en LeadFlow.

### Opciones técnicas

1. **Automatización de navegador**, preferentemente con Playwright:
   - iniciar sesión de forma controlada;
   - reutilizar una sesión autorizada;
   - completar formularios;
   - validar el resultado visible;
   - guardar evidencia de cada operación.

2. **Reproducción de solicitudes internas**:
   - identificar las solicitudes HTTP que realiza la aplicación web;
   - reutilizar una sesión vigente;
   - enviar operaciones equivalentes mediante un cliente HTTP;
   - renovar la sesión cuando caduque.

La segunda opción puede ser más rápida, pero también es más frágil porque depende de endpoints internos, cookies, tokens, CSRF y comportamientos no documentados. No debe ser la única ruta sin pruebas y mecanismos de recuperación.

### Enfoque recomendado

Usar automatización de navegador como ruta principal y emplear solicitudes HTTP internas solo cuando:

- el comportamiento esté suficientemente entendido;
- la operación sea estable;
- exista autorización;
- se valide la respuesta y la postcondición;
- pueda volver a ejecutarse sin duplicar datos.

### Requisitos de seguridad y operación

- usar una cuenta de prueba o un usuario autorizado;
- documentar el alcance permitido por la empresa;
- no almacenar credenciales o tokens en el repositorio;
- cifrar o proteger cualquier estado de sesión persistido;
- registrar quién ejecutó cada automatización;
- mantener idempotencia;
- detectar duplicados;
- validar la postcondición en el sistema corporativo;
- permitir confirmación humana para operaciones sensibles;
- incluir reintentos limitados;
- detenerse ante cambios inesperados de interfaz;
- no evadir controles de acceso, CAPTCHA o medidas de seguridad;
- disponer de una forma manual de recuperación.

### Primera entrega recomendada

- sincronizar un lead de LeadFlow al sistema corporativo;
- soportar primero un único tipo de registro;
- mostrar vista previa de los datos;
- requerir confirmación humana;
- guardar resultado, fecha, identificador externo y evidencia;
- evitar el reenvío de un lead ya sincronizado;
- reportar claramente errores parciales.

---

## 13. Proceso comercial inicial a modelar

El pipeline todavía debe validarse con el asesor.

Propuesta inicial:

1. capturado;
2. contacto pendiente;
3. contactado;
4. conversación activa;
5. calificado;
6. cotización enviada;
7. negociación;
8. cierre ganado;
9. cierre perdido;
10. seguimiento futuro.

Cada etapa debe tener:

- criterio de entrada;
- criterio de salida;
- próxima acción;
- fecha;
- responsable;
- evidencia;
- motivo de pérdida, cuando aplique.

---

## 14. Datos mínimos del prospecto

### Obligatorios para captura rápida

- nombre o identificador;
- teléfono;
- modelo o categoría de interés;
- fuente;
- fecha de captura.

### Recomendados

- fecha estimada de compra;
- forma de pago;
- vehículo como parte de pago;
- ciudad;
- próxima acción;
- notas breves.

### Datos a validar antes de añadir

- presupuesto;
- entrada disponible;
- estado de financiamiento;
- número de personas que deciden;
- uso del vehículo;
- modelo alternativo;
- razón principal de compra;
- razón de no compra;
- campaña;
- feria o punto de origen.

No se debe convertir la captura en una entrevista larga.

---

## 15. UX del modo feria

El modo feria debe priorizar velocidad.

Principios:

- una sola pantalla;
- mínimo desplazamiento;
- teclado apropiado;
- botones grandes;
- selecciones rápidas;
- guardado automático o explícito claro;
- confirmación visible;
- recuperación ante pérdida de conexión;
- detección de duplicados;
- captura básica primero;
- completar después;
- dictado opcional;
- acceso rápido a cámara, QR o catálogo solo si aporta valor.

---

## 16. Arquitectura e infraestructura existentes

LeadFlow usa:

- Next.js con App Router;
- React;
- TypeScript estricto;
- Supabase remoto;
- PostgreSQL;
- Supabase Realtime;
- Server Components;
- Server Actions;
- repositorios de dominio;
- Zod;
- Evolution API;
- Redis para Evolution;
- Docker Compose;
- Dockerfile multi-stage;
- webhook de Evolution;
- borrado lógico mediante RPC;
- variables privadas solo en servidor.

### Arquitectura actual

```text
Navegador
   ↓
Next.js App Router
   ├── Server Components
   ├── Server Actions
   ├── API webhook
   └── Repositorios
        ↓
Supabase
        ↓
Evolution API
        ↓
WhatsApp
```

### Decisión actual

Para el piloto de un solo vendedor, esta arquitectura es suficiente.

No se recomienda migrar ahora a microservicios, LangGraph, n8n, un CRM empresarial ni una arquitectura multiagente en producción solo por anticipar el futuro.

---

## 17. Deuda y riesgos técnicos actuales

- no existe una suite de pruebas propia;
- el score todavía debe validarse con resultados reales;
- el sistema depende de Evolution API;
- no existe autenticación ni aislamiento multiusuario;
- la integración con el sistema corporativo dependerá de una interfaz o endpoints no documentados;
- el catálogo y configuración deben mantenerse actualizados;
- el sistema puede crecer por acumulación de excepciones;
- las automatizaciones pueden mezclarse con reglas de negocio;
- el código actual puede ser desechable, pero los datos y aprendizajes no deben serlo;
- la falta de métricas haría imposible saber si la app mejora ventas.

---

## 18. Hipótesis pendientes de validar

- el mayor problema es la falta de seguimiento;
- la captura rápida aumentará la cantidad de prospectos útiles;
- la verificación temprana reducirá números inválidos;
- un mensaje automático mejorará la respuesta;
- el score ayudará a priorizar;
- el asesor usará una herramienta adicional todos los días;
- los recordatorios aumentarán cierres;
- compartir contenido de vehículos aumentará interés;
- la automatización del CRM corporativo reducirá tiempo y errores sin introducir duplicados o fallos operativos;
- otros vendedores tienen el mismo problema;
- una empresa pagaría por la solución;
- el producto futuro debe ser un CRM completo;
- la misma arquitectura servirá para múltiples negocios.

Estas hipótesis deben convertirse en experimentos o entrevistas.

---

## 19. Decisiones actuales

- LeadFlow se probará primero con un solo asesor.
- La prioridad es el resultado operativo durante los próximos cinco meses.
- La aplicación existente se conservará y mejorará.
- Supabase seguirá siendo la fuente principal de datos.
- El backend seguirá dentro de Next.js durante el piloto.
- Evolution API seguirá como integración de WhatsApp mientras sea viable.
- Se priorizarán reglas deterministas y flujos claros.
- La IA no debe decidir acciones críticas sin validación.
- Las automatizaciones de navegador no se implementarán sin permiso y pruebas.
- La visión SaaS no debe inflar el MVP.
- BMAD se usará para aprender y estructurar el desarrollo.
- QA y criterios verificables serán prioritarios.
- Los agentes de desarrollo deben producir artefactos y evidencia, no solo conversar.

---

## 20. Contexto de IA y agentes para el desarrollo

Jordan quiere aprender a construir con un enfoque AI-first y una organización de agentes similar a un equipo de producto:

- Product Owner;
- QA/Test Architect;
- arquitecto o líder técnico;
- desarrollador;
- revisión;
- automatización.

Este objetivo es válido como laboratorio de aprendizaje, pero debe mantenerse separado del valor entregado al asesor.

### Principios para el equipo de agentes

- el PO no inventa necesidades;
- las decisiones de producto parten de evidencia;
- QA verifica riesgos y criterios;
- desarrollo también puede descubrir requisitos incompletos;
- los agentes intercambian documentos, código y resultados verificables;
- el humano aprueba alcance, cambios sensibles y despliegues;
- no crear una jerarquía grande antes de dominar los workflows estándar;
- no usar agentes autónomos para datos o servicios reales sin controles.

### Agente personalizado recomendado más adelante

**Sales Operations Domain Steward**

Responsabilidades:

- guardar conocimiento validado del proceso comercial;
- separar hechos de hipótesis;
- mantener vocabulario y reglas;
- registrar observaciones del asesor;
- proponer experimentos;
- convertir evidencia en requisitos;
- señalar contradicciones.

No debe crearse antes de completar al menos un ciclo estándar de BMAD.

---

## 21. Relación con jrdn-manager y la plataforma conversacional futura

Existe otro proyecto, `jrdn-manager`, orientado a una plataforma de atención al cliente con IA para negocios por WhatsApp y, a futuro, voz.

Ese proyecto ha generado preocupaciones relevantes:

- prompts frágiles;
- reglas duplicadas;
- memoria inconsistente;
- operaciones estructuradas mezcladas con conversación libre;
- necesidad de handoff humano;
- multi-tenancy;
- orden e idempotencia;
- observabilidad;
- evaluación;
- riesgo de construir demasiadas piezas propias.

Estas lecciones son útiles para la visión futura de LeadFlow, pero no justifican importar ahora toda esa arquitectura.

### Regla de separación

- **LeadFlow actual:** herramienta especializada para un asesor.
- **jrdn-manager:** laboratorio/plataforma conversacional más general.
- **CRM futuro:** producto aún no validado que puede reutilizar aprendizajes, no necesariamente código.

No fusionar los tres objetivos durante el MVP.

---

## 22. Alcance futuro posible

Después de validar el piloto:

- varios asesores;
- autenticación;
- organizaciones;
- roles;
- aislamiento de datos;
- asignación de leads;
- catálogo por empresa;
- integraciones oficiales;
- bandeja omnicanal;
- analítica por equipo;
- campañas;
- automatizaciones configurables;
- API;
- auditoría;
- facturación;
- CRM específico para venta automotriz.

La prioridad futura debe surgir de evidencia de varios usuarios, no de una lista de funcionalidades.

---

## 23. Fuera de alcance ahora

- CRM genérico;
- múltiples industrias;
- voz con IA;
- avatares;
- video;
- agentes autónomos conversando entre sí en producción;
- microservicios;
- multi-tenancy completo;
- integraciones con todas las redes sociales;
- campañas masivas;
- automatización total y desatendida de todos los procesos del sistema corporativo;
- scoring con machine learning;
- RAG complejo;
- marketplace de módulos;
- reescritura completa;
- venta empresarial antes de demostrar uso y resultados.

---

## 24. Preguntas clave para el asesor

No se necesitan 50 preguntas. Estas son las prioritarias:

1. ¿De dónde llegan hoy los prospectos y cuántos llegan por cada fuente?
2. ¿Qué pasos sigue desde el primer contacto hasta cerrar o perder una venta?
3. ¿En qué punto se pierden más oportunidades?
4. ¿Qué información necesita realmente para decidir a quién contactar primero?
5. ¿Qué tareas repite más y cuánto tiempo consumen?
6. ¿Qué debe registrar obligatoriamente en el sistema de la empresa?
7. ¿Qué acciones o automatizaciones permite la empresa?
8. ¿Cómo sabe hoy cuándo volver a llamar o escribir?
9. ¿Cuáles son las razones más comunes de pérdida?
10. ¿Qué sería una mejora evidente después de dos semanas usando LeadFlow?
11. ¿Qué información nunca debería automatizarse o enviarse sin revisión?
12. ¿Qué cambiaría para que usara la app todos los días?

---

## 25. Preguntas abiertas de producto

- ¿Cuál es la fuente principal de prospectos?
- ¿Cuánto tarda hoy la captura?
- ¿Cuántos prospectos se pierden por falta de seguimiento?
- ¿Qué sistema corporativo usa?
- ¿Existe alguna exportación o endpoint interno estable?
- ¿Qué operaciones concretas autorizó la empresa automatizar?
- ¿Qué mensajes están aprobados?
- ¿Cuál es el volumen diario?
- ¿Qué tasas actuales existen en cada etapa?
- ¿Cómo se define una oportunidad calificada?
- ¿Cuándo se considera ganado o perdido?
- ¿Qué datos sensibles se recopilan?
- ¿Cuánto tiempo deben retenerse?
- ¿Cuál es el mecanismo de notificación preferido?
- ¿Cómo se gestionan consentimientos?
- ¿Qué parte del flujo es obligatoria por la empresa?
- ¿Qué fallos actuales de LeadFlow impiden usarlo diariamente?

---

## 26. Experimentos recomendados

### Experimento 1 — Captura en feria

Comparar:

- papel/celular actual;
- LeadFlow.

Medir:

- tiempo;
- errores;
- porcentaje de datos completos;
- cantidad de prospectos capturados.

### Experimento 2 — Verificación del número

Comparar prospectos con y sin mensaje inicial.

Medir:

- entregas;
- respuestas;
- números inválidos;
- quejas;
- conversiones posteriores.

### Experimento 3 — Próxima acción

Exigir o sugerir una próxima acción.

Medir:

- seguimientos vencidos;
- contactos completados;
- cotizaciones;
- cierres.

### Experimento 4 — Score

Comparar prioridad calculada con resultado real.

Medir:

- precisión práctica;
- falsos positivos;
- falsos negativos;
- utilidad reportada.

### Experimento 5 — Resumen diario

Enviar una lista corta de acciones pendientes.

Medir:

- tareas completadas;
- uso;
- fatiga;
- preferencia del asesor.

---

## 27. Criterios para considerar útil el piloto

El piloto funciona si, durante varias semanas:

- el asesor usa LeadFlow de forma voluntaria;
- captura prospectos más rápido;
- registra próximas acciones;
- reduce seguimientos olvidados;
- responde más rápido;
- puede explicar qué funcionalidades le ayudan;
- se dispone de datos confiables del embudo;
- no se producen mensajes duplicados o acciones inseguras;
- el sistema requiere menos trabajo del que ahorra;
- aparecen patrones repetibles que podrían servir a otros asesores.

---

## 28. Instrucciones para BMAD Product Brief

Usar este documento junto con:

- `_bmad-output/project-context.md`;
- `README.md`;
- `prompts/`;
- código existente;
- migraciones;
- observaciones reales del asesor.

Antes de redactar el brief final:

1. entrevistar a Jordan;
2. distinguir hechos, hipótesis y decisiones;
3. cuestionar el objetivo de ventas y su atribución;
4. no convertir la visión futura en alcance actual;
5. proponer métricas;
6. identificar riesgos;
7. marcar preguntas no resueltas;
8. mantener el piloto centrado en un solo asesor;
9. no modificar código;
10. no inventar políticas de la empresa.

---

## 29. Prompt sugerido para iniciar el Product Brief

```text
$bmad-product-brief

Usa como fuentes:
- docs/product-input.md
- _bmad-output/project-context.md
- README.md
- prompts/
- el código y las migraciones existentes

Este proyecto brownfield ya tiene funciones operativas.

Antes de redactar el Product Brief:
1. entrevístame para completar los vacíos;
2. separa hechos confirmados, hipótesis, decisiones y visión futura;
3. cuestiona cualquier alcance que no contribuya al piloto de cinco meses;
4. no asumas que la aplicación puede garantizar el objetivo de ventas;
5. define métricas adelantadas medibles;
6. no propongas una reescritura;
7. no modifiques código.

El usuario inicial es un solo asesor de ventas de vehículos.
El objetivo inmediato es mejorar captura, velocidad de contacto, disciplina
de seguimiento y aprendizaje del proceso comercial.
La visión futura de CRM o SaaS debe quedar explícitamente fuera del MVP.
```
