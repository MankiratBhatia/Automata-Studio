# Algorithms

How each algorithm in Automata Studio works, why it is correct, what it costs, and where the code and tests live. Everything here is implemented in the pure-Python engine, `backend/automata_core/`; the frontend only draws the results and the step traces.

Notation: an automaton is `A = (Q, Σ, δ, q₀, F)`. For an ε-NFA, `δ(q, a)` may be a set and `a` may be ε. `|δ|` is the number of transitions.

| Algorithm | Module | Input → output |
|---|---|---|
| Validation | `validate.py` | any automaton → list of issues |
| ε-closure and `move` | `closure.py` | state set → state set |
| Simulation | `simulate.py` | automaton + string → accept/reject + trace |
| Regex parsing | `regex/parser.py` | string → syntax tree |
| Thompson's construction | `regex/thompson.py` | syntax tree → ε-NFA |
| ε-removal | `convert.py` | ε-NFA → NFA |
| Subset construction | `convert.py` | NFA / ε-NFA → complete DFA |
| Minimisation (Moore) | `minimize.py` | DFA → minimal complete DFA |
| Equivalence | `equivalence.py` | two automata → yes, or a shortest counterexample |

## 1. Building blocks

### ε-closure and `move`

`closure(S)` is every state reachable from `S` using only ε-transitions. `move(S, a)` is every state reachable from `S` by exactly one `a`-transition.

```
closure(S):
    seen ← S ; stack ← S
    while stack not empty:
        q ← pop(stack)
        for each ε-transition q → r:
            if r ∉ seen: add r to seen and push r
    return seen
```

The `seen` set is what makes ε-cycles safe. Cost: `O(|Q| + |δ|)`.

### Simulation

A single algorithm covers DFA, NFA and ε-NFA by tracking the **set** of active states. A DFA simply never has more than one.

```
active ← closure({q₀})
for each symbol a in the input:
    active ← closure(move(active, a))
    if active = ∅: reject (the run died)
accept  iff  active ∩ F ≠ ∅
```

Cost: `O(|w| · (|Q| + |δ|))`. Every step is recorded (active states and the transitions used), which is what the canvas animates. The simulator refuses an automaton with validation errors, and reports an input symbol outside the alphabet as an error rather than silently rejecting it.

### Validation

Errors (block simulation and conversion): `NO_START`, `DANGLING_REF`, `UNKNOWN_SYMBOL`, `EPSILON_NOT_ALLOWED` (ε outside an ε-NFA), `NONDETERMINISTIC` (a DFA with two moves on one symbol).
Warnings: `INCOMPLETE_DFA`, `UNREACHABLE` (BFS from the start), `DEAD_STATE` (reverse BFS from accepting states; an intentional self-looping trap is not flagged), `NO_ACCEPTING`, `DUPLICATE_TRANSITION`, `EMPTY_ALPHABET`.

An unfinished drawing is allowed to be invalid, so the API reports issues as data rather than failing; only operations that need a valid automaton refuse it.

## 2. Regex → ε-NFA

### Parsing

A recursive-descent parser over this grammar, where `|` is union:

```
union   := concat ('|' concat)*
concat  := repeat repeat*
repeat  := atom ('*' | '+' | '?')*
atom    := SYMBOL | 'ε' | '∅' | '(' union ')'
```

Precedence falls out of the grammar: repetition binds tighter than concatenation, which binds tighter than union. A backslash escapes the next character. Errors carry the character position (the UI draws a caret under it), and nesting is capped at 100 levels so a hostile input becomes an error, not a crash.

### Thompson's construction

Each syntax-tree node becomes a fragment with one start and one accept state, built bottom-up. Fragments are joined only by ε-edges.

| Node | Construction |
|---|---|
| symbol `a` | `s —a→ e` |
| `ε` | `s —ε→ e` |
| `∅` | `s` and `e` with no edge |
| `r₁ r₂` | ε-edge from `e₁` to `s₂` |
| `r₁ ∣ r₂` | new `s`, `e`; ε from `s` to each `sᵢ`, and from each `eᵢ` to `e` |
| `r*` | new `s`, `e`; ε `s→sᵣ`, `eᵣ→e`, `s→e` (skip), `eᵣ→sᵣ` (repeat) |
| `r+` | as `r*` without the skip edge |
| `r?` | as `r*` without the repeat edge |

Properties (all tested): the result has exactly `2 × (leaves + unions + repetitions)` states (concatenation adds none), every state has at most two outgoing edges, and there is exactly one accepting state with no outgoing edges. Cost: `O(|r|)`. States are renamed in breadth-first order so the start state is `q0`.

**Worked example.** `(a|b)*abb` gives a 14-state ε-NFA. (The textbook figure has 11 states because it merges the joints between concatenated parts; this implementation keeps every joint as an explicit ε-edge so each step of the construction is visible.)

