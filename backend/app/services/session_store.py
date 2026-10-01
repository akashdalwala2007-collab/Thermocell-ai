"""Persistent diagnostic session storage with SQLite and PostgreSQL support."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction


DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "thermocell_sessions.db")


class DiagnosticSessionStore:
    """Relational diagnostic session store supporting SQLite and PostgreSQL with connection lifecycle management."""

    def __init__(self, db_path: Optional[str] = None, database_url: Optional[str] = None):
        raw_url = database_url or db_path or os.getenv("DATABASE_URL", DEFAULT_DB_PATH)
        if raw_url.startswith("postgres://"):
            raw_url = "postgresql://" + raw_url[len("postgres://"):]
        self.database_url = raw_url
        self.is_postgres = raw_url.lower().startswith("postgresql")
        self.is_sqlite = not self.is_postgres

        if self.is_sqlite:
            if raw_url.startswith("sqlite:///"):
                self.db_path = raw_url[len("sqlite:///"):]
            else:
                self.db_path = raw_url
        else:
            self.db_path = raw_url

        self._memory_conn: Optional[sqlite3.Connection] = None
        if self.is_sqlite and self.db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self):
        """Yield a database connection managed within a transaction boundary."""
        if self.is_sqlite:
            if self.db_path == ":memory:":
                if self._memory_conn is None:
                    self._memory_conn = sqlite3.connect(":memory:")
                    self._memory_conn.row_factory = sqlite3.Row
                try:
                    yield self._memory_conn
                    self._memory_conn.commit()
                except Exception:
                    self._memory_conn.rollback()
                    raise
                return

            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
        elif self.is_postgres:
            import psycopg2
            from psycopg2.extras import RealDictCursor

            conn = psycopg2.connect(self.database_url, cursor_factory=RealDictCursor)
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def close(self) -> None:
        """Close any open database connections."""
        if self._memory_conn is not None:
            self._memory_conn.close()
            self._memory_conn = None

    def _init_db(self) -> None:
        """Create tables and indices if they do not exist."""
        with self._connection() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS diagnostic_sessions (
                        session_id TEXT PRIMARY KEY,
                        cell_id TEXT NOT NULL,
                        cycle_index INTEGER,
                        created_at TEXT NOT NULL,
                        triage_class TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        provenance TEXT NOT NULL,
                        v_pre_pulse REAL NOT NULL,
                        telemetry_json TEXT NOT NULL,
                        features_json TEXT NOT NULL,
                        prediction_json TEXT NOT NULL
                    )
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_cell_id ON diagnostic_sessions(cell_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON diagnostic_sessions(created_at)")
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS rate_limit_events (
                        key TEXT NOT NULL,
                        bucket TEXT NOT NULL,
                        timestamp REAL NOT NULL
                    )
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_rate_limit_key_ts ON rate_limit_events(key, bucket, timestamp)")
            elif self.is_postgres:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS diagnostic_sessions (
                        session_id VARCHAR(64) PRIMARY KEY,
                        cell_id VARCHAR(64) NOT NULL,
                        cycle_index INTEGER,
                        created_at VARCHAR(64) NOT NULL,
                        triage_class VARCHAR(32) NOT NULL,
                        confidence DOUBLE PRECISION NOT NULL,
                        provenance VARCHAR(32) NOT NULL,
                        v_pre_pulse DOUBLE PRECISION NOT NULL,
                        telemetry_json TEXT NOT NULL,
                        features_json TEXT NOT NULL,
                        prediction_json TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_sessions_cell_id ON diagnostic_sessions(cell_id);
                    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON diagnostic_sessions(created_at);

                    CREATE TABLE IF NOT EXISTS rate_limit_events (
                        key VARCHAR(128) NOT NULL,
                        bucket VARCHAR(64) NOT NULL,
                        timestamp DOUBLE PRECISION NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_rate_limit_key_ts ON rate_limit_events(key, bucket, timestamp);
                """)

    def save_diagnostic_run(
        self,
        telemetry: BatteryPulseTelemetry,
        prediction: DiagnosticPrediction,
        session_id: Optional[str] = None,
    ) -> str:
        """Persist a completed diagnostic pulse run atomically."""
        sid = session_id or str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        telemetry_dict = telemetry.model_dump()
        features_dict = dict(prediction.extracted_features)
        prediction_dict = prediction.model_dump()

        params = (
            sid,
            telemetry.cell_id,
            telemetry.cycle_index,
            now_iso,
            prediction.triage_class.value,
            float(prediction.confidence),
            telemetry.provenance.value,
            float(telemetry.v_pre_pulse),
            json.dumps(telemetry_dict),
            json.dumps(features_dict),
            json.dumps(prediction_dict),
        )

        with self._connection() as conn:
            cursor = conn.cursor()
            if self.is_sqlite:
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO diagnostic_sessions (
                        session_id, cell_id, cycle_index, created_at, triage_class,
                        confidence, provenance, v_pre_pulse, telemetry_json, features_json, prediction_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    params,
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO diagnostic_sessions (
                        session_id, cell_id, cycle_index, created_at, triage_class,
                        confidence, provenance, v_pre_pulse, telemetry_json, features_json, prediction_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (session_id) DO UPDATE SET
                        cell_id = EXCLUDED.cell_id,
                        cycle_index = EXCLUDED.cycle_index,
                        created_at = EXCLUDED.created_at,
                        triage_class = EXCLUDED.triage_class,
                        confidence = EXCLUDED.confidence,
                        provenance = EXCLUDED.provenance,
                        v_pre_pulse = EXCLUDED.v_pre_pulse,
                        telemetry_json = EXCLUDED.telemetry_json,
                        features_json = EXCLUDED.features_json,
                        prediction_json = EXCLUDED.prediction_json
                    """,
                    params,
                )
        return sid

    def get_diagnostic_run(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a stored session by UUID."""
        with self._connection() as conn:
            cursor = conn.cursor()
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(
                f"SELECT * FROM diagnostic_sessions WHERE session_id = {placeholder}",
                (session_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "session_id": row["session_id"],
                "cell_id": row["cell_id"],
                "cycle_index": row["cycle_index"],
                "created_at": row["created_at"],
                "triage_class": row["triage_class"],
                "confidence": row["confidence"],
                "provenance": row["provenance"],
                "v_pre_pulse": row["v_pre_pulse"],
                "telemetry": json.loads(row["telemetry_json"]),
                "features": json.loads(row["features_json"]),
                "prediction": json.loads(row["prediction_json"]),
            }

    def list_cell_sessions(self, cell_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve historical sessions for a physical cell ordered by timestamp descending."""
        with self._connection() as conn:
            cursor = conn.cursor()
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(
                f"""
                SELECT session_id, cell_id, cycle_index, created_at, triage_class, confidence, provenance, v_pre_pulse
                FROM diagnostic_sessions
                WHERE cell_id = {placeholder}
                ORDER BY created_at DESC
                LIMIT {placeholder}
                """,
                (cell_id, limit),
            )
            return [dict(row) for row in cursor.fetchall()]

    def list_recent_sessions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieve recent diagnostic runs across all cells."""
        with self._connection() as conn:
            cursor = conn.cursor()
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(
                f"""
                SELECT session_id, cell_id, cycle_index, created_at, triage_class, confidence, provenance, v_pre_pulse
                FROM diagnostic_sessions
                ORDER BY created_at DESC
                LIMIT {placeholder}
                """,
                (limit,),
            )
            return [dict(row) for row in cursor.fetchall()]

    def check_and_record_rate_limit(
        self, key: str, bucket: str, limit: int, window_seconds: int = 60
    ) -> Tuple[bool, int]:
        """
        Atomically check and record a rate limit event across worker processes.
        Returns (is_allowed, retry_after_seconds).
        """
        now = datetime.now(timezone.utc).timestamp()
        cutoff = now - float(window_seconds)

        with self._connection() as conn:
            cursor = conn.cursor()
            placeholder = "%s" if self.is_postgres else "?"

            cursor.execute(
                f"DELETE FROM rate_limit_events WHERE timestamp < {placeholder}",
                (cutoff,),
            )

            cursor.execute(
                f"""
                SELECT COUNT(*), MIN(timestamp)
                FROM rate_limit_events
                WHERE key = {placeholder} AND bucket = {placeholder} AND timestamp >= {placeholder}
                """,
                (key, bucket, cutoff),
            )
            row = cursor.fetchone()
            if self.is_postgres:
                count = row["count"] if "count" in row else list(row.values())[0]
                min_ts = row["min"] if "min" in row else list(row.values())[1]
            else:
                count = row[0]
                min_ts = row[1]

            if count >= limit:
                retry_after = max(1, int(window_seconds - (now - (min_ts or cutoff))))
                return False, retry_after

            cursor.execute(
                f"INSERT INTO rate_limit_events (key, bucket, timestamp) VALUES ({placeholder}, {placeholder}, {placeholder})",
                (key, bucket, now),
            )
            return True, 0

    def reset_rate_limits(self) -> None:
        """Clear all rate limit records (used in test fixtures)."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM rate_limit_events")


_default_store: Optional[DiagnosticSessionStore] = None


def get_session_store() -> DiagnosticSessionStore:
    """Return default singleton session store."""
    global _default_store
    if _default_store is None:
        _default_store = DiagnosticSessionStore()
    return _default_store


def reset_session_store() -> None:
    """Reset the global session store singleton (useful for test fixtures)."""
    global _default_store
    if _default_store is not None:
        _default_store.close()
    _default_store = None
