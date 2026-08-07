import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LANES, type Status, type Todo } from '../types'
import {
  applyRealtimeEvent,
  laneTodos,
  nextPosition,
  progress,
  toggledStatus,
  withMove,
  type RealtimeEvent,
} from '../lib/board'
import { Lane } from './Lane'

type BoardProps = {
  userId: string
  email: string | undefined
  onSignOut: () => void
}

export function Board({ userId, email, onSignOut }: BoardProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Load todos for the logged-in user ---
  useEffect(() => {
    let active = true
    async function load() {
      const { data, error: loadError } = await supabase
        .from('todos')
        .select('*')
        .order('position', { ascending: true })
      if (!active) return
      if (loadError) {
        setError(loadError.message)
      } else {
        setTodos(data ?? [])
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [userId])

  // --- Realtime: reconcile changes from other tabs/sessions ---
  useEffect(() => {
    const channel = supabase
      .channel('todos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // The reconciliation rules live in lib/board.ts so they can be tested
          // without two browser tabs — see board.test.ts.
          setTodos((prev) => applyRealtimeEvent(prev, payload as unknown as RealtimeEvent))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const addTodo = useCallback(
    async (status: Status, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      const { error: insertError } = await supabase.from('todos').insert({
        title: trimmed,
        status,
        position: nextPosition(todos, status),
        // user_id defaults to auth.uid() in the DB, but set it so the
        // optimistic realtime path and RLS check line up explicitly.
        user_id: userId,
      })
      if (insertError) setError(insertError.message)
      // Realtime INSERT event adds it to state.
    },
    [userId, todos],
  )

  const moveTodo = useCallback(
    async (id: string, status: Status) => {
      const todo = todos.find((t) => t.id === id)
      if (!todo || todo.status === status) return
      const position = nextPosition(todos, status)
      // Optimistic update; realtime reconciles to the persisted row.
      setTodos((prev) => withMove(prev, id, status))
      const { error: updateError } = await supabase
        .from('todos')
        .update({ status, position })
        .eq('id', id)
      if (updateError) setError(updateError.message)
    },
    [todos],
  )

  // Checkbox: mark a card done (move to Done), or send a done card back to
  // Backlog. "done" is just a lane, so this reuses moveTodo.
  const toggleDone = useCallback(
    (todo: Todo) => {
      moveTodo(todo.id, toggledStatus(todo))
    },
    [moveTodo],
  )

  const deleteTodo = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    const { error: deleteError } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
  }, [])

  const { total, done: doneCount, pct } = progress(todos)

  return (
    <div className="board-wrap">
      <header className="board-head">
        <div>
          <h1 className="board-title">To-Do</h1>
          <p className="board-sub">
            {doneCount} of {total} tasks complete · {pct}% done
          </p>
        </div>
        <div className="board-head-right">
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {email && <span className="board-email">{email}</span>}
          <button type="button" className="signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="error">⚠ {error}</p>}
      {loading && !error && <p className="muted">Loading…</p>}

      <div className="board">
        {LANES.map((lane) => (
          <Lane
            key={lane.status}
            status={lane.status}
            label={lane.label}
            dot={lane.dot}
            todos={laneTodos(todos, lane.status)}
            onAdd={addTodo}
            onMove={moveTodo}
            onToggle={toggleDone}
            onDelete={deleteTodo}
          />
        ))}
      </div>
    </div>
  )
}
