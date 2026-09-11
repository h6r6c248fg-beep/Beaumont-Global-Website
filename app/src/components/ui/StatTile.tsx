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
  const accentColor = {
    gold: 'text-[var(--color-gold-bright)]',
    emerald: 'text-[var(--color-emerald)]',
    rose: 'text-[var(--color-rose)]',
    azure: 'text-[var(--color-azure)]',
  }[accent]

  return (
    <Panel className={cx('p-5', className)}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">{label}</p>
        {icon && <div className={cx('opacity-80', accentColor)}>{icon}</div>}
      </div>
      <p className="mt-2 font-display text-2xl font-medium text-[var(--color-paper)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-mist)]">{sub}</p>}
    </Panel>
  )
}
