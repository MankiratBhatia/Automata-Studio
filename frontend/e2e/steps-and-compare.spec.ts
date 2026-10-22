import { expect, test, type Page } from './fixtures.ts'

const example = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Load example' }).selectOption({ label })
const side = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()
const next = (page: Page, times = 1) =>
  Promise.all(
    Array.from({ length: times }, () => page.getByRole('button', { name: 'Next step' }).click()),
  )
const last = (page: Page) => page.getByRole('button', { name: 'Last step' }).click()

/** Replay canvas states that are actually drawn (unbuilt ones are invisible ghosts). */
const built = (page: Page) =>
  page.getByTestId('replay').locator('[data-testid^="state-"]:not(.opacity-0)')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

async function buildRegex(page: Page, regex: string) {
  await side(page, 'Convert')
  await page.getByRole('textbox', { name: 'Regular expression' }).fill(regex)
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  await expect(page.getByTestId('convert-note')).toBeVisible()
}

test('Thompson player grows the ε-NFA one fragment at a time', async ({ page }) => {
  await buildRegex(page, 'ab|c')
  await side(page, 'Steps')
  await expect(page.getByTestId('replay')).toContainText('Replay (read-only)')

  // Step 0 builds just the first symbol: two states exist.
  await expect(page.getByTestId('step-card')).toContainText("Symbol 'a'")
  await expect(built(page)).toHaveCount(2)

  await next(page, 2) // symbol b, then concatenation (joins existing parts: no new states)
  await expect(page.getByTestId('step-card')).toContainText('Concatenation: ab')
  await expect(built(page)).toHaveCount(4)

  await last(page)
  await expect(page.getByTestId('step-card')).toContainText('Done')
  await expect(built(page)).toHaveCount(8) // all of them

  // Going back to the start un-builds everything but the first fragment.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(built(page)).toHaveCount(2)
})

test('arrow keys step the player', async ({ page }) => {
  await buildRegex(page, 'ab')
  await side(page, 'Steps')
  await page.getByLabel(/Step player/).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('step-card')).toContainText('Step 2 of')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('step-card')).toContainText('Step 1 of')
})

test('subset construction: the NFA is replayed while the DFA table fills in', async ({ page }) => {
  await example(page, 'Third-last symbol is a')
  await side(page, 'Convert')
  await page.getByRole('button', { name: 'Convert to DFA' }).click()
  await expect(page.getByTestId('convert-note')).toContainText('4 NFA states → 8 DFA states.')
  await side(page, 'Steps')

  // The canvas shows the source NFA (4 states) read-only; the table starts with one row.
  await expect(built(page)).toHaveCount(4)
  const table = page.getByRole('region', { name: 'Subset construction table' })
  await expect(table.getByRole('row')).toHaveCount(2) // header + start state
  await expect(table.getByRole('rowheader').first()).toContainText('→ A')

  await next(page)
  await expect(page.getByTestId('step-card')).toContainText("A on 'a'")
  await expect(table.locator('[data-current]')).toHaveCount(1)

  await last(page)
  await expect(table.getByRole('row')).toHaveCount(9) // header + 8 DFA states
})

test('minimisation: blocks get colours on the canvas and a list in the panel', async ({ page }) => {
  await example(page, 'Non-minimal DFA (B~C, U unreachable)')
  await side(page, 'Convert')
  await page.getByRole('button', { name: 'Minimise DFA' }).click()
  await side(page, 'Steps')

  await next(page) // initial partition: accepting vs the rest
  await expect(page.getByRole('heading', { name: /Initial partition · 2 blocks/ })).toBeVisible()
  const groups = async () =>
    new Set(
      await page
        .getByTestId('replay')
        .locator('[data-group]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-group'))),
    )
  expect((await groups()).size).toBe(2)

  await last(page)
  await expect(
    page.getByRole('heading', { name: /Partition after round 2 · 4 blocks/ }),
  ).toBeVisible()
  expect((await groups()).size).toBe(4)
  await expect(page.locator('[data-block]')).toHaveCount(4)
  await expect(page.getByText('new').first()).toBeVisible()
})

