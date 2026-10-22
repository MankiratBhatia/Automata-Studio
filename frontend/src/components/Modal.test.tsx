import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Modal
          title="Test dialog"
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        >
          <button>First</button>
          <button>Middle</button>
          <button>Last</button>
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('is a labelled, modal dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus into the dialog when it opens', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to what opened it', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('closes when the dimmed backdrop is clicked, but not when the panel is', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the dialog, wrapping at both ends', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await userEvent.tab() // would leave the dialog: wraps to the first
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await userEvent.tab({ shift: true }) // and backwards
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })
})
