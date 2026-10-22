# Automata Studio

Interactive web app to build, simulate, analyse and convert DFA / NFA / ε-NFA.
See [docs/PLAN.md](docs/PLAN.md) for the full roadmap. Current status: **Phase 4 (analysis and step-by-step visualisation)**. Draw, validate and simulate
DFA/NFA/ε-NFA; convert (regex → ε-NFA → DFA → minimal DFA); replay each algorithm step by step; and
check two automata for equivalence with a shortest counterexample. See the plan for what comes next.

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
