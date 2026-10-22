from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import load_raw

client = TestClient(app)


def save(fixture: str = "dfa_ends_with_01", **patch: Any) -> Any:
    doc = {**load_raw(fixture), **patch}
    return client.post("/api/projects", json={"automaton": doc})


def test_create_returns_the_project_with_ids_and_timestamps() -> None:
    r = save("dfa_ends_with_01")
    assert r.status_code == 201
    body = r.json()
    assert len(body["id"]) == 32
    assert body["name"] == "Ends with 01"
    assert body["kind"] == "DFA"
    assert body["createdAt"] == body["updatedAt"]
    assert body["automaton"]["start"] == "q0"


def test_the_automaton_comes_back_exactly_as_saved() -> None:
    doc = load_raw("enfa_abb_thompson")
    doc["states"][0]["position"] = {"x": 12.5, "y": -3}
    created = client.post("/api/projects", json={"automaton": doc}).json()
    got = client.get(f"/api/projects/{created['id']}").json()["automaton"]
    assert got["states"][0]["position"] == {"x": 12.5, "y": -3}
    assert [t["symbol"] for t in got["transitions"]].count(None) == 8  # epsilon survives as null
    assert got["kind"] == "ENFA"


def test_list_shows_summaries_newest_first_without_the_bodies() -> None:
    first = save("dfa_even_ones").json()
    second = save("dfa_div_by_3").json()
    listing = client.get("/api/projects").json()
    assert [p["id"] for p in listing] == [second["id"], first["id"]]
    assert set(listing[0]) == {"id", "name", "kind", "createdAt", "updatedAt"}


def test_empty_list() -> None:
    assert client.get("/api/projects").json() == []


def test_update_replaces_the_automaton_and_renames_the_project() -> None:
    pid = save("dfa_even_ones").json()["id"]
    edited = load_raw("dfa_even_ones")
    edited["name"] = "Renamed"
    edited["kind"] = "NFA"
    r = client.put(f"/api/projects/{pid}", json={"automaton": edited})
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["kind"]) == ("Renamed", "NFA")
    got = client.get(f"/api/projects/{pid}").json()
    assert got["name"] == "Renamed" and got["automaton"]["kind"] == "NFA"
    assert len(client.get("/api/projects").json()) == 1  # updated in place, not duplicated


def test_delete_then_it_is_gone() -> None:
    pid = save().json()["id"]
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/projects/{pid}").status_code == 404
    assert client.get("/api/projects").json() == []


def test_a_blank_name_becomes_untitled() -> None:
    assert save("dfa_even_ones", name="   ").json()["name"] == "Untitled"


def test_unknown_ids_are_404_in_the_standard_error_shape() -> None:
    for call in (
        lambda: client.get("/api/projects/nope"),
        lambda: client.put("/api/projects/nope", json={"automaton": load_raw("dfa_even_ones")}),
        lambda: client.delete("/api/projects/nope"),
    ):
        r = call()
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"
        assert r.json()["error"]["message"] == "No saved project with that id."


def test_an_invalid_body_is_422_and_saves_nothing() -> None:
    bad = load_raw("dfa_even_ones")
    bad["alphabet"] = ["01"]
    r = client.post("/api/projects", json={"automaton": bad})
    assert r.status_code == 422
    assert client.get("/api/projects").json() == []


def test_a_semantically_broken_automaton_can_still_be_saved() -> None:
    # Work in progress is allowed to be invalid; only the schema shape is enforced.
    doc = load_raw("dfa_even_ones")
    doc["start"] = None
    assert client.post("/api/projects", json={"automaton": doc}).status_code == 201


def test_overlong_names_are_rejected() -> None:
    assert save("dfa_even_ones", name="x" * 201).status_code == 422
