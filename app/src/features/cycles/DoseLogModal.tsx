import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { cx } from '@/lib/utils'
import { INJECTION_SITES, suggestNextSite } from './utils'
import type { CycleItem, DoseLog } from '@/types/database'

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function DoseLogModal({
  open,
  onClose,
  cycleItem,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  cycleItem: CycleItem
  onSaved: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isInjectable = cycleItem.route === 'im' || cycleItem.route === 'subq'

  const [amount, setAmount] = useState(String(cycleItem.dose_amount))
  const [unit, setUnit] = useState(cycleItem.dose_unit)
  const [loggedAt, setLoggedAt] = useState(toLocalInputValue(new Date()))
  const [site, setSite] = useState<string | null>(null)
  const [taken, setTaken] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount(String(cycleItem.dose_amount))
    setUnit(cycleItem.dose_unit)
    setLoggedAt(toLocalInputValue(new Date()))
    setSite(null)
    setTaken(true)
    setNotes('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycleItem.id])

  const lastLogQuery = useQuery({
    queryKey: ['last-dose-log', cycleItem.id],
    enabled: open && isInjectable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dose_logs')
        .select('*')
        .eq('cycle_item_id', cycleItem.id)
        .not('injection_site', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as DoseLog | null
    },
  })

  const suggestedSite = isInjectable ? suggestNextSite(lastLogQuery.data?.injection_site) : null

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const amt = parseFloat(amount)
      if (!amt || amt <= 0) throw new Error('Enter a valid amount.')
      const iso = new Date(loggedAt).toISOString()
      const { error } = await supabase.from('dose_logs').insert({
        user_id: user.id,
        cycle_item_id: cycleItem.id,
        logged_at: iso,
        amount: amt,
        unit: unit.trim(),
        injection_site: isInjectable ? site : null,
        taken,
        notes: notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-dose-logs'] })
      queryClient.invalidateQueries({ queryKey: ['last-dose-log', cycleItem.id] })
      onSaved()
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Log dose — ${cycleItem.compound_name}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <Input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </Field>
        </div>

        <Field label="Logged at">
          <Input type="datetime-local" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} required />
        </Field>

        {isInjectable && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Injection site</p>
            {lastLogQuery.data?.injection_site && (
              <p className="mb-2 text-xs text-[var(--color-mist)]">
                Last used: <span className="text-[var(--color-paper)]">{lastLogQuery.data.injection_site}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {INJECTION_SITES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSite(s)}
                  className={cx(
                    'relative rounded-full border px-3 py-1.5 text-xs transition-colors',
                    site === s
                      ? 'border-[var(--color-gold)] bg-[var(--color-gold)]/15 text-[var(--color-gold-bright)]'
                      : 'border-[var(--color-line)] bg-[var(--color-obsidian-2)] text-[var(--color-mist)] hover:text-[var(--color-paper)]'
                  )}
                >
                  {s}
                  {s === suggestedSite && site !== s && (
                    <span className="ml-1.5 rounded-full bg-[var(--color-emerald)]/15 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-emerald)]">
                      suggested
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-2.5">
          <div>
            <p className="text-sm text-[var(--color-paper)]">Dose taken</p>
            <p className="text-xs text-[var(--color-mist)]">Turn off to log a missed or skipped dose.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={taken}
            onClick={() => setTaken((t) => !t)}
            className={cx(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              taken ? 'bg-[var(--color-emerald)]/60' : 'bg-white/10'
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                taken ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        <Field label="Notes" hint="Optional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Save log
          </Button>
        </div>
      </form>
    </Modal>
  )
}
