import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './fixtures.ts'

const kind = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Kind of machine' }).getByRole('button', { name }).click()
const pdaMode = (page: Page) => kind(page, 'Pushdown automata')
const tmMode = (page: Page) => kind(page, 'Turing machines')
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()
const example = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Load example' }).selectOption({ label })
const nodes = (page: Page) => page.locator('.react-flow__node')
const next = (page: Page, n = 1) =>
  Promise.all(
    Array.from({ length: n }, () => page.getByRole('button', { name: 'Next step' }).click()),
  )

async function run(page: Page, input: string) {
  await tab(page, 'Run')
  await page.getByLabel('Input string').fill(input)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toBeVisible()
}

const stackNow = (page: Page) =>
  page.getByTestId('stack').locator('li span:first-child').allTextContents()

test.beforeEach(async ({ page }) => {
  await page.goto('/#/studio')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.describe('pushdown automata', () => {
  test.beforeEach(async ({ page }) => pdaMode(page))

  test('starts with a working example already drawn', async ({ page }) => {
    await expect(nodes(page)).toHaveCount(3)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      'a^n b^n (accept by final state)',
    )
    await expect(page.locator('.as-label').first()).toContainText(/,.*\//) // read,pop/push
  })

  test('accepts a^n b^n and shows the stack growing and shrinking', async ({ page }) => {
    await run(page, 'aabb')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await expect(page.getByTestId('step-card')).toContainText('Step 0 of 5')
    expect(await stackNow(page)).toEqual(['Z'])
    await next(page)
    expect(await stackNow(page)).toEqual(['A', 'Z']) // top first
    await next(page)
    expect(await stackNow(page)).toEqual(['A', 'A', 'Z'])
    await next(page, 2) // two b's pop two A's
    expect(await stackNow(page)).toEqual(['Z'])
    await expect(page.getByTestId('step-card')).toContainText('Step 4 of 5')
  })

  test('the diagram follows the run', async ({ page }) => {
    await run(page, 'ab')
    await expect(page.getByTestId('state-q0')).toHaveClass(/border-blue-600/)
    await next(page, 2) // a (stay in q0), then b moves to q1
    await expect(page.getByTestId('state-q1')).toHaveClass(/border-blue-600/)
    await expect(page.getByTestId('state-q0')).not.toHaveClass(/border-blue-600/)
  })

  test('rejects, and shows the closest attempt', async ({ page }) => {
    await run(page, 'aab')
    await expect(page.getByTestId('verdict')).toHaveText('Rejected')
    await expect(page.getByRole('region', { name: 'Result' })).toContainText(
      'closest attempt: it read 3 of 3 symbols',
    )
    await expect(page.getByRole('region', { name: 'Result' })).toContainText(
      'every possible computation was tried',
    )
  })

  test('the empty string is a valid input', async ({ page }) => {
    await run(page, '')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
  })

  test('the nondeterministic palindrome machine guesses the middle', async ({ page }) => {
    await example(page, 'Even palindromes w w^R (nondeterministic)')
    await run(page, 'abba')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await page.getByLabel('Input string').fill('abab')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Rejected')
  })

  test('acceptance by empty stack', async ({ page }) => {
    await example(page, 'a^n b^n (accept by empty stack)')
    await tab(page, 'Machine')
    await expect(page.getByLabel('Accept by')).toHaveValue('emptyStack')
    await run(page, 'aabb')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await page.getByRole('button', { name: 'Last step' }).click()
    await expect(page.getByTestId('stack')).toContainText('empty')
  })

  test('a symbol outside the alphabet is explained, not silently rejected', async ({ page }) => {
    await tab(page, 'Run')
    await page.getByLabel('Input string').fill('abx')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText("Input symbol 'x' at position 2")
    await expect(page.getByTestId('verdict')).toHaveCount(0)
  })

  test('a machine that never stops growing its stack ends as "undecided", not a hang', async ({
    page,
  }) => {
    const machine = {
      schemaVersion: 1,
      name: 'Pushes forever',
      inputAlphabet: ['a'],
      stackAlphabet: ['Z', 'A'],
      startStack: 'Z',
      acceptBy: 'finalState',
      states: [
        { id: 'q0', label: 'q0' },
        { id: 'q1', label: 'q1' },
      ],
      start: 'q0',
      accepting: ['q1'],
      transitions: [{ from: 'q0', to: 'q0', input: null, pop: null, push: 'A' }],
    }
    await page.getByLabel('Import machine file').setInputFiles({
      name: 'loop.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(machine)),
    })
    await run(page, 'a')
    await expect(page.getByTestId('verdict')).toHaveText('Undecided')
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('not a rejection')
  })

  test('editing: an unknown stack symbol is reported as a problem, and fixing it clears it', async ({
    page,
  }) => {
    await tab(page, 'Machine')
    const pop = page.getByLabel('Transition 1 pop')
    await pop.fill('Q')
    const problems = page.getByRole('region', { name: 'Problems' })
    await expect(problems).toContainText("'Q', which is not in the stack alphabet")
    await pop.fill('Z')
    await expect(problems).toContainText('No problems found.')
  })

  test('editing the machine changes what it accepts', async ({ page }) => {
    await run(page, 'ab')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await tab(page, 'Machine')
    // Delete the move that lets the machine finish after popping its last A.
    const rows = page.getByRole('region', { name: 'Transitions' }).getByRole('row')
    const count = await rows.count()
    await page.getByRole('button', { name: `Delete transition ${count - 1}` }).click()
    await tab(page, 'Run')
    await expect(page.getByTestId('verdict')).toHaveCount(0) // the old result described the old machine
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Rejected')
  })

  test('states can be added, renamed and removed, and a clashing name is refused', async ({
    page,
  }) => {
    await tab(page, 'Machine')
    await page.getByRole('button', { name: 'Add state' }).click()
    await expect(page.getByLabel('Name of state q3')).toBeVisible()
    const name = page.getByLabel('Name of state q3')
    await name.fill('q0')
    await name.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'already called' })).toBeVisible()
    await name.fill('extra')
    await name.press('Enter')
    await expect(page.getByLabel('Name of state extra')).toBeVisible()
    await expect(nodes(page)).toHaveCount(4)
    await page.getByRole('button', { name: 'Delete state extra' }).click()
    await expect(nodes(page)).toHaveCount(3)
  })

  test('export, then import the file again', async ({ page }) => {
    page.on('dialog', (d) => void d.accept())
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe('a-n-b-n-accept-by-final-state.json')
    const path = (await download.path())!
    expect(JSON.parse(readFileSync(path, 'utf8')).acceptBy).toBe('finalState')

    await example(page, 'Balanced parentheses')
    await expect(page.getByRole('button', { name: 'Undo load' })).toBeEnabled()
    await page.getByLabel('Import machine file').setInputFiles(path)
    await tab(page, 'Machine')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      'a^n b^n (accept by final state)',
    )
  })

  test('"Undo load" brings back the machine an example replaced', async ({ page }) => {
    await tab(page, 'Machine')
    await page.getByLabel('Name', { exact: true }).fill('My own machine')
    await page.getByLabel('Name', { exact: true }).press('Enter')
    await example(page, 'Balanced parentheses')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Balanced parentheses')
    await page.getByRole('button', { name: 'Undo load' }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My own machine')
  })

  test('the machine and the mode survive a reload', async ({ page }) => {
    await tab(page, 'Machine')
    await page.getByLabel('Name', { exact: true }).fill('Kept across reloads')
    await page.getByLabel('Name', { exact: true }).press('Enter')
    await page.waitForTimeout(600) // autosave is debounced
    await page.reload()
    await expect(
      page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Pushdown automata' }),
    ).toHaveAttribute('aria-current', 'true')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kept across reloads')
  })
})

