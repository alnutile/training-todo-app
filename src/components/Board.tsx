import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LANES, type Status, type Todo } from '../types'
import { Lane } from './Lane'

export function Board({ userId }: { userId: string }) {
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
          setTodos((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Todo
              if (prev.some((t) => t.id === row.id)) return prev
              return [...prev, row]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Todo
              return prev.map((t) => (t.id === row.id ? row : t))
            }
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as Partial<Todo>
              return prev.filter((t) => t.id !== oldRow.id)
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Next position = end of the target lane.
  const nextPosition = useCallback(
    (status: Status) => {
      const inLane = todos.filter((t) => t.status === status)
      if (inLane.length === 0) return 1
      return Math.max(...inLane.map((t) => t.position)) + 1
    },
    [todos],
  )

  const addTodo = useCallback(
    async (status: Status, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      const { error: insertError } = await supabase.from('todos').insert({
        title: trimmed,
        status,
        position: nextPosition(status),
        // user_id defaults to auth.uid() in the DB, but set it so the
        // optimistic realtime path and RLS check line up explicitly.
        user_id: userId,
      })
      if (insertError) setError(insertError.message)
      // Realtime INSERT event adds it to state.
    },
    [userId, nextPosition],
  )

  const moveTodo = useCallback(
    async (id: string, status: Status) => {
      const todo = todos.find((t) => t.id === id)
      if (!todo || todo.status === status) return
      const position = nextPosition(status)
      // Optimistic update; realtime reconciles to the persisted row.
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status, position } : t)),
      )
      const { error: updateError } = await supabase
        .from('todos')
        .update({ status, position })
        .eq('id', id)
      if (updateError) setError(updateError.message)
    },
    [todos, nextPosition],
  )

  const deleteTodo = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    const { error: deleteError } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
  }, [])

  return (
    <>
      {error && <p className="error">⚠ {error}</p>}
      {loading && !error && <p className="muted">Loading…</p>}

      <div className="board">
        {LANES.map((lane) => (
          <Lane
            key={lane.status}
            status={lane.status}
            label={lane.label}
            todos={todos
              .filter((t) => t.status === lane.status)
              .sort((a, b) => a.position - b.position)}
            onAdd={addTodo}
            onMove={moveTodo}
            onDelete={deleteTodo}
          />
        ))}
      </div>
    </>
  )
}
