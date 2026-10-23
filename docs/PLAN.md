# Automata Studio — Implementation Plan

> Interactive web app to build, simulate, analyse and convert DFA / NFA / ε-NFA.
> Stack: React + TypeScript + React Flow + Tailwind · Python + FastAPI · JSON / SQLite.

---

## 0. Guiding principles

1. **Engine first, UI second.** Every algorithm lives in a pure Python package with
   no web or UI code in it. It is tested on its own before any UI calls it. If the engine is
   correct, the UI is "just" a visualiser.
2. **One source of truth for algorithms.** Algorithms run in Python only. The frontend never
   re-implements subset construction, minimisation, etc. It renders the results and
   **step traces** that the backend returns.
3. **One canonical JSON format.** Every automaton (user-drawn, generated, saved, exported)
   uses the same schema. Every API endpoint takes it in and gives it back.
4. **Ship a demo-able MVP early.** By the end of Phase 2 you can draw an automaton, validate
   it and simulate a string step by step. Everything after that is an addition, not a rescue.
5. **Small, boring architecture.** No microservices, auth, Redux, Docker-in-prod or GraphQL.
   One frontend, one backend, one SQLite file.

---

## 1. Architecture

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  React + TS                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Canvas      │  │ Side panels  │  │ Step player              │  │
│  │ (React Flow)│  │ validate /   │  │ (replays algorithm steps)│  │
│  │ custom nodes│  │ simulate /   │  │                          │  │
│  │ & edges     │  │ convert      │  │                          │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         └───────── Zustand store (automaton doc + UI state) ──────┘
│                          │  typed API client (generated from OpenAPI)
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTP/JSON
┌──────────────────────────┼──────── FastAPI ──────────────────────┐
│  api/ routers (thin)  →  Pydantic schemas  →  core engine calls   │
│  storage/ (SQLite projects table, JSON blobs)                     │
└──────────────────────────┼───────────────────────────────────────┘
                           │ plain Python calls
┌──────────────────────────┴──────── automata_core (pure Python) ───┐
│  model · validate · simulate · regex · subset · minimise ·        │
│  equivalence · steps (trace protocol)                             │
└───────────────────────────────────────────────────────────────────┘
```

**Why this split:** `automata_core` can be tested with `pytest` in milliseconds and shown to
your examiner without the UI. FastAPI is only a translation layer. The UI only draws things.

### Key technical decisions

| Concern | Decision | Reason |
|---|---|---|
| Frontend state | **Zustand** (one store) | Small; React Flow already uses it internally; no boilerplate |
| Auto-layout of generated automata | **dagre** (`@dagrejs/dagre`), left-to-right | Simple, predictable, good enough for ≤ 50 states |
| Shared types | `openapi-typescript` generates TS types from FastAPI's `/openapi.json` | Backend and frontend schemas cannot drift apart |
| Backend validation | Pydantic v2 models at the API boundary; frozen dataclasses inside the engine | Strict input checks, fast internal code |
| Storage | **MVP:** browser `localStorage` autosave + JSON file import/export. **Phase 5:** SQLite via stdlib `sqlite3` (one table storing JSON) | You don't need an ORM for one table |
| Python tooling | `uv` (or pip + venv), `ruff`, `mypy --strict` on `automata_core`, `pytest`, `hypothesis` | |
| JS tooling | Vite, ESLint, Prettier, Vitest, React Testing Library, Playwright (a few E2E tests only) | |
| CI | GitHub Actions: lint + type-check + tests for both halves on every push | |

---

## 2. Canonical automaton schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "kind": "DFA",                 // "DFA" | "NFA" | "ENFA"
  "name": "Ends with 01",
  "alphabet": ["0", "1"],        // single-character symbols for v1
  "states": [
    { "id": "q0", "label": "q0", "position": { "x": 0,   "y": 0 } },
    { "id": "q1", "label": "q1", "position": { "x": 180, "y": 0 } },
    { "id": "q2", "label": "q2", "position": { "x": 360, "y": 0 } }
  ],
  "start": "q0",
  "accepting": ["q2"],
  "transitions": [
    { "from": "q0", "to": "q0", "symbol": "1" },
    { "from": "q0", "to": "q1", "symbol": "0" },
    { "from": "q1", "to": "q2", "symbol": "1" }
    // ε-transition: "symbol": null
  ]
}
```

