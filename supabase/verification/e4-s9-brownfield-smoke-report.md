# E4-S9 brownfield smoke report

Status: `DEFERRED_RUNTIME_VALIDATION`
Reason: real/preview infrastructure, Auth session and controlled webhook destination are prohibited in this phase.

Each runtime step must record all fields below; this preparation artifact contains no runtime PASS:

| step_id | status | environment | fixture/user | timestamp UTC | correlation ID | setup | action | expected | observed | cleanup |
|---|---|---|---|---|---|---|---|---|---|---|
| login_logout | DEFERRED | preview/local later | synthetic singleton | `<runtime>` | `<runtime>` | isolated fixture | login/logout | session lifecycle works | `<runtime>` | remove fixture |
| capture_dashboard | DEFERRED | preview/local later | synthetic lead | `<runtime>` | `<runtime>` | maintenance off only in test target | capture/read | owner-only visibility | `<runtime>` | soft delete |
| webhook_matrix | DEFERRED | mock destination later | synthetic payloads | `<runtime>` | `<runtime>` | controlled mock | inbound/outbound/duplicate/no-id | composite dedupe and rejection | `<runtime>` | discard fixtures |
| realtime | DEFERRED | preview/local later | synthetic owner | `<runtime>` | `<runtime>` | authenticated session | observe update/fallback | transport separated from persistence | `<runtime>` | unsubscribe |
| soft_delete | DEFERRED | preview/local later | synthetic lead | `<runtime>` | `<runtime>` | isolated fixture | RPC + no-rematch | hidden, actions canceled, messages retained | `<runtime>` | verify cleanup |
| privacy_negatives | DEFERRED | preview/local later | wrong/anon user | `<runtime>` | `<runtime>` | isolated fixture | read probes | denied without policy relaxation | `<runtime>` | discard fixtures |

`AUTH_REQUIRED=true`, maintenance and anonymous-private closure remain fail-closed on every runtime failure. No physical delivery or real customer contact is asserted.
