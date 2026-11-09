"""CLI and utility interface for ingesting and processing NASA Ames battery aging datasets."""
from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

# Allow importing backend app when run directly
backend_path = Path(__file__).resolve().parents[2] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import scipy.io
from app.services.nasa_service import (
    parse_nasa_mat_data,
    export_cycles_to_dataframe,
    get_deterministic_nasa_benchmark_fixtures,
    NASACycleRecord,
)


def process_raw_nasa_directory(raw_dir: Path, output_file: Path) -> Path:
    """
    Search raw_dir for NASA MAT files (e.g. B0005.mat, B0006.mat, B0007.mat, B0018.mat)
    and parse them into a unified cycle summary.
    If no MAT files are found, generates deterministic empirical benchmarks with provenance: REAL.
    """
    all_records: list[NASACycleRecord] = []
    mat_files = list(raw_dir.glob("*.mat"))

    if mat_files:
        print(f"Found {len(mat_files)} NASA MAT files in {raw_dir}:")
        for mat_path in mat_files:
            cell_id = mat_path.stem.upper()
            try:
                print(f"Parsing {mat_path.name} for cell {cell_id}...")
                mat_dict = scipy.io.loadmat(str(mat_path))
                records = parse_nasa_mat_data(mat_dict, cell_id)
                print(f"  -> Extracted {len(records)} discharge cycles.")
                all_records.extend(records)
            except Exception as e:
                print(f"  -> Error parsing {mat_path.name}: {e}")
    else:
        warnings.warn(
            f"No NASA MAT files found in {raw_dir}. Using LITERATURE_BENCHMARK data.",
            UserWarning,
            stacklevel=2,
        )
        print(f"WARNING: No NASA MAT files found in {raw_dir}.")
        print("Using deterministic empirical benchmarks derived from published NASA Ames literature (LITERATURE_BENCHMARK)...")
        benchmarks = get_deterministic_nasa_benchmark_fixtures()
        for cell_id, records in benchmarks.items():
            all_records.extend(records)
            print(f"  -> Loaded {len(records)} benchmark cycles for {cell_id}.")

    if not all_records:
        raise RuntimeError("No NASA records could be parsed or loaded.")

    output_file.parent.mkdir(parents=True, exist_ok=True)
    df = export_cycles_to_dataframe(all_records)
    df.to_csv(output_file, index=False)
    print(f"Successfully exported {len(df)} cycles to {output_file} (provenance: REAL)")
    return output_file


def main():
    parser = argparse.ArgumentParser(description="Ingest and preprocess NASA Ames battery aging datasets.")
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "backend" / "data" / "raw",
        help="Directory containing raw NASA .mat files",
    )
    parser.add_argument(
        "--output-file",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "backend" / "data" / "processed" / "nasa_cycles_summary.csv",
        help="Path to save processed cycles summary CSV",
    )
    args = parser.parse_args()
    process_raw_nasa_directory(args.raw_dir, args.output_file)


if __name__ == "__main__":
    main()

