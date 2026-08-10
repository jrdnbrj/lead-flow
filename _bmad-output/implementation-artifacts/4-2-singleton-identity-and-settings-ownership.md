# Story 4.2: Singleton de identidad y ownership de configuración existente

Status: ready-for-revalidation

## Story

Como sistema de un solo asesor,
quiero una autoridad de identidad única y ownership consistente en las escrituras actuales,
para que todas las fases posteriores puedan comprobar propiedad sin depender de convenciones del cliente.

## Dependencies

- E4-S1: reporte `status: PASS` de backup y restore verificados, conforme al gate consumible de E4-S1.

## Acceptance Criteria

1. Una migración aditiva crea `leadflow_installation` con exactamente un `advisor_user_id` no nulo que referencia `auth.users`. El `advisor_user_id` aprobado es la única entrada operativa para crear o verificar el singleton; la migración no descubre la identidad mediante email, metadata, orden de creación, caller, entorno u otra heurística. No existe signup público, multiusuario ni una segunda autoridad de identidad.
2. La migración valida que la entrada exista y tenga formato UUID, que corresponda exactamente a una fila de `auth.users` y que el estado existente permita un único singleton. Ante entrada ausente o inválida, usuario inexistente, más de una fila candidata, singleton duplicado o singleton existente con otro `advisor_user_id`, falla cerrado antes de cualquier `INSERT`/`UPDATE` y no deja escritura parcial.
3. `leadflow_settings` pasa a ser un ownership root directo con `user_id` no nulo después de la migración; la fila singleton existente se conserva y queda asociada al `advisor_user_id` aprobado.
4. Las lecturas y escrituras actuales de configuración dejan de depender de `id = 'default'` como autoridad de ownership: el servidor filtra/upsertea por el owner singleton y mantiene el fallback de campos vacíos.
5. Las nuevas escrituras privadas de `leads` que ya hayan sido autorizadas legítimamente por su entrypoint reciben el owner singleton en Phase A a través de `lib/leads/repository.ts:createLead`, invocado por `createLeadAction`. Ese componente resuelve server-side el owner desde `leadflow_installation`, no acepta `user_id` proporcionado por el caller y nunca persiste una nueva fila privada autorizada Phase A con `user_id = null`; si no puede resolver un singleton válido, falla cerrado y sin persistencia parcial. La asignación de `advisor_user_id` define ownership, no autorización: conocer el UUID no autoriza un caller ni convierte una llamada anónima en escritura privada. `tenant_id` permanece como campo legacy y no es autoridad de identidad. `lead_messages` y `lead_follow_up_actions` continúan derivando ownership exclusivamente por `lead_id`; no se agregan tablas ni capabilities futuras para satisfacer esta story.
6. La migración conserva compatibilidad anónima de Phase A y no revoca ni modifica las políticas/grants anónimos para permitir escrituras privadas. E4-S2 no autoriza callers anónimos ni usa un cliente privilegiado para saltarse la autorización vigente; la decisión de si un entrypoint está autorizado pertenece a E4-S3. La revocación final pertenece exclusivamente a E4-S8.
7. Existe una verificación reproducible de unicidad, foreign key, no nulidad, owner mismatch y comportamiento ante identidad ausente, UUID inválido, usuario inexistente, singleton duplicado o singleton conflictivo. Reaplicar la operación con el mismo `advisor_user_id` conserva el singleton y no duplica la fila; un UUID diferente falla sin reemplazo. La modificación directa del singleton queda preparada para ser bloqueada en Phase B, sin abrir un runtime de reemplazo.

## Tasks / Subtasks

- [ ] Confirmar, después del backup de E4-S1, el `advisor_user_id` aprobado como entrada única de la operación; validar formato y existencia exacta en `auth.users` sin descubrirlo por email, metadata, orden, caller o entorno.
- [ ] Crear la migración aditiva del singleton y la columna/índice de owner de `leadflow_settings`.
- [ ] Resolver la fila singleton actual de configuración sin duplicarla ni descartar campos.
- [ ] Actualizar el repositorio server-side y su Server Action para leer/upsert por owner.
- [ ] Actualizar `lib/leads/repository.ts:createLead`, invocado por `createLeadAction`, para resolver server-side el owner desde `leadflow_installation` mediante la frontera privilegiada existente únicamente después de que el entrypoint haya sido autorizado por su contrato vigente; rechazar `user_id` del caller, impedir `user_id = null` en nuevas escrituras privadas autorizadas Phase A y fallar sin persistencia parcial si falta el singleton. No añadir autorización, nuevo entrypoint ni bypass privilegiado para callers anónimos.
- [ ] Añadir checks SQL y de repositorio para integridad, nulidad, duplicidad, owner mismatch, identidad ausente/inválida/conflictiva y compatibilidad Phase A.

