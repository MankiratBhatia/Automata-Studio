import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { HERO_INPUT, HERO_TRACE } from '../src/landing/content.ts'
import { expect, test, type Page } from './fixtures.ts'

const studio = (page: Page) => page.getByRole('combobox', { name: 'Load example' })
// The studio has its own level-1 heading (its title), so name the landing headline.
const hero = (page: Page) =>
  page.getByRole('heading', { level: 1, name: /Build\. Simulate\. Understand\./ })
const launchLinks = (page: Page) => page.getByRole('link', { name: /Launch Studio/ })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.describe('the home page', () => {
  test('is what you see at the bare address', async ({ page }) => {
    await expect(hero(page)).toHaveText('Build. Simulate. Understand.')
    await expect(
      page.getByText('hands-on tool for the machines in a theory of computation course'),
    ).toBeVisible()
    await expect(launchLinks(page).first()).toBeVisible()
    await expect(studio(page)).toHaveCount(0) // the studio is not mounted behind it
  })

  test('shows all three machines and what the studio can do', async ({ page }) => {
    for (const name of ['Finite automata', 'Pushdown automata', 'Turing machines']) {
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible()
    }
    for (const name of [
      'Visual construction',
      'String simulation',
      'Validation',
      'Step-by-step algorithms',
      'Equivalence checking',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
    await expect(page.getByRole('list', { name: 'Conversion pipeline' })).toContainText(
      'Minimal DFA',
    )
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
    await expect(page.getByRole('contentinfo')).toContainText('Automata Studio')
  })

  test('does not need the backend', async ({ page }) => {
    const apiCalls: string[] = []
    // Only real data requests: the dev server also serves source files that have "api" in their path.
    page.on(
      'request',
      (r) =>
        ['fetch', 'xhr'].includes(r.resourceType()) &&
        r.url().includes('/api/') &&
        apiCalls.push(r.url()),
    )
    await page.reload()
    await expect(hero(page)).toBeVisible()
    await page.waitForTimeout(500)
    expect(apiCalls).toEqual([])
  })

  test('an unknown address falls back to the home page', async ({ page }) => {
    await page.goto('/#/no-such-page')
    await expect(hero(page)).toBeVisible()
  })

  test('the section links scroll to their heading and focus it', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Page sections' })
      .getByRole('button', { name: 'How it works' })
      .click()
    const heading = page.getByRole('heading', { name: 'How it works' })
    await expect(heading).toBeFocused()
    await expect(heading).toBeInViewport()
    await expect(hero(page)).not.toBeInViewport()
    expect(page.url()).not.toContain('how-it-works') // scrolling must not disturb the route
  })

  test('"Explore features" scrolls to the machines', async ({ page }) => {
    await page.getByRole('button', { name: 'Explore features' }).click()
    await expect(
      page.getByRole('heading', { name: 'Three kinds of machine, one studio' }),
    ).toBeInViewport()
  })

  test('the theme control works and is remembered', async ({ page }) => {
    await page.getByLabel('Theme').selectOption('dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('Launch Studio', () => {
  for (const [where, pick] of [
    [
      'the top bar',
      (p: Page) => p.getByRole('banner').getByRole('link', { name: /Launch Studio/ }),
    ],
    [
      'the hero',
      (p: Page) =>
        p
          .getByRole('main')
          .getByRole('link', { name: /Launch Studio/ })
          .first(),
    ],
    [
      'the closing call to action',
      (p: Page) =>
        p.getByRole('heading', { name: 'Ready to try it?' }).locator('xpath=following::a[1]'),
    ],
    [
      'the footer',
      (p: Page) => p.getByRole('contentinfo').getByRole('link', { name: 'Launch Studio' }),
    ],
  ] as const) {
    test(`from ${where} opens the finite-automata studio`, async ({ page }) => {
      await pick(page).click()
      await expect(page).toHaveURL(/#\/studio$/)
      await expect(studio(page)).toBeVisible()
      await expect(
        page
          .getByRole('navigation', { name: 'Kind of machine' })
          .getByRole('button', { name: 'Finite automata' }),
      ).toHaveAttribute('aria-current', 'true')
      await expect(hero(page)).toHaveCount(0)
    })
  }

  test('lands in the finite-automata screen even if you last used a machine screen', async ({
    page,
  }) => {
    await page.goto('/#/studio')
    await page
      .getByRole('navigation', { name: 'Kind of machine' })
      .getByRole('button', { name: 'Turing machines' })
      .click()
    await page.goto('/#/')
    await launchLinks(page).first().click()
    await expect(studio(page)).toBeVisible()
    await expect(
      page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Finite automata' }),
    ).toHaveAttribute('aria-current', 'true')
  })

  test('the existing studio works after arriving from the home page', async ({ page }) => {
    await launchLinks(page).first().click()
    await expect(page.getByText(/Backend connected/)).toBeVisible()
    await page.getByRole('button', { name: 'Try an example' }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    await page.getByRole('tab', { name: 'Simulate', exact: true }).click()
    await page.getByLabel('Input string').fill('1101')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await page.getByRole('button', { name: 'Last step' }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Accepted')
  })

  test('the machine cards open their own screens', async ({ page }) => {
    await page.getByRole('button', { name: 'Open pushdown automata' }).click()
    await expect(
      page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Pushdown automata' }),
    ).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('tab', { name: 'Run', exact: true })).toBeVisible()

    await page.goto('/#/')
    await page.getByRole('button', { name: 'Open Turing machines' }).click()
    await expect(
      page
        .getByRole('navigation', { name: 'Kind of machine' })
        .getByRole('button', { name: 'Turing machines' }),
    ).toHaveAttribute('aria-current', 'true')

    await page.goto('/#/')
    await page.getByRole('button', { name: 'Open finite automata' }).click()
    await expect(studio(page)).toBeVisible()
  })
})

test.describe('getting around', () => {
  test('the studio title leads back home, and the browser back button returns to the studio', async ({
    page,
  }) => {
    await launchLinks(page).first().click()
    await expect(studio(page)).toBeVisible()
    await page.getByRole('link', { name: 'Automata Studio' }).click()
    await expect(hero(page)).toBeVisible()
    await page.goBack()
    await expect(studio(page)).toBeVisible()
    await page.goForward()
    await expect(hero(page)).toBeVisible()
  })

  test('a link straight to the studio works, and so does a reload there', async ({ page }) => {
    await page.goto('/#/studio')
    await expect(studio(page)).toBeVisible()
    await page.reload()
    await expect(studio(page)).toBeVisible()
  })

  test('work in the studio is still there after a trip home', async ({ page }) => {
    await page.goto('/#/studio')
    await page.getByRole('button', { name: 'Try an example' }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    await page.waitForTimeout(600) // the workspace autosave is debounced
    await page.getByRole('link', { name: 'Automata Studio' }).click()
    await expect(hero(page)).toBeVisible()
    await launchLinks(page).first().click()
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
  })
})

test.describe('the hero animation', () => {
  test('matches what the real backend does on the same input', async ({ page, request }) => {
    const automaton = JSON.parse(
      readFileSync('../backend/tests/fixtures/dfa_ends_with_01.json', 'utf8'),
    )
    const res = await request.post('/api/simulate', { data: { automaton, input: HERO_INPUT } })
    const steps = (await res.json()).steps as { states: string[]; transitions: number[] }[]
    expect(
      steps.map((s) => ({ state: s.states[0], transition: s.transitions[0] ?? null })),
    ).toEqual(HERO_TRACE)
    await expect(page.getByLabel('A live preview of the studio')).toBeVisible()
  })

  test('plays through the input and ends on Accepted', async ({ page }) => {
    const figure = page.getByLabel('A live preview of the studio')
    await expect(figure.getByRole('img', { name: 'Input 1101, 0 symbols read' })).toBeVisible()
    await expect(figure.getByRole('img', { name: 'Input 1101, 2 symbols read' })).toBeVisible({
      timeout: 6000,
    })
    await expect(figure.getByText('Accepted')).toBeVisible({ timeout: 8000 })
  })

  test('can be paused, and stays still while paused', async ({ page }) => {
    const figure = page.getByLabel('A live preview of the studio')
    await figure.getByRole('button', { name: 'Pause' }).click()
    await expect(figure.getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const before = await figure.getByRole('img', { name: /^Input 1101/ }).getAttribute('aria-label')
    await page.waitForTimeout(2500)
    expect(await figure.getByRole('img', { name: /^Input 1101/ }).getAttribute('aria-label')).toBe(
      before,
    )
  })

  test('with reduced motion it is already finished and still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    const figure = page.getByLabel('A live preview of the studio')
    await expect(figure.getByText('Accepted')).toBeVisible()
    await expect(figure.getByRole('button', { name: 'Play' })).toBeVisible()
  })

  test('scrolling over the diagram scrolls the page instead of zooming the diagram', async ({
    page,
  }) => {
    const box = (await page.getByTestId('readonly-canvas').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('nothing overflows sideways, and the Launch button is within reach', async ({ page }) => {
    await expect(hero(page)).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await expect(launchLinks(page).first()).toBeInViewport()
    await page.getByRole('button', { name: 'Open Turing machines' }).scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })

  test('Launch Studio still works', async ({ page }) => {
    await launchLinks(page).first().click()
    await expect(studio(page)).toBeVisible()
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  const check = async (page: Page, what: string) => {
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(
      violations.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
      `accessibility violations on: ${what}`,
    ).toEqual([])
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`the home page, ${theme} theme`, async ({ page }) => {
      await page.getByLabel('Theme').selectOption(theme)
      await check(page, `home, ${theme}`)
    })
  }

  test('the home page on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await check(page, 'home, phone')
  })

  test('the paused and the finished hero', async ({ page }) => {
    await page
      .getByLabel('A live preview of the studio')
      .getByRole('button', { name: 'Pause' })
      .click()
    await check(page, 'hero paused')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await check(page, 'hero finished')
  })

  test('the skip link is the first thing keyboard focus reaches', async ({ page }) => {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
  })
})
