"""
SQLite-backed persistent case storage for the Bitcoin Traffic Intelligence prototype.

Provides lightweight, robust persistence for investigation cases and attached
forensic alerts using Python's built-in sqlite3 module.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional


DEFAULT_DB_REL_PATH = Path("data") / "cases.db"


def get_default_db_path() -> Path:
    env_path = os.environ.get("CASE_DB_PATH")
    if env_path:
        return Path(env_path)
    base_dir = Path(__file__).resolve().parent.parent.parent
    return base_dir / DEFAULT_DB_REL_PATH


class CaseStore:
    """
    Manages persistent SQLite storage for investigation cases and forensic alerts.
    """

    def __init__(self, db_path: Optional[str | Path] = None):
        if db_path is None:
            self.db_path = get_default_db_path()
        elif str(db_path) == ":memory:":
            self.db_path = ":memory:"
        else:
            self.db_path = Path(db_path)

        if str(self.db_path) != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        self._in_memory_conn: Optional[sqlite3.Connection] = None
        if str(self.db_path) == ":memory:":
            # Preserve in-memory connection across operations for this instance
            self._in_memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._in_memory_conn.execute("PRAGMA foreign_keys = ON;")
            self._in_memory_conn.row_factory = sqlite3.Row

        self.init_db()

    def _get_connection(self) -> sqlite3.Connection:
        if self._in_memory_conn is not None:
            return self._in_memory_conn
        conn = sqlite3.connect(str(self.db_path), timeout=15.0)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        """Create tables and indexes if they do not exist."""
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cases (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'open',
                        analyst_note TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS case_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        case_id INTEGER NOT NULL,
                        alert_id TEXT NOT NULL,
                        txid TEXT NOT NULL DEFAULT '',
                        src_ip TEXT NOT NULL DEFAULT '',
                        score REAL NOT NULL DEFAULT 0.0,
                        confidence REAL NOT NULL DEFAULT 0.0,
                        reasons TEXT NOT NULL DEFAULT '[]',
                        geo_country TEXT NOT NULL DEFAULT '',
                        asn TEXT NOT NULL DEFAULT '',
                        analyst_note TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_case_alerts_case_id ON case_alerts(case_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_case_alerts_alert_id ON case_alerts(alert_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);")
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def create_case(
        self,
        title: str,
        description: str = "",
        status: str = "open",
        analyst_note: str = ""
    ) -> Dict[str, Any]:
        """Create a new investigation case."""
        title = (title or "").strip()
        if not title:
            raise ValueError("Case title cannot be empty.")

        now = datetime.now(timezone.utc).isoformat()
        conn = self._get_connection()
        try:
            with conn:
                cursor = conn.execute("""
                    INSERT INTO cases (title, description, status, analyst_note, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                """, (title, description.strip(), status.strip() or "open", analyst_note.strip(), now, now))
                case_id = cursor.lastrowid

            return self.get_case(case_id)  # type: ignore
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def list_cases(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List cases with attached alert counts, ordered by most recently updated."""
        conn = self._get_connection()
        try:
            query = """
                SELECT c.id, c.title, c.description, c.status, c.analyst_note,
                       c.created_at, c.updated_at,
                       COUNT(a.id) AS alert_count
                FROM cases c
                LEFT JOIN case_alerts a ON c.id = a.case_id
            """
            params: List[Any] = []
            if status:
                query += " WHERE c.status = ?"
                params.append(status.strip())

            query += " GROUP BY c.id ORDER BY c.updated_at DESC, c.id DESC;"

            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            return [
                {
                    "id": r["id"],
                    "title": r["title"],
                    "description": r["description"],
                    "status": r["status"],
                    "analyst_note": r["analyst_note"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "alert_count": r["alert_count"],
                }
                for r in rows
            ]
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def get_case(self, case_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a case by ID along with all attached alerts."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("""
                SELECT id, title, description, status, analyst_note, created_at, updated_at
                FROM cases WHERE id = ?;
            """, (case_id,))
            case_row = cursor.fetchone()
            if not case_row:
                return None

            alert_cursor = conn.execute("""
                SELECT id, case_id, alert_id, txid, src_ip, score, confidence,
                       reasons, geo_country, asn, analyst_note, created_at
                FROM case_alerts
                WHERE case_id = ?
                ORDER BY created_at ASC, id ASC;
            """, (case_id,))
            alert_rows = alert_cursor.fetchall()

            alerts = []
            for ar in alert_rows:
                try:
                    reasons = json.loads(ar["reasons"])
                except Exception:
                    reasons = [ar["reasons"]] if ar["reasons"] else []

                alerts.append({
                    "id": ar["id"],
                    "case_id": ar["case_id"],
                    "alert_id": ar["alert_id"],
                    "txid": ar["txid"],
                    "src_ip": ar["src_ip"],
                    "score": ar["score"],
                    "confidence": ar["confidence"],
                    "reasons": reasons,
                    "geo_country": ar["geo_country"],
                    "asn": ar["asn"],
                    "analyst_note": ar["analyst_note"],
                    "created_at": ar["created_at"],
                })

            return {
                "id": case_row["id"],
                "title": case_row["title"],
                "description": case_row["description"],
                "status": case_row["status"],
                "analyst_note": case_row["analyst_note"],
                "created_at": case_row["created_at"],
                "updated_at": case_row["updated_at"],
                "alert_count": len(alerts),
                "alerts": alerts,
            }
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def update_case(
        self,
        case_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        analyst_note: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update case fields and timestamp."""
        conn = self._get_connection()
        try:
            # Check existence
            chk = conn.execute("SELECT id FROM cases WHERE id = ?;", (case_id,)).fetchone()
            if not chk:
                return None

            updates = []
            params: List[Any] = []

            if title is not None:
                clean_title = title.strip()
                if not clean_title:
                    raise ValueError("Case title cannot be empty.")
                updates.append("title = ?")
                params.append(clean_title)

            if description is not None:
                updates.append("description = ?")
                params.append(description.strip())

            if status is not None:
                updates.append("status = ?")
                params.append(status.strip())

            if analyst_note is not None:
                updates.append("analyst_note = ?")
                params.append(analyst_note.strip())

            if not updates:
                return self.get_case(case_id)

            now = datetime.now(timezone.utc).isoformat()
            updates.append("updated_at = ?")
            params.append(now)

            params.append(case_id)
            sql = f"UPDATE cases SET {', '.join(updates)} WHERE id = ?;"

            with conn:
                conn.execute(sql, params)

            return self.get_case(case_id)
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def attach_alert(
        self,
        case_id: int,
        alert_data: Dict[str, Any],
        analyst_note: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Attach a forensic alert to a case, persisting existing alert attributes.
        """
        conn = self._get_connection()
        try:
            # Check case existence
            chk = conn.execute("SELECT id FROM cases WHERE id = ?;", (case_id,)).fetchone()
            if not chk:
                return None

            alert_id = str(alert_data.get("id") or alert_data.get("alert_id") or "UNKNOWN")
            txid = str(alert_data.get("txid") or "")
            src_ip = str(alert_data.get("src_ip") or "")
            score = float(alert_data.get("score", 0.0) or 0.0)
            confidence = float(alert_data.get("confidence", 0.0) or 0.0)
            geo_country = str(alert_data.get("geo_country") or "")
            asn = str(alert_data.get("asn") or "")

            raw_reasons = alert_data.get("reasons", [])
            if isinstance(raw_reasons, list):
                reasons_json = json.dumps(raw_reasons)
                reasons_list = raw_reasons
            elif raw_reasons:
                reasons_json = json.dumps([str(raw_reasons)])
                reasons_list = [str(raw_reasons)]
            else:
                reasons_json = "[]"
                reasons_list = []

            note = (analyst_note or alert_data.get("analyst_note") or "").strip()
            now = datetime.now(timezone.utc).isoformat()

            with conn:
                cursor = conn.execute("""
                    INSERT INTO case_alerts (
                        case_id, alert_id, txid, src_ip, score, confidence,
                        reasons, geo_country, asn, analyst_note, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    case_id, alert_id, txid, src_ip, score, confidence,
                    reasons_json, geo_country, asn, note, now
                ))
                alert_row_id = cursor.lastrowid

                # Touch updated_at on the parent case
                conn.execute("UPDATE cases SET updated_at = ? WHERE id = ?;", (now, case_id))

            return {
                "id": alert_row_id,
                "case_id": case_id,
                "alert_id": alert_id,
                "txid": txid,
                "src_ip": src_ip,
                "score": score,
                "confidence": confidence,
                "reasons": reasons_list,
                "geo_country": geo_country,
                "asn": asn,
                "analyst_note": note,
                "created_at": now,
            }
        finally:
            if self._in_memory_conn is None:
                conn.close()

    def get_case_alerts(self, case_id: int) -> List[Dict[str, Any]]:
        """Retrieve all alerts attached to a case."""
        case = self.get_case(case_id)
        if not case:
            return []
        return case.get("alerts", [])

    def delete_case(self, case_id: int) -> bool:
        """Delete a case and cascade-delete its attached alerts."""
        conn = self._get_connection()
        try:
            with conn:
                cursor = conn.execute("DELETE FROM cases WHERE id = ?;", (case_id,))
                return cursor.rowcount > 0
        finally:
            if self._in_memory_conn is None:
                conn.close()


# Module-level default store
_DEFAULT_STORE: Optional[CaseStore] = None


def get_case_store() -> CaseStore:
    global _DEFAULT_STORE
    if _DEFAULT_STORE is None:
        _DEFAULT_STORE = CaseStore()
    return _DEFAULT_STORE


def set_default_case_store(store: Optional[CaseStore]) -> None:
    global _DEFAULT_STORE
    _DEFAULT_STORE = store
