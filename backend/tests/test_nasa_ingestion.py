"""Unit tests for NASA dataset ingestion, SoH calculation, and empirical grounding."""
import pytest
import numpy as np

from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum
from app.services.nasa_service import (
    calculate_soh,
    derive_ground_truth_triage,
    estimate_cycle_dcir,
    NASACycleRecord,
    parse_nasa_mat_data,
    export_cycles_to_dataframe,
    get_deterministic_nasa_benchmark_fixtures,
)


class TestSoHAndTriage:
    def test_calculate_soh_valid(self):
        # 2.0Ah nominal
        assert calculate_soh(2.0, 2.0) == 100.0
        assert calculate_soh(1.6, 2.0) == 80.0
        assert calculate_soh(1.4, 2.0) == 70.0
        assert calculate_soh(1.0, 2.0) == 50.0

    def test_calculate_soh_rejects_non_positive(self):
        with pytest.raises(ValueError, match="positive finite float"):
            calculate_soh(-0.5, 2.0)
        with pytest.raises(ValueError, match="positive finite float"):
            calculate_soh(1.8, 0.0)
        with pytest.raises(ValueError, match="positive finite float"):
            calculate_soh(float("nan"), 2.0)

    def test_derive_ground_truth_triage_boundaries(self):
        # REUSE: >= 80%
        assert derive_ground_truth_triage(100.0) == TriageClassEnum.REUSE
        assert derive_ground_truth_triage(80.0) == TriageClassEnum.REUSE

        # INVESTIGATE: [70%, 80%)
        assert derive_ground_truth_triage(79.99) == TriageClassEnum.INVESTIGATE
        assert derive_ground_truth_triage(75.0) == TriageClassEnum.INVESTIGATE
        assert derive_ground_truth_triage(70.0) == TriageClassEnum.INVESTIGATE

        # RETIRE: < 70%
        assert derive_ground_truth_triage(69.99) == TriageClassEnum.RETIRE
        assert derive_ground_truth_triage(50.0) == TriageClassEnum.RETIRE


class TestNASACycleRecord:
    def test_valid_record(self):
        rec = NASACycleRecord(
            cell_id="B0005",
            cycle_index=40,
            discharge_capacity=1.72,
            nominal_capacity=2.0,
            soh=86.0,
            baseline_dcir=0.108,
            min_temp=24.0,
            max_temp=39.0,
            temp_rise=15.0,
            surface_heating_rate=0.0045,
            triage_label=TriageClassEnum.REUSE,
            provenance=ProvenanceEnum.REAL,
        )
        assert rec.cell_id == "B0005"
        assert rec.cycle_index == 40
        assert rec.soh == 86.0
        assert rec.provenance == ProvenanceEnum.REAL

    def test_reject_cycle_in_cell_id(self):
        with pytest.raises(ValueError, match="composite cycle strings are prohibited"):
            NASACycleRecord(
                cell_id="B0005-CYC40",
                cycle_index=40,
                discharge_capacity=1.72,
                nominal_capacity=2.0,
                soh=86.0,
                baseline_dcir=0.108,
                min_temp=24.0,
                max_temp=39.0,
                temp_rise=15.0,
                surface_heating_rate=0.0045,
                triage_label=TriageClassEnum.REUSE,
                provenance=ProvenanceEnum.REAL,
            )

    def test_reject_negative_cycle_index(self):
        with pytest.raises(ValueError, match="cycle_index must be >= 0"):
            NASACycleRecord(
                cell_id="B0005",
                cycle_index=-1,
                discharge_capacity=1.72,
                nominal_capacity=2.0,
                soh=86.0,
                baseline_dcir=0.108,
                min_temp=24.0,
                max_temp=39.0,
                temp_rise=15.0,
                surface_heating_rate=0.0045,
                triage_label=TriageClassEnum.REUSE,
                provenance=ProvenanceEnum.REAL,
            )

    def test_reject_synthetic_provenance_on_nasa_record(self):
        with pytest.raises(ValueError, match="must have REAL provenance"):
            NASACycleRecord(
                cell_id="B0005",
                cycle_index=1,
                discharge_capacity=1.85,
                nominal_capacity=2.0,
                soh=92.5,
                baseline_dcir=0.09,
                min_temp=24.0,
                max_temp=38.0,
                temp_rise=14.0,
                surface_heating_rate=0.004,
                triage_label=TriageClassEnum.REUSE,
                provenance=ProvenanceEnum.SYNTHETIC,
            )


