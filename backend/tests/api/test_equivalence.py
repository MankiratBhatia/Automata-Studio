from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import load_raw

client = TestClient(app)


def post(path: str, body: Any) -> Any:
    return client.post(path, json=body)


def test_equivalent_automata() -> None:
    d = load_raw("dfa_ends_with_01")
    r = post("/api/equivalence", {"a": d, "b": d})
    assert r.status_code == 200
    body = r.json()
    assert body["equivalent"] is True
    assert body["counterexample"] is None
    assert body["aAccepts"] is None and body["bAccepts"] is None
    assert body["explored"] >= 1


def test_counterexample_and_who_accepts_it() -> None:
    a, b = load_raw("dfa_even_ones"), load_raw("dfa_even_ones_but_not_00")
    r = post("/api/equivalence", {"a": a, "b": b})
    assert r.json() == {
        "equivalent": False,
        "counterexample": "00",
        "aAccepts": True,
        "bAccepts": False,
        "explored": r.json()["explored"],
    }


def test_the_empty_string_counterexample_is_not_null() -> None:
    a = load_raw("dfa_even_ones")
    b = load_raw("dfa_even_ones")
    b["accepting"] = ["o"]  # now accepts odd, rejects even: they differ already on ""
    body = post("/api/equivalence", {"a": a, "b": b}).json()
    assert body["counterexample"] == ""
    assert body["equivalent"] is False


def test_an_nfa_and_its_regex_automaton_can_be_compared_over_http() -> None:
    enfa = post("/api/regex-to-nfa", {"regex": "(a|b)*abb"}).json()["automaton"]
    dfa = post("/api/minimize", post("/api/nfa-to-dfa", enfa).json()["automaton"]).json()[
        "automaton"
    ]
    assert post("/api/equivalence", {"a": enfa, "b": dfa}).json()["equivalent"] is True


def test_invalid_automaton_is_400_with_issues() -> None:
    bad = load_raw("dfa_even_ones")
    bad["start"] = None
    r = post("/api/equivalence", {"a": bad, "b": load_raw("dfa_even_ones")})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_AUTOMATON"


def test_missing_field_is_422_naming_it() -> None:
    r = post("/api/equivalence", {"a": load_raw("dfa_even_ones")})
    assert r.status_code == 422
    assert "b" in r.json()["error"]["message"]


def test_step_player_fields_are_in_conversion_responses() -> None:
    body = post("/api/nfa-to-dfa", load_raw("nfa_third_last_a")).json()
    first = body["steps"][0]
    assert first["addsStates"] == ["{q0}"]
    assert first["round"] is None
    move = body["steps"][1]
    assert len(move["addsTransitions"]) == 1


def test_minimisation_steps_carry_their_round() -> None:
    body = post("/api/minimize", load_raw("dfa_non_minimal")).json()
    assert [s["round"] for s in body["steps"]] == [None, 0, 1, 2, 2]
    assert len(body["rounds"]) == 3
