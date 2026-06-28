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

// Lane order + display labels, left to right on the board.
export const LANES: { status: Status; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'next', label: 'Next' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]
