import { type ReactNode, useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { cx } from '@/lib/utils'

/**
 * Plays a short branded launch animation over the app on first mount, then
 * gets out of the way. The app mounts underneath immediately so data
 * fetching starts right away — the splash is purely a cover animation.
 */
export function SplashGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in')

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase('out'), 1250)
    const doneTimer = setTimeout(() => setPhase('done'), 1850)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  return (
    <>
      {phase !== 'done' && (
        <div
          className={cx(
            'fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[var(--color-ink)]',
            phase === 'out' && 'animate-splash-exit'
          )}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-gold)]/12 blur-[120px]" />
          </div>

          <div className="relative flex flex-col items-center">
            <div className="animate-splash-logo-in flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 shadow-[0_0_50px_-10px_rgba(203,161,92,0.55)]">
              <Compass className="h-8 w-8 text-[var(--color-gold-bright)]" strokeWidth={1.5} />
            </div>
            <div className="animate-splash-word-in mt-4 font-display text-2xl font-medium text-[var(--color-paper)]">Beaumont One</div>
          </div>
        </div>
      )}
      {children}
    </>
  )
}
