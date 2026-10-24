import { type ReactNode } from 'react'
import { useMode, type Mode } from '../mode'
import { hrefFor, navigate } from '../route'
import { useTheme, type ThemePref } from '../theme'
import { ALGORITHMS_URL, CAPABILITIES, MACHINES, PIPELINE, REPO_URL, STEPS } from './content'
import { HeroDemo } from './HeroDemo'
import { Icon } from './Icons'
import { prefersReducedMotion } from './motion'

/** Open the studio, on the screen for `mode` (finite automata unless a machine card was used). */
function launch(mode: Mode = 'fa') {
  useMode.getState().setMode(mode)
  navigate('studio')
}

/** Scroll to a section and move keyboard focus to its heading, so the jump is not just visual. */
function jumpTo(id: string) {
  const heading = document.getElementById(id)
  if (!heading) return
  heading.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
  heading.focus({ preventScroll: true })
}

const SECTION = 'mx-auto w-full max-w-6xl px-5 sm:px-8'
const H2 = 'text-2xl font-bold tracking-tight sm:text-3xl outline-none scroll-mt-24'
const LEAD = 'mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-300'

function LaunchButton({
  children = 'Launch Studio',
  large,
}: {
  children?: ReactNode
  large?: boolean
}) {
  return (
    <a
      href={hrefFor('studio')}
      onClick={(e) => {
        e.preventDefault()
        launch()
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        large ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M4 10a1 1 0 0 1 1-1h7.6L9.3 5.7a1 1 0 1 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L12.6 11H5a1 1 0 0 1-1-1Z" />
      </svg>
    </a>
  )
}

function TopBar() {
  const pref = useTheme((s) => s.pref)
  const setPref = useTheme((s) => s.setPref)
  const link =
    'hidden rounded px-2 py-1 text-sm font-medium text-slate-700 hover:text-blue-700 md:inline dark:text-slate-300 dark:hover:text-blue-300'
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/85">
      <div className={`${SECTION} flex items-center gap-4 py-3`}>
        <a
          href={hrefFor('home')}
          className="flex items-center gap-2 rounded text-lg font-bold tracking-tight"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white"
          >
            <Icon name="fa" className="h-5 w-5" />
          </span>
          Automata Studio
        </a>
        <nav aria-label="Page sections" className="ml-4 flex gap-1">
          <button type="button" className={link} onClick={() => jumpTo('machines')}>
            Machines
          </button>
          <button type="button" className={link} onClick={() => jumpTo('capabilities')}>
            Capabilities
          </button>
          <button type="button" className={link} onClick={() => jumpTo('how-it-works')}>
            How it works
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <select
            aria-label="Theme"
            value={pref}
            onChange={(e) => setPref(e.target.value as ThemePref)}
            className="btn hidden dark:bg-slate-900 sm:block"
          >
            <option value="system">Theme: System</option>
            <option value="light">Theme: Light</option>
            <option value="dark">Theme: Dark</option>
          </select>
          <LaunchButton />
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-white to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-900"
    >
      <div
        className={`${SECTION} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-14`}
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Interactive theory of computation
          </p>
          <h1
            id="hero-title"
            className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
          >
            <span>Build.</span> <span>Simulate.</span>{' '}
            <span className="text-blue-600 dark:text-blue-400">Understand.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Automata Studio is a hands-on tool for the machines in a theory of computation course.
            Build finite automata on a canvas, define pushdown automata and Turing machines with
            tables, run each on any input, and watch every step: the active state, the stack, the
            tape.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LaunchButton large />
            <button
              type="button"
              className="btn !px-5 !py-3 text-base"
              onClick={() => jumpTo('machines')}
            >
              Explore features
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No account needed. Includes ready-made examples to start from.
          </p>
        </div>
        <HeroDemo />
      </div>
    </section>
  )
}

function Machines() {
  return (
    <section aria-labelledby="machines" className="py-16 sm:py-20">
      <div className={SECTION}>
        <h2 id="machines" tabIndex={-1} className={H2}>
          Three kinds of machine, one studio
        </h2>
        <p className={LEAD}>
          Each model of computation has its own screen, built for what makes it different: a diagram
          for states, a stack for pushdown automata, a tape for Turing machines.
        </p>
        <ul className="mt-10 grid gap-6 lg:grid-cols-3">
          {MACHINES.map((m) => (
            <li
              key={m.mode}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Icon name={m.icon} />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{m.title}</h3>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{m.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {m.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      fill="currentColor"
                    >
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn mt-6 !py-2 font-medium"
                onClick={() => launch(m.mode)}
              >
                {m.cta}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Capabilities() {
  return (
    <section
      aria-labelledby="capabilities"
      className="bg-slate-100/70 py-16 sm:py-20 dark:bg-slate-950/50"
    >
      <div className={SECTION}>
        <h2 id="capabilities" tabIndex={-1} className={H2}>
          What you can do
        </h2>
        <p className={LEAD}>Everything below is built in and works today.</p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <li
              key={c.title}
              className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="text-blue-600 dark:text-blue-400">
                <Icon name={c.icon} />
              </span>
              <h3 className="mt-3 font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{c.text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-lg font-semibold">Supported conversions</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Turn a regular expression into a minimal DFA one stage at a time. Every stage opens in
            its own tab, so you can compare them, and every stage can be replayed.
          </p>
          <ol
            className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-2"
            aria-label="Conversion pipeline"
          >
            {PIPELINE.map((p, i) => (
              <li
                key={p.label}
                className="flex items-center gap-2 lg:flex-1 lg:flex-col lg:items-stretch"
              >
                <div className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm font-semibold text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
                  {p.label}
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 lg:flex-col lg:py-1">
                    <span
                      aria-hidden
                      className="text-lg leading-none text-blue-600 dark:text-blue-400"
                    >
                      <span className="lg:hidden">↓</span>
                      <span className="hidden lg:inline">→</span>
                    </span>
                    <span>{PIPELINE[i].how}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="py-16 sm:py-20">
      <div className={SECTION}>
        <h2 id="how-it-works" tabIndex={-1} className={H2}>
          How it works
        </h2>
        <p className={LEAD}>From a blank canvas to an answer in four steps.</p>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="relative rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
            >
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CallToAction() {
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-16 sm:px-8 sm:pb-20">
      <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-12 text-center text-white sm:px-12">
        <h2 id="cta-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Ready to try it?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-50">
          Open the studio, pick an example, and press Run.
        </p>
        <a
          href={hrefFor('studio')}
          onClick={(e) => {
            e.preventDefault()
            launch()
          }}
          className="mt-7 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-blue-800 shadow hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Launch Studio
        </a>
      </div>
    </section>
  )
}

function Footer() {
  const link = 'rounded underline-offset-4 hover:underline'
  return (
    <footer className="border-t border-slate-200 py-10 dark:border-slate-700">
      <div
        className={`${SECTION} flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between`}
      >
        <div>
          <p className="font-bold">Automata Studio</p>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            A theory of computation project. Built with React, TypeScript, React Flow and FastAPI.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          <a
            href={hrefFor('studio')}
            className={link}
            onClick={(e) => {
              e.preventDefault()
              launch()
            }}
          >
            Launch Studio
          </a>
          <a href={ALGORITHMS_URL} className={link} target="_blank" rel="noreferrer">
            How the algorithms work
          </a>
          <a href={REPO_URL} className={link} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 focus:shadow-lg"
        onClick={() => {
          const main = document.getElementById('main')
          main?.focus()
          main?.scrollIntoView()
        }}
      >
        Skip to content
      </button>
      <TopBar />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Machines />
        <Capabilities />
        <HowItWorks />
        <CallToAction />
      </main>
      <Footer />
    </div>
  )
}
