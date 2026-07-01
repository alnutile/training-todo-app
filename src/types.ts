export type Status = 'backlog' | 'next' | 'in_progress' | 'done'

export type Todo = {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: Status
  position: number
  created_at: string
  updated_at: string
}

// Lane order + display labels + header dot colour, left to right on the board.
export const LANES: { status: Status; label: string; dot: string }[] = [
  { status: 'backlog', label: 'Backlog', dot: '#94a3b8' },
  { status: 'next', label: 'Next', dot: '#6366f1' },
  { status: 'in_progress', label: 'In Progress', dot: '#f59e0b' },
  { status: 'done', label: 'Done', dot: '#22c55e' },
]
