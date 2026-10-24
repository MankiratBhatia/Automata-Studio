import { useEffect } from 'react'
import App from './App'
import { LandingPage } from './landing/LandingPage'
import { useRoute } from './route'

/** Chooses between the landing page and the studio. The studio itself (App) is unchanged. */
export default function Root() {
  const route = useRoute()

  // A new page starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  return route === 'studio' ? <App /> : <LandingPage />
}