test('Steps tab says so when there is nothing to replay', async ({ page }) => {
  await example(page, 'Ends with 01')
  await side(page, 'Steps')
  await expect(page.getByText('No steps to replay for this tab.')).toBeVisible()
  // The canvas is the normal editable one.
  await expect(page.getByTestId('replay')).toHaveCount(0)
})

test('equivalence: a counterexample, shown on both automata', async ({ page }) => {
  await example(page, 'Even number of 1s')
  await example(page, 'Even number of 1s, except rejects 00')
  await side(page, 'Compare')
  // The active tab is A; the other one is B.
  await page.getByRole('button', { name: 'Check equivalence' }).click()

  const result = page.getByTestId('equivalence-result')
  await expect(result).toContainText('Not equivalent')
  await expect(page.getByTestId('counterexample')).toHaveText('“00”')
  await expect(result).toContainText('A rejects it; B accepts it.')

  await page.getByRole('button', { name: 'Show both runs' }).click()
  await expect(page.getByTestId('compare-pane')).toBeVisible()
  await expect(page.getByTestId('readonly-canvas')).toHaveCount(2)
  await expect(page.getByTestId('verdict-a')).toHaveCount(0) // verdicts only once the run ends

  await last(page)
  await expect(page.getByTestId('verdict-a')).toHaveText('Rejects')
  await expect(page.getByTestId('verdict-b')).toHaveText('Accepts')

  await page.getByRole('button', { name: 'Back to editing' }).click()
  await expect(page.getByTestId('compare-pane')).toHaveCount(0)
  await expect(page.getByTestId('canvas')).toBeVisible()
})

test('equivalence: a regex automaton equals its own minimal DFA', async ({ page }) => {
  await side(page, 'Convert')
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('(a|b)*abb')
  await page.getByRole('button', { name: 'Run full pipeline' }).click()
  await expect(page.getByTestId('convert-note')).toContainText('minimal DFA (4)')
  await side(page, 'Compare')
  await page.getByLabel('Automaton B').selectOption({ label: 'Thompson: (a|b)*abb' })
  await page.getByRole('button', { name: 'Check equivalence' }).click()
  await expect(page.getByTestId('equivalence-result')).toContainText('Equivalent')
  await expect(page.getByTestId('equivalence-result')).toContainText('state pair')
  await expect(page.getByRole('button', { name: 'Show both runs' })).toHaveCount(0)
})

test('editing an automaton after a check marks the result stale', async ({ page }) => {
  await example(page, 'Even number of 1s')
  await example(page, 'Even number of 1s, except rejects 00')
  await side(page, 'Compare')
  await page.getByRole('button', { name: 'Check equivalence' }).click()
  await expect(page.getByTestId('equivalence-result')).toBeVisible()
  await expect(page.getByText(/changed since this check/)).toHaveCount(0)

  await side(page, 'Edit')
  await page.getByLabel('Name').fill('Edited')
  await side(page, 'Compare')
  await expect(page.getByText(/changed since this check/)).toBeVisible()
})

test('a symbol only one automaton knows gives a clear note, not an error', async ({ page }) => {
  // "a|b" knows the symbol b; "a" has never heard of it.
  await side(page, 'Convert')
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('a')
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('a|b')
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  await side(page, 'Compare')
  // A = "a|b" (the active tab), B = "a". Both accept "a", so the shortest difference is "b".
  await page.getByRole('button', { name: 'Check equivalence' }).click()
  await expect(page.getByTestId('counterexample')).toHaveText('“b”')
  await page.getByRole('button', { name: 'Show both runs' }).click()
  await expect(page.getByTestId('side-b')).toContainText('is not in this automaton’s alphabet')
  await last(page)
  await expect(page.getByTestId('verdict-b')).toHaveText('Rejects')
  await expect(page.getByTestId('verdict-a')).toHaveText('Accepts')
})
