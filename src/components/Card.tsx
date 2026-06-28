import type { DragEvent } from 'react'
import type { Todo } from '../types'

type CardProps = {
  todo: Todo
  onDelete: (id: string) => void
}

export function Card({ todo, onDelete }: CardProps) {
  function handleDragStart(e: DragEvent) {
    e.dataTransfer.setData('text/plain', todo.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <article
      className="card"
      draggable
      onDragStart={handleDragStart}
    >
      <span className={todo.status === 'done' ? 'card-title done' : 'card-title'}>
        {todo.title}
      </span>
      <button
        type="button"
        className="card-delete"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete ${todo.title}`}
      >
        ×
      </button>
    </article>
  )
}
