"""Automated test suite verifying the zero-leakage cross-validation audit."""
import pytest
from ml.evaluation.leakage_audit import run_leakage_audit


def test_leakage_audit_guarantee():
    """LOGO leakage audit must pass with 100% group isolation across all physical cells."""
    report = run_leakage_audit()

    assert "VERIFIED_ZERO_LEAKAGE" in report["conclusion"]
    assert report["all_folds_disjoint"] is True
    assert report["cell_id_contract_passed"] is True
    assert report["num_folds"] == 4
    
    # Verify every fold is strictly disjoint
    for fold in report["fold_details"]:
        assert fold["leakage_detected"] is False
        assert len(set(fold["train_cells"]) & set(fold["test_cells"])) == 0

    # Verify performance metrics
    m1 = report["model_1_health"]
    m2 = report["model_2_pattern"]
    assert m1["balanced_accuracy_logo"] >= 0.75
    assert m2["balanced_accuracy_logo"] >= 0.75
