# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Automata Studio: a web app to build, simulate, analyse and convert DFA / NFA / ε-NFA (regex → ε-NFA → DFA → minimal DFA, equivalence checking with counterexamples, step-by-step algorithm replay). Python/FastAPI backend plus React/TypeScript/React Flow frontend. `docs/PLAN.md` is the phased roadmap (Phases 0–6 done). `docs/ALGORITHMS.md` explains each algorithm; `docs/DEMO_SCRIPT.md` is run as an E2E test. `README.md` has setup and user-facing usage.

## Commands

Backend (`cd backend`; uses `.venv`, not on PATH):
```bash
.venv/bin/uvicorn app.main:app --reload            # API on :8000
.venv/bin/pytest                                   # all tests (pyproject already sets `-q`: don't pass another, it hides the summary line)
.venv/bin/pytest tests/unit/test_minimize.py::test_name
HYPOTHESIS_PROFILE=thorough .venv/bin/pytest tests/property   # 500 examples instead of 100
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy   # mypy is --strict
```

Frontend (`cd frontend`). On this WSL machine Node lives in `~/.local/node/bin`; `export PATH=$HOME/.local/node/bin:$PATH` first (the only `npm` otherwise visible is the Windows one):
```bash
npm run dev                          # :5173, proxies /api to :8000
npm run lint                         # oxlint (not ESLint)
npm run format:check                 # Prettier; `npx prettier --write src e2e` to fix
npm run typecheck && npm test        # Vitest; single file: npx vitest run src/model/replay.test.ts
npm run build
npm run e2e                          # Playwright; starts backend + Vite itself. One test: npx playwright test -g "name"
                                     # Includes axe accessibility checks (e2e/a11y.spec.ts). The backend gets a temp DB (AUTOMATA_DB).
npm run gen:api                      # regenerate src/api/types.gen.ts + openapi.json from the backend
```
CI (`.github/workflows/ci.yml`) runs all of the above for both halves. It does **not** check that generated API types are current: after changing anything in `backend/app/schemas.py`, run `gen:api` and commit both generated files.

## Architecture

**Engine first.** `backend/automata_core/` is a pure-Python algorithm package and must never import FastAPI/Pydantic. `backend/app/` is a thin translation layer (`schemas.py` Pydantic models ↔ core dataclasses via `adapters.py`; routers; exception handlers in `main.py`). The frontend never re-implements an algorithm; it renders results and step traces the backend returns. Domain errors (`automata_core/errors.py`) are mapped to a uniform `{"error": {code, message, position?, issues?}}` body with HTTP 400; request-shape problems are 422 in the same shape.

**One canonical automaton JSON** used everywhere (API, files, localStorage): `symbol: null` means ε; `position` is UI-only and ignored by the engine; `kind` is what the user *declares* and validation checks the structure against it; one transition record per symbol (the UI merges records with the same endpoints into one drawn edge). Transition order is meaningful: step highlights refer to transitions by **index**.

