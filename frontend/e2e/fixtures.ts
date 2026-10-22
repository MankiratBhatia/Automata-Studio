import { expect, test as base } from '@playwright/test'

export { expect }
export type { Locator, Page } from '@playwright/test'

// Chrome logs every 4xx response as a console error. Several tests deliberately trigger the
// API's validation errors (a bad regex, an invalid automaton), so those are expected. Anything
// else the page logs, and any uncaught exception, fails the test: the app must run clean.
const EXPECTED = [/Failed to load resource: the server responded with a status of 4\d\d/]

export const test = base.extend({
  page: async ({ page }, runTest) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`uncaught exception: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error' && !EXPECTED.some((re) => re.test(m.text()))) {
        problems.push(`console.error: ${m.text()}`)
      }
    })
    await runTest(page)
    expect(problems, 'the page logged errors').toEqual([])
  },
})
