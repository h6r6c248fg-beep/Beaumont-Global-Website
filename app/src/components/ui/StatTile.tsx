import type { ReactNode } from 'react'
import { cx } from '@/lib/utils'
import { Panel } from './Panel'

export function StatTile({
  label,
  value,
  sub,
  icon,
  accent = 'gold',
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  accent?: 'gold' | 'emerald' | 'rose' | 'azure'
  className?: string
}) {
  const accentStyle = {
    gold: 'text-[var(--color-gold-bright)] bg-[var(--color-gold)]/12',
    emerald: 'text-[var(--color-emerald)] bg-[var(--color-emerald)]/12',
    rose: 'text-[var(--color-rose)] bg-[var(--color-rose)]/12',
    azure: 'text-[var(--color-azure)] bg-[var(--color-azure)]/12',
  }[accent]

  return (
    <Panel className={cx('p-5', className)}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">{label}</p>
        {icon && <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', accentStyle)}>{icon}</div>}
      </div>
      <p className="mt-3 font-display text-2xl font-medium text-[var(--color-paper)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-mist)]">{sub}</p>}
    </Panel>
  )
}