test.describe('Turing machines', () => {
  test.beforeEach(async ({ page }) => tmMode(page))

  test('starts with binary increment drawn', async ({ page }) => {
    await expect(nodes(page)).toHaveCount(3)
    await expect(page.getByTestId('tape')).toHaveCount(0)
    await expect(page.getByText('Run the machine to see its tape here.')).toBeVisible()
  })

  test('adds one to a binary number and shows the tape', async ({ page }) => {
    await run(page, '1011')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await expect(page.getByTestId('output')).toHaveText('1100')
    // At the start the head is on the first input symbol.
    const cells = page.getByTestId('tape').locator('ol > li > span:nth-child(2)')
    await expect(cells.filter({ hasText: '1' }).first()).toBeVisible()
    await expect(page.getByTestId('tape').locator('[data-head]')).toHaveCount(1)
    await expect(page.getByTestId('tape')).toContainText('cell 0')
    await next(page, 2)
    await expect(page.getByTestId('tape')).toContainText('cell 2')
    await page.getByRole('button', { name: 'Last step' }).click()
    const finalCells = await page
      .getByTestId('tape')
      .locator('ol > li > span:nth-child(2)')
      .allTextContents()
    expect(
      finalCells
        .join('')
        .replace(/\s*\(head\)/g, '')
        .replace(/_/g, ''),
    ).toBe('1100')
  })

  test('the carry can write to the left of the input', async ({ page }) => {
    await run(page, '111')
    await expect(page.getByTestId('output')).toHaveText('1000')
    await page.getByRole('button', { name: 'Last step' }).click()
    await expect(page.getByTestId('tape')).toContainText('cell -1')
  })

  test('the diagram follows the run', async ({ page }) => {
    await run(page, '1')
    await expect(page.getByTestId('state-scan')).toHaveClass(/border-blue-600/)
    await page.getByRole('button', { name: 'Last step' }).click()
    await expect(page.getByTestId('state-done')).toHaveClass(/border-blue-600/)
  })

  test('a^n b^n c^n: accepts, and rejects with a reason', async ({ page }) => {
    await example(page, 'a^n b^n c^n')
    await run(page, 'aabbcc')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await page.getByLabel('Input string').fill('aabbc')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Rejected')
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('no transition from')
  })

  test('palindromes', async ({ page }) => {
    await example(page, 'Palindromes over {a,b}')
    await run(page, 'abba')
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
    await page.getByLabel('Input string').fill('abb')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Rejected')
  })

  test('a machine that never halts stops at the step limit and says what that means', async ({
    page,
  }) => {
    await example(page, 'Runs forever (step limit demo)')
    await run(page, 'a')
    await expect(page.getByTestId('verdict')).toHaveText('Step limit')
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('may run forever')
    await expect(page.getByTestId('step-card')).toContainText('Step 0 of 10000')
    await page.getByRole('button', { name: 'Last step' }).click()
    await expect(page.getByTestId('step-card')).toContainText('Step 10000 of 10000')
  })

  test('playing at a fast speed reaches the end of a long run', async ({ page }) => {
    await example(page, 'a^n b^n c^n')
    await run(page, 'aaabbbccc')
    await page.getByLabel('Speed').selectOption('Very fast')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible() // stopped by itself
    await expect(page.getByTestId('step-card')).not.toContainText('Step 0 of')
  })

  test('input symbols outside the alphabet are an error', async ({ page }) => {
    await tab(page, 'Run')
    await page.getByLabel('Input string').fill('12')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText("Input symbol '2' at position 1")
  })

  test('a nondeterministic table is reported, and a state cannot both accept and reject', async ({
    page,
  }) => {
    await tab(page, 'Machine')
    await page.getByRole('button', { name: 'Add transition' }).click()
    // The new move is "from scan, read 0": the same as the first move, so now two apply.
    await page.getByLabel('Transition 7 from').selectOption('scan')
    await page.getByLabel('Transition 7 read').fill('0')
    await expect(page.getByRole('region', { name: 'Problems' })).toContainText(
      'must be deterministic',
    )

    await page.getByLabel('done is a rejecting state').check()
    await expect(page.getByLabel('done is an accepting state')).not.toBeChecked()
    await page.getByLabel('done is an accepting state').check()
    await expect(page.getByLabel('done is a rejecting state')).not.toBeChecked()
  })

  test('a rejecting state is marked in the diagram', async ({ page }) => {
    await tab(page, 'Machine')
    await page.getByLabel('carry is a rejecting state').check()
    await expect(page.getByTestId('state-carry ✗')).toBeVisible()
  })
})

test('the machine screens never touch the finite-automata workspace', async ({ page }) => {
  await example(page, 'Ends with 01')
  await expect(nodes(page)).toHaveCount(3)
  await pdaMode(page)
  await page.keyboard.press('s') // would add a state to the hidden automaton
  await page.keyboard.press('Control+z')
  await tmMode(page)
  await page.keyboard.press('s')
  await kind(page, 'Finite automata')
  await expect(nodes(page)).toHaveCount(3)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ends with 01')
})

test('Space steps a machine run, and ? opens the shortcut list', async ({ page }) => {
  await pdaMode(page)
  await run(page, 'aabb')
  await page.getByTestId('verdict').click() // focus somewhere that is not a button
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.getByTestId('step-card')).toContainText('Step 2 of')
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})
