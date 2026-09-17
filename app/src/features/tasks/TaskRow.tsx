import { Check } from 'lucide-react'
import { cx } from '@/lib/utils'
import type { Task } from '@/types/database'
import { formatDueLabel, isTaskOverdue } from './taskUtils'

const priorityDot: Record<Task['priority'], string> = {
  high: 'bg-[var(--color-rose)]',
  medium: 'bg-[var(--color-amber)]',
  low: 'bg-[var(--color-azure)]',
}

export function TaskRow({
  task,
  onToggleComplete,
  onOpen,
}: {
  task: Task
  onToggleComplete: (task: Task) => void
  onOpen: (task: Task) => void
}) {
  const overdue = isTaskOverdue(task)

  return (
    <div
      onClick={() => onOpen(task)}
      className={cx(
        'group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-300 hover:bg-white/[0.03]',
        task.completed && 'opacity-45'
      )}
    >
      <button
        type="button"
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(task)
        }}
        className={cx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          task.completed
            ? 'border-[var(--color-emerald)] bg-[var(--color-emerald)]/20 text-[var(--color-emerald)]'
            : 'border-[var(--color-line)] text-transparent hover:border-[var(--color-gold-dim)]'
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </button>

      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', priorityDot[task.priority])} title={`${task.priority} priority`} />

      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'truncate text-sm text-[var(--color-paper)] transition-colors',
            task.completed && 'text-[var(--color-mist)] line-through'
          )}
        >
          {task.title}
        </p>
        {(task.due_at || task.notes) && (
          <p className="mt-0.5 truncate text-xs text-[var(--color-mist)]">
            {task.due_at && (
              <span className={overdue ? 'text-[var(--color-rose)]' : undefined}>{formatDueLabel(task.due_at)}</span>
            )}
            {task.due_at && task.notes ? ' · ' : ''}
            {task.notes}
          </p>
        )}
      </div>
    </div>
  )
}
