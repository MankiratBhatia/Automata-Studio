from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from tests.machines import machine_json

client = TestClient(app)


def post(path: str, body: Any) -> Any:
    return client.post(path, json=body)


# --- pushdown automata --------------------------------------------------------------------


def run_pda(name: str, word: str, **machine_patch: Any) -> Any:
    return post("/api/pda/run", {"pda": {**machine_json(name), **machine_patch}, "input": word})


def test_pda_validate_clean_example() -> None:
    r = post("/api/pda/validate", machine_json("pda_palindromes"))
    assert r.status_code == 200 and r.json() == {"issues": []}


def test_pda_validate_reports_problems_as_data_with_highlight_info() -> None:
    doc = machine_json("pda_balanced")
    doc["transitions"][0]["pop"] = "Q"  # not in the stack alphabet
    r = post("/api/pda/validate", doc)
    assert r.status_code == 200
    issue = r.json()["issues"][0]
    assert issue["code"] == "UNKNOWN_STACK_SYMBOL" and issue["severity"] == "error"
    assert issue["transitionIndices"] == [0]


def test_pda_accepts_and_returns_the_computation() -> None:
    body = run_pda("pda_anbn_final", "aabb").json()
    assert body["verdict"] == "accepted" and body["closest"] is False
    assert [s["stack"] for s in body["steps"]] == ["Z", "AZ", "AAZ", "AZ", "Z", "Z"]
    assert body["steps"][0] == {
        "index": 0,
        "state": "q0",
        "position": 0,
        "stack": "Z",
        "transition": None,
        "note": "Start",
    }
    assert body["steps"][1]["note"] == "δ(q0, a, Z) → (q0, AZ)"


def test_pda_rejects_and_shows_the_closest_attempt() -> None:
    body = run_pda("pda_anbn_final", "aab").json()
    assert body["verdict"] == "rejected" and body["closest"] is True
    assert body["steps"][-1]["position"] == 3


def test_pda_epsilon_is_null_on_the_wire() -> None:
    doc = machine_json("pda_anbn_final")
    assert any(t["input"] is None for t in doc["transitions"])
    assert run_pda("pda_anbn_final", "").json()["verdict"] == "accepted"


def test_pda_that_never_stops_growing_reports_a_limit_not_a_hang() -> None:
    patch = {
        "transitions": [{"from": "q0", "to": "q0", "input": None, "pop": None, "push": "A"}],
        "accepting": [],
    }
    body = run_pda("pda_anbn_final", "", **patch).json()
    assert body["verdict"] == "limit"
    assert "stack" in body["reason"]


def test_pda_empty_stack_mode_ignores_accepting_states() -> None:
    assert run_pda("pda_anbn_empty", "aabb").json()["verdict"] == "accepted"


def test_pda_unknown_input_symbol_is_400_with_position() -> None:
    r = run_pda("pda_anbn_final", "abx")
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "INPUT_SYMBOL" and err["position"] == 2


def test_pda_invalid_machine_is_400_with_issues() -> None:
    r = run_pda("pda_anbn_final", "", start=None)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "INVALID_AUTOMATON"
    assert [i["code"] for i in err["issues"]] == ["NO_START"]


def test_pda_schema_rules_are_422() -> None:
    long_symbol = {**machine_json("pda_balanced"), "inputAlphabet": ["ab"]}
    assert post("/api/pda/validate", long_symbol).status_code == 422
    two_stack = {**machine_json("pda_balanced"), "startStack": "ZZ"}
    assert post("/api/pda/validate", two_stack).status_code == 422
    assert run_pda("pda_balanced", "(" * 201).status_code == 422
    missing = machine_json("pda_balanced")
    del missing["acceptBy"]
    r = post("/api/pda/validate", missing)
    assert r.status_code == 422 and "acceptBy" in r.json()["error"]["message"]


def test_pda_unknown_acceptance_mode_is_422() -> None:
    assert run_pda("pda_balanced", "", acceptBy="sometimes").status_code == 422


# --- Turing machines ----------------------------------------------------------------------


def run_tm(name: str, word: str, **extra: Any) -> Any:
    return post("/api/tm/run", {"tm": machine_json(name), "input": word, **extra})


def test_tm_validate_clean_example() -> None:
    r = post("/api/tm/validate", machine_json("tm_anbncn"))
    assert r.status_code == 200 and r.json() == {"issues": []}


def test_tm_validate_reports_nondeterminism_with_highlight_info() -> None:
    doc = machine_json("tm_increment")
    doc["transitions"].append(
        {"from": "scan", "to": "scan", "read": "0", "write": "1", "move": "L"}
    )
    issues = post("/api/tm/validate", doc).json()["issues"]
    nondet = next(i for i in issues if i["code"] == "NONDETERMINISTIC")
    assert nondet["severity"] == "error" and nondet["stateIds"] == ["scan"]
    assert nondet["transitionIndices"] == [0, len(doc["transitions"]) - 1]


def test_tm_increment() -> None:
    body = run_tm("tm_increment", "1011").json()
    assert body["status"] == "accepted" and body["output"] == "1100"
    assert body["steps"][0]["note"] == "Start"


def test_tm_steps_carry_what_a_viewer_needs_to_rebuild_the_tape() -> None:
    body = run_tm("tm_increment", "1").json()
    first_move = body["steps"][1]
    assert first_move == {
        "index": 1,
        "state": "scan",
        "head": 1,
        "transition": 1,
        "read": "1",
        "write": "1",
        "cell": 0,
        "note": "δ(scan, 1) → (scan, write 1, move R)",
    }


def test_tm_accepts_and_rejects() -> None:
    assert run_tm("tm_anbncn", "aabbcc").json()["status"] == "accepted"
    rejected = run_tm("tm_anbncn", "aabbc").json()
    assert rejected["status"] == "rejected" and "no transition" in rejected["reason"]


def test_tm_that_never_halts_stops_at_the_step_limit() -> None:
    body = run_tm("tm_loop_forever", "a", maxSteps=100).json()
    assert body["status"] == "limit" and len(body["steps"]) == 101
    assert "100" in body["reason"]


def test_tm_default_step_limit_is_ten_thousand() -> None:
    body = run_tm("tm_loop_forever", "a").json()
    assert body["status"] == "limit" and len(body["steps"]) == 10_001


def test_tm_step_limit_is_bounded() -> None:
    assert run_tm("tm_increment", "1", maxSteps=10_001).status_code == 422
    assert run_tm("tm_increment", "1", maxSteps=0).status_code == 422


def test_tm_unknown_input_symbol_is_400_with_position() -> None:
    err = run_tm("tm_palindromes", "abc").json()["error"]
    assert err["code"] == "INPUT_SYMBOL" and err["position"] == 2


def test_tm_invalid_machine_is_400_with_issues() -> None:
    doc = {**machine_json("tm_palindromes"), "start": "ghost"}
    r = post("/api/tm/run", {"tm": doc, "input": ""})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_AUTOMATON"


def test_tm_schema_rules_are_422() -> None:
    bad_move = machine_json("tm_increment")
    bad_move["transitions"][0]["move"] = "UP"
    assert post("/api/tm/validate", bad_move).status_code == 422
    two_char_blank = {**machine_json("tm_increment"), "blank": "__"}
    assert post("/api/tm/validate", two_char_blank).status_code == 422
    assert run_tm("tm_increment", "1" * 501).status_code == 422


def test_openapi_describes_both_machine_types() -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    for name in ("Pda", "Tm", "PdaRunResponse", "TmRunResponse"):
        assert name in schemas