class TestDCIRCalculation:
    def test_estimate_dcir_from_step(self):
        # At t=0: I=0, V=4.20. At t=1: I=2.0A, V=4.00V -> ΔV = 0.20V, ΔI = 2.0A -> DCIR = 0.10 Ω
        v = [4.20, 4.00, 3.98, 3.95]
        i = [0.0, 2.0, 2.0, 2.0]
        dcir = estimate_cycle_dcir(v, i)
        assert dcir is not None
        assert abs(dcir - 0.10) < 1e-4

    def test_estimate_dcir_short_vector(self):
        assert estimate_cycle_dcir([4.2], [0.0]) is None


class TestMATParser:
    def test_parse_mock_nasa_mat_structure(self):
        # Create a structured numpy array mimicking scipy.io.loadmat for NASA Ames
        # Structure: mat_dict['B0005'][0, 0]['cycle'][0]
        cycle_dtype = np.dtype([
            ('type', 'O'),
            ('data', 'O'),
        ])
        data_dtype = np.dtype([
            ('Capacity', 'O'),
            ('Voltage_measured', 'O'),
            ('Current_measured', 'O'),
            ('Temperature_measured', 'O'),
            ('Time', 'O'),
        ])

        # 2 cycles: cycle 0 is discharge (1.85Ah), cycle 1 is charge (skipped)
        data0 = np.empty((1, 1), dtype=data_dtype)
        data0['Capacity'][0, 0] = np.array([[1.85]])
        data0['Voltage_measured'][0, 0] = np.array([4.2, 4.0, 3.9, 3.8])
        data0['Current_measured'][0, 0] = np.array([0.0, 2.0, 2.0, 2.0])
        data0['Temperature_measured'][0, 0] = np.array([24.0, 26.0, 30.0, 38.0])
        data0['Time'][0, 0] = np.array([0.0, 100.0, 1000.0, 3000.0])

        cycles_arr = np.empty((2,), dtype=cycle_dtype)
        cycles_arr[0]['type'] = np.array(['discharge'])
        cycles_arr[0]['data'] = data0

        cycles_arr[1]['type'] = np.array(['charge'])
        cycles_arr[1]['data'] = np.empty((0,))

        root_dtype = np.dtype([('cycle', 'O')])
        root = np.empty((1, 1), dtype=root_dtype)
        root['cycle'][0, 0] = cycles_arr

        mat_dict = {'B0005': root}

        records = parse_nasa_mat_data(mat_dict, 'B0005')
        assert len(records) == 1
        r = records[0]
        assert r.cell_id == "B0005"
        assert r.cycle_index == 0
        assert abs(r.discharge_capacity - 1.85) < 1e-4
        assert r.soh == 92.5
        assert r.triage_label == TriageClassEnum.REUSE
        assert r.provenance == ProvenanceEnum.REAL
        assert r.source == "MAT_PARSED"
        assert r.min_temp == 24.0
        assert r.max_temp == 38.0
        assert r.temp_rise == 14.0

    def test_parse_rejects_missing_cell_id(self):
        mat_dict = {'B0005': np.empty((0,))}
        with pytest.raises(KeyError, match="not found in MAT file"):
            parse_nasa_mat_data(mat_dict, 'B0006')


class TestBenchmarksAndExport:
    def test_benchmark_fixtures_integrity(self):
        benchmarks = get_deterministic_nasa_benchmark_fixtures()
        assert set(benchmarks.keys()) == {"B0005", "B0006", "B0007", "B0018"}

        for cell_id, cycles in benchmarks.items():
            assert len(cycles) == 4
            for r in cycles:
                assert r.cell_id == cell_id
                assert r.provenance == ProvenanceEnum.REAL
                assert r.source == "LITERATURE_BENCHMARK"
                assert 0.0 < r.discharge_capacity <= 2.2
                assert 50.0 <= r.soh <= 105.0
                assert r.triage_label in {TriageClassEnum.REUSE, TriageClassEnum.INVESTIGATE, TriageClassEnum.RETIRE}

    def test_export_to_dataframe(self):
        benchmarks = get_deterministic_nasa_benchmark_fixtures()
        df = export_cycles_to_dataframe(benchmarks["B0005"])
        assert len(df) == 4
        assert "provenance" in df.columns
        assert (df["provenance"] == "REAL").all()
        assert "source" in df.columns
        assert (df["source"] == "LITERATURE_BENCHMARK").all()
        assert (df["cell_id"] == "B0005").all()
        assert "soh" in df.columns
        assert "triage_label" in df.columns

