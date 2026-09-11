import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--color-line)] px-6 py-14 text-center">
      {icon && <div className="text-[var(--color-mist-2)]">{icon}</div>}
      <div>
        <p className="font-display text-lg text-[var(--color-paper)]">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--color-mist)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}
