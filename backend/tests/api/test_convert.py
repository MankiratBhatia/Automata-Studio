from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import load_raw

client = TestClient(app)


def post(path: str, body: Any) -> Any:
    return client.post(path, json=body)


def ids(doc: dict[str, Any]) -> list[str]:
    return [s["id"] for s in doc["states"]]


# --- regex -> epsilon-NFA ---------------------------------------------------------------


def test_regex_to_nfa() -> None:
    r = post("/api/regex-to-nfa", {"regex": "(a|b)*abb"})
    assert r.status_code == 200
    body = r.json()
    a = body["automaton"]
    assert a["kind"] == "ENFA"
    assert a["alphabet"] == ["a", "b"]
    assert a["start"] == "q0"
    assert len(a["accepting"]) == 1
    assert any(t["symbol"] is None for t in a["transitions"])  # epsilon is null on the wire
    assert body["steps"][-1]["title"] == "Done"
    assert body["stateMap"] is None and body["rounds"] is None


def test_regex_result_can_be_fed_straight_back_in() -> None:
    nfa = post("/api/regex-to-nfa", {"regex": "ab*"}).json()["automaton"]
    r = post("/api/simulate", {"automaton": nfa, "input": "abbb"})
    assert r.status_code == 200 and r.json()["accepted"] is True


def test_regex_syntax_error_reports_position() -> None:
    r = post("/api/regex-to-nfa", {"regex": "a(b|"})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "REGEX_SYNTAX"
    assert err["position"] == 4
    assert "regex ended" in err["message"]


def test_empty_regex_is_a_syntax_error_not_a_validation_error() -> None:
    r = post("/api/regex-to-nfa", {"regex": ""})
    assert r.status_code == 400
    assert r.json()["error"] == {
        "code": "REGEX_SYNTAX",
        "message": "The regex is empty.",
        "position": 0,
    }


def test_overlong_regex_is_422() -> None:
    assert post("/api/regex-to-nfa", {"regex": "a" * 501}).status_code == 422


# --- epsilon removal --------------------------------------------------------------------


def test_remove_epsilon() -> None:
    r = post("/api/remove-epsilon", load_raw("enfa_abb_thompson"))
    assert r.status_code == 200
    a = r.json()["automaton"]
    assert a["kind"] == "NFA"
    assert ids(a) == ["0", "3", "5", "8", "9", "10"]
    assert all(t["symbol"] is not None for t in a["transitions"])


# --- subset construction ----------------------------------------------------------------


def test_nfa_to_dfa_returns_the_subset_map() -> None:
    r = post("/api/nfa-to-dfa", load_raw("nfa_third_last_a"))
    assert r.status_code == 200
    body = r.json()
    assert body["automaton"]["kind"] == "DFA"
    assert len(body["automaton"]["states"]) == 8
    assert body["stateMap"]["{q0,q1}"] == ["q0", "q1"]
    assert body["automaton"]["start"] == "{q0}"


def test_nfa_to_dfa_invalid_automaton_is_400_with_issues() -> None:
    doc = load_raw("nfa_third_last_a")
    doc["start"] = None
    r = post("/api/nfa-to-dfa", doc)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "INVALID_AUTOMATON"
    assert [i["code"] for i in err["issues"]] == ["NO_START"]


def test_nfa_to_dfa_state_limit_is_a_friendly_400() -> None:
    k = 11  # needs 2**11 DFA states, over the 512 limit
    states = [{"id": f"q{i}", "label": f"q{i}"} for i in range(k + 1)]
    trans = [
        {"from": "q0", "to": "q0", "symbol": "a"},
        {"from": "q0", "to": "q0", "symbol": "b"},
        {"from": "q0", "to": "q1", "symbol": "a"},
    ]
    for i in range(1, k):
        for c in "ab":
            trans.append({"from": f"q{i}", "to": f"q{i + 1}", "symbol": c})
    doc = {
        "schemaVersion": 1,
        "kind": "NFA",
        "name": "",
        "alphabet": ["a", "b"],
        "states": states,
        "start": "q0",
        "accepting": [f"q{k}"],
        "transitions": trans,
    }
    r = post("/api/nfa-to-dfa", doc)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "LIMIT_EXCEEDED"
    assert "512" in err["message"]


# --- minimisation -----------------------------------------------------------------------


def test_minimize() -> None:
    r = post("/api/minimize", load_raw("dfa_non_minimal"))
    assert r.status_code == 200
    body = r.json()
    assert ids(body["automaton"]) == ["A", "B=C", "D", "E"]
    assert body["stateMap"]["B=C"] == ["B", "C"]
    assert body["rounds"][0] == [["D"], ["A", "B", "C", "E"]]
    assert len(body["rounds"][-1]) == 4


def test_minimize_refuses_an_nfa_with_a_hint() -> None:
    r = post("/api/minimize", load_raw("nfa_third_last_a"))
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "WRONG_KIND"
    assert "Convert it to a DFA first" in err["message"]


def test_the_whole_pipeline_over_http() -> None:
    enfa = post("/api/regex-to-nfa", {"regex": "(a|b)*abb"}).json()["automaton"]
    dfa = post("/api/nfa-to-dfa", enfa).json()["automaton"]
    minimal = post("/api/minimize", dfa).json()["automaton"]
    assert len(minimal["states"]) == 4
    for word, expected in [("abb", True), ("aabb", True), ("ab", False), ("abba", False)]:
        r = post("/api/simulate", {"automaton": minimal, "input": word})
        assert r.json()["accepted"] is expected, word


def test_automaton_size_limits_are_enforced() -> None:
    doc = load_raw("dfa_even_ones")
    doc["alphabet"] = [chr(65 + i) for i in range(65)]
    r = post("/api/validate", doc)
    assert r.status_code == 422
