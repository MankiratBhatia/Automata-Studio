import itertools

import pytest

from automata_core.errors import InputSymbolError, InvalidAutomatonError
from automata_core.tm import Tm, TmTransition, run_tm, validate_tm
from automata_core.validate import has_errors
from tests.machines import (
    PREDICATES,
    expectations,
    load_tm,
    machine_json,
    replay_tape,
    tape_text,
)

HALTING = ["tm_anbncn", "tm_palindromes"]


def words(alphabet: str, max_len: int) -> list[str]:
    out = [""]
    for n in range(1, max_len + 1):
        out += ["".join(p) for p in itertools.product(alphabet, repeat=n)]
    return out


def make(
    transitions: list[tuple[str, str, str, str, str]],
    *,
    accepting: list[str] | None = None,
    rejecting: list[str] | None = None,
    states: tuple[str, ...] = ("q0", "q1"),
    input_alphabet: tuple[str, ...] = ("a",),
    tape_alphabet: tuple[str, ...] = ("a", "b", "_"),
    blank: str = "_",
    start: str | None = "q0",
) -> Tm:
    return Tm(
        states=states,
        input_alphabet=input_alphabet,
        tape_alphabet=tape_alphabet,
        blank=blank,
        start=start,
        accepting=frozenset(accepting or []),
        rejecting=frozenset(rejecting or []),
        # Written the textbook way: (from, read, to, write, move).
        transitions=tuple(TmTransition(t[0], t[2], t[1], t[3], t[4]) for t in transitions),
    )


# --- the example machines -----------------------------------------------------------------


@pytest.mark.parametrize("name", [*HALTING, "tm_increment", "tm_loop_forever"])
def test_every_example_is_valid(name: str) -> None:
    assert not has_errors(validate_tm(load_tm(name)))


@pytest.mark.parametrize("name", HALTING)
def test_listed_accept_and_reject_cases(name: str) -> None:
    tm = load_tm(name)
    for w in expectations()[name]["accept"]:
        assert run_tm(tm, w).status == "accepted", f"{name} should accept {w!r}"
    for w in expectations()[name]["reject"]:
        assert run_tm(tm, w).status == "rejected", f"{name} should reject {w!r}"


def test_anbncn_matches_the_language_on_every_string() -> None:
    tm = load_tm("tm_anbncn")
    for w in words("abc", 7):
        run = run_tm(tm, w)
        assert run.status != "limit", w
        assert (run.status == "accepted") == PREDICATES["tm_anbncn"](w), w


def test_palindromes_match_the_language_on_every_string() -> None:
    tm = load_tm("tm_palindromes")
    for w in words("ab", 10):
        run = run_tm(tm, w)
        assert (run.status == "accepted") == PREDICATES["tm_palindromes"](w), w


def test_binary_increment_adds_one_to_every_number() -> None:
    tm = load_tm("tm_increment")
    for n in range(300):
        run = run_tm(tm, format(n, "b"))
        assert run.status == "accepted"
        assert run.output == format(n + 1, "b"), n


def test_listed_increment_outputs() -> None:
    tm = load_tm("tm_increment")
    for word, out in expectations()["tm_increment"]["outputs"].items():
        assert run_tm(tm, word).output == out


def test_increment_uses_the_tape_to_the_left_of_the_input() -> None:
    run = run_tm(load_tm("tm_increment"), "111")
    assert run.output == "1000"
    assert min(s.head for s in run.steps) == -1  # the carry wrote a new leading 1 at cell -1


# --- traces -------------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["tm_anbncn", "tm_palindromes", "tm_increment"])
def test_traces_are_legal_and_rebuild_the_final_tape(name: str) -> None:
    tm = load_tm(name)
    cases = expectations()[name].get("accept") or list(expectations()[name]["outputs"])
    for w in cases:
        run = run_tm(tm, w)
        tape = replay_tape(tm, w, run.steps)
        assert tape_text(tape, tm.blank) == run.output


def test_the_first_step_is_the_initial_configuration() -> None:
    s = run_tm(load_tm("tm_increment"), "101").steps[0]
    assert (s.index, s.state, s.head, s.transition, s.note) == (0, "scan", 0, None, "Start")


def test_steps_are_numbered_and_describe_the_move_made() -> None:
    run = run_tm(load_tm("tm_increment"), "1")
    assert [s.index for s in run.steps] == list(range(len(run.steps)))
    assert run.steps[1].note == "δ(scan, 1) → (scan, write 1, move R)"
    assert (run.steps[1].cell, run.steps[1].write, run.steps[1].read) == (0, "1", "1")


# --- halting and limits --------------------------------------------------------------------


def test_a_machine_that_never_halts_is_stopped_at_the_step_limit() -> None:
    run = run_tm(load_tm("tm_loop_forever"), "aaa", max_steps=50)
    assert run.status == "limit"
    assert len(run.steps) == 51  # the start plus fifty moves
    assert "50" in run.reason


def test_the_default_step_limit_is_ten_thousand() -> None:
    run = run_tm(load_tm("tm_loop_forever"), "a")
    assert run.status == "limit" and len(run.steps) == 10_001


def test_getting_stuck_in_a_non_halting_state_rejects() -> None:
    run = run_tm(load_tm("tm_anbncn"), "b")
    assert run.status == "rejected"
    assert "no transition" in run.reason


def test_entering_a_rejecting_state_rejects() -> None:
    tm = make([("q0", "a", "bad", "a", "R")], rejecting=["bad"], states=("q0", "bad"))
    run = run_tm(tm, "a")
    assert run.status == "rejected" and "rejecting" in run.reason


