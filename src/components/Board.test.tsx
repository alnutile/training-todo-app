/**
 * Component test: the real Board, the real supabase-js client, a fake network.
 *
 * Nothing here is a stub of *our* code — the component runs exactly as it does
 * in the browser. MSW just plays the part of the database, so we can assert on
 * the request the board would have sent.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { TEST_USER_ID, fakeTodosApi, makeTodo } from '../test/mocks/supabase'
import { Board } from './Board'

function renderBoard() {
  return render(<Board userId={TEST_USER_ID} email="you@example.com" onSignOut={() => {}} />)
}

/** The lane column that owns a given header label. */
function lane(label: string) {
  return screen.getByText(label).closest('section') as HTMLElement
}

describe('Board', () => {
  it('shows the cards the database returns, in the right lanes', async () => {
    const db = fakeTodosApi([
      makeTodo({ title: 'Write the script', status: 'backlog', position: 1 }),
      makeTodo({ title: 'Record the video', status: 'in_progress', position: 1 }),
      makeTodo({ title: 'Buy a microphone', status: 'done', position: 1 }),
    ])
    server.use(...db.handlers)

    renderBoard()

    expect(await screen.findByText('Write the script')).toBeInTheDocument()
    expect(within(lane('In Progress')).getByText('Record the video')).toBeInTheDocument()
    expect(within(lane('Done')).getByText('Buy a microphone')).toBeInTheDocument()
  })

  it('reports progress across the board', async () => {
    server.use(
      ...fakeTodosApi([
        makeTodo({ title: 'a', status: 'done' }),
        makeTodo({ title: 'b', status: 'backlog' }),
        makeTodo({ title: 'c', status: 'backlog' }),
        makeTodo({ title: 'd', status: 'backlog' }),
      ]).handlers,
    )

    renderBoard()

    expect(await screen.findByText(/1 of 4 tasks complete · 25% done/)).toBeInTheDocument()
  })

  it('sorts a lane by position, not by insertion order', async () => {
    server.use(
      ...fakeTodosApi([
        makeTodo({ title: 'second', status: 'next', position: 2 }),
        makeTodo({ title: 'first', status: 'next', position: 1 }),
      ]).handlers,
    )

    renderBoard()

    await screen.findByText('first')
    const titles = within(lane('Next'))
      .getAllByText(/first|second/)
      .map((el) => el.textContent)
    expect(titles).toEqual(['first', 'second'])
  })

  it('adds a card to the lane it was typed into', async () => {
    const db = fakeTodosApi([makeTodo({ title: 'Existing', status: 'next', position: 3 })])
    server.use(...db.handlers)
    const user = userEvent.setup()

    renderBoard()
    await screen.findByText('Existing')

    await user.type(screen.getByLabelText('Add a task to Next'), 'Brand new task')
    await user.click(screen.getByRole('button', { name: 'Add to Next' }))

    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        title: 'Brand new task',
        status: 'next',
        // End of the Next lane, which already had a card at position 3.
        position: 4,
        user_id: TEST_USER_ID,
      },
    })
  })

  it('refuses to send an empty title to the database', async () => {
    const db = fakeTodosApi()
    server.use(...db.handlers)
    const user = userEvent.setup()

    renderBoard()
    await screen.findByText('Backlog')

    await user.type(screen.getByLabelText('Add a task to Backlog'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add to Backlog' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/title/i)
    expect(db.writes).toHaveLength(0)
  })

  it('clears the validation message once you start typing again', async () => {
    server.use(...fakeTodosApi().handlers)
    const user = userEvent.setup()

    renderBoard()
    await screen.findByText('Backlog')
    const input = screen.getByLabelText('Add a task to Backlog')

    await user.click(screen.getByRole('button', { name: 'Add to Backlog' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.type(input, 'A real title')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('checking a card moves it to Done', async () => {
    const card = makeTodo({ title: 'Finish the edit', status: 'backlog', position: 1 })
    const db = fakeTodosApi([card])
    server.use(...db.handlers)
    const user = userEvent.setup()

    renderBoard()
    await screen.findByText('Finish the edit')

    await user.click(screen.getByRole('button', { name: 'Mark Finish the edit done' }))

    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toMatchObject({ method: 'PATCH', body: { status: 'done' } })
    // Optimistic: the card lands in Done before the server answers.
    expect(within(lane('Done')).getByText('Finish the edit')).toBeInTheDocument()
  })

  it('deletes a card', async () => {
    const card = makeTodo({ title: 'Scrap this', status: 'backlog' })
    const db = fakeTodosApi([card])
    server.use(...db.handlers)
    const user = userEvent.setup()

    renderBoard()
    await screen.findByText('Scrap this')

    await user.click(screen.getByRole('button', { name: 'Delete Scrap this' }))

    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toMatchObject({ method: 'DELETE', body: { id: card.id } })
    expect(screen.queryByText('Scrap this')).not.toBeInTheDocument()
  })

  it('shows the database error instead of failing silently', async () => {
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.get('https://fake-project.supabase.co/rest/v1/todos', () =>
        HttpResponse.json({ message: 'permission denied for table todos' }, { status: 403 }),
      ),
    )

    renderBoard()

    expect(await screen.findByText(/permission denied for table todos/)).toBeInTheDocument()
  })
})
