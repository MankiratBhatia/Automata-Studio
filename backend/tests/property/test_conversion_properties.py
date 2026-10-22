"""Language-preservation invariants on random automata and regexes.

Every language is compared on *all* words up to length 5, so a bug in any construction shows
up as a concrete counterexample string.
"""

import re

from hypothesis import given, settings

from automata_core.convert import nfa_to_dfa, remove_epsilon
from automata_core.minimize import minimize
from automata_core.model import Automaton
from automata_core.regex.thompson import regex_to_enfa
from automata_core.validate import has_errors, validate
from tests.helpers import all_words, canon, language
from tests.strategies import automata, regexes, to_python_regex

SETTINGS = settings()  # example count comes from the Hypothesis profile (see conftest.py)
MAX_LEN = 5  # compare languages on every word up to this length


@SETTINGS
@given(regexes)
def test_thompson_agrees_with_python_re(pattern: str) -> None:
    a = regex_to_enfa(pattern).automaton
    py = to_python_regex(pattern)
    expected = frozenset(w for w in all_words(["a", "b"], MAX_LEN) if re.fullmatch(py, w))
    assert language(a, ["a", "b"], MAX_LEN) == expected, pattern


@SETTINGS
@given(automata())
def test_epsilon_removal_preserves_the_language(n: Automaton) -> None:
    assert language(remove_epsilon(n).automaton, n.alphabet, MAX_LEN) == language(
        n, n.alphabet, MAX_LEN
    )


@SETTINGS
@given(automata())
def test_subset_construction_preserves_the_language(n: Automaton) -> None:
    assert language(nfa_to_dfa(n).automaton, n.alphabet, MAX_LEN) == language(
        n, n.alphabet, MAX_LEN
    )


@SETTINGS
@given(automata())
def test_subset_construction_output_is_a_complete_dfa(n: Automaton) -> None:
    issues = validate(nfa_to_dfa(n).automaton)
    assert not has_errors(issues)
    assert not any(i.code == "INCOMPLETE_DFA" for i in issues)


@SETTINGS
@given(automata())
def test_minimisation_preserves_the_language_and_never_grows(n: Automaton) -> None:
    d = nfa_to_dfa(n).automaton
    m = minimize(d).automaton
    assert language(m, n.alphabet, MAX_LEN) == language(n, n.alphabet, MAX_LEN)
    assert len(m.states) <= len(d.states)


@SETTINGS
@given(automata())
def test_minimising_twice_changes_nothing(n: Automaton) -> None:
    once = minimize(nfa_to_dfa(n).automaton).automaton
    assert canon(minimize(once).automaton) == canon(once)


@SETTINGS
@given(automata(kinds=("ENFA",)))
def test_minimal_dfa_is_unique_whichever_route_built_it(e: Automaton) -> None:
    # Subset construction straight from the epsilon-NFA vs. after removing epsilons first.
    direct = minimize(nfa_to_dfa(e).automaton).automaton
    via_nfa = minimize(nfa_to_dfa(remove_epsilon(e).automaton).automaton).automaton
    assert canon(direct) == canon(via_nfa)


@SETTINGS
@given(regexes)
def test_full_pipeline_from_a_regex_keeps_the_language(pattern: str) -> None:
    enfa = regex_to_enfa(pattern).automaton
    mdfa = minimize(nfa_to_dfa(enfa).automaton).automaton
    alphabet = ["a", "b"]
    assert language(mdfa, alphabet, MAX_LEN) == language(enfa, alphabet, MAX_LEN), pattern
