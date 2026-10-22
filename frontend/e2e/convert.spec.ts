import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Convert' }).click()
})

const docTab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Open automata' }).getByRole('tab', { name, exact: true })

const nodes = (page: Page) => page.locator('.react-flow__node')

test('regex pipeline opens ε-NFA, DFA and minimal DFA tabs; the minimal one has 4 states and works', async ({
  page,
}) => {
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('(a|b)*abb')
  await page.getByRole('button', { name: 'Run full pipeline' }).click()

  await expect(page.getByTestId('convert-note')).toContainText(
    'ε-NFA (14 states) → DFA (5) → minimal DFA (4)',
  )
  await expect(docTab(page, 'Thompson: (a|b)*abb')).toBeVisible()
  await expect(docTab(page, 'Thompson: (a|b)*abb (DFA)')).toBeVisible()
  await expect(docTab(page, 'Thompson: (a|b)*abb (DFA) (minimal)')).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // The minimal DFA is on screen: 4 states, a complete DFA, and it recognises the language.
  await expect(nodes(page)).toHaveCount(4)
  // The textbook result: DFA states A and C are equivalent, so they merge into one.
  await expect(page.getByTestId('state-A=C')).toBeVisible()
  await page.getByRole('tab', { name: 'Validate' }).click()
  await expect(page.getByText('Valid — no issues found.')).toBeVisible()
  await page.getByRole('tab', { name: 'Simulate' }).click()
  await page.getByLabel('Input string').fill('babb')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Last step' }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Accepted')

  // The earlier stages are still there to compare against.
  await docTab(page, 'Thompson: (a|b)*abb').click()
  await expect(nodes(page)).toHaveCount(14)
})

test('Build ε-NFA creates one tab', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('ab*')
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  await expect(docTab(page, 'Thompson: ab*')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('convert-note')).toContainText('Built an ε-NFA with 6 states.')
})

test('a syntax error points at the offending character and creates nothing', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('a(b|')
  await page.getByRole('button', { name: 'Build ε-NFA' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('regex ended')
  await expect(alert.locator('pre')).toHaveText('a(b|\n    ^')
  await expect(page.getByRole('tablist', { name: 'Open automata' }).getByRole('tab')).toHaveCount(1)
})

test('NFA → DFA: the third-last-symbol NFA blows up to 8 states', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: 'Third-last symbol is a' })
  await expect(nodes(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Convert to DFA' }).click()
  await expect(page.getByTestId('convert-note')).toContainText('4 NFA states → 8 DFA states.')
  await expect(nodes(page)).toHaveCount(8)
  await expect(docTab(page, 'Third-last symbol is a (DFA)')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // Subset states are lettered, and a key says which NFA states each letter stands for.
  await expect(page.getByTestId('state-A')).toBeVisible()
  const key = page.getByRole('region', { name: 'State key' })
  await expect(key.getByRole('row').filter({ hasText: 'A' }).first()).toContainText('{q0}')
  await expect(key.getByRole('row').filter({ hasText: 'B' }).first()).toContainText('{q0, q1}')
})

test('ε-removal turns the Thompson example into a smaller ε-free NFA', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: '(a|b)*abb (Thompson)' })
  await page.getByRole('button', { name: 'Remove ε-transitions' }).click()
  await expect(page.getByTestId('convert-note')).toContainText(
    '11 states → 6 states, no ε-transitions.',
  )
  await expect(nodes(page)).toHaveCount(6)
  await page.getByRole('tab', { name: 'Edit' }).click()
  await expect(page.getByLabel('Type')).toHaveValue('NFA')
})

test('minimisation merges the equivalent states and says which', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: 'Non-minimal DFA (B~C, U unreachable)' })
  await page.getByRole('button', { name: 'Minimise DFA' }).click()
  await expect(page.getByTestId('convert-note')).toContainText(
    '6 states → 4 states. Merged: B + C.',
  )
  await expect(nodes(page)).toHaveCount(4)
  await expect(page.getByTestId('state-B=C')).toBeVisible()
})

test('Minimise is refused for an NFA and Convert-to-DFA for a DFA', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption({ label: 'Third-last symbol is a' })
  await expect(page.getByRole('button', { name: 'Minimise DFA' })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Load example' }).selectOption({ label: 'Ends with 01' })
  await expect(page.getByRole('button', { name: 'Convert to DFA' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Minimise DFA' })).toBeEnabled()
})

test('tabs keep their own work, and survive a refresh', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Regular expression' }).fill('ab')
  await page.getByRole('button', { name: 'Run full pipeline' }).click()
  await expect(docTab(page, 'Thompson: ab (DFA) (minimal)')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.waitForTimeout(600) // autosave is debounced
  await page.reload()
  await expect(page.getByRole('tablist', { name: 'Open automata' }).getByRole('tab')).toHaveCount(3)
  await expect(docTab(page, 'Thompson: ab (DFA) (minimal)')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await docTab(page, 'Thompson: ab').click()
  await expect(nodes(page)).toHaveCount(4)

  await page.getByRole('button', { name: 'Close Thompson: ab', exact: true }).click()
  await expect(page.getByRole('tablist', { name: 'Open automata' }).getByRole('tab')).toHaveCount(2)
})
