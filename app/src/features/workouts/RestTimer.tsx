import { useEffect, useState } from 'react'
import { Minus, Plus, TimerOff, X } from 'lucide-react'
import { cx } from '@/lib/utils'
import { formatClock } from './lib'

export interface ActiveRest {
  exerciseName: string
  endAt: number
  duration: number
}

export function RestTimer({
  rest,
  onAdjust,
  onSkip,
}: {
  rest: ActiveRest
  onAdjust: (deltaSeconds: number) => void
  onSkip: () => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const secondsLeft = Math.max(0, Math.round((rest.endAt - now) / 1000))
  const done = secondsLeft <= 0

  useEffect(() => {
    if (!done) return
    const id = setTimeout(onSkip, 4000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const progress = rest.duration > 0 ? Math.min(1, Math.max(0, 1 - secondsLeft / rest.duration)) : 1

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-sm sm:inset-x-auto sm:right-6 sm:left-auto">
      <div className="glass-panel overflow-hidden rounded-2xl bg-[var(--color-obsidian-2)] animate-fade-up">
        <div className="h-1 w-full bg-[var(--color-line-soft)]">
          <div
            className={cx('h-full transition-[width] duration-500', done ? 'bg-[var(--color-emerald)]' : 'bg-[var(--color-gold)]')}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-mist)]">
              {done ? 'Rest complete' : `Resting · ${rest.exerciseName}`}
            </p>
            <p className={cx('font-display text-2xl tabular-nums', done ? 'text-[var(--color-emerald)]' : 'text-[var(--color-paper)]')}>
              {done ? "Let's go" : formatClock(secondsLeft)}
            </p>
          </div>
          {!done && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onAdjust(-15)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-paper)] transition-colors hover:border-[var(--color-gold-dim)]"
                aria-label="Subtract 15 seconds"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => onAdjust(15)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-paper)] transition-colors hover:border-[var(--color-gold-dim)]"
                aria-label="Add 15 seconds"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
          <button
            onClick={onSkip}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)]"
            aria-label={done ? 'Dismiss' : 'Skip rest'}
          >
            {done ? <X className="h-4 w-4" /> : <TimerOff className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
