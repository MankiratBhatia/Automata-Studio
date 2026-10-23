import itertools

import pytest

from automata_core.errors import InputSymbolError, InvalidAutomatonError
from automata_core.pda import Pda, PdaTransition, run_pda, validate_pda
from automata_core.validate import has_errors
from tests.machines import (
    PREDICATES,
    check_pda_trace,
    expectations,
    load_pda,
    machine_json,
)

PDAS = ["pda_anbn_final", "pda_anbn_empty", "pda_palindromes", "pda_balanced"]


def words(alphabet: str, max_len: int) -> list[str]:
    out = [""]
    for n in range(1, max_len + 1):
        out += ["".join(p) for p in itertools.product(alphabet, repeat=n)]
    return out


def make(
    transitions: list[tuple[str, str | None, str | None, str, str]],
    *,
    accepting: list[str] | None = None,
    accept_by: str = "finalState",
    start_stack: str = "Z",
    states: tuple[str, ...] = ("q0", "q1"),
    input_alphabet: tuple[str, ...] = ("a", "b"),
    stack_alphabet: tuple[str, ...] = ("Z", "A", "B"),
    start: str | None = "q0",
) -> Pda:
    return Pda(
        states=states,
        input_alphabet=input_alphabet,
        stack_alphabet=stack_alphabet,
        start=start,
        start_stack=start_stack,
        accepting=frozenset(accepting or []),
        accept_by=accept_by,  # type: ignore[arg-type]
        # Written the textbook way: (from, input, pop, to, push).
        transitions=tuple(PdaTransition(t[0], t[3], t[1], t[2], t[4]) for t in transitions),
    )


# --- the example machines -----------------------------------------------------------------


@pytest.mark.parametrize("name", PDAS)
def test_every_example_is_valid(name: str) -> None:
    assert not has_errors(validate_pda(load_pda(name)))


@pytest.mark.parametrize("name", PDAS)
def test_listed_accept_and_reject_cases(name: str) -> None:
    p = load_pda(name)
    for w in expectations()[name]["accept"]:
        assert run_pda(p, w).verdict == "accepted", f"{name} should accept {w!r}"
    for w in expectations()[name]["reject"]:
        assert run_pda(p, w).verdict == "rejected", f"{name} should reject {w!r}"


@pytest.mark.parametrize("name", PDAS)
def test_matches_the_language_on_every_string(name: str) -> None:
    p = load_pda(name)
    alphabet = "".join(p.input_alphabet)
    for w in words(alphabet, 8):
        run = run_pda(p, w)
        assert run.verdict != "limit", f"{name} hit a limit on {w!r}"
        assert (run.verdict == "accepted") == PREDICATES[name](w), f"{name} wrong on {w!r}"


@pytest.mark.parametrize("name", PDAS)
def test_accepting_traces_are_legal_computations(name: str) -> None:
    p = load_pda(name)
    for w in expectations()[name]["accept"]:
        run = run_pda(p, w)
        check_pda_trace(p, w, run)
        last = run.steps[-1]
        assert last.position == len(w)
        assert not run.closest
        if p.accept_by == "finalState":
            assert last.state in p.accepting
        else:
            assert last.stack == ""


def test_the_start_step_is_the_initial_configuration() -> None:
    run = run_pda(load_pda("pda_anbn_final"), "ab")
    s = run.steps[0]
    assert (s.index, s.state, s.position, s.stack, s.transition) == (0, "q0", 0, "Z", None)
    assert s.note == "Start"


def test_the_accepting_run_is_a_shortest_one() -> None:
    # a, a, b, b, then the epsilon move into the accepting state: five moves, six steps.
    run = run_pda(load_pda("pda_anbn_final"), "aabb")
    assert len(run.steps) == 6
    assert [s.stack for s in run.steps] == ["Z", "AZ", "AAZ", "AZ", "Z", "Z"]
    assert [s.position for s in run.steps] == [0, 1, 2, 3, 4, 4]


def test_each_step_explains_the_transition_it_used() -> None:
    run = run_pda(load_pda("pda_anbn_final"), "ab")
    assert run.steps[1].note == "δ(q0, a, Z) → (q0, AZ)"
    assert run.steps[2].note == "δ(q0, b, A) → (q1, ε)"  # nothing pushed
    assert run.steps[3].note == "δ(q1, ε, Z) → (q2, Z)"  # epsilon input


# --- acceptance modes ---------------------------------------------------------------------


