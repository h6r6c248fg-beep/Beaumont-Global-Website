import type { HTMLAttributes } from 'react'
import { cx } from '@/lib/utils'

type Tone = 'gold' | 'emerald' | 'rose' | 'azure' | 'amber' | 'neutral'

const tones: Record<Tone, string> = {
  gold: 'bg-[var(--color-gold)]/12 text-[var(--color-gold-bright)] border-[var(--color-gold)]/25',
  emerald: 'bg-[var(--color-emerald)]/12 text-[var(--color-emerald)] border-[var(--color-emerald)]/25',
  rose: 'bg-[var(--color-rose)]/12 text-[var(--color-rose)] border-[var(--color-rose)]/25',
  azure: 'bg-[var(--color-azure)]/12 text-[var(--color-azure)] border-[var(--color-azure)]/25',
  amber: 'bg-[var(--color-amber)]/12 text-[var(--color-amber)] border-[var(--color-amber)]/25',
  neutral: 'bg-white/5 text-[var(--color-mist)] border-white/10',
}

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
