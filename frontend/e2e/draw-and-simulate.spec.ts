import { expect, test, type Page } from './fixtures.ts'

/** Drag from a state's connection dot onto another state (or itself). */
async function connect(page: Page, from: string, to: string) {
  const source = page.getByTestId(`state-${from}`)
  await source.hover()
  const dot = await source.locator('.react-flow__handle-right').boundingBox()
  const target = await page.getByTestId(`state-${to}`).boundingBox()
  if (!dot || !target) throw new Error('missing handle or target')
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })
  await page.mouse.up()
}

async function setSymbols(page: Page, text: string) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill(text)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
}

/** Open the Export menu and pick one of its items. */
async function exportAs(page: Page, item: string) {
  await page.getByRole('button', { name: /^Export/ }).click()
  await page.getByRole('button', { name: item }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('draw a DFA from scratch, validate it, simulate a string, see Accepted', async ({ page }) => {
  // "Strings over {a,b} that end in a": q0 --a--> q1, q1 is accepting.
  const canvas = page.getByTestId('canvas')
  const box = (await canvas.boundingBox())!
  await canvas.dblclick({ position: { x: 200, y: box.height / 2 } })
  await canvas.dblclick({ position: { x: 520, y: box.height / 2 } })
  await expect(page.getByTestId('state-q0')).toBeVisible()
  await expect(page.getByTestId('state-q1')).toBeVisible()

  await connect(page, 'q0', 'q1')
  await setSymbols(page, 'a')
  await connect(page, 'q0', 'q0')
  await setSymbols(page, 'b')
  await connect(page, 'q1', 'q1')
  await setSymbols(page, 'a')
  await connect(page, 'q1', 'q0')
  await setSymbols(page, 'b')

  // Make q1 accepting from the Edit panel.
  await page.getByTestId('state-q1').click()
  await page.getByLabel('Accepting state').check()

  // Validation is clean: no badge on the tab and an all-clear message.
  await page.getByRole('tab', { name: 'Validate' }).click()
  await expect(page.getByText('Valid — no issues found.')).toBeVisible()

  // Simulate "bba" step by step.
  await page.getByRole('tab', { name: 'Simulate' }).click()
  await page.getByLabel('Input string').fill('bba')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByText('Step 0 of 3')).toBeVisible()
  await expect(page.getByTestId('verdict')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Accepted')

  // And a string that must be rejected.
  await page.getByLabel('Input string').fill('ab')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Rejected')
})

test('work survives a page refresh', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Load example' }).selectOption({ label: 'Ends with 01' })
  await expect(page.getByTestId('state-q2')).toBeVisible()
  await page.waitForTimeout(600) // autosave is debounced
  await page.reload()
  await expect(page.getByTestId('state-q2')).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue('Ends with 01')
})

test('an NFA shows several active states at once', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: 'Third-last symbol is a' })
  await page.getByRole('tab', { name: 'Simulate' }).click()
  await page.getByLabel('Input string').fill('aa')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.getByText('{q0, q1, q2}', { exact: false }).first()).toBeVisible()
  await expect(
    page.locator('.react-flow__node').filter({ has: page.locator('.ring-blue-400\\/50') }),
  ).toHaveCount(3)
})

test('a validation issue can be clicked to highlight the states involved', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: 'Non-minimal DFA (B~C, U unreachable)' })
  await page.getByRole('tab', { name: 'Validate' }).click()
  const issue = page.getByRole('button', { name: /Unreachable from the start state: U/ })
  await issue.click()
  await expect(issue).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('state-U')).toHaveClass(/border-red-500/)
})

test('export then import gives the same automaton', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: '(a|b)*abb (Thompson)' })
  await expect(page.getByTestId('state-10')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportAs(page, 'Automaton file (.json)'),
  ])
  const path = await download.path()

  // Clear the canvas so the import has to bring everything back.
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Untitled')
  await expect(page.locator('.react-flow__node')).toHaveCount(0)

  await page.getByLabel('Import automaton file').setInputFiles(path)
  await expect(page.getByLabel('Name')).toHaveValue('(a|b)*abb (Thompson)')
  await expect(page.locator('.react-flow__node')).toHaveCount(11)
  await expect(page.locator('.react-flow__edge')).toHaveCount(13)
})

test('a bad import shows a readable error', async ({ page }) => {
  await page.getByLabel('Import automaton file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"nope": true}'),
  })
  await expect(page.getByRole('alert')).toContainText('Could not import bad.json')
})
