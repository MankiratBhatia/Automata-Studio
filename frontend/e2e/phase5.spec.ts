import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from './fixtures.ts'

const example = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Load example' }).selectOption({ label })
const side = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()
const nodes = (page: Page) => page.locator('.react-flow__node')
const docTab = (page: Page, name: string | RegExp) =>
  page
    .getByRole('navigation', { name: 'Open automata' })
    .getByRole('button', { name, exact: typeof name === 'string' })
/** Wait until an element has stopped moving (e.g. while the canvas animates to fit). */
async function settled(locator: Locator) {
  let last = ''
  await expect
    .poll(async () => {
      const now = JSON.stringify(await locator.boundingBox())
      const stable = now === last
      last = now
      return stable
    })
    .toBe(true)
}
const exportAs = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /^Export/ }).click()
  await page.getByRole('button', { name: item }).click()
}

// Saved-project tests only ever touch projects they created, named "E2E ...", so a developer's
// real saved work is safe even if these run against a server that was already running.
test.beforeEach(async ({ page, request }) => {
  const all = await (await request.get('/api/projects')).json()
  for (const p of all as { id: string; name: string }[]) {
    if (p.name.startsWith('E2E ')) await request.delete(`/api/projects/${p.id}`)
  }
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('guided empty state: "Try an example" loads one', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Start an automaton' })).toBeVisible()
  await page.getByRole('button', { name: 'Try an example' }).click()
  await expect(nodes(page)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Start an automaton' })).toHaveCount(0)
})

test('first-run tip can be dismissed for good', async ({ page }) => {
  await example(page, 'Ends with 01')
  await expect(page.getByText('drag from a state’s blue dot to connect states')).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('drag from a state’s blue dot')).toHaveCount(0)
  await page.reload()
  await example(page, 'Ends with 01')
  await expect(page.getByText('drag from a state’s blue dot to connect states')).toHaveCount(0)
})

test.describe('undo and redo', () => {
  test('S adds states, Ctrl+Z / Ctrl+Y walk through them', async ({ page }) => {
    await page.keyboard.press('s')
    await page.keyboard.press('s')
    await page.keyboard.press('s')
    await expect(nodes(page)).toHaveCount(3)
    await page.keyboard.press('Control+z')
    await expect(nodes(page)).toHaveCount(2)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+y')
    await expect(nodes(page)).toHaveCount(2)
    await page.keyboard.press('Control+Shift+z')
    await expect(nodes(page)).toHaveCount(3)
  })

  test('the toolbar buttons mirror the shortcuts and disable when there is nothing to do', async ({
    page,
  }) => {
    const undo = page.getByRole('button', { name: 'Undo' })
    const redo = page.getByRole('button', { name: 'Redo' })
    await expect(undo).toBeDisabled()
    await page.getByRole('button', { name: '+ State' }).click()
    await expect(nodes(page)).toHaveCount(1)
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()
    await undo.click()
    await expect(nodes(page)).toHaveCount(0)
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(nodes(page)).toHaveCount(1)
  })

  test('a whole drag is one undo step', async ({ page }) => {
    await example(page, 'Ends with 01')
    const node = page.getByTestId('state-q1')
    await settled(node) // the view animates to fit the new automaton; wait for it to stop
    const before = (await node.boundingBox())!
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    await page.mouse.move(before.x + 120, before.y + 90, { steps: 12 })
    await page.mouse.up()
    const moved = (await node.boundingBox())!
    expect(Math.abs(moved.x - before.x)).toBeGreaterThan(60)

    await page.keyboard.press('Control+z')
    const back = (await node.boundingBox())!
    expect(Math.abs(back.x - before.x)).toBeLessThan(2)
    expect(Math.abs(back.y - before.y)).toBeLessThan(2)
  })

  test('typing in a field keeps its own undo: the shortcut does not touch the canvas', async ({
    page,
  }) => {
    await page.keyboard.press('s')
    await side(page, 'Edit')
    const name = page.getByLabel('Name', { exact: true })
    await name.fill('Typed name')
    await name.press('Control+z')
    await expect(nodes(page)).toHaveCount(1) // the state was not undone
  })
})

test.describe('saved projects', () => {
  async function rename(page: Page, name: string) {
    await side(page, 'Edit')
    await page.getByLabel('Name').fill(name)
  }

  test('save, see it listed, reopen it from the list, then delete it', async ({ page }) => {
    await example(page, 'Ends with 01')
    await rename(page, 'E2E Saved demo')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Saved “E2E Saved demo”.' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Projects' }).click()
    const dialog = page.getByRole('dialog', { name: 'My projects' })
    await expect(dialog.getByText('E2E Saved demo')).toBeVisible()
    await expect(dialog.getByText('open', { exact: true })).toBeVisible() // it is open in a tab
    await page.keyboard.press('Escape')

    // Close the tab, then bring the project back from the list.
    await page.getByRole('button', { name: /^Close E2E Saved demo/ }).click()
    await expect(nodes(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Projects' }).click()
    await dialog.getByRole('button', { name: 'Open E2E Saved demo' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(nodes(page)).toHaveCount(3)
    await expect(docTab(page, 'E2E Saved demo')).toHaveAttribute('aria-current', 'true')

    // Delete takes two clicks.
    await page.getByRole('button', { name: 'Projects' }).click()
    await dialog.getByRole('button', { name: 'Delete E2E Saved demo' }).click()
    await expect(dialog.getByText('E2E Saved demo')).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm delete E2E Saved demo' }).click()
    await expect(dialog.getByText('E2E Saved demo')).toHaveCount(0)
  })

  test('the saved copy is exactly what the API stores, and survives a reload', async ({
    page,
    request,
  }) => {
    await example(page, 'Third-last symbol is a')
    await rename(page, 'E2E Stored check')
    await page.keyboard.press('Control+s')
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()

    const list = (await (await request.get('/api/projects')).json()) as {
      id: string
      name: string
      kind: string
    }[]
    const mine = list.find((p) => p.name === 'E2E Stored check')!
    expect(mine.kind).toBe('NFA')
    const stored = await (await request.get(`/api/projects/${mine.id}`)).json()
    expect(stored.automaton.states).toHaveLength(4)

    await page.waitForTimeout(600) // autosave of the workspace is debounced
    await page.reload()
    await expect(docTab(page, 'E2E Stored check')).toBeVisible() // still linked after the reload
  })

  test('an unsaved-changes dot appears after an edit and goes away on save', async ({ page }) => {
    await example(page, 'Ends with 01')
    await rename(page, 'E2E Dirty check')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(docTab(page, 'E2E Dirty check')).toBeVisible()
    await page.getByTestId('state-q0').click()
    await page.getByLabel('Accepting state').check()
    await expect(docTab(page, 'E2E Dirty check (unsaved changes)')).toBeVisible()
    await page.keyboard.press('Control+s')
    await expect(docTab(page, 'E2E Dirty check')).toBeVisible()
  })

  test('saving an empty canvas explains why nothing happened', async ({ page }) => {
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Nothing to save yet. Add a state first.')).toBeVisible()
  })

  test('the dialog is empty-state friendly and traps focus', async ({ page }) => {
    await page.getByRole('button', { name: 'Projects' }).click()
    const dialog = page.getByRole('dialog', { name: 'My projects' })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('exports', () => {
  test('Markdown transition table', async ({ page }) => {
    await example(page, 'Ends with 01')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportAs(page, 'Transition table (.md)'),
    ])
    expect(download.suggestedFilename()).toBe('ends-with-01-table.md')
    const text = readFileSync((await download.path())!, 'utf8')
    expect(text).toContain('| State | 0 | 1 |')
    expect(text).toContain('| → q0 | q1 | q0 |')
    expect(text).toContain('| * q2 | q1 | q0 |')
  })

  test('CSV transition table opens cleanly in a spreadsheet', async ({ page }) => {
    await example(page, 'Third-last symbol is a')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportAs(page, 'Transition table (.csv)'),
    ])
    const text = readFileSync((await download.path())!, 'utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff) // byte-order mark, so Excel reads UTF-8
    expect(text).toContain('→ q0,"{q0, q1}",{q0}')
  })

  test('PNG image of the whole drawing', async ({ page }) => {
    await example(page, '(a|b)*abb (Thompson)')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportAs(page, 'Image (.png)'),
    ])
    expect(download.suggestedFilename()).toBe('a-b-abb-thompson.png')
    const bytes = readFileSync((await download.path())!)
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    expect(width).toBeGreaterThan(600)
    expect(height).toBeGreaterThan(200)
  })

  test('SVG image contains the states and labels', async ({ page }) => {
    await example(page, 'Ends with 01')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportAs(page, 'Image (.svg)'),
    ])
    const text = readFileSync((await download.path())!, 'utf8')
    expect(text).toContain('<svg')
    expect(text).toContain('q2')
    // Regression: the arrowhead definition once stayed behind, so every edge lost its arrow.
    expect(text).toContain('<marker')
    expect(text).toContain('url(#as-arrow)')
  })

  test('an image of an empty canvas is refused with an explanation', async ({ page }) => {
    await exportAs(page, 'Image (.png)')
    await expect(page.getByRole('alert')).toContainText('nothing to export')
  })

  test('an image cannot be taken from the read-only replay, and says why', async ({ page }) => {
    await side(page, 'Convert')
    await page.getByRole('textbox', { name: 'Regular expression' }).fill('ab')
    await page.getByRole('button', { name: 'Build ε-NFA' }).click()
    await side(page, 'Steps')
    await exportAs(page, 'Image (.png)')
    await expect(page.getByRole('alert')).toContainText('Go back to the editor')
  })
})

