"""Random PDAs and Turing machines checked against independent oracles.

The oracles below are deliberately written differently from the engines (a depth-first search
for PDAs, a list-backed tape for Turing machines) so a mistake in one is unlikely to be repeated
in the other.
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from automata_core.pda import Pda, PdaTransition, run_pda
from automata_core.tm import Tm, TmTransition, run_tm
from tests.machines import check_pda_trace, replay_tape, tape_text

# --- Turing machines ----------------------------------------------------------------------

BLANK = "_"
SYMBOLS = ["a", "b", BLANK]


@st.composite
def turing_machines(draw: st.DrawFn) -> Tm:
    n = draw(st.integers(2, 4))
    names = tuple(f"q{i}" for i in range(n))
    accepting = frozenset(draw(st.lists(st.sampled_from(names[1:]), unique=True, max_size=2)))
    rest = [s for s in names if s not in accepting and s != names[0]]
    rejecting = (
        frozenset(draw(st.lists(st.sampled_from(rest), unique=True, max_size=1)))
        if rest
        else frozenset()
    )
    transitions: list[TmTransition] = []
    for state in names:
        for symbol in SYMBOLS:
            if draw(st.booleans()):  # deterministic by construction: one entry per (state, symbol)
                transitions.append(
                    TmTransition(
                        state,
                        draw(st.sampled_from(names)),
                        symbol,
                        draw(st.sampled_from(SYMBOLS)),
                        draw(st.sampled_from(["L", "R", "S"])),
                    )
                )
    return Tm(
        names, ("a", "b"), tuple(SYMBOLS), BLANK, names[0], accepting, rejecting, tuple(transitions)
    )


def oracle_tm(tm: Tm, word: str, max_steps: int) -> tuple[str, str, int]:
    """A plain simulator with a Python list for a tape that grows at either end."""
    delta = {(t.src, t.read): t for t in tm.transitions}
    tape = list(word)
    pos = 0
    state = tm.start
    taken = 0
    while True:
        if state in tm.accepting:
            status = "accepted"
            break
        if state in tm.rejecting:
            status = "rejected"
            break
        if taken == max_steps:
            status = "limit"
            break
        if not tape:
            tape.append(BLANK)
        symbol = tape[pos]
        t = delta.get((state, symbol))
        if t is None:
            status = "rejected"
            break
        tape[pos] = t.write
        state = t.dst
        taken += 1
        if t.move == "L":
            if pos == 0:
                tape.insert(0, BLANK)
            else:
                pos -= 1
        elif t.move == "R":
            pos += 1
            if pos == len(tape):
                tape.append(BLANK)
    return status, "".join(tape).strip(BLANK), taken


@settings()
@given(turing_machines(), st.text(alphabet="ab", max_size=6))
def test_turing_machine_matches_an_independent_simulator(tm: Tm, word: str) -> None:
    run = run_tm(tm, word, max_steps=60)
    status, output, taken = oracle_tm(tm, word, 60)
    assert run.status == status
    assert run.output == output
    assert len(run.steps) - 1 == taken


@settings()
@given(turing_machines(), st.text(alphabet="ab", max_size=6))
def test_turing_machine_traces_rebuild_the_final_tape(tm: Tm, word: str) -> None:
    run = run_tm(tm, word, max_steps=60)
    tape = replay_tape(tm, word, run.steps)
    assert tape_text(tape, tm.blank) == run.output


# --- pushdown automata --------------------------------------------------------------------

STACK_CAP = 6


@st.composite
def pushdown_automata(draw: st.DrawFn) -> Pda:
    names = tuple(f"q{i}" for i in range(draw(st.integers(2, 3))))
    move = st.tuples(
        st.sampled_from(names),
        st.sampled_from([None, "a", "b"]),
        st.sampled_from([None, "Z", "A"]),
        st.sampled_from(names),
        st.sampled_from(["", "A", "Z", "AA", "AZ", "ZA"]),
    )
    moves = draw(st.lists(move, max_size=7))
    return Pda(
        states=names,
        input_alphabet=("a", "b"),
        stack_alphabet=("Z", "A"),
        start=names[0],
        start_stack=draw(st.sampled_from(["Z", ""])),
        accepting=frozenset(draw(st.lists(st.sampled_from(names), unique=True))),
        accept_by=draw(st.sampled_from(["finalState", "emptyStack"])),
        transitions=tuple(
            PdaTransition(src, dst, i, pop, push) for src, i, pop, dst, push in moves
        ),
    )


def oracle_pda(p: Pda, word: str, cap: int) -> bool:
    """Depth-first search over configurations, with the same stack-height cap as the engine."""
    stack_of: list[tuple[str, int, str]] = [(p.start or "", 0, p.start_stack)]
    seen = set(stack_of)
    while stack_of:
        state, pos, stack = stack_of.pop()
        if pos == len(word) and (
            state in p.accepting if p.accept_by == "finalState" else stack == ""
        ):
            return True
        for t in p.transitions:
            if t.src != state:
                continue
            if t.input is not None and (pos >= len(word) or word[pos] != t.input):
                continue
            if t.pop is not None and not stack.startswith(t.pop):
                continue
            new_pos = pos + (1 if t.input is not None else 0)
            new_stack = t.push + (stack[1:] if t.pop is not None else stack)
            if len(new_stack) > cap:
                continue
            config = (t.dst, new_pos, new_stack)
            if config not in seen:
                seen.add(config)
                stack_of.append(config)
    return False


@settings()
@given(pushdown_automata(), st.text(alphabet="ab", max_size=4))
def test_pushdown_automaton_agrees_with_an_independent_search(p: Pda, word: str) -> None:
    run = run_pda(p, word, max_configs=50_000, max_stack=STACK_CAP)
    expected = oracle_pda(p, word, STACK_CAP)
    if run.verdict == "accepted":
        assert expected
        check_pda_trace(p, word, run)
        assert not run.closest
    elif run.verdict == "rejected":
        assert not expected
    else:  # "limit": some branch was cut off, but an accepting branch would still have been found
        assert not expected


@settings()
@given(pushdown_automata(), st.text(alphabet="ab", max_size=4))
def test_every_pushdown_trace_is_a_legal_computation(p: Pda, word: str) -> None:
    run = run_pda(p, word, max_configs=50_000, max_stack=STACK_CAP)
    check_pda_trace(p, word, run)  # the accepting run, or else the closest attempt