Rules:
- **One transition record per symbol.** The UI *groups* records with the same `(from, to)` into
  one drawn edge labelled `0, 1`. That keeps the model simple and the drawing clean.
- `symbol: null` means ε (never the string `"ε"` or `""`), so there's no ambiguity.
- `position` belongs to the UI. The engine ignores it. Generated automata come back without
  positions and the frontend lays them out with dagre.
- `id` is internal and stable. `label` is what the user sees and can edit.
- `kind` is what the user *declares*. Validation checks that the structure matches it.

---

## 3. Algorithms (what, how, complexity, and edge cases)

All conversion and analysis functions return `(result, steps)`. `steps` is a list of
`Step` objects used by the visualiser (see §3.8).

### 3.1 Validation — `validate(automaton) -> list[Issue]`
Each issue has a `severity` (`error` | `warning`), a `code`, a `message` and the affected
`stateIds` / `transitionIndices`, so the UI can highlight them.

| Code | Severity | Check |
|---|---|---|
| `NO_START` | error | No start state, or the start state doesn't exist |
| `UNKNOWN_SYMBOL` | error | A transition uses a symbol that isn't in the alphabet |
| `DANGLING_REF` | error | A transition or accepting entry points to a missing state |
| `EPSILON_NOT_ALLOWED` | error | ε-transition in an automaton not declared ENFA |
| `NONDETERMINISTIC` | error (DFA) | Two transitions from one state on the same symbol |
| `INCOMPLETE_DFA` | warning | A DFA is missing transitions (offer "add trap state") |
| `UNREACHABLE` | warning | State can't be reached from the start (BFS) |
| `DEAD_STATE` | warning | No accepting state reachable from it (reverse BFS), excluding an intentional trap |
| `NO_ACCEPTING` | warning | The language is ∅ |
| `DUPLICATE_TRANSITION` | warning | The identical transition is listed twice |
| `EMPTY_ALPHABET` | warning | The alphabet has no symbols |

### 3.2 Simulation — `simulate(automaton, input) -> Trace`
- **DFA:** follow one path. The trace is a list of `(state, symbol consumed)`. If a
  transition is missing, the string is rejected and the trace says so.
- **NFA / ε-NFA:** track the **set** of active states. Start with `ε-closure({start})`, then
  for each symbol `S ← ε-closure(move(S, a))`. Each trace step stores the active set plus the
  transitions used, so the canvas can light up every branch at once.
- ε-closure: iterative DFS with a visited set. This handles ε-cycles.
- Complexity: DFA O(n). NFA O(n · |Q|²) worst case. Fine at this scale.
- Batch mode: run many strings at once → accept/reject table (great for demos).

### 3.3 Regex → ε-NFA (Thompson's construction)
1. **Tokenise**, then **insert explicit concatenation operators**.
2. **Parse** with a small **recursive-descent parser** into an AST. It is easier to explain and
   gives better error messages than shunting-yard. Grammar:
   ```
   union   := concat ('|' concat)*
   concat  := repeat repeat*
   repeat  := atom ('*' | '+' | '?')*
   atom    := SYMBOL | 'ε' | '∅' | '(' union ')'
   ```
3. **Build** the NFA bottom-up from the AST with Thompson fragments (one start state, one
   accept state each). Each fragment is one visualisation step: "Built fragment for `a*`".
- Syntax decision: `|` means union (textbooks often write `+`). Document this in the UI and add
  a "textbook `+` = union" toggle later if you want it.
