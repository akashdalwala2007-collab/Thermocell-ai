"""CLI and pipeline interface for extracting canonical 14 features and assembling feature datasets."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow importing backend app when run directly
backend_path = Path(__file__).resolve().parents[2] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import pandas as pd
from app.services.telemetry_source import SyntheticPulseSource
from app.services.feature_service import assemble_feature_record, export_features_dataset
from app.services.nasa_service import get_deterministic_nasa_benchmark_fixtures


def generate_benchmark_feature_dataset(output_path: Path) -> Path:
    """
    Generate physics-informed 10-second pulses calibrated to empirical NASA benchmark cycles,
    extract the canonical 14 features for each, and save to output_path with explicit provenance.
    """
    benchmarks = get_deterministic_nasa_benchmark_fixtures()
    source = SyntheticPulseSource()
    feature_records = []

    print("Synthesizing 10-second pulse telemetry calibrated against NASA empirical cycles...")
    for cell_id, cycles in benchmarks.items():
        for cycle_rec in cycles:
            # Map empirical degradation state to pulse model
            # Fresh cells: ~4.12V, DCIR ~ 0.09Ω
            # Degraded cells: ~4.05V, DCIR grows up to 0.22Ω
            dcir = cycle_rec.baseline_dcir or 0.10
            ocv = 4.15 - (0.10 * (1.0 - cycle_rec.soh / 100.0))

            pulse = source.get_pulse_telemetry(
                cell_id=cell_id,
                cycle_index=cycle_rec.cycle_index,
                ocv=round(ocv, 3),
                dcir=round(dcir, 4),
            )

            record = assemble_feature_record(
                telemetry=pulse,
                ground_truth_soh=cycle_rec.soh,
                ground_truth_label=cycle_rec.triage_label.value,
            )
            # Tag thermal provenance explicitly as SYNTHETIC
            record["thermal_provenance"] = "SYNTHETIC"
            feature_records.append(record)
            print(f"  -> Extracted canonical 14 features for {cell_id} cycle {cycle_rec.cycle_index} (SoH: {cycle_rec.soh}%, DCIR: {dcir:.3f} Ohm)")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_features_dataset(feature_records, output_path)
    print(f"Successfully exported {len(feature_records)} feature records to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Extract canonical 14 features for ML dataset.")
    parser.add_argument(
        "--output-file",
        type=Path,
        default=Path(__file__).resolve().parent / "extracted_features.csv",
        help="Path to save extracted features CSV",
    )
    args = parser.parse_args()
    generate_benchmark_feature_dataset(args.output_file)


if __name__ == "__main__":
    main()
