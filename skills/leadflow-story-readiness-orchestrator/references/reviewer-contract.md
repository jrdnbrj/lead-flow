# Reviewer contract

The initial validator receives the current story, the deterministic input manifest, approved active decisions, and the review rubric. It does not receive previous reviewer output, corrector explanations, parent reasoning, or copied conversation history.

The revalidator receives a fresh context manifest plus only objective blocker IDs, locations, and closure criteria. It independently decides whether the blockers are closed. Findings must use stable IDs, a location, a classification, a blocking flag, an authority reference, and a closure criterion.

Allowed blocking classifications are `TECHNICAL_DETERMINISTIC`, `PRODUCT_DECISION`, `ARCHITECTURAL_CONTRADICTION`, and `HIGH_RISK_ACCEPTANCE`. `PREFERENCE`, `OPTIONAL_IMPROVEMENT`, `FUTURE_STORY`, and `OUT_OF_SCOPE` are non-blocking. An uncertain finding is not auto-fixable.