## 3. ε-NFA → NFA (ε-removal)

```
δ'(q, a) = move(closure(q), a)
q is accepting in the new NFA  iff  closure(q) ∩ F ≠ ∅
```

then delete states unreachable from `q₀`.

There is deliberately no trailing closure: whatever a step lands on, the *next* step begins with `closure` anyway, so adding it would only keep states alive that carry no information. States that were only ever entered by ε-edges therefore disappear. For the textbook `(a|b)*abb` automaton (11 states) the result has **6 states**.

Cost: `O(|Q| · (|Q| + |δ|) · |Σ|)`.

## 4. NFA / ε-NFA → DFA (subset construction)

Each DFA state is a *set* of NFA states: the set the NFA could be in after reading some input.

```
start ← closure({q₀})
worklist ← [start] ; states ← {start}
while worklist not empty:
    S ← pop(worklist)
    for each symbol a in Σ:
        T ← closure(move(S, a))
        add the DFA transition S —a→ T
        if T is new: add T to states and worklist
accepting: every S with S ∩ F ≠ ∅
```

Only **reachable** subsets are built (the construction is lazy). The empty set becomes an explicit trap state `∅`, so the DFA is complete. States are named by their members (`{q0,q1}`) in the engine and lettered A, B, C… in the UI, with a "state key" table.

Worst case `2^|Q|` states, which really happens: "the k-th symbol from the end is `a`" needs `2^k` states. The engine therefore stops at **512 states** with a clear error instead of hanging. For the third-last-symbol NFA the 4 NFA states become **8 DFA states**.

## 5. DFA minimisation (Moore's partition refinement)

Two states are *equivalent* if no string leads one to acceptance and the other to rejection. Minimising merges equivalent states.

1. Drop states unreachable from the start; if any transition is missing, add a trap state so the DFA is complete.
2. Start with the partition `{F, Q∖F}`.
3. Repeat: split any block whose members send some symbol to *different* blocks. Stop when a round changes nothing.
4. Each final block is one state of the minimal DFA.

```
repeat:
    for each state s: signature(s) ← (block(s), [block(δ(s,a)) for a in Σ])
    group states with equal signatures into new blocks
until the number of blocks stops growing
```

Each round that changes anything adds at least one block, and there are at most `|Q|` blocks, so there are at most `|Q|` rounds: `O(|Σ| · |Q|²)`. (Hopcroft's algorithm is `O(|Σ| · |Q| log |Q|)` but is harder to visualise; each Moore round is one clear picture, which is why it was chosen.)

The result is the **unique** smallest complete DFA for the language (Myhill–Nerode), which is what makes the property tests below possible. Merged states are named `A=C`.

**Worked example.** Pipeline for `(a|b)*abb`: ε-NFA (14 states) → DFA (5 states, A–E) → minimal DFA (**4 states**; A and C are equivalent and merge).

## 6. Equivalence with a counterexample

Do two automata accept the same language?

1. Give both the **union** of their alphabets (a symbol an automaton has never heard of simply leads to rejection), and turn each into a complete DFA with the subset construction.
2. Breadth-first search the **product automaton** from `(q₀ᴬ, q₀ᴮ)`, moving both automata on each symbol. A pair `(p, q)` is a *witness* if exactly one of `p`, `q` is accepting.
3. If a witness is found, follow the parent links back to the start: the symbols along the way spell a string accepted by exactly one automaton. If the search ends with no witness, the languages are equal.

Because breadth-first search discovers pairs in order of depth, the first witness is at the smallest depth, so **the counterexample is a shortest one**; trying symbols in alphabet order makes it the alphabetically first among the shortest. Cost: `O(|Σ| · |Q_A| · |Q_B|)` on the two DFAs.

## 7. How correctness is tested

- **Brute-force comparison.** Property tests (Hypothesis) generate hundreds of random NFAs, ε-NFAs and regexes and check, on *every* string up to a fixed length, that each construction preserves the language: ε-removal, subset construction, minimisation, and the whole regex pipeline.
- **An independent oracle.** Regex results are compared with Python's own `re` module; simulation is compared with a separate depth-first search that shares no code with the engine.
- **Uniqueness.** Minimal DFAs reached by different routes must be identical up to renaming, and minimising twice changes nothing.
- **Shortest counterexamples.** The equivalence checker is compared with brute force: it agrees on whether the languages are equal, the counterexample is a real one, and nothing shorter distinguishes them.
- **Mutation checks.** Each construction was deliberately broken (a dropped ε-edge, a wrong accepting rule, depth-first instead of breadth-first search…) to confirm the tests fail.
- **Determinism.** The suite is run under many hash seeds, because engine output must not depend on set iteration order.

Run the deep version with `HYPOTHESIS_PROFILE=thorough pytest tests/property` (500 examples per property instead of 100).
