# Final post-correction adversarial certification — LeadFlow

## Verdict

**PASS.** No concrete critical- or high-severity divergence remains. The spine stays mechanically valid (`lint_spine.py`: 0 findings), and each of the five corrected contracts rejects or converges the incompatible child implementations attempted below.

## Critical/high residuals

None.

## Adversarial construction attempts

| Focus | Candidate implementation A | Candidate implementation B | Certification result |
| --- | --- | --- | --- |
| Unique active Push endpoint | Atomically reactivate/rotate the existing row for an exact endpoint. | Insert a second active row for the same exact endpoint during registration or key rotation. | B is non-compliant: AD-9 requires one row/current lifecycle per exact endpoint and enforces `(user_id, endpoint_digest)` uniqueness through subscription lifecycle RPCs. Concurrent registration must converge on that row; key-material changes advance its version/generation. |
| Pre-I/O cancellation | A terminal action wins the prescribed locks and cancels a claimed attempt whose `request_started_at` is null. | The sender wins first, commits `request_started_at`, and the terminal transition cancels the still-resultless attempt. | The outcomes are not two compliant choices. Under the shared lock order, whichever transaction wins is observable; after the begin-I/O fence, cancellation is forbidden and the attempt remains evidence while late results cannot mutate the terminal/newer action. Before the fence, the worker's later begin fails and no I/O is permitted. |
| One provider request per attempt | Use a client with transport retries and non-GET redirect replay disabled. | Let an SDK retry automatically after timeout under the same attempt/fence. | B is explicitly non-compliant with AD-7. A second physical effect request needs a newly authorized attempt and, after uncertainty, proven remote idempotency or definitive query-by-key evidence; otherwise the state remains `UNKNOWN`. |
| Exact `FACT`/`ATTEMPT` identity | Application modules invent event IDs or choose different entity/version tuples. | Database-owned RPCs construct keys from the schema-v1 mapping and return the existing event on replay. | A is non-compliant with AD-10. Every registered `FACT`/`ATTEMPT` has exact identity components, callers cannot supply free-form fact/aggregate identities, and unique `event_key` insertion is owned transactionally by PostgreSQL. Effect-state changes separately map to versioned `EXTERNAL_EFFECT` transition events. |
| Auth cutover with live callbacks | Each Evolution mutation acquires the named shared transaction advisory lock; callbacks before the exclusive cutover drain, and later callbacks wait then run under the new rules. | The cutover revokes anonymous access while callbacks bypass the lock, are acknowledged without persistence, or are released midway through migration. | B is non-compliant with AD-3. The bounded cutover uses the exclusive form of the same lock, rolls back on budget failure, preserves the live webhook path, and enables `AUTH_REQUIRED` only after post-cutover webhook and ownership smoke tests. |

## Wider critical/high scan

- Ownership and mutation authority converge on the immutable database singleton plus versioned PostgreSQL RPCs; Next.js and Edge Functions cannot implement competing state policy.
- Action/message concurrency uses action versions, source-message identity, total ordering and one lock order; stale commands are functional no-ops.
- Push materialization retains one canonical delivery/effect identity across its lifecycle, repairs missing current pairs, and never rematerializes a started or terminal identity.
- External uncertainty remains durable evidence and cannot trigger an automatic resend; accepted Push is not represented as physical delivery or read.
- Security, deployment, environment isolation, scheduler authentication, one-minute monitoring and deferred corporate automation have closed implementation boundaries or explicit no-go gates.

## Certification

The requested final adversarial gate passes. No critical/high correction is required before changing the spine from `draft` to `final` through the parent BMad finalize flow.