def test_final_state_acceptance_ignores_what_is_left_on_the_stack() -> None:
    run = run_pda(load_pda("pda_anbn_final"), "ab")
    assert run.verdict == "accepted" and run.steps[-1].stack == "Z"


def test_empty_stack_acceptance_ignores_final_states() -> None:
    p = load_pda("pda_anbn_empty")
    assert p.accepting == frozenset()
    run = run_pda(p, "aabb")
    assert run.verdict == "accepted" and run.steps[-1].stack == ""


def test_empty_stack_acceptance_needs_the_stack_to_actually_be_empty() -> None:
    # Reads everything, but a Z is left behind: not accepted in empty-stack mode.
    p = make([("q0", "a", "Z", "q0", "Z")], accept_by="emptyStack")
    assert run_pda(p, "a").verdict == "rejected"


def test_final_state_acceptance_needs_the_input_to_be_used_up() -> None:
    p = make([("q0", "a", None, "q1", "")], accepting=["q1"])
    assert run_pda(p, "a").verdict == "accepted"
    assert run_pda(p, "aa").verdict == "rejected"


def test_an_empty_initial_stack_means_the_stack_starts_empty() -> None:
    p = make([], accept_by="emptyStack", start_stack="")
    assert run_pda(p, "").verdict == "accepted"
    assert run_pda(p, "").steps[0].stack == ""


# --- how stack operations work ------------------------------------------------------------


def test_pushed_symbols_are_written_top_first() -> None:
    p = make([("q0", "a", "Z", "q1", "AB")], accepting=["q1"])
    run = run_pda(p, "a")
    assert run.steps[-1].stack == "AB"  # A is on top, B beneath it


def test_a_move_with_no_pop_leaves_the_stack_alone_before_pushing() -> None:
    p = make([("q0", "a", None, "q1", "A")], accepting=["q1"])
    assert run_pda(p, "a").steps[-1].stack == "AZ"


def test_popping_needs_the_right_symbol_on_top() -> None:
    p = make([("q0", "a", "A", "q1", "")], accepting=["q1"])  # top is Z, not A
    assert run_pda(p, "a").verdict == "rejected"


def test_a_pop_move_cannot_fire_on_an_empty_stack() -> None:
    p = make([("q0", "a", "Z", "q0", "")], accepting=["q0"], accept_by="finalState")
    assert run_pda(p, "aa").verdict == "rejected"  # the second a has nothing to pop


# --- nondeterminism, closest attempts and limits -----------------------------------------


def test_nondeterminism_tries_every_choice() -> None:
    p = load_pda("pda_palindromes")
    assert run_pda(p, "abba").verdict == "accepted"  # needs the right guess for the middle
    assert run_pda(p, "abab").verdict == "rejected"


def test_a_rejection_shows_the_closest_attempt() -> None:
    run = run_pda(load_pda("pda_anbn_final"), "aab")
    assert run.verdict == "rejected" and run.closest
    assert run.steps[-1].position == 3  # it got through all three symbols before getting stuck


def test_closest_attempt_is_a_legal_computation_too() -> None:
    p = load_pda("pda_anbn_final")
    run = run_pda(p, "aabbb")
    check_pda_trace(p, "aabbb", run)


def test_an_epsilon_loop_that_changes_nothing_terminates() -> None:
    p = make([("q0", None, None, "q1", ""), ("q1", None, None, "q0", "")])
    run = run_pda(p, "")
    assert run.verdict == "rejected"  # the search space is finite, and it was exhausted


def test_a_loop_that_keeps_pushing_hits_the_stack_limit_instead_of_hanging() -> None:
    p = make([("q0", None, None, "q0", "A")], accepting=["q9"], states=("q0", "q9"))
    run = run_pda(p, "", max_stack=20)
    assert run.verdict == "limit"


def test_the_configuration_limit_stops_a_huge_search() -> None:
    p = make(
        [("q0", None, None, "q0", "A"), ("q0", None, None, "q0", "B")],
        accepting=["q9"],
        states=("q0", "q9"),
    )
    run = run_pda(p, "", max_configs=50, max_stack=1000)
    assert run.verdict == "limit"
    assert run.explored <= 51


def test_an_accepting_run_is_still_found_when_a_limit_would_apply_elsewhere() -> None:
    # One branch loops forever, the other accepts: acceptance wins, and is reported as such.
    p = make(
        [("q0", None, None, "q0", "A"), ("q0", "a", "Z", "q1", "")],
        accepting=["q1"],
        states=("q0", "q1"),
    )
    assert run_pda(p, "a", max_stack=10).verdict == "accepted"


