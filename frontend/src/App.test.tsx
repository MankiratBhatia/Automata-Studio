import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

function backend(health: 'ok' | 'down') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (health === 'down') throw new TypeError('x')
      if (url === '/api/validate') return new Response(JSON.stringify({ issues: [] }))
      return new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }))
    }),
  )
}

describe('App', () => {
  it('shows connected when the backend answers', async () => {
    backend('ok')
    render(<App />)
    expect(await screen.findByText(/Backend connected \(v0\.1\.0\)/)).toBeInTheDocument()
  })

  it('shows offline when the backend is down', async () => {
    backend('down')
    render(<App />)
    expect(await screen.findByText('Backend offline')).toBeInTheDocument()
  })

  it('offers the example gallery and the three panels', () => {
    backend('ok')
    render(<App />)
    expect(screen.getByRole('combobox', { name: 'Load example' })).toBeInTheDocument()
    for (const name of ['Edit', 'Validate', 'Simulate']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Double-click anywhere to add a state')).toBeInTheDocument()
  })
})
