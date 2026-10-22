"""SQLite storage for saved projects. One table, one JSON blob per project.

The database path comes from `AUTOMATA_DB` (read on every call, so tests can redirect it) and
defaults to `backend/data/automata.sqlite3`. Each call opens its own short-lived connection,
which keeps this safe under FastAPI's thread pool without any shared state.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    json       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


class ProjectNotFoundError(Exception):
    """No project has the requested id."""


@dataclass(frozen=True)
class ProjectRow:
    id: str
    name: str
    kind: str
    json: str
    created_at: str
    updated_at: str


def db_path() -> Path:
    default = Path(__file__).resolve().parent.parent / "data" / "automata.sqlite3"
    return Path(os.environ.get("AUTOMATA_DB", default))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(_SCHEMA)
        with conn:  # commit on success, roll back on error
            yield conn
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _row(r: sqlite3.Row) -> ProjectRow:
    return ProjectRow(r["id"], r["name"], r["kind"], r["json"], r["created_at"], r["updated_at"])


def create_project(name: str, kind: str, body: str) -> ProjectRow:
    now = _now()
    row = ProjectRow(uuid.uuid4().hex, name, kind, body, now, now)
    with _connect() as db:
        db.execute(
            "INSERT INTO projects (id, name, kind, json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (row.id, row.name, row.kind, row.json, row.created_at, row.updated_at),
        )
    return row


def list_projects() -> list[ProjectRow]:
    """Newest-updated first. `rowid` breaks ties so same-second saves keep a stable order."""
    with _connect() as db:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC, rowid DESC").fetchall()
    return [_row(r) for r in rows]


def get_project(project_id: str) -> ProjectRow:
    with _connect() as db:
        r = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if r is None:
        raise ProjectNotFoundError(project_id)
    return _row(r)


def update_project(project_id: str, name: str, kind: str, body: str) -> ProjectRow:
    with _connect() as db:
        cur = db.execute(
            "UPDATE projects SET name = ?, kind = ?, json = ?, updated_at = ? WHERE id = ?",
            (name, kind, body, _now(), project_id),
        )
        if cur.rowcount == 0:
            raise ProjectNotFoundError(project_id)
    return get_project(project_id)


def delete_project(project_id: str) -> None:
    with _connect() as db:
        if db.execute("DELETE FROM projects WHERE id = ?", (project_id,)).rowcount == 0:
            raise ProjectNotFoundError(project_id)
