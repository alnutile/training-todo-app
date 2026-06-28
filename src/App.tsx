import { useEffect, useState, type FormEvent } from 'react'

type Todo = {
  id: string
  title: string
  done: boolean
}

const STORAGE_KEY = 'training-todo-app.todos'

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Keep only well-formed items so a bad localStorage value can't crash us.
    return parsed.filter(
      (t): t is Todo =>
        t &&
        typeof t.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.done === 'boolean',
    )
  } catch {
    return []
  }
}

function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [title, setTitle] = useState('')

  // Persist on every change so a refresh keeps the list.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  function addTodo(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTodos((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: trimmed, done: false },
    ])
    setTitle('')
  }

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <main className="app">
      <h1>To-Do</h1>

      <form className="add-form" onSubmit={addTodo}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          aria-label="Task title"
        />
        <button type="submit">Add</button>
      </form>

      {todos.length === 0 ? (
        <p className="empty">No tasks yet. Add one above.</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <li key={todo.id} className="todo-item">
              <label className="todo-label">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span className={todo.done ? 'done' : ''}>{todo.title}</span>
              </label>
              <button
                type="button"
                className="delete"
                onClick={() => deleteTodo(todo.id)}
                aria-label={`Delete ${todo.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
