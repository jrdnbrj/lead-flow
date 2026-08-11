# External evidence contract

For `OPERATIONAL` and `HYBRID` stories, generate `external-evidence-request.json`, register it with `register_external_evidence.py`, and only then wait for a person or external process. The registry binds request ID, story/run context, artifact path, file SHA-256, request fingerprint, and creation time.

The external process returns `external-evidence-result.json`. Supplying it never means PASS. `import_external_evidence.py` first verifies that the request file is the intact controller-registered artifact. References are explicit: `LOCAL_ARTIFACT` is resolved and cryptographically checked by the controller; `EXTERNAL_ARTIFACT` and `EXTERNAL_ID` are not read by the workflow and therefore require an explicit `HUMAN_ATTESTED` or `REFERENCE_ONLY` verification mode with postcondition/attestation metadata. It validates the request/result relationship, all REQUIRED evidence IDs, artifact references, environment restrictions, postcondition results, timestamps, redaction declarations, and secret absence. It records whether each reference was hash-verified or only attested so review cannot confuse the two. It appends only structured evidence references to the implementation ledger; it never stores secrets, private-row dumps, raw payloads, credentials, or unredacted command output.

For E4-S1 the request must require evidence of:

- backup identity, mechanism/version, UTC timestamp, source project/environment, digest, scope and responsible operator;
- inventory of migrations 001–009 tables plus present functions, triggers, RPCs, policies, grants, RLS, Realtime publication, identity, audit/event objects, and explicit verified `N/A` reasons;
- a real restore drill in isolated local/preview destination, with destination identity proving it is not production;
- pre/post object, schema, constraint, index, function/trigger/RPC, RLS/policy/grant, Realtime, row-count and deterministic ownership-digest comparisons;
- privileged/authenticated access verification without private rows in the report;
- proof that no new anonymous private access was introduced;
- negative-case results for missing/corrupt backup, missing object, mismatch, non-isolated destination, unverifiable pooler, new anonymous access, and secret exposure;
- recovery procedure evidence that does not reopen anonymous private access.

The orchestrator may validate the report and references. It must not execute backup, restore, remote SQL, migration push, or external storage operations.