test.describe('theme', () => {
  const isDark = (page: Page) =>
    page.evaluate(() => document.documentElement.classList.contains('dark'))
  const choose = (page: Page, value: string) => page.getByLabel('Theme').selectOption(value)

  test('Dark and Light override the system, and the choice is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await choose(page, 'dark')
    expect(await isDark(page)).toBe(true)
    await page.reload()
    expect(await isDark(page)).toBe(true)
    await choose(page, 'light')
    expect(await isDark(page)).toBe(false)
  })

  test('System follows the operating system, live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    expect(await isDark(page)).toBe(true)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => isDark(page)).toBe(false)
  })

  test('in dark mode the page background is actually dark', async ({ page }) => {
    await choose(page, 'dark')
    // Tailwind reports colours as oklch(...), so read the real pixel colour via a canvas.
    const [r, g, b] = await page.evaluate(() => {
      const css = getComputedStyle(document.querySelector('#root > div')!).backgroundColor
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data]
    })
    expect(r + g + b).toBeLessThan(150) // slate-900 is (15, 23, 42)
  })
})

test('? opens the shortcut list and Escape closes it', async ({ page }) => {
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Ctrl+Z')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('Space steps a simulation once focus is off the buttons', async ({ page }) => {
  await example(page, 'Ends with 01')
  await side(page, 'Simulate')
  await page.getByLabel('Input string').fill('0101')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByText('Step 0 of 4')).toBeVisible()
  await page.getByTestId('canvas').click({ position: { x: 300, y: 450 } }) // focus the canvas
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.getByText('Step 2 of 4')).toBeVisible()
})

