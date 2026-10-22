import { expect, test, type Page } from './fixtures.ts'

// docs/DEMO_SCRIPT.md as an automated test. The fixtures file fails any test whose page logs a
// console error or throws, so "runs cleanly" is checked along with "does the right thing".
// The Definition of Done asks for the whole script in under five minutes; a person takes
// about five, so the machine budget below is generous but real.

const side = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()
const nav = (page: Page) => page.getByRole('navigation', { name: 'Open automata' })
const docTab = (page: Page, name: string) => nav(page).getByRole('button', { name, exact: true })
const example = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Load example' }).selectOption({ label })
const nodes = (page: Page) => page.locator('.react-flow__node')

test.beforeEach(async ({ page, request }) => {
  for (const p of (await (await request.get('/api/projects')).json()) as {
    id: string
    name: string
  }[]) {
    if (p.name.startsWith('E2E ')) await request.delete(`/api/projects/${p.id}`)
  }
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('the whole demo script runs cleanly, in well under five minutes', async ({ page }) => {
  test.setTimeout(120_000)
  const started = Date.now()

  // 1. Draw and simulate
  await expect(page.getByRole('heading', { name: 'Start an automaton' })).toBeVisible()
  await page.getByRole('button', { name: 'Try an example' }).click()
  await expect(nodes(page)).toHaveCount(3)
  await side(page, 'Simulate')
  await page.getByLabel('Input string').fill('1101')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByTestId('canvas').click({ position: { x: 300, y: 450 } })
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space')
  await expect(page.getByTestId('verdict')).toHaveText('Accepted')
  await page.getByLabel('Input string').fill('110')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Rejected')
  await page.getByLabel(/Batch inputs/).fill('01\n10\n0x')
  await page.getByRole('button', { name: 'Run all' }).click()
  const table = page.getByRole('table')
  await expect(table.getByRole('row').nth(1)).toContainText('Accepted')
  await expect(table.getByRole('row').nth(2)).toContainText('Rejected')
  await expect(table.getByRole('row').nth(3)).toContainText('not in the alphabet')

  // 2. Validation: a nondeterministic "DFA"
  await example(page, 'Third-last symbol is a')
  await side(page, 'Edit')
  await page.getByLabel('Type').selectOption('DFA')
  await side(page, 'Validate')
  const issue = page.getByRole('button', { name: /several transitions on 'a'/ })
  await expect(issue).toBeVisible()
  await issue.click()
  await expect(page.getByTestId('state-q0')).toHaveClass(/border-red-500/)
  await side(page, 'Edit')
  await page.getByLabel('Type').selectOption('NFA')
  await side(page, 'Validate')
  await expect(page.getByRole('button', { name: /several transitions on 'a'/ })).toHaveCount(0)

  // 3. Regex pipeline
  await side(page, 'Convert')
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('(a|b)*abb')
  await page.getByRole('button', { name: 'Run full pipeline' }).click()
  await expect(page.getByTestId('convert-note')).toContainText(
    'ε-NFA (14 states) → DFA (5) → minimal DFA (4)',
  )
  await expect(nodes(page)).toHaveCount(4)
  await expect(page.getByTestId('state-A=C')).toBeVisible() // A and C turned out equivalent
  await docTab(page, 'Thompson: (a|b)*abb (DFA)').click()
  await expect(page.getByRole('region', { name: 'State key' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('(a|b')
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  await expect(page.getByRole('alert').locator('pre')).toHaveText('(a|b\n    ^')

  // 4. Watch the algorithms run
  await side(page, 'Steps')
  await expect(page.getByRole('region', { name: 'Subset construction table' })).toBeVisible()
  await page.getByLabel(/Step player/).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('step-card')).toContainText('Step 2 of')
  await docTab(page, 'Thompson: (a|b)*abb (DFA) (minimal)').click()
  await side(page, 'Steps')
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.getByRole('heading', { name: /Initial partition · 2 blocks/ })).toBeVisible()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.locator('[data-block]')).toHaveCount(4)
  await docTab(page, 'Thompson: (a|b)*abb').click()
  await side(page, 'Steps')
  await expect(page.getByTestId('step-card')).toContainText("Symbol 'a'")

  // 5. Equivalence
  await side(page, 'Compare')
  await page.getByLabel('Automaton A').selectOption({ label: 'Thompson: (a|b)*abb' })
  await page
    .getByLabel('Automaton B')
    .selectOption({ label: 'Thompson: (a|b)*abb (DFA) (minimal)' })
  await page.getByRole('button', { name: 'Check equivalence' }).click()
  await expect(page.getByTestId('equivalence-result')).toContainText('Equivalent')
  await example(page, 'Even number of 1s')
  await example(page, 'Even number of 1s, except rejects 00')
  await side(page, 'Compare')
  await page.getByLabel('Automaton A').selectOption({ label: 'Even number of 1s' })
  await page
    .getByLabel('Automaton B')
    .selectOption({ label: 'Even number of 1s, except rejects 00' })
  await page.getByRole('button', { name: 'Check equivalence' }).click()
  await expect(page.getByTestId('counterexample')).toHaveText('“00”')
  await page.getByRole('button', { name: 'Show both runs' }).click()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.getByTestId('verdict-a')).toHaveText('Accepts')
  await expect(page.getByTestId('verdict-b')).toHaveText('Rejects')
  await page.getByRole('button', { name: 'Back to editing' }).click()

  // 6. Keep and share your work
  await side(page, 'Edit')
  await page.getByLabel('Name', { exact: true }).fill('E2E Demo project')
  await page.keyboard.press('Control+s')
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved “E2E Demo project”.' }),
  ).toBeVisible()
  await page.waitForTimeout(600) // the workspace autosave is debounced
  await page.reload()
  await page.getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByRole('dialog', { name: 'My projects' })).toContainText('E2E Demo project')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Export/ }).click()
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Image (.png)' }).click(),
  ])
  expect(png.suggestedFilename()).toBe('e2e-demo-project.png')
  await page.getByLabel('Theme').selectOption('dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()

  expect(Date.now() - started, 'the demo should take far less than 5 minutes').toBeLessThan(
    5 * 60_000,
  )
})