## Dev Notes

- `leadflow_settings` hoy solo tiene `id text primary key check (id = 'default')` y es accesible mediante el cliente admin en `lib/config/persistent-settings.ts`; `lib/config/actions.ts` es su mutación actual.
- `leads.user_id` ya existe, pero `lib/leads/repository.ts:createLead` hoy usa el usuario de sesión o `null`; E4-S2 debe sustituir esa fuente para nuevas escrituras Phase A por el singleton resuelto server-side desde `leadflow_installation`. No aceptar un owner enviado por el caller, no usar `tenant_id` como autoridad y no inventar ownership directo en tablas derivadas.
- La asignación de `advisor_user_id` define ownership, no autorización. E4-S2 solo garantiza que, una vez autorizada legítimamente una escritura, el owner resultante sea el singleton y nunca un valor aportado por el caller. La resolución y persistencia del owner se mantiene en la frontera server-side existente; no usar un cliente privilegiado para convertir una llamada anónima en una escritura privada del singleton.
- E4-S2 no decide si un entrypoint está autorizado, no autoriza callers anónimos y no cambia policies/grants anónimos para permitir escrituras privadas. Esa política pertenece a E4-S3. No crear en esta story login, `requireAdvisor()`, `AUTH_REQUIRED`, una policy/RLS final, un webhook, un backfill, un cutover, un nuevo entrypoint ni una nueva capability. Mensajes y acciones siguen derivando ownership mediante `lead_id`.
- La identidad de instalación es la única autoridad para Next.js, PostgreSQL, Edge y Evolution; los entrypoints privilegiados no deben aceptar un `owner_id` enviado por el caller.
- El guard final de inmutabilidad y la revocación de privilegios directos del singleton se activan durante Phase B, no como bypass anónimo en Phase A.

### Current Brownfield Context

- `lib/config/persistent-settings.ts` usa `SUPABASE_SERVICE_ROLE_KEY` y filtra por `id = 'default'`.
- `lib/supabase/admin.ts` usa las variables legacy actuales; la reconciliación a `SUPABASE_SECRET_KEY` queda sujeta a AD-12 sin exponer secretos al navegador.
- Las migraciones 001, 003, 004 y 006 contienen ownership/RLS existentes y deben evolucionar de forma aditiva.

### Testing Requirements

- Probar migración con entrada `advisor_user_id` ausente, UUID malformado, UUID inexistente, usuario válido único, múltiples filas candidatas, singleton duplicado y singleton conflictivo; cada fallo debe producir `FAIL` sin `INSERT`/`UPDATE` parcial.
- Probar que la configuración se conserva, que una segunda fila singleton no puede insertarse y que los campos vacíos siguen usando el fallback actual.
- Probar que una invocación no autorizada, incluida una llamada anónima, no puede producir una escritura privada atribuida al singleton solo porque el servidor conoce el UUID; E4-S2 no debe cambiar el resultado de autorización ni las policies/grants anónimos.
- Probar que, para una escritura legítimamente autorizada, `createLeadAction`/`createLead` persiste nuevas filas con el `user_id` del singleton, rechaza cualquier `user_id` del caller, conserva `tenant_id` como legacy, no persiste `user_id = null` y falla sin fila parcial si el singleton no puede resolverse.
- Probar que mensajes y acciones creados para el lead continúan derivando ownership únicamente mediante `lead_id`.
- No afirmar que RLS final está activo hasta E4-S8.

### Scope Guardrails

- No implementar clasificación/matching/convergencia de Epic 2.
- No implementar WhatsApp/Push, pagos, hitos posteriores ni sincronización corporativa.
- No crear tablas/capabilities futuras solo para anticipar ownership.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-3]
- [Source: supabase/migrations/001_leadflow_core_schema.sql]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: lib/config/persistent-settings.ts]
- [Source: lib/config/actions.ts]
- [Source: lib/leads/repository.ts#createLead]
- [Source: lib/supabase/admin.ts]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