- Error handling: unbalanced parentheses, empty operand, unknown character → `400` error
  with the character position, shown inline under the regex input.
- Output size is O(|regex|).

### 3.4 ε-NFA → NFA (ε-elimination) *(optional but cheap, good for teaching)*
δ'(q, a) = ε-closure(move(ε-closure(q), a)). q is accepting if its ε-closure contains an
accepting state.

### 3.5 NFA / ε-NFA → DFA (subset construction)
- **Lazy, reachable-only** construction: a worklist starting at `ε-closure({start})`. Only
  subsets that can actually be reached get created.
- Subset states are labelled `{q0,q2}` (sorted, so the output is deterministic). The empty
  subset becomes an explicit **trap state `∅`** so the DFA is complete.
- **Safety cap:** stop at e.g. 512 DFA states and return a clear error. The construction is
  exponential in the worst case, and the cap keeps one bad input from freezing the server.
- Each step records "from subset S on symbol a → subset T (new / existing)". That builds the
  classic **subset table** the UI shows next to the graph.

### 3.6 DFA minimisation
1. Make the DFA complete (add a trap state if needed) and remove unreachable states.
2. **Partition refinement (Moore's algorithm):** start with {F, Q∖F}. Repeatedly split blocks
   whose members go to different blocks on some symbol, until nothing changes.
   - O(|Σ|·|Q|²) worst case. Fine for < 1000 states. It is also **much easier to visualise**
     than Hopcroft, because each round is one clear picture.
   - Hopcroft's O(|Σ|·|Q| log|Q|) is a stretch goal. If you add it, test that it gives the same
     result as Moore.
3. Optionally, render the **table-filling (Myhill–Nerode)** view of the same result. Examiners
   like it.
4. Each round is one step: "Round 2: block {q1,q3} split on symbol `b`".

### 3.7 Equivalence with counterexample
1. Convert both inputs to complete DFAs over the **union of their alphabets** (missing
   transitions go to a trap state).
2. **BFS over the product automaton** `(p, q)` from `(start₁, start₂)`, storing parent
   pointers.
3. The first reached pair where exactly one of p, q is accepting gives the counterexample.
   Rebuild the string from the parent pointers. **Because the search is BFS, this is a
   shortest counterexample.**
4. Return `{ equivalent: bool, counterexample: string | null, acceptedBy: "A" | "B" | null }`.
   The UI can then run the counterexample on both automata side by side. This is a strong
   demo moment.

### 3.8 Step trace protocol (shared by every algorithm)

```jsonc
{
  "index": 3,
  "title": "Subset {q0,q1} on 'b'",
  "detail": "move = {q2}; ε-closure = {q2,q3}; new DFA state",
  "highlight": { "states": ["q2","q3"], "transitions": [4,5] },
  "snapshot": { /* partial result automaton, canonical schema */ },
  "table": { /* optional: subset table rows / partition blocks */ }
}
```
The frontend has **one** `StepPlayer` component (first / previous / play / next / last, plus a
speed slider) that works for every algorithm. You write it once and every algorithm can be
visualised.

---

## 4. Folder structure

```
TOC_Project/
├── README.md                     # setup, run, demo instructions
├── docs/
│   ├── PLAN.md                   # this file
│   ├── ALGORITHMS.md             # write-ups with pseudocode (doubles as report material)
│   └── DEMO_SCRIPT.md            # 5-minute demo walkthrough
├── .github/workflows/ci.yml
│
├── backend/
│   ├── pyproject.toml
│   ├── automata_core/            # PURE engine — no FastAPI imports allowed here
│   │   ├── __init__.py
│   │   ├── model.py              # Automaton dataclass, (de)serialisation, helpers
│   │   ├── validate.py
│   │   ├── closure.py            # ε-closure, move
│   │   ├── simulate.py
│   │   ├── regex/
│   │   │   ├── lexer.py
│   │   │   ├── parser.py         # → AST
│   │   │   └── thompson.py       # AST → ε-NFA
│   │   ├── convert.py            # ε-elimination, subset construction
│   │   ├── minimize.py
│   │   ├── equivalence.py
│   │   ├── steps.py              # Step dataclass + StepRecorder helper
│   │   └── errors.py             # domain exceptions (LimitExceeded, RegexSyntaxError…)
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, exception handlers
│   │   ├── schemas.py            # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── analyze.py        # /validate, /simulate, /equivalence
│   │   │   ├── convert.py        # /regex-to-nfa, /nfa-to-dfa, /minimize, /remove-epsilon
│   │   │   └── projects.py       # Phase 5: CRUD on SQLite
│   │   └── storage.py            # Phase 5: sqlite3 wrapper
│   └── tests/
│       ├── fixtures/             # textbook automata as JSON (shared with frontend tests)
│       ├── unit/                 # one file per core module
│       ├── property/             # hypothesis-based tests
│       └── api/                  # FastAPI TestClient contract tests
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── src/
    │   ├── main.tsx / App.tsx
    │   ├── api/
    │   │   ├── client.ts         # fetch wrapper + error normalisation
    │   │   └── types.gen.ts      # generated from OpenAPI — never hand-edit
    │   ├── store/
    │   │   └── useStudioStore.ts # automaton doc, selection, sim state, undo history
    │   ├── model/
    │   │   ├── automaton.ts      # pure helpers: add/remove state, group edges, serialise
    │   │   └── layout.ts         # dagre auto-layout
    │   ├── canvas/
    │   │   ├── AutomatonCanvas.tsx
    │   │   ├── StateNode.tsx     # circle, double ring if accepting, start arrow
    │   │   ├── TransitionEdge.tsx# curved edges, self-loops, bidirectional offset
    │   │   └── canvasMapping.ts  # automaton ⇄ React Flow nodes/edges
    │   ├── panels/
    │   │   ├── Toolbar.tsx
    │   │   ├── PropertiesPanel.tsx
    │   │   ├── ValidationPanel.tsx
    │   │   ├── SimulationPanel.tsx
    │   │   ├── ConvertPanel.tsx
    │   │   └── EquivalencePanel.tsx
    │   ├── steps/
    │   │   ├── StepPlayer.tsx
    │   │   ├── SubsetTable.tsx
    │   │   └── PartitionView.tsx
    │   ├── examples/             # built-in gallery (reuses backend fixtures)
    │   └── components/ui/        # Button, Panel, Tabs, Toast…
    └── tests/
        ├── unit/                 # Vitest: model helpers, canvasMapping, store
        └── e2e/                  # Playwright: 3–4 demo flows
```

---

## 5. Phased roadmap

Time estimates assume ~8–12 focused hours a week. Adjust to your deadline. **Don't start a phase
until the previous phase's Definition of Done is met.**

### Phase 0 — Foundations (≈ 1 week)
**Goal:** both halves run, CI is green, and the schema is fixed.
- Scaffold `backend/` (FastAPI, ruff, mypy, pytest) and `frontend/` (Vite React-TS, Tailwind,
  ESLint, Prettier, Vitest).
- `GET /api/health`. The frontend calls it and shows a "backend connected" dot.
- Write the schema (§2) as Pydantic models. Generate TS types from them.
- Add 5 textbook fixtures as JSON (see §6.3).
- GitHub Actions CI running lint, type checks and tests for both halves.

**DoD**
- [ ] `npm run dev` and `uvicorn app.main:app --reload` both start. The UI shows "connected".
- [ ] CI passes on a clean clone. The README has copy-paste setup steps.
- [ ] Fixtures load and round-trip through Pydantic without changes.

### Phase 1 — Core engine (≈ 1.5–2 weeks) — *no UI work*
**Goal:** a correct, tested model with validation and simulation for all three kinds.
- `model.py`, `closure.py`, `validate.py`, `simulate.py` (+ batch).
- Endpoints `POST /api/validate` and `POST /api/simulate`.
- `steps.py` (the Step protocol) built now, even though nothing visualises it yet.

**DoD**
- [ ] Every validation code in §3.1 has at least one positive and one negative test.
- [ ] Simulation is correct on all fixtures for a hand-written accept/reject list.
- [ ] ε-cycles, empty input `""`, unknown symbols in input and empty alphabet are all tested.
- [ ] ≥ 90% line coverage on `automata_core`. `mypy --strict` is clean.
- [ ] API tests cover the happy path plus malformed JSON → `422` with a readable message.

### Phase 2 — Editor + simulation UI ★ **MVP milestone** (≈ 2–2.5 weeks)
**Goal:** a user can build an automaton visually, validate it and step through a simulation.
- Canvas: double-click to add a state, drag from a handle to add a transition, a symbol prompt
  for each new transition, delete key, right-click or panel to toggle start/accepting, rename.
- Custom `StateNode` (double ring for accepting, arrow for start) and `TransitionEdge`
  (**self-loops, curved edges in both directions between two states, grouped labels**).
  *Expect this to take the most UI time. Start it early in the phase.*
- Kind selector (DFA/NFA/ε-NFA) and alphabet editor.
- Validation panel: live (debounced ~300 ms). Clicking an issue highlights the states involved.
- Simulation panel: input string, then step / play / reset. Active state(s) glow, the used
  edge animates, the input tape shows the cursor, and the final verdict is a coloured badge.
  Batch-test table.
- Persistence: localStorage autosave, plus Import/Export JSON buttons.
- Examples menu that loads the fixtures.

**DoD**
- [ ] Draw the "ends with 01" DFA from scratch in < 1 minute without reading docs.
- [ ] Self-loops and A⇄B edges are readable and their labels don't overlap.
- [ ] Simulation of an NFA visibly shows several active states at once.
- [ ] Refreshing the page keeps your work. Export → Import gives the identical automaton.
- [ ] Vitest covers `canvasMapping` and the `automaton.ts` helpers. One Playwright test does
      draw → simulate → see "Accepted".
- [ ] **Tag `v0.1-mvp`.** From here on you always have something demo-able.

### Phase 3 — Conversions (≈ 2 weeks)
**Goal:** Regex → ε-NFA, ε-NFA → NFA, NFA → DFA and DFA minimisation, with readable output.
- Implement §3.3–§3.6 in the engine, test-first.
- Endpoints `/api/regex-to-nfa`, `/api/remove-epsilon`, `/api/nfa-to-dfa`, `/api/minimize`.
- The UI opens results in a **new tab** inside the app. Each tab is its own automaton document,
  and dagre auto-layouts it.
- A "Pipeline" button: regex → ε-NFA → DFA → min-DFA, one tab per stage.
- Show the state count before and after each conversion.

**DoD**
- [ ] Property tests (§6.2) pass for every conversion with ≥ 200 hypothesis examples.
- [ ] `(a|b)*abb` gives the textbook 4-state minimal DFA.
- [ ] Hitting the subset cap gives a friendly error, not a crash or hang.
- [ ] Regex syntax errors point to the exact character position.
- [ ] Generated automata lay out left to right with no overlapping nodes for ≤ 30 states.

**Status: done.** Notes on what differs from the plan above:
- ε-removal uses `delta'(q,c) = move(closure(q), c)` (no trailing closure), so states entered only by ε edges drop out. The textbook `(a|b)*abb` ε-NFA shrinks from 11 to 6 states.
- Subset states keep self-describing ids (`{q0,q1}`) but the UI labels them A, B, C… with a "state key"; minimised states are labelled by the merged labels (`A=C`).
- Moore (not Hopcroft) minimisation, as planned. Hopcroft remains a stretch goal.
- Every result opens in its own document tab; "Run full pipeline" opens three (ε-NFA, DFA, minimal DFA).
- Property tests default to 100 examples; run `HYPOTHESIS_PROFILE=thorough pytest tests/property` for 500.

### Phase 4 — Analysis & step-by-step visualisation (≈ 2 weeks)
**Goal:** equivalence checking with counterexamples, plus replaying any algorithm step by step.
- Implement §3.7. Build `EquivalencePanel`: pick two tabs → verdict. If they differ, show the
  counterexample with a "simulate on both" button that splits the view side by side.
- `StepPlayer` + `SubsetTable` + `PartitionView`. Wire them to Thompson, subset construction
  and minimisation.
- Optional: a table-filling (Myhill–Nerode) view for minimisation.

**DoD**
- [ ] The counterexample is always a shortest distinguishing string (property-tested).
- [ ] Equivalence holds for `A` vs `minimize(A)` and for `regex` vs `nfa_to_dfa(regex)` on
      random inputs.
- [ ] Every step of every algorithm has a human-readable `title` and `detail`.
- [ ] You can play subset construction forwards and backwards. The partial DFA, the subset
      table and the highlighted NFA states stay in sync.

**Status: done.** Notes on what differs from the plan above:
- `POST /api/equivalence` returns `{equivalent, counterexample, aAccepts, bAccepts, explored}`. Alphabets are unioned, so an automaton that has never heard of a symbol simply rejects words containing it. Counterexamples are shortest, and alphabetically first among the shortest.
- Steps now say how the result grows (`addsStates`, `addsTransitions`) and which partition they show (`round`), so one player drives all three algorithms.
- The player replays on the **input** automaton (read-only snapshot): the NFA while the DFA table fills in, the DFA being partitioned with one colour per block. Thompson instead grows the result, with unbuilt parts drawn invisibly so the layout stays put.
- Step text is shown with on-screen labels (`B`), not the backend's ids (`{q0,q1}`).
- Counterexample runs are stacked (side by side on very wide screens), because automata are laid out left to right.
- Step records are kept for the session only; they are not saved across a reload.
- Not done: a table-filling (Myhill-Nerode) view of minimisation (listed as optional above).

### Phase 5 — Persistence, polish & demo-readiness (≈ 1.5–2 weeks)
**Goal:** it feels like a product and the demo can't go wrong.
- SQLite `projects` table (`id, name, kind, json, created_at, updated_at`) and
  `/api/projects` CRUD. A "My Projects" dialog. localStorage stays as the offline fallback.
- Undo/redo (history stack in the store, capped at 100 entries).
- Keyboard shortcuts (`S` add state, `Del`, `Ctrl+Z/Y`, `Space` step simulation).
- Export as PNG/SVG (`html-to-image`) and as a transition table (Markdown/CSV).
- Dark mode, empty states, loading spinners, toasts for errors, onboarding hints.
- `docs/DEMO_SCRIPT.md` and `docs/ALGORITHMS.md` (reuse them for your report).

**DoD**
- [ ] A cold start → full demo script runs in under 5 minutes with zero console errors.
- [ ] Saved projects survive a backend restart.
- [ ] Lighthouse accessibility ≥ 90. Everything works at 1280×720 (projector resolution).
- [ ] Full Playwright suite (4–5 flows) is green in CI.
- [ ] **Tag `v1.0`.**

**Status: done, except the `v1.0` tag (create it once you are happy with a CI run on GitHub).**
Evidence for the Definition of Done:
- [x] Full demo script runs with zero console errors: `docs/DEMO_SCRIPT.md` is run as `e2e/demo.spec.ts` in about 7 seconds, and every Playwright test fails if the page logs an error.
- [x] Saved projects survive a backend restart: tested across two Python processes, and checked by killing and restarting the real server.
- [x] Accessibility: Lighthouse (desktop preset) scores **100**, and axe finds no WCAG A/AA violations on any view, dialog or theme (`e2e/a11y.spec.ts`). On Lighthouse's phone emulation the score is 97, because the layout targets 1280×720.
- [x] Everything works at 1280×720 (the viewport used by every E2E test).
- [x] Full Playwright suite green (and in CI for the previous phases).

Notes on what differs from the plan above:
- Undo history is per tab and not saved across reloads. Typing in a field merges into one step.
- Image export captures the editable canvas; it is refused with an explanation on a read-only replay.
- Moving a project between machines is by exporting the JSON file; there is no sign-in or sharing.

### Phase 6 — Extensions (only after v1.0)
- **PDA simulator:** configuration = (state, remaining input, stack). Non-determinism means BFS
  over configurations with a step/depth cap. Show the stack visually. Acceptance by final state
  or by empty stack.
- **Turing Machine simulator:** single tape, a dict-based infinite tape, step cap (e.g. 10 000)
  to handle non-halting machines, tape viewer with the head marker. Examples: aⁿbⁿcⁿ, binary
  increment.
- Others: DFA → regex (state elimination), product constructions (∪, ∩, complement), CFG → PDA.
- **Schema impact:** add `"kind": "PDA" | "TM"` and kind-specific transition fields. The
  `schemaVersion` field exists so you can migrate old files.

**Status: PDA and Turing machine simulators done.** What was built and what differs from the bullets above:
- Machines are **separate document types** (`Pda`, `Tm`) with their own engines (`automata_core/pda.py`, `tm.py`), validation and API (`/api/pda/*`, `/api/tm/*`), rather than new `kind` values of the finite-automaton schema. The finite-automaton code is untouched. They share the diagram renderer, playback controls and example-fixture mechanism.
- PDA: breadth-first search over configurations, acceptance by final state or empty stack, limits of 200 stack symbols (per branch) and 20,000 configurations, and an **Undecided** verdict when a limit cut the search short. The trace shown is the shortest accepting computation, or the closest attempt.
- Turing machine: deterministic single tape, sparse and unbounded both ways, `L`/`R`/`S` moves, accepting and rejecting states, step cap of 10,000, and a tape viewer with the head marked.
- Examples: four PDAs (aⁿbⁿ both ways, even palindromes, balanced parentheses) and four Turing machines (binary increment, aⁿbⁿcⁿ, palindromes, one that never halts).
- Not done (listed above as "Others"): DFA → regex, product constructions, CFG → PDA. Also not done: nondeterministic or multi-tape Turing machines, and saving machines to the database (they save in the browser and as JSON files).

---

## 6. Testing strategy

### 6.1 Test pyramid
| Layer | Tool | What | Target |
|---|---|---|---|
| Engine unit | pytest | Each algorithm on hand-crafted cases plus edge cases | ≥ 90% coverage |
| Engine property | hypothesis | Language-preservation invariants on random automata and regexes | ≥ 200 examples per property |
| API contract | FastAPI `TestClient` | Status codes, schemas, error shapes | Every endpoint |
| Frontend unit | Vitest + RTL | Pure model helpers, canvas mapping, store reducers | Core helpers 100% |
| E2E | Playwright | 4–5 real demo flows | Green in CI |

### 6.2 Property tests (the strongest correctness evidence for your report)
With `L(X)` checked on **every string over Σ up to length 6–8**:
- `L(nfa_to_dfa(N)) == L(N)`
- `L(remove_epsilon(E)) == L(E)`
- `L(minimize(D)) == L(D)`, `|minimize(D)| ≤ |D|`, and `minimize(minimize(D)) ≅ minimize(D)` (idempotent)
- For minimal DFAs from different routes to the same language, the **state counts are equal**
  (minimal DFAs are unique up to isomorphism)
- `regex_to_nfa(r)` accepts `w` ⇔ Python `re.fullmatch(r', w)` accepts it, where `r'` is `r`
  translated to Python syntax. **Python's `re` acts as a free, trusted oracle.**
- `equivalent(A, B)` agrees with brute-force comparison, and any counterexample really is
  accepted by exactly one of A and B.

Generators: random automata with 1–6 states, |Σ| ∈ {1, 2, 3}, random accepting sets, random
ε-edges. Random regex ASTs up to depth 4.

### 6.3 Golden fixtures (in `backend/tests/fixtures/`)
1. DFA: binary strings ending in `01`
2. DFA: binary numbers divisible by 3
3. NFA: strings over {a,b} whose 3rd-last symbol is `a` (shows exponential blow-up: 4 → 8)
4. ε-NFA: Thompson output for `(a|b)*abb` (Dragon Book example, known minimal DFA has 4 states)
5. Non-minimal DFA with equivalent and unreachable states (minimisation demo)
6. Two equivalent-looking DFAs that differ only on one string (equivalence demo)

### 6.4 Definition of Done for any feature (applies everywhere)
- Engine code is tested before the UI calls it.
- Lint, type-check and tests pass locally and in CI.
- Errors reach the user as readable messages, never a stack trace or a blank screen.
- It works on at least one built-in example and you have checked it manually in the browser.
- Docs updated if behaviour or API changed.

---

## 7. API surface (v1)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/health` | → `{status}` |
| POST | `/api/validate` | `Automaton` → `{issues[]}` |
| POST | `/api/simulate` | `{automaton, input}` → `{accepted, trace[]}` |
| POST | `/api/simulate/batch` | `{automaton, inputs[]}` → `{results[]}` |
| POST | `/api/regex-to-nfa` | `{regex}` → `{automaton, steps[]}` |
| POST | `/api/remove-epsilon` | `Automaton` → `{automaton, steps[]}` |
| POST | `/api/nfa-to-dfa` | `Automaton` → `{automaton, steps[]}` |
| POST | `/api/minimize` | `Automaton` → `{automaton, steps[]}` |
| POST | `/api/equivalence` | `{a, b}` → `{equivalent, counterexample, acceptedBy}` |
| CRUD | `/api/projects[/{id}]` | Phase 5 |

Error shape everywhere: `{ "error": { "code": "REGEX_SYNTAX", "message": "...", "position": 4 } }`.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Custom React Flow edges (self-loops, bidirectional curves) take longer than expected | Prototype `TransitionEdge` on day 1 of Phase 2; time-box to 3 days; fall back to straight edges with offset labels |
| Subset construction blow-up hangs the server | Hard state cap + request timeout; tested with fixture #3 scaled up |
| Algorithm bugs that "look right" | Property tests + `re` oracle; never trust a visual check alone |
| Scope creep (PDA/TM before MVP is solid) | Phase gates: no Phase 6 work before `v1.0` tag |
| Demo-day failure (network, backend down) | Run fully locally; backend health indicator; localStorage fallback; rehearse the demo script |
| Frontend/backend schema drift | Generated TS types + API contract tests in CI |

---

## 9. Demo storyline (what the finished app should show in ~5 minutes)
1. Load "ends with 01" DFA → simulate `1101` step by step → Accepted.
2. Type regex `(a|b)*abb` → Pipeline → ε-NFA → DFA (show the subset table in the step player)
   → minimal DFA (4 states, show partition rounds).
3. Hand-draw a slightly wrong DFA for the same language → Equivalence → counterexample `abb`
   (or similar) → simulate it on both side by side.
4. Show the validation panel catching a nondeterministic DFA and an unreachable state.
5. Save the project, reload the page, reopen it.

---

## 10. Immediate next step
Start **Phase 0**: scaffold `backend/` and `frontend/`, set up tooling and CI, write the schema
as Pydantic models, and add the fixtures. Do not start on the canvas yet.
