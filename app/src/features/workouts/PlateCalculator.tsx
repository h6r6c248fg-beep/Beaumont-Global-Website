import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Input'
import { calculatePlates } from './lib'
import { round } from '@/lib/utils'

export function PlateCalculatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [target, setTarget] = useState('100')
  const [bar, setBar] = useState('20')

  const targetNum = Number(target) || 0
  const barNum = Number(bar) || 0
  const plates = useMemo(() => calculatePlates(targetNum, barNum), [targetNum, barNum])
  const accounted = barNum + plates.reduce((s, p) => s + p, 0) * 2

  return (
    <Modal open={open} onClose={onClose} title="Plate calculator" className="max-w-sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target weight (kg)">
            <Input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-11"
            />
          </Field>
          <Field label="Bar weight (kg)">
            <Input type="number" inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} className="h-11" />
          </Field>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Per side</p>
          {plates.length > 0 ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {plates.map((p, i) => (
                  <span
                    key={i}
                    className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-2 font-display text-sm text-[var(--color-gold-bright)]"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--color-mist)]">
                {plates.join(', ')} kg per side · loads to {round(accounted, 2)}kg total
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-mist)]">
              {targetNum <= barNum ? 'Target is at or below the bar weight — no plates needed.' : 'Enter a target weight.'}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
