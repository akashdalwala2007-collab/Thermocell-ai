"""Train ML Model 2: Spatial Thermal Degradation Pattern Classifier."""
from __future__ import annotations

import os
import json
from typing import Dict, Any, List

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, balanced_accuracy_score

FEATURE_COLS_MODEL_2 = [
    "T_max_pixel",
    "T_mean_cell",
    "σ²_T",
    "∇T_tab-body",
    "hotspot_eccentricity",
    "DCIR",
    "τ_cool",
]

GROUP_COL = "cell_id"


def assign_degradation_pattern(row: pd.Series) -> str:
    """Label physical degradation pattern from spatial thermal non-uniformity and impedance."""
    if row["σ²_T"] > 0.020 or (row["T_max_pixel"] - row["T_mean_cell"]) > 0.35:
        return "HOTSPOT_RUNAWAY_RISK"
    elif row["∇T_tab-body"] > 0.15:
        return "TAB_CONTACT_RESISTANCE"
    else:
        return "UNIFORM_AGING"


def train_and_evaluate_pattern_model(
    csv_path: str = "ml/features/extracted_features.csv",
    output_dir: str = "ml/saved_models",
) -> Dict[str, Any]:
    """Train Model 2 on spatial thermal features with LOGO CV and serialize artifact."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Extracted features file not found: {csv_path}")

    df = pd.read_csv(csv_path)
    df["degradation_pattern"] = df.apply(assign_degradation_pattern, axis=1)

    X = df[FEATURE_COLS_MODEL_2]
    y = df["degradation_pattern"]
    groups = df[GROUP_COL]

    # 1. Leave-One-Group-Out (LOGO) Cross-Validation
    logo = LeaveOneGroupOut()
    y_true: List[str] = []
    y_pred: List[str] = []

    for train_idx, test_idx in logo.split(X, y, groups):
        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=1.0, random_state=42, max_iter=1000)),
        ])
        pipe.fit(X.iloc[train_idx], y.iloc[train_idx])
        preds = pipe.predict(X.iloc[test_idx])
        y_true.extend(y.iloc[test_idx])
        y_pred.extend(preds)

    balanced_acc = float(balanced_accuracy_score(y_true, y_pred))
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)

    # 2. Train Final Pipeline on All Data
    final_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(C=1.0, random_state=42, max_iter=1000)),
    ])
    final_pipeline.fit(X, y)

    # 3. Save Model Artifact
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "pattern_model.joblib")
    meta_path = os.path.join(output_dir, "pattern_model_meta.json")

    artifact = {
        "pipeline": final_pipeline,
        "feature_names": FEATURE_COLS_MODEL_2,
        "classes": final_pipeline.named_steps["clf"].classes_.tolist(),
        "balanced_accuracy_logo": balanced_acc,
    }
    joblib.dump(artifact, model_path)

    metadata = {
        "model_name": "Model 2: Spatial Degradation Pattern Classifier",
        "features": FEATURE_COLS_MODEL_2,
        "classes": final_pipeline.named_steps["clf"].classes_.tolist(),
        "balanced_accuracy_logo": balanced_acc,
        "classification_report": report,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


if __name__ == "__main__":
    meta = train_and_evaluate_pattern_model()
    print(f"Model 2 trained successfully. LOGO Balanced Accuracy: {meta['balanced_accuracy_logo']:.4f}")
