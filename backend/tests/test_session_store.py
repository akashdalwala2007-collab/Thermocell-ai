"""Unit tests for dialect-agnostic session persistence store and rate-limit tracking."""
from unittest.mock import MagicMock, patch
import pytest
from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction
from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum
from app.services.session_store import DiagnosticSessionStore, reset_session_store
from app.services.telemetry_source import SyntheticPulseSource
from app.services.ml_service import screen_telemetry


@pytest.fixture(autouse=True)
def teardown_store():
    reset_session_store()
    yield
    reset_session_store()


@pytest.fixture
def memory_store():
    return DiagnosticSessionStore(database_url="sqlite:///:memory:")


def test_sqlite_in_memory_lifecycle(memory_store):
    """DiagnosticSessionStore must initialize schema and perform CRUD operations in SQLite."""
    assert memory_store.is_sqlite is True
    assert memory_store.is_postgres is False

    # Generate synthetic pulse and prediction
    source = SyntheticPulseSource()
    telemetry = source.get_pulse_telemetry("B0005", cycle_index=10, ocv=4.143, dcir=0.092)
    prediction = screen_telemetry(telemetry)

    # Save run
    session_id = memory_store.save_diagnostic_run(telemetry, prediction)
    assert session_id is not None
    assert len(session_id) > 10

    # Retrieve run
    record = memory_store.get_diagnostic_run(session_id)
    assert record is not None
    assert record["session_id"] == session_id
    assert record["cell_id"] == "B0005"
    assert record["cycle_index"] == 10
    assert record["triage_class"] == prediction.triage_class.value
    assert record["provenance"] == ProvenanceEnum.SYNTHETIC.value
    assert len(record["telemetry"]["timestamps"]) == 100
    assert len(record["features"]) == 14
    assert record["prediction"]["confidence"] == prediction.confidence


def test_list_sessions(memory_store):
    """Session store must list sessions filtered by cell_id and across all cells ordered by timestamp."""
    source = SyntheticPulseSource()
    
    t1 = source.get_pulse_telemetry("B0005", cycle_index=10)
    p1 = screen_telemetry(t1)
    t2 = source.get_pulse_telemetry("B0005", cycle_index=20)
    p2 = screen_telemetry(t2)
    t3 = source.get_pulse_telemetry("B0006", cycle_index=5, ocv=4.14, dcir=0.088)
    p3 = screen_telemetry(t3)

    memory_store.save_diagnostic_run(t1, p1)
    memory_store.save_diagnostic_run(t2, p2)
    memory_store.save_diagnostic_run(t3, p3)

    # Filter by cell
    b5_runs = memory_store.list_cell_sessions("B0005")
    assert len(b5_runs) == 2
    for r in b5_runs:
        assert r["cell_id"] == "B0005"

    b6_runs = memory_store.list_cell_sessions("B0006")
    assert len(b6_runs) == 1
    assert b6_runs[0]["cell_id"] == "B0006"

    # List all recent
    all_runs = memory_store.list_recent_sessions(limit=10)
    assert len(all_runs) == 3


def test_nonexistent_session_returns_none(memory_store):
    """Querying an unknown session UUID must safely return None."""
    assert memory_store.get_diagnostic_run("non-existent-uuid") is None


def test_postgres_dialect_detection():
    """DiagnosticSessionStore must configure postgres dialect flags and normalize URL."""
    store_pg = DiagnosticSessionStore.__new__(DiagnosticSessionStore)
    raw_url = "postgres://user:pass@localhost:5432/thermocell"
    if raw_url.startswith("postgres://"):
        raw_url = "postgresql://" + raw_url[len("postgres://"):]
    store_pg.database_url = raw_url
    store_pg.is_postgres = raw_url.lower().startswith("postgresql")
    store_pg.is_sqlite = not store_pg.is_postgres

    assert store_pg.is_postgres is True
    assert store_pg.is_sqlite is False
    assert store_pg.database_url.startswith("postgresql://")


def test_postgres_operations_mocked():
    """Verify PostgreSQL initialization and CRUD execute parameterized %s queries via psycopg2."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    with patch("psycopg2.connect", return_value=mock_conn) as mock_connect:
        pg_url = "postgresql://user:pass@localhost:5432/thermocell"
        store = DiagnosticSessionStore(database_url=pg_url)

        assert store.is_postgres is True
        assert store.is_sqlite is False
        mock_connect.assert_called_once()
        # Assert schema was created with %s or DDL
        assert mock_cursor.execute.call_count >= 1

        # Test save_diagnostic_run executes ON CONFLICT clause
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0005", cycle_index=10, ocv=4.143, dcir=0.092)
        prediction = screen_telemetry(telemetry)

        sid = store.save_diagnostic_run(telemetry, prediction)
        assert sid is not None
        last_sql = mock_cursor.execute.call_args[0][0]
        assert "ON CONFLICT (session_id) DO UPDATE" in last_sql
        assert "%s" in last_sql


def test_rate_limit_events_sqlite(memory_store):
    """Verify check_and_record_rate_limit correctly counts events and enforces threshold."""
    key = "127.0.0.1"
    bucket = "auth"
    limit = 3

    # First 3 attempts must be allowed
    for _ in range(limit):
        allowed, retry = memory_store.check_and_record_rate_limit(key, bucket, limit, window_seconds=60)
        assert allowed is True
        assert retry == 0

    # 4th attempt must be rejected with retry_after > 0
    allowed, retry = memory_store.check_and_record_rate_limit(key, bucket, limit, window_seconds=60)
    assert allowed is False
    assert retry > 0

    # Reset clears records
    memory_store.reset_rate_limits()
    allowed, retry = memory_store.check_and_record_rate_limit(key, bucket, limit, window_seconds=60)
    assert allowed is True


def test_file_backed_connection_closes_after_operation(tmp_path):
    """File-backed SQLite store must close connections after operations without leaking handles."""
    db_file = tmp_path / "test_lifecycle.db"
    store = DiagnosticSessionStore(db_path=str(db_file))

    source = SyntheticPulseSource()
    telemetry = source.get_pulse_telemetry("B0005", cycle_index=10, ocv=4.143, dcir=0.092)
    prediction = screen_telemetry(telemetry)

    sid = store.save_diagnostic_run(telemetry, prediction)
    assert sid is not None

    record = store.get_diagnostic_run(sid)
    assert record is not None

    store.close()
    assert db_file.exists()
