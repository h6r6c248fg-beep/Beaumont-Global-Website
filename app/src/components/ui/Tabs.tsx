import { cx } from '@/lib/utils'

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            'rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors',
            value === tab.value
              ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold-bright)]'
              : 'text-[var(--color-mist)] hover:text-[var(--color-paper)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
