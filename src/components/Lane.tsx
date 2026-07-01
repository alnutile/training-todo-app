import { useState, type DragEvent, type FormEvent } from 'react'
import type { Status, Todo } from '../types'
import { Card } from './Card'

type LaneProps = {
  status: Status
  label: string
  dot: string
  todos: Todo[]
  onAdd: (status: Status, title: string) => void
  onMove: (id: string, status: Status) => void
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
}

export function Lane({
  status,
  label,
  dot,
  todos,
  onAdd,
  onMove,
  onToggle,
  onDelete,
}: LaneProps) {
  const [title, setTitle] = useState('')
  const [dragOver, setDragOver] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    onAdd(status, title)
    setTitle('')
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData('text/plain')
    if (id) onMove(id, status)
  }

  return (
    <section
      className={`lane${dragOver ? ' lane--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <header className="lane-header">
        <span className="lane-dot" style={{ background: dot }} />
        <span className="lane-title">{label}</span>
        <span className="lane-count">{todos.length}</span>
      </header>

      <form className="lane-add" onSubmit={submit}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Add to ${label}…`}
          aria-label={`Add a task to ${label}`}
        />
        <button type="submit" aria-label={`Add to ${label}`}>
          +
        </button>
      </form>

      <div className="lane-cards">
        {todos.map((todo) => (
          <Card
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
        {todos.length === 0 && <div className="lane-empty">Drop tasks here</div>}
      </div>
    </section>
  )
}
