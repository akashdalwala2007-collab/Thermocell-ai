"""Train ML Model 1: Battery Health / Screening Classifier with Leave-One-Group-Out CV."""
from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Dict, Any, List

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, balanced_accuracy_score, confusion_matrix

FEATURE_COLS_MODEL_1 = [
    "OCV",
    "DCIR",
    "ΔV10",
    "dV/dt_slope",
    "V_recovery_rate",
    "T_initial",
    "ΔT_bulk",
    "dT/dt_max",
    "τ_cool",
]

TARGET_COL = "ground_truth_label"
GROUP_COL = "cell_id"


def train_and_evaluate_health_model(
    csv_path: str = "ml/features/extracted_features.csv",
    output_dir: str = "ml/saved_models",
) -> Dict[str, Any]:
    """Train Model 1 on electrical and bulk thermal features with LOGO CV and serialize artifact."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Extracted features file not found: {csv_path}")

    df = pd.read_csv(csv_path)
    X = df[FEATURE_COLS_MODEL_1]
    y = df[TARGET_COL]
    groups = df[GROUP_COL]

    # 1. Leave-One-Group-Out (LOGO) Cross-Validation across physical cells
    logo = LeaveOneGroupOut()
    y_true: List[str] = []
    y_pred: List[str] = []
    fold_metrics = []

    for fold_idx, (train_idx, test_idx) in enumerate(logo.split(X, y, groups)):
        held_out_cell = groups.iloc[test_idx].unique().tolist()
        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=1.0, random_state=42, max_iter=1000)),
        ])
        pipe.fit(X.iloc[train_idx], y.iloc[train_idx])
        preds = pipe.predict(X.iloc[test_idx])
        
        y_true.extend(y.iloc[test_idx])
        y_pred.extend(preds)
        fold_metrics.append({
            "fold": fold_idx + 1,
            "held_out_cell": held_out_cell,
            "samples": len(test_idx),
            "correct": int(np.sum(preds == y.iloc[test_idx])),
        })

    balanced_acc = float(balanced_accuracy_score(y_true, y_pred))
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    conf_mat = confusion_matrix(y_true, y_pred, labels=["REUSE", "INVESTIGATE", "RETIRE"]).tolist()

    # 2. Train Final Calibrated Model on Complete Dataset
    final_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(C=1.0, random_state=42, max_iter=1000)),
    ])
    final_pipeline.fit(X, y)

    # 3. Save Model Artifact
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "health_model.joblib")
    meta_path = os.path.join(output_dir, "health_model_meta.json")

    artifact = {
        "pipeline": final_pipeline,
        "feature_names": FEATURE_COLS_MODEL_1,
        "classes": final_pipeline.named_steps["clf"].classes_.tolist(),
        "balanced_accuracy_logo": balanced_acc,
    }
    joblib.dump(artifact, model_path)

    metadata = {
        "model_name": "Model 1: Battery Health Classifier",
        "features": FEATURE_COLS_MODEL_1,
        "classes": final_pipeline.named_steps["clf"].classes_.tolist(),
        "balanced_accuracy_logo": balanced_acc,
        "classification_report": report,
        "confusion_matrix": conf_mat,
        "fold_results": fold_metrics,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


if __name__ == "__main__":
    meta = train_and_evaluate_health_model()
    print(f"Model 1 trained successfully. LOGO Balanced Accuracy: {meta['balanced_accuracy_logo']:.4f}")
