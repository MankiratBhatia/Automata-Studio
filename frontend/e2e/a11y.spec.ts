import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures.ts'

// Lighthouse's accessibility score is computed by the axe engine, so a clean axe run on every
// view is the same evidence, and it runs in CI. WCAG 2.0/2.1 level A and AA rules are checked.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectAccessible(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  )
  expect(report, `accessibility violations on: ${what}`).toEqual([])
}

const example = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Load example' }).selectOption({ label })
const side = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/studio')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.getByLabel('Theme').selectOption(theme)
    })

    test('empty canvas', async ({ page }) => {
      await expectAccessible(page, 'empty canvas')
    })

    test('every side tab with an automaton on screen', async ({ page }) => {
      await example(page, 'Third-last symbol is a')
      for (const tab of ['Edit', 'Validate', 'Simulate', 'Convert', 'Steps', 'Compare']) {
        await side(page, tab)
        await expectAccessible(page, `${tab} tab`)
      }
    })

    test('a selected state and a selected transition', async ({ page }) => {
      await example(page, 'Ends with 01')
      await page.getByTestId('state-q1').click()
      await expectAccessible(page, 'state selected')
      await page.locator('.react-flow__edge').first().click({ force: true })
      await expectAccessible(page, 'edge selected')
    })

    test('simulation results and batch table', async ({ page }) => {
      await example(page, 'Ends with 01')
      await side(page, 'Simulate')
      await page.getByLabel('Input string').fill('101')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await page.getByRole('button', { name: 'Last step' }).click()
      await expectAccessible(page, 'simulation verdict')
      await page.getByLabel(/Batch inputs/).fill('01\n10\n0x')
      await page.getByRole('button', { name: 'Run all' }).click()
      await expect(page.getByRole('table')).toBeVisible()
      await expectAccessible(page, 'batch results')
    })

    test('validation issues', async ({ page }) => {
      await example(page, 'Non-minimal DFA (B~C, U unreachable)')
      await side(page, 'Validate')
      await page.getByRole('button', { name: /Unreachable from the start state/ }).click()
      await expectAccessible(page, 'validation issue highlighted')
    })

    test('regex error, conversion result and state key', async ({ page }) => {
      await side(page, 'Convert')
      await page.getByRole('textbox', { name: 'Regular expression' }).fill('a(b|')
      await page.getByRole('button', { name: 'Build ε-NFA' }).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await expectAccessible(page, 'regex syntax error')
      await example(page, 'Third-last symbol is a')
      await side(page, 'Convert')
      await page.getByRole('button', { name: 'Convert to DFA' }).click()
      await expect(page.getByRole('region', { name: 'State key' })).toBeVisible()
      await expectAccessible(page, 'conversion result with state key')
    })

    test('step player: subset table and partition view', async ({ page }) => {
      await example(page, 'Third-last symbol is a')
      await side(page, 'Convert')
      await page.getByRole('button', { name: 'Convert to DFA' }).click()
      await side(page, 'Steps')
      await page.getByRole('button', { name: 'Last step' }).click()
      await expectAccessible(page, 'subset construction replay')
      await example(page, 'Non-minimal DFA (B~C, U unreachable)')
      await side(page, 'Convert')
      await page.getByRole('button', { name: 'Minimise DFA' }).click()
      await side(page, 'Steps')
      await page.getByRole('button', { name: 'Last step' }).click()
      await expectAccessible(page, 'minimisation replay')
    })

    test('equivalence result and the side-by-side runs', async ({ page }) => {
      await example(page, 'Even number of 1s')
      await example(page, 'Even number of 1s, except rejects 00')
      await side(page, 'Compare')
      await page.getByRole('button', { name: 'Check equivalence' }).click()
      await expect(page.getByTestId('equivalence-result')).toBeVisible()
      await expectAccessible(page, 'equivalence result')
      await page.getByRole('button', { name: 'Show both runs' }).click()
      await page.getByRole('button', { name: 'Last step' }).click()
      await expectAccessible(page, 'side-by-side runs')
    })

    test('dialogs: transition symbols, projects, shortcuts', async ({ page }) => {
      await example(page, 'Ends with 01')
      await page.locator('.as-label').first().dblclick()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page, 'transition symbols dialog')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Projects' }).click()
      await expect(page.getByRole('dialog', { name: 'My projects' })).toBeVisible()
      await expectAccessible(page, 'projects dialog')
      await page.keyboard.press('Escape')
      await page.keyboard.press('?')
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
      await expectAccessible(page, 'shortcuts dialog')
    })

    test('pushdown automaton screen: editor, run result, stack', async ({ page }) => {
      await page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Pushdown automata' })
        .click()
      await expectAccessible(page, 'PDA editor')
      await page.getByRole('tab', { name: 'Run', exact: true }).click()
      await page.getByLabel('Input string').fill('aabb')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await expect(page.getByTestId('verdict')).toBeVisible()
      await page.getByRole('button', { name: 'Next step' }).click()
      await expectAccessible(page, 'PDA run with stack')
      await page.getByLabel('Input string').fill('aab')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await expect(page.getByTestId('verdict')).toHaveText('Rejected')
      await expectAccessible(page, 'PDA rejected, closest attempt')
      await page.getByLabel('Input string').fill('abx')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await expectAccessible(page, 'PDA input error')
    })

    test('Turing machine screen: editor, tape, step limit', async ({ page }) => {
      await page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Turing machines' })
        .click()
      await expectAccessible(page, 'TM editor')
      await page.getByRole('tab', { name: 'Run', exact: true }).click()
      await page.getByLabel('Input string').fill('1011')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await expect(page.getByTestId('tape')).toBeVisible()
      await page.getByRole('button', { name: 'Next step' }).click()
      await expectAccessible(page, 'TM run with tape')
      await page
        .getByRole('combobox', { name: 'Load example' })
        .selectOption({ label: 'Runs forever (step limit demo)' })
      await page.getByLabel('Input string').fill('a')
      await page.getByRole('button', { name: 'Run', exact: true }).click()
      await expect(page.getByTestId('verdict')).toHaveText('Step limit')
      await expectAccessible(page, 'TM step limit')
      await page.getByRole('tab', { name: 'Machine', exact: true }).click()
      await page.getByRole('button', { name: 'Add transition' }).click()
      await expectAccessible(page, 'TM editor with a problem listed')
    })

    test('export menu, tip bar and toast', async ({ page }) => {
      await example(page, 'Ends with 01')
      await page.getByRole('button', { name: /^Export/ }).click()
      await expectAccessible(page, 'export menu open')
      await page.getByRole('button', { name: 'Transition table (.md)' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Exported' })).toBeVisible()
      await expectAccessible(page, 'success toast')
    })
  })
}
