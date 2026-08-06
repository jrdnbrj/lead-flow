# Reconciliación — código y migraciones

- **Resultado:** consistente con la base operativa.
- **Cubierto:** contratos de dominio para leads, tipos de acción, estados, normalización de teléfonos, scoring, validación Zod, repositorio, Server Actions, Evolution, webhook, `leads`, `lead_messages`, `lead_follow_up_actions`, catálogo, configuración, Realtime y borrado lógico.
- **Gaps:** no se encontró implementación de Push, Service Worker, suscripciones Push, sincronización corporativa ni eventos de producto; el PRD los define como trabajo nuevo sin modificar el código durante esta fase.
