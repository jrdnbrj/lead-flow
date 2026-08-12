# E4-S8 cutover writers

Version: 1.0 — preparation only. No writer is changed by this artifact.

| Writer | Ownership roots | Mode during cutover | Lock/evidence |
|---|---|---|---|
| PWA lead capture/actions | `leads`, `lead_follow_up_actions` | FROZEN | maintenance + `leadflow_auth_cutover` |
| Evolution webhook | `leads`, `lead_messages`, actions | SHARED_LOCK | token entrypoint + retryable timeout |
| server/admin repository | `leads`, settings, messages | FROZEN | maintenance + lock |
| scheduler/provider jobs | any declared ownership root | FROZEN unless inventoried | fail closed if unlisted |
| Supabase Auth/config | singleton identity | FROZEN | preflight only |

An unlisted writer, missing lock acquisition, timeout or unknown outcome blocks the cutover. This file does not enable maintenance or execute a lock.
