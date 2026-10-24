import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'studio'

/**
 * Which page a URL hash means. Anything unrecognised is the home page, so a mistyped link
 * lands somewhere sensible instead of on a blank screen.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '')
  return path === 'studio' ? 'studio' : 'home'
}

export const hrefFor = (route: Route): string => (route === 'studio' ? '#/studio' : '#/')

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}

/** The current page, following the browser's back and forward buttons. */
export const useRoute = (): Route =>
  useSyncExternalStore(
    subscribe,
    () => parseRoute(window.location.hash),
    () => 'home',
  )

/** Go to a page. Using the hash keeps the back button working with no server configuration. */
export function navigate(route: Route): void {
  window.location.hash = hrefFor(route)
}
