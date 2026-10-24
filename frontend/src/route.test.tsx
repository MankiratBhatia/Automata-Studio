import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hrefFor, navigate, parseRoute, useRoute } from './route'

describe('parseRoute', () => {
  it.each([
    ['', 'home'],
    ['#', 'home'],
    ['#/', 'home'],
    ['#/studio', 'studio'],
    ['#/studio/', 'studio'],
    ['#studio', 'studio'],
    ['#/Studio', 'home'], // routes are case-sensitive
    ['#/studio/extra', 'home'],
    ['#/nonsense', 'home'],
    ['#features', 'home'],
  ])('%j is the %s page', (hash, route) => {
    expect(parseRoute(hash)).toBe(route)
  })

  it('every route round-trips through its own link', () => {
    for (const r of ['home', 'studio'] as const) expect(parseRoute(hrefFor(r))).toBe(r)
  })
})

function Where() {
  return <p data-testid="where">{useRoute()}</p>
}

describe('navigate and useRoute', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('starts from whatever the address already says', () => {
    window.location.hash = '#/studio'
    render(<Where />)
    expect(screen.getByTestId('where')).toHaveTextContent('studio')
  })

  it('navigate changes the address and the page that is showing', async () => {
    render(<Where />)
    expect(screen.getByTestId('where')).toHaveTextContent('home')
    await act(async () => {
      navigate('studio')
      // jsdom fires hashchange asynchronously
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.location.hash).toBe('#/studio')
    expect(screen.getByTestId('where')).toHaveTextContent('studio')
  })

  it('follows the browser back button', async () => {
    window.location.hash = '#/studio'
    render(<Where />)
    await act(async () => {
      window.location.hash = '#/'
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.getByTestId('where')).toHaveTextContent('home')
  })
})
