"""LeadFlow PROJECT-SPECIFIC implementation policy.

This module is intentionally declarative. Generic orchestrator contracts remain
unchanged; this policy only selects the project's default execution posture and
the conditions that require a stricter posture.
"""

from __future__ import annotations

PROJECT_POLICY = "PROJECT_LEAN"

PROJECT_LEAN = {
    "flow": ("IMPLEMENT", "TARGETED_VALIDATE", "LIGHT_REVIEW", "DONE"),
    "targeted_validation": {
        "affected_diff_and_direct_dependencies_only": True,
        "always": ("git diff --check", "scope check"),
        "typescript": ("typecheck",),
        "directly_related": ("tests",),
        "skip_by_default": ("build", "full suite", "full DB regression", "global tests"),
    },
    "review": {
        "context_isolated_reviews": 1,
        "minor_unambiguous": "fix -> targeted validation -> DONE",
        "p0_p1": "fix -> relevant validation -> one new review",
        "automatic_normal_repair_rounds": 1,
        "external_manual_review_by_default": False,
    },
    "batch_validation": {
        "after_done_stories": 3,
        "at_execution_wave_end": True,
        "checks": ("typecheck", "lint", "build", "full relevant suite"),
        "db_regression_when_db_changes": True,
        "must_pass_before_continuing": True,
    },
    "credit_efficiency": {
        "reuse_fresh_results": True,
        "avoid_re_reading_unchanged_artifacts": True,
        "avoid_regenerating_planning": True,
        "avoid_repeating_frozen_analysis": True,
        "avoid_redundant_checks": True,
        "brief_final_responses": True,
    },
}

STRICT_TRIGGERS = (
    "destructive_or_hard_to_revert_migration",
    "auth_rls_grants_or_ownership",
    "remote_or_production_operation",
    "secret_or_sensitive_config",
    "real_data",
    "architectural_change",
    "p0_or_p1",
    "contradictory_evidence",
    "material_scope_drift",
)

STRICT_POLICY = {
    "triggered_by": STRICT_TRIGGERS,
    "validation_scope": "controls necessary for the identified risk only",
    "preserve_acceptance_criteria": True,
    "never_bypass_failed_tests": True,
    "never_bypass_p0_p1": True,
    "never_relax_destructive_or_remote_operations": True,
    "no_human_intervention_for_resolvable_technical_failures": True,
}


def project_policy() -> dict[str, object]:
    """Return the project policy without exposing mutable module state."""

    return {
        "PROJECT_LEAN": dict(PROJECT_LEAN),
        "STRICT_TRIGGERS": STRICT_TRIGGERS,
        "STRICT": dict(STRICT_POLICY),
        "default": PROJECT_POLICY,
    }


__all__ = ["PROJECT_LEAN", "PROJECT_POLICY", "STRICT_POLICY", "STRICT_TRIGGERS", "project_policy"]