def test_a_start_state_that_is_accepting_accepts_at_once() -> None:
    run = run_tm(make([], accepting=["q0"]), "aaa")
    assert run.status == "accepted" and len(run.steps) == 1


def test_accepting_at_exactly_the_last_allowed_step_is_still_accepting() -> None:
    tm = make([("q0", "a", "q1", "a", "R")], accepting=["q1"])
    assert run_tm(tm, "a", max_steps=1).status == "accepted"
    assert run_tm(tm, "a", max_steps=0).status == "limit"


def test_stay_moves_leave_the_head_where_it_is() -> None:
    tm = make([("q0", "a", "q1", "b", "S")], accepting=["q1"])
    run = run_tm(tm, "a")
    assert run.steps[-1].head == 0 and run.output == "b"


def test_writing_a_blank_erases_the_cell_and_the_output_ignores_blank_edges() -> None:
    tm = make([("q0", "a", "q1", "_", "R")], accepting=["q1"])
    assert run_tm(tm, "a").output == ""


def test_output_spans_from_the_first_to_the_last_non_blank_cell() -> None:
    tm = make(
        [("q0", "a", "q1", "_", "R"), ("q1", "a", "q2", "a", "S")],
        accepting=["q2"],
        states=("q0", "q1", "q2"),
    )
    # "aa": the first a is erased, the second stays at cell 1. "aaa" also leaves cell 2.
    assert run_tm(tm, "aa").output == "a"
    assert run_tm(tm, "aaa").output == "aa"


def test_output_keeps_blanks_that_sit_between_symbols() -> None:
    tm = make(
        [("q0", "a", "q1", "a", "R"), ("q1", "a", "q2", "_", "R"), ("q2", "a", "q3", "a", "S")],
        accepting=["q3"],
        states=("q0", "q1", "q2", "q3"),
    )
    assert run_tm(tm, "aaa").output == "a_a"


def test_the_head_can_walk_left_past_the_start_of_the_input() -> None:
    tm = make([("q0", "a", "q0", "a", "L"), ("q0", "_", "q1", "b", "S")], accepting=["q1"])
    run = run_tm(tm, "a")
    assert run.status == "accepted" and run.steps[-1].head == -1 and run.output == "ba"


# --- errors and validation ----------------------------------------------------------------


def test_input_symbols_outside_the_input_alphabet_are_an_error() -> None:
    with pytest.raises(InputSymbolError) as e:
        run_tm(load_tm("tm_palindromes"), "abc")
    assert e.value.position == 2 and e.value.symbol == "c"


def test_the_blank_is_not_a_legal_input_symbol() -> None:
    with pytest.raises(InputSymbolError):
        run_tm(load_tm("tm_palindromes"), "a_b")


def test_an_invalid_machine_cannot_run() -> None:
    with pytest.raises(InvalidAutomatonError):
        run_tm(make([], start=None), "")


def codes(tm: Tm) -> set[str]:
    return {i.code for i in validate_tm(tm)}


def test_start_and_references() -> None:
    assert "NO_START" in codes(make([], start=None))
    assert "NO_START" in codes(make([], start="ghost"))
    assert "DANGLING_REF" in codes(make([("q0", "a", "ghost", "a", "R")]))
    assert "DANGLING_REF" in codes(make([], accepting=["ghost"]))
    assert "DANGLING_REF" in codes(make([], rejecting=["ghost"]))


def test_symbols_must_be_on_the_tape_alphabet() -> None:
    assert "UNKNOWN_SYMBOL" in codes(make([("q0", "z", "q1", "a", "R")]))
    assert "UNKNOWN_SYMBOL" in codes(make([("q0", "a", "q1", "z", "R")]))


def test_blank_rules() -> None:
    assert "BLANK_NOT_ON_TAPE" in codes(make([], tape_alphabet=("a",)))
    assert "BLANK_IN_INPUT" in codes(make([], input_alphabet=("a", "_")))
    assert "INPUT_NOT_ON_TAPE" in codes(make([], input_alphabet=("a", "z")))


def test_the_machine_must_be_deterministic() -> None:
    p = make([("q0", "a", "q1", "a", "R"), ("q0", "a", "q0", "b", "L")])
    issue = next(i for i in validate_tm(p) if i.code == "NONDETERMINISTIC")
    assert issue.severity == "error" and issue.transition_indices == (0, 1)


def test_a_state_cannot_both_accept_and_reject() -> None:
    assert "ACCEPT_AND_REJECT" in codes(make([], accepting=["q0"], rejecting=["q0"]))


def test_transitions_out_of_halting_states_are_flagged_as_dead_code() -> None:
    p = make([("q1", "a", "q0", "a", "R")], accepting=["q1"])
    issue = next(i for i in validate_tm(p) if i.code == "FROM_HALTING_STATE")
    assert issue.severity == "warning" and issue.transition_indices == (0,)


def test_no_accepting_state_and_unreachable_states_are_warnings() -> None:
    issues = {i.code: i for i in validate_tm(make([], states=("q0", "q1")))}
    assert issues["NO_ACCEPTING"].severity == "warning"
    assert issues["UNREACHABLE"].state_ids == ("q1",)


def test_good_examples_raise_no_errors() -> None:
    for n in [*HALTING, "tm_increment"]:
        assert not has_errors(validate_tm(load_tm(n)))


def test_from_dict_reads_the_wire_format() -> None:
    tm = Tm.from_dict(machine_json("tm_increment"))
    assert tm.blank == "_" and tm.accepting == frozenset({"done"})
    assert tm.transitions[0] == TmTransition("scan", "scan", "0", "0", "R")
