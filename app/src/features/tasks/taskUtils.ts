import { format, isPast, isToday, isTomorrow } from 'date-fns'
import type { Task } from '@/types/database'

export const INBOX = 'Inbox'

/** A task is overdue when it has a due date strictly before today and is not completed. */
export function isTaskOverdue(task: Task): boolean {
  if (task.completed || !task.due_at) return false
  const due = new Date(task.due_at)
  return isPast(due) && !isToday(due)
}

/** A task is "due today" when its due date falls on the current calendar day (regardless of time). */
export function isTaskDueToday(task: Task): boolean {
  if (!task.due_at) return false
  return isToday(new Date(task.due_at))
}

/** Sort by due date ascending, undated tasks last, then newest-created first. */
export function sortByDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
    if (a.due_at) return -1
    if (b.due_at) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** Distinct list names present across a task set, always including Inbox, Inbox first, rest alphabetical. */
export function listNamesFrom(tasks: Task[]): string[] {
  const names = new Set<string>([INBOX])
  for (const t of tasks) names.add(t.list_name || INBOX)
  return Array.from(names).sort((a, b) => {
    if (a === INBOX) return -1
    if (b === INBOX) return 1
    return a.localeCompare(b)
  })
}

function timePart(date: Date): string {
  return (date.getMinutes() === 0 ? format(date, 'ha') : format(date, 'h:mma')).toLowerCase()
}

/** A due_at with time-of-day left at local midnight is treated as a date-only due date. */
function hasExplicitTime(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0
}

/** Relative, compact label for a due date: "Today 5pm", "Tomorrow", "12 Sep". */
export function formatDueLabel(dueAt: string): string {
  const date = new Date(dueAt)
  const withTime = hasExplicitTime(date)
  if (isToday(date)) return withTime ? `Today ${timePart(date)}` : 'Today'
  if (isTomorrow(date)) return withTime ? `Tomorrow ${timePart(date)}` : 'Tomorrow'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const dateStr = format(date, sameYear ? 'd MMM' : 'd MMM yyyy')
  return withTime ? `${dateStr} ${timePart(date)}` : dateStr
}

/** Convert an ISO string to a value a `datetime-local` input accepts, in local time. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert a `datetime-local` input value back to an ISO string, or null if empty. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