test.describe('editing on the canvas', () => {
  test('double-clicking a transition label edits its symbols', async ({ page }) => {
    await example(page, 'Ends with 01')
    await page.locator('.as-label').first().dblclick()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Transition q0 → q1')
    await dialog.getByRole('textbox').fill('1')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await nodes(page).count()).toBe(3) // and the double-click did not add a state
    await expect(page.locator('.as-label').first()).toHaveText('1')
  })

  test('selecting a state or a transition does not re-create the drawing', async ({ page }) => {
    // Regression: handing React Flow fresh node objects made every edge vanish and reappear
    // on each click, which also swallowed the second click of a double-click.
    await example(page, 'Ends with 01')
    await settled(page.getByTestId('state-q1'))
    await page.evaluate(() => {
      document
        .querySelectorAll('.react-flow__edge, .react-flow__node, .as-label')
        .forEach((e) => ((e as unknown as { __kept: boolean }).__kept = true))
    })
    const kept = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('.react-flow__edge, .react-flow__node, .as-label')].filter(
            (e) => (e as unknown as { __kept?: boolean }).__kept,
          ).length,
      )
    const total = await page.evaluate(
      () => document.querySelectorAll('.react-flow__edge, .react-flow__node, .as-label').length,
    )
    await page.getByTestId('state-q1').click()
    await page.locator('.as-label').nth(2).click()
    await page.getByTestId('state-q2').click()
    expect(await kept()).toBe(total)
  })
})
