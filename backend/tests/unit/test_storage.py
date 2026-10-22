import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

from app import storage


def make(name: str = "Demo", kind: str = "DFA", body: str = '{"x": 1}') -> storage.ProjectRow:
    return storage.create_project(name, kind, body)


def test_create_then_get_round_trips() -> None:
    row = make("Ends with 01", "DFA", '{"a": [1, 2]}')
    got = storage.get_project(row.id)
    assert (got.name, got.kind, got.json) == ("Ends with 01", "DFA", '{"a": [1, 2]}')
    assert got.id == row.id
    assert got.created_at == got.updated_at


def test_ids_are_unique_and_opaque() -> None:
    ids = {make().id for _ in range(20)}
    assert len(ids) == 20
    assert all(len(i) == 32 and i.isalnum() for i in ids)


def test_list_is_newest_first_by_last_update() -> None:
    a, b, c = make("A"), make("B"), make("C")
    time.sleep(1.1)  # timestamps have one-second resolution
    storage.update_project(a.id, "A2", "DFA", "{}")
    assert [p.name for p in storage.list_projects()] == ["A2", "C", "B"]
    assert {p.id for p in storage.list_projects()} == {a.id, b.id, c.id}


def test_update_changes_content_and_keeps_creation_time() -> None:
    row = make("Old", "DFA", "{}")
    time.sleep(1.1)
    new = storage.update_project(row.id, "New", "NFA", '{"y": 2}')
    assert (new.name, new.kind, new.json) == ("New", "NFA", '{"y": 2}')
    assert new.created_at == row.created_at
    assert new.updated_at > row.updated_at
    assert storage.get_project(row.id).json == '{"y": 2}'


def test_delete_removes_only_that_project() -> None:
    a, b = make("A"), make("B")
    storage.delete_project(a.id)
    assert [p.id for p in storage.list_projects()] == [b.id]


@pytest.mark.parametrize("op", ["get", "update", "delete"])
def test_unknown_id_raises_not_found(op: str) -> None:
    with pytest.raises(storage.ProjectNotFoundError):
        if op == "get":
            storage.get_project("nope")
        elif op == "update":
            storage.update_project("nope", "x", "DFA", "{}")
        else:
            storage.delete_project("nope")


def test_empty_database_lists_nothing() -> None:
    assert storage.list_projects() == []


def test_the_database_file_and_its_folder_are_created_on_demand(
    isolated_database: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    nested = isolated_database.parent / "deep" / "er" / "x.sqlite3"
    monkeypatch.setenv("AUTOMATA_DB", str(nested))
    make()
    assert nested.exists()


def test_sql_in_a_name_is_just_text() -> None:
    nasty = "x'); DROP TABLE projects; --"
    row = make(nasty)
    assert storage.get_project(row.id).name == nasty
    assert len(storage.list_projects()) == 1


def test_saved_projects_survive_a_process_restart(isolated_database: Path) -> None:
    """The Definition-of-Done check: write in one Python process, read in another."""
    code = (
        "import sys, json; from app import storage\n"
        "if sys.argv[1] == 'write':\n"
        "    print(storage.create_project('Persisted', 'ENFA', json.dumps({'k': 1})).id)\n"
        "else:\n"
        "    p = storage.get_project(sys.argv[2]); print(p.name, p.kind, p.json)\n"
    )
    env = {"AUTOMATA_DB": str(isolated_database), "PATH": ""}
    cwd = Path(__file__).resolve().parents[2]

    def run(*args: str) -> str:
        return subprocess.run(
            [sys.executable, "-c", code, *args],
            capture_output=True,
            text=True,
            check=True,
            cwd=cwd,
            env=env,
        ).stdout.strip()

    project_id = run("write")
    assert run("read", project_id) == f"Persisted ENFA {json.dumps({'k': 1})}"
