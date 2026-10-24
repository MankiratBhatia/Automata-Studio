# Automata Studio

Interactive web app to build, simulate, analyse and convert DFA / NFA / ε-NFA.
See [docs/PLAN.md](docs/PLAN.md) for the full roadmap. Current status: **Phase 6 (pushdown automata and Turing machines)**, on top of the finished finite-automata studio. Draw, validate and simulate DFA/NFA/ε-NFA;
convert (regex → ε-NFA → DFA → minimal DFA); replay each algorithm step by step; check two automata
for equivalence with a shortest counterexample; save projects, undo/redo, export images and tables,
and use it in light or dark mode. A header switch also opens a **pushdown automaton** simulator (with a
stack view) and a **Turing machine** simulator (with a tape view).

More documentation: [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) (how each algorithm works, its cost and
how it is tested), [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) (a 5-minute walkthrough, also run as
an automated test) and [`docs/PLAN.md`](docs/PLAN.md) (the roadmap).

## Setup

Requires Python 3.11+ and Node 20+.

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload      # http://127.0.0.1:8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                                   # http://localhost:5173
```

The header shows **Backend connected** when the two halves talk to each other
(Vite forwards `/api/*` to port 8000).

## Checks (same as CI)

```bash
cd backend  && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy && .venv/bin/pytest
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
cd frontend && npx playwright install chromium && npm run e2e   # starts both servers itself
```

## Home page and routes

The app opens on a **home page** (`/`) that explains the project and has a **Launch Studio** button.
The studio itself is at `/#/studio`, so you can bookmark it or link straight to it. Routing uses the URL
hash, which needs no server configuration, and the browser's back button works. Clicking the
*Automata Studio* title in the studio returns to the home page.

## Using the editor

- **Add a state:** double-click empty canvas (or *Add* from a state's panel).
- **Add a transition:** drag from a state's blue dot onto another state, or onto itself for a loop.
  Type symbols such as `a, b`; in an ε-NFA, `ε` (or `eps`) is epsilon. Double-click a label to edit it.
- **Delete:** select and press Delete/Backspace.
- **Validate** tab: live issues; click one to highlight the states involved.
- **Simulate** tab: run a string and step through it, or batch-test many strings.
- **Convert** tab: regex → ε-NFA (Thompson), ε-removal, NFA → DFA (subset construction) and DFA
  minimisation. Each result opens in its own tab; *Run full pipeline* opens all three stages.
  Regex syntax: `|` union, `*` `+` `?` repeat, `( )` group, `ε` empty string, `∅` empty set, `\` escapes.
- **Steps** tab: replay the conversion that produced the current tab. Thompson grows the ε-NFA one
  fragment at a time; subset construction highlights the NFA while the DFA table fills in; minimisation
  colours the states by partition block. Arrow keys step, and the slider scrubs.
- **Compare** tab: pick two tabs and check whether they accept the same language. If not, you get a
  shortest counterexample, and *Show both runs* plays it on both automata at once.
- **Projects** / **Save** (Ctrl+S): save the current tab to the backend's SQLite database
  (`backend/data/automata.sqlite3`, or the path in `AUTOMATA_DB`) and reopen it later. A dot on a tab
  means unsaved changes. Your open tabs are also kept in the browser, so work survives even if the
  backend is down.
- **Undo / Redo** (Ctrl+Z, Ctrl+Y) per tab, up to 100 steps; a whole drag is one step.
- **Export ▾**: the automaton as JSON, the drawing as PNG or SVG, or the transition table as
  Markdown or CSV. Press **?** for all keyboard shortcuts.
- **Theme**: System, Light or Dark.
- **Pushdown automata** and **Turing machines** (the switch at the top left): each has an editor
  (states, alphabets, a transition table), a live state diagram, examples, import/export as JSON, and a
  *Run* tab that replays a computation step by step: the stack for a PDA, the tape and head for a Turing
  machine. A PDA is searched nondeterministically and reports **Undecided** (not "Rejected") if a limit
  stopped the search; a Turing machine stops after 10,000 steps with **Step limit**. These screens save
  to the browser and by file; they are not part of *Projects*.
- Work autosaves in the browser. *Export* / *Import* use the JSON format in `docs/PLAN.md`.

## API types

Frontend types are generated from the backend's OpenAPI document. After changing any
request/response model in `backend/app/schemas.py`, run `npm run gen:api` in `frontend/` and
commit `openapi.json` and `src/api/types.gen.ts`.

## Layout

- `backend/automata_core/` – pure algorithm engine (no web imports)
- `backend/app/` – FastAPI layer and Pydantic schema (`schemas.py` is the canonical automaton format)
- `backend/tests/fixtures/` – textbook automata as JSON, with accept/reject expectations
- `frontend/src/` – React + TypeScript UI
