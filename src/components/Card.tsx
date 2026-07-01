import { useState, type DragEvent } from 'react'
import type { Todo } from '../types'

type CardProps = {
  todo: Todo
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
}

export function Card({ todo, onToggle, onDelete }: CardProps) {
  const [dragging, setDragging] = useState(false)
  const done = todo.status === 'done'

  function handleDragStart(e: DragEvent) {
    e.dataTransfer.setData('text/plain', todo.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }

  return (
    <article
      className={`card${done ? ' card--done' : ''}${dragging ? ' card--dragging' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
    >
      <button
        type="button"
        className="card-check"
        onClick={() => onToggle(todo)}
        aria-label={done ? `Mark ${todo.title} not done` : `Mark ${todo.title} done`}
      >
        {done ? '✓' : ''}
      </button>
      <span className="card-title">{todo.title}</span>
      <button
        type="button"
        className="card-delete"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete ${todo.title}`}
      >
        ✕
      </button>
    </article>
  )
}
