from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import load_raw

client = TestClient(app)


def post(path: str, body: Any) -> Any:
    return client.post(path, json=body)


def test_validate_clean_fixture() -> None:
    r = post("/api/validate", load_raw("dfa_ends_with_01"))
    assert r.status_code == 200
    assert r.json() == {"issues": []}


def test_validate_reports_issues_with_highlight_data() -> None:
    r = post("/api/validate", load_raw("dfa_non_minimal"))
    assert r.status_code == 200
    (issue,) = r.json()["issues"]
    assert issue == {
        "severity": "warning",
        "code": "UNREACHABLE",
        "message": "Unreachable from the start state: U.",
        "stateIds": ["U"],
        "transitionIndices": [],
    }


def test_validate_returns_errors_in_body_not_as_http_errors() -> None:
    doc = load_raw("dfa_even_ones")
    doc["start"] = None
    r = post("/api/validate", doc)
    assert r.status_code == 200
    assert r.json()["issues"][0]["code"] == "NO_START"


def test_simulate_accepts() -> None:
    r = post("/api/simulate", {"automaton": load_raw("dfa_ends_with_01"), "input": "101"})
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True and body["stuck"] is False
    assert [s["states"] for s in body["steps"]] == [["q0"], ["q0"], ["q1"], ["q2"]]
    assert body["steps"][1] == {
        "index": 1,
        "title": "Read '1'",
        "detail": "{q0} --1--> {q0}",
        "states": ["q0"],
        "transitions": [1],
        "position": 1,
        "symbol": "1",
    }


def test_simulate_epsilon_nfa() -> None:
    r = post("/api/simulate", {"automaton": load_raw("enfa_abb_thompson"), "input": "aabb"})
    assert r.json()["accepted"] is True


def test_simulate_unknown_input_symbol_is_400_with_position() -> None:
    r = post("/api/simulate", {"automaton": load_raw("dfa_ends_with_01"), "input": "01x"})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "INPUT_SYMBOL" and err["position"] == 2
    assert "'x'" in err["message"]


def test_simulate_invalid_automaton_is_400_with_issues() -> None:
    doc = load_raw("dfa_even_ones")
    doc["start"] = None
    r = post("/api/simulate", {"automaton": doc, "input": ""})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "INVALID_AUTOMATON"
    assert [i["code"] for i in err["issues"]] == ["NO_START"]


def test_batch() -> None:
    r = post(
        "/api/simulate/batch",
        {"automaton": load_raw("dfa_ends_with_01"), "inputs": ["01", "10", "0z"]},
    )
    assert r.status_code == 200
    results = r.json()["results"]
    assert [x["accepted"] for x in results] == [True, False, None]
    assert results[2]["error"] is not None and results[0]["error"] is None


def test_malformed_json_is_422_with_readable_message() -> None:
    r = client.post(
        "/api/validate", content="{not json", headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 422
    assert r.json() == {
        "error": {"code": "VALIDATION", "message": "Request body is not valid JSON."}
    }


def test_schema_violation_names_the_field() -> None:
    doc = load_raw("dfa_even_ones")
    del doc["alphabet"]
    r = post("/api/validate", doc)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION" and "alphabet" in err["message"]


def test_multichar_symbol_is_422() -> None:
    doc = load_raw("dfa_even_ones")
    doc["alphabet"] = ["01"]
    r = post("/api/validate", doc)
    assert r.status_code == 422
    assert "single character" in r.json()["error"]["message"]


def test_overlong_input_is_422() -> None:
    r = post("/api/simulate", {"automaton": load_raw("dfa_even_ones"), "input": "0" * 2001})
    assert r.status_code == 422
