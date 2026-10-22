import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  useStudioStore.setState({ toasts: [] })
})
afterEach(() => vi.useRealTimers())

describe('toasts', () => {
  it('shows a message and removes it by itself', () => {
    store().showToast('success', 'Saved')
    expect(store().toasts.map((t) => t.message)).toEqual(['Saved'])
    vi.advanceTimersByTime(4000)
    expect(store().toasts).toEqual([])
  })

  it('keeps errors on screen longer than other messages', () => {
    store().showToast('error', 'Broke')
    store().showToast('info', 'FYI')
    vi.advanceTimersByTime(4000)
    expect(store().toasts.map((t) => t.message)).toEqual(['Broke'])
    vi.advanceTimersByTime(4000)
    expect(store().toasts).toEqual([])
  })

  it('can be dismissed early, and only that one', () => {
    store().showToast('info', 'one')
    store().showToast('info', 'two')
    store().dismissToast(store().toasts[0].id)
    expect(store().toasts.map((t) => t.message)).toEqual(['two'])
  })

  it('never piles up more than four at once', () => {
    for (let i = 0; i < 10; i++) store().showToast('info', `m${i}`)
    expect(store().toasts.map((t) => t.message)).toEqual(['m6', 'm7', 'm8', 'm9'])
  })
})
