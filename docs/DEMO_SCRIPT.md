# Demo script (about 5 minutes)

A walkthrough that shows every major feature in order. It is also run automatically as an end-to-end test (`frontend/e2e/demo.spec.ts`), so if a step stops working the test fails.

## Before you start

```bash
# terminal 1
cd backend && .venv/bin/uvicorn app.main:app
# terminal 2
cd frontend && npm run dev
```

Open <http://localhost:5173> in a window of about 1280×720 (a projector resolution). The header should say **Backend connected**. For a clean start, clear the site data for `localhost:5173` so the first-run hints appear.

Projects are saved in `backend/data/automata.sqlite3`. Delete that file for a blank list.

## 1. Draw and simulate (0:00 – 1:15)

*Idea: a DFA is a machine that reads a string one symbol at a time.*

1. The empty canvas explains itself. Click **Try an example** → "Ends with 01" appears.
2. Point out the **start arrow**, the **double-ringed accepting state**, the curved pair of edges between `q1` and `q2`, and the self-loops.
3. Open the **Simulate** tab, type `1101`, press **Run**. Click the empty canvas (so the keyboard is not on a button), then press **Space** (or use the next-step button) to step: the active state glows and the edge just used animates; the tape shows the cursor.
4. At the end the badge reads **Accepted**. Run `110` to show **Rejected**.
5. Run the **Batch test** with the lines `01`, `10`, `0x`: the third line is reported as an error (`x` is not in the alphabet), not silently rejected.

## 2. Validation (1:15 – 1:50)

*Idea: not every drawing is a legal automaton.*

1. **Examples → Third-last symbol is a** (an NFA). Open the **Edit** tab and change **Type** to DFA.
2. Open **Validate**: an error says a state has several transitions on the same symbol, which a DFA forbids. Click the issue: the offending state and edges turn red on the canvas.
3. Change the type back to NFA; the error goes away.

## 3. Regex → ε-NFA → DFA → minimal DFA (1:50 – 3:00)

*Idea: the standard chain of constructions in a theory-of-computation course.*

1. **Convert** tab. Type `(a|b)*abb` and press **Run full pipeline**.
2. Three new tabs appear. Note the summary: *ε-NFA (14 states) → DFA (5) → minimal DFA (4)*.
3. Flip through the tabs. The DFA's states are lettered A–E; the **state key** beneath says which NFA states each letter stands for.
4. In the minimal DFA, `A=C` is a merged pair: states A and C turned out to be equivalent.
5. Type `(a|b` and press **Build ε-NFA**: the error points a caret at the problem.

## 4. Watch the algorithms run (3:00 – 3:50)

*Idea: the algorithms are not magic; you can see every step.*

1. Select the **DFA** tab, open **Steps**. The canvas shows the source NFA (read-only) while the subset table fills in one move at a time. Use the **arrow keys** or the slider.
2. Select the **minimal DFA** tab → **Steps**. States are coloured by partition block; press **Next step** and watch blocks split. The list beside it shows which blocks are new.
3. Select the **ε-NFA** tab → **Steps**: the automaton is built up fragment by fragment.

## 5. Equivalence with a counterexample (3:50 – 4:35)

*Idea: decide whether two machines accept the same language, and prove it when they don't.*

1. **Compare** tab, pick the **ε-NFA** and the **minimal DFA** from the pipeline → **Equivalent**.
2. Load **Even number of 1s** and **Even number of 1s, except rejects 00**. Check them: **Not equivalent**, shortest counterexample `00`.
3. Press **Show both runs**: both automata read `00` side by side; one ends **Accepts**, the other **Rejects**.

## 6. Keep and share your work (4:35 – 5:00)

1. Press **Ctrl+S** (or **Save**): the project is saved on the backend. Reload the page and open **Projects** to see it.
2. **Export ▾** → **Image (.png)** for a figure, or **Transition table (.md)** for a report.
3. Switch **Theme** to Dark. Press **?** to show the keyboard shortcuts.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Header says **Backend offline** | Start the backend (terminal 1). The page reconnects by itself. |
| A tab shows no steps | Steps exist only for tabs produced by a conversion, and only for the current session. |
| "Nothing to export" | Image export works on the editor canvas, not on a replay. Go back to the **Edit** tab view. |
| Odd leftovers from a previous run | Clear site data for `localhost:5173`, or use a private window. |