**Conversions return a `Conversion`** (`automata_core/steps.py`): result automaton + `steps` + optional `state_map` (subset construction, minimisation) + `rounds` (minimisation partitions). A `Step` has highlight fields (which refer to the algorithm's *input* automaton, except regex which has none) and keyword-only `adds_states` / `adds_transitions` / `round` describing how the *result* grows. One frontend player (`model/replay.ts`, `panels/StepsPanel.tsx`) drives all algorithms from these.

**ids vs labels.** The backend names result states after what they mean (`{q0,q1}`, `B=C`). The frontend keeps those as `id` but chooses the displayed `label` in `model/labels.ts` (`relabelResult`: A, B, C… for subset states, merged labels for minimised ones) and rewrites step text to match (`friendlyText`). Pipeline stages are fed the *relabelled* previous result so labels carry through.

**Safety limits and determinism.** Subset construction stops at 512 DFA states (`LimitExceededError`); request sizes are capped in `schemas.py`. Engine output must not depend on set/dict iteration order (tests run across hash seeds; sort anything derived from a set).

**Saved projects.** `backend/app/storage.py` is a one-table SQLite store (id, name, kind, json, timestamps). It opens a short-lived connection per call and reads `AUTOMATA_DB` every time, so tests (autouse fixture in `tests/conftest.py`) and E2E (`playwright.config.ts`) redirect it to a temp file and never touch real saved work. E2E tests that save projects must name them `E2E ...` and only delete those.
**Machines (PDA / Turing).** Separate document types, not `kind`s of `Automaton`: `automata_core/pda.py` and `tm.py` (pure engines; PDA = breadth-first search with stack/config limits and a `limit` verdict that is *not* a rejection; TM = sparse-dict tape with a 10,000-step cap), `schemas.Pda` / `schemas.Tm`, `routers/machines.py`. Example machines are JSON in `backend/tests/fixtures/machines/` (+ `expectations.json`), shared with the frontend like the FA fixtures. Tests compare engines with independent oracles and with plain-Python language predicates (`tests/machines.py`).
**Tests.** `backend/tests/fixtures/*.json` plus `expectations.json` (accept/reject lists) are shared with the frontend: `src/examples/index.ts` imports them via `import.meta.glob` (hence `server.fs.allow` in `vite.config.ts`), so the example gallery, backend tests and E2E tests all use the same automata. Property tests (`tests/property`) check every construction against brute-force language comparison and Python's `re`; they are the main correctness evidence.

### Frontend

- **One Zustand store** (`src/store/useStudioStore.ts`) holds a multi-document workspace: `tabs` + `activeTabId`, with `doc` mirroring the active tab. The active tab's entry in `tabs` may be stale; always go through `syncedTabs` / `selectWorkspace` / `docOfTab`. Per-tab step data lives in `records[tabId]` (session-only, not persisted). Workspace autosaves to localStorage (`store/persistence.ts`, with migration from the Phase 2 single-doc key).
- **Never write a selector that returns a new array/object each call** (e.g. `selectWorkspace(s).tabs`): Zustand re-renders forever. Select raw fields and derive with `useMemo`.
- **Pure model code** (`src/model/*`: automaton helpers, layout via dagre, serialize/parse, labels, replay) holds the logic and carries the unit tests; components stay thin.
- **Undo/redo** is a per-tab history stack inside the store (`history[tabId]`, capped at 100). Every undoable change goes through `edit(next, key?)`; edits with the same `key` within a second merge (typing a label). Pure moves are *not* undoable by themselves: the canvas calls `beginMove()` on drag start so a whole drag is one step.
- **Canvas element identity matters.** React Flow treats a new node object as changed and re-measures it, which makes attached edges vanish for a frame (and breaks double-click on labels). `AutomatonCanvas` therefore runs `toFlow` output through `stabilize()` and feeds React Flow's measured sizes back into the nodes. Keep it that way when touching the canvas.
- **Shortcuts** live in `src/shortcuts.ts` (`handleShortcut`, testable without rendering); dialogs use the shared `components/Modal` (focus trap, Escape, focus restore). Theme is `src/theme.ts` (a `dark` class on `<html>`; Tailwind's `dark:` variant is wired to it in `index.css`). Image export (`canvas/exportImage.ts`) must re-attach the shared arrowhead `<marker>` to the cloned viewport, or every exported edge loses its arrow.
- **Playwright specs import `test` from `e2e/fixtures.ts`**, which fails any test whose page logs a console error or throws (4xx API responses are the only exception).
- **Routing and the home page.** There is no router library: `src/route.ts` is a tiny hash router (`/#/` = home, `/#/studio` = studio; unknown hashes mean home) and `Root.tsx` renders `LandingPage` or the untouched `App`. In-page links on the home page must not use `#anchors` (they would change the route); they scroll with `scrollIntoView` instead. Everything the landing page claims lives in `landing/content.ts` and must describe a feature that exists and is tested; the hero animation's trace there is checked against the backend by `e2e/landing.spec.ts`. The hero reuses `ReadOnlyCanvas` with `interactive={false}` so the wheel scrolls the page.
- **Machine screens.** `mode.ts` picks finite automata / PDA / TM; `App` renders `PdaApp` or `TmApp` (src/machines/) instead of the FA workspace, with their own small store (`useMachineStore`: machines, runs, validation) and localStorage persistence. A machine is drawn by converting it to a plain pseudo-automaton (`model/machines.ts` `pdaDiagram`/`tmDiagram`, one multi-line label per pair of states) and reusing `ReadOnlyCanvas`. `handleShortcut` hands off to a machine-only handler when `mode !== 'fa'`, so keys never edit the hidden finite automaton.
- **Canvas.** `canvas/canvasMapping.ts` turns an automaton + a `CanvasView` into React Flow nodes/edges (grouping, curve/loop decisions, ghosts for unbuilt parts, partition groups). Edges are "floating": `TransitionEdge` ignores handles and draws between circle boundaries using the pure geometry in `canvas/edgeGeometry.ts`. `AutomatonCanvas` is the editable canvas; `ReadOnlyCanvas` serves replay and the side-by-side comparison. Don't use React Flow's `fitView` prop on the editable canvas (it re-fits when the first node is added and moves the canvas under the user); fit on `loadId` changes instead.

## Gotchas

- E2E tests enter the studio with `page.goto('/#/studio')`; `/` is the home page.
- Don't stop servers with `pkill -f <pattern>`: the pattern appears in the shell's own command line and kills it. Stop by port (`ss -ltnp | grep :5173`).
- First Vite load after installing a dependency re-optimises and reloads the page, which can wipe in-flight state in browser tests; reload once before testing.
- Prettier rewraps code, so scripted string replacements against previously written files can silently miss; verify the edit landed.
- `frontend/.npmrc` sets `legacy-peer-deps=true` (openapi-typescript peers on TypeScript 5); peers such as `@testing-library/dom` must then be installed explicitly.