def test_exploration_is_counted() -> None:
    assert run_pda(load_pda("pda_anbn_final"), "ab").explored >= 3


# --- errors and validation ----------------------------------------------------------------


def test_input_symbols_outside_the_alphabet_are_an_error() -> None:
    with pytest.raises(InputSymbolError) as e:
        run_pda(load_pda("pda_anbn_final"), "abx")
    assert e.value.position == 2 and e.value.symbol == "x"


def test_an_invalid_machine_cannot_run() -> None:
    with pytest.raises(InvalidAutomatonError):
        run_pda(make([], start=None), "")


def codes(p: Pda) -> set[str]:
    return {i.code for i in validate_pda(p)}


def test_no_start_state() -> None:
    assert "NO_START" in codes(make([], start=None))
    assert "NO_START" in codes(make([], start="ghost"))


def test_dangling_references() -> None:
    assert "DANGLING_REF" in codes(make([("q0", "a", "Z", "ghost", "")]))
    assert "DANGLING_REF" in codes(make([], accepting=["ghost"]))


def test_symbols_must_belong_to_their_alphabets() -> None:
    assert "UNKNOWN_INPUT_SYMBOL" in codes(make([("q0", "x", "Z", "q1", "")]))
    assert "UNKNOWN_STACK_SYMBOL" in codes(make([("q0", "a", "Q", "q1", "")]))
    assert "UNKNOWN_STACK_SYMBOL" in codes(make([("q0", "a", "Z", "q1", "AQ")]))
    assert "UNKNOWN_STACK_SYMBOL" in codes(make([], start_stack="Q"))


def test_a_good_machine_has_no_issues_of_those_kinds() -> None:
    bad = {"NO_START", "DANGLING_REF", "UNKNOWN_INPUT_SYMBOL", "UNKNOWN_STACK_SYMBOL"}
    assert not (codes(load_pda("pda_palindromes")) & bad)


def test_final_state_mode_without_accepting_states_is_only_a_warning() -> None:
    issues = validate_pda(make([], accepting=[]))
    no_acc = [i for i in issues if i.code == "NO_ACCEPTING"]
    assert no_acc and no_acc[0].severity == "warning"
    assert not has_errors(issues)


def test_empty_stack_mode_does_not_need_accepting_states() -> None:
    assert "NO_ACCEPTING" not in codes(make([], accept_by="emptyStack"))


def test_unreachable_states_and_duplicate_transitions_are_warnings() -> None:
    p = make(
        [("q0", "a", "Z", "q0", "Z"), ("q0", "a", "Z", "q0", "Z")],
        accepting=["q0"],
        states=("q0", "q1"),
    )
    found = {i.code: i for i in validate_pda(p)}
    assert found["UNREACHABLE"].state_ids == ("q1",)
    assert found["DUPLICATE_TRANSITION"].transition_indices == (0, 1)


def test_issues_name_the_offending_transition() -> None:
    p = make([("q0", "a", "Z", "q0", ""), ("q0", "x", "Z", "q0", "")])
    issue = next(i for i in validate_pda(p) if i.code == "UNKNOWN_INPUT_SYMBOL")
    assert issue.transition_indices == (1,)


def test_from_dict_reads_the_wire_format() -> None:
    raw = machine_json("pda_balanced")
    p = Pda.from_dict(raw)
    assert p.accept_by == "finalState" and p.start_stack == "Z"
    assert p.transitions[2] == PdaTransition("q0", "q0", ")", "X", "")
    assert p.transitions[3].input is None  # null on the wire is epsilon


def test_a_branch_that_hits_the_stack_limit_does_not_stop_other_branches() -> None:
    # The first branch keeps growing the stack; the second needs a few more steps to accept.
    p = make(
        [
            ("q0", None, None, "q0", "A"),  # grows without bound
            ("q0", "a", "Z", "q1", "Z"),
            ("q1", "b", "Z", "q2", "Z"),
        ],
        accepting=["q2"],
        states=("q0", "q1", "q2"),
    )
    assert run_pda(p, "ab", max_stack=5).verdict == "accepted"


def test_a_cut_off_branch_is_remembered_in_the_reason() -> None:
    p = make([("q0", None, None, "q0", "A")], accepting=["q9"], states=("q0", "q9"))
    run = run_pda(p, "", max_stack=5)
    assert run.verdict == "limit" and "stack" in run.reason
