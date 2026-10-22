import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getHealth } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('getHealth', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', version: '1' }))),
    )
    await expect(getHealth()).resolves.toEqual({ status: 'ok', version: '1' })
  })

  it('wraps HTTP errors with status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 500 })))
    await expect(getHealth()).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })

  it('gives a readable message when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await getHealth().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/backend/i)
  })
})
