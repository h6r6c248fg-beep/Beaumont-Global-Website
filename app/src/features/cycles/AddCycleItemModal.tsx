import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Check, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea, Label } from '@/components/ui/Input'
import { cx } from '@/lib/utils'
import { FREQUENCY_PRESETS } from './utils'
import type { AdministrationRoute, Compound, CompoundCategory, CycleItem } from '@/types/database'

const ROUTES: { value: AdministrationRoute; label: string }[] = [
  { value: 'im', label: 'Intramuscular (IM)' },
  { value: 'subq', label: 'Subcutaneous (SubQ)' },
  { value: 'oral', label: 'Oral' },
  { value: 'topical', label: 'Topical' },
  { value: 'nasal', label: 'Nasal' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_LABELS: Record<CompoundCategory, string> = {
  anabolic_steroid: 'Anabolic Steroids',
  peptide: 'Peptides',
  ancillary: 'Ancillaries',
  sarm: 'SARMs',
  other: 'Other',
}

const CATEGORY_OPTIONS: { value: CompoundCategory; label: string }[] = [
  { value: 'anabolic_steroid', label: 'Anabolic steroid' },
  { value: 'peptide', label: 'Peptide' },
  { value: 'ancillary', label: 'Ancillary' },
  { value: 'sarm', label: 'SARM' },
  { value: 'other', label: 'Other' },
]

export function AddCycleItemModal({
  open,
  onClose,
  cycleId,
  onSaved,
  editingItem,
}: {
  open: boolean
  onClose: () => void
  cycleId: string
  onSaved: () => void
  editingItem?: CycleItem | null
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isEdit = !!editingItem

  const [step, setStep] = useState<'compound' | 'details'>(isEdit ? 'details' : 'compound')
  const [search, setSearch] = useState('')
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<CompoundCategory>('other')
  const [customUnit, setCustomUnit] = useState('mg')

  const [compoundId, setCompoundId] = useState<string | null>(editingItem?.compound_id ?? null)
  const [compoundName, setCompoundName] = useState(editingItem?.compound_name ?? '')
  const [doseAmount, setDoseAmount] = useState(editingItem ? String(editingItem.dose_amount) : '')
  const [doseUnit, setDoseUnit] = useState(editingItem?.dose_unit ?? 'mg')
  const [frequencyPreset, setFrequencyPreset] = useState<string>(
    editingItem && !FREQUENCY_PRESETS.includes(editingItem.frequency as any) ? 'Custom' : editingItem?.frequency ?? 'EOD'
  )
  const [frequencyCustom, setFrequencyCustom] = useState(
    editingItem && !FREQUENCY_PRESETS.includes(editingItem.frequency as any) ? editingItem.frequency : ''
  )
  const [route, setRoute] = useState<AdministrationRoute>(editingItem?.route ?? 'im')
  const [startDate, setStartDate] = useState(editingItem?.start_date ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(editingItem?.end_date ?? '')
  const [notes, setNotes] = useState(editingItem?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(editingItem ? 'details' : 'compound')
    setSearch('')
    setShowCustomForm(false)
    setCustomName('')
    setCustomCategory('other')
    setCustomUnit('mg')
    setCompoundId(editingItem?.compound_id ?? null)
    setCompoundName(editingItem?.compound_name ?? '')
    setDoseAmount(editingItem ? String(editingItem.dose_amount) : '')
    setDoseUnit(editingItem?.dose_unit ?? 'mg')
    const preset = editingItem && !FREQUENCY_PRESETS.includes(editingItem.frequency as any) ? 'Custom' : editingItem?.frequency ?? 'EOD'
    setFrequencyPreset(preset)
    setFrequencyCustom(preset === 'Custom' ? editingItem?.frequency ?? '' : '')
    setRoute(editingItem?.route ?? 'im')
    setStartDate(editingItem?.start_date ?? new Date().toISOString().slice(0, 10))
    setEndDate(editingItem?.end_date ?? '')
    setNotes(editingItem?.notes ?? '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem?.id])

  const compoundsQuery = useQuery({
    queryKey: ['compounds-search', user?.id, search],
    enabled: open && step === 'compound' && !!user,
    queryFn: async () => {
      let query = supabase
        .from('compounds')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${user!.id}`)
        .order('name', { ascending: true })
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Compound[]
    },
  })

  const grouped = useMemo(() => {
    const list = compoundsQuery.data ?? []
    const map = new Map<CompoundCategory, Compound[]>()
    for (const c of list) {
      const arr = map.get(c.category) ?? []
      arr.push(c)
      map.set(c.category, arr)
    }
    return map
  }, [compoundsQuery.data])

  const createCompoundMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('compounds')
        .insert({
          user_id: user.id,
          name: customName.trim(),
          category: customCategory,
          default_unit: customUnit.trim() || 'mg',
          is_custom: true,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Compound
    },
    onSuccess: (compound) => {
      queryClient.invalidateQueries({ queryKey: ['compounds-search'] })
      pickCompound(compound)
    },
    onError: (e: any) => setError(e?.message ?? 'Could not add compound'),
  })

  const pickCompound = (c: Compound) => {
    setCompoundId(c.id)
    setCompoundName(c.name)
    setDoseUnit(c.default_unit)
    setStep('details')
  }

  const pickCustomOneOff = () => {
    setCompoundId(null)
    setCompoundName(search.trim() || compoundName)
    setStep('details')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const frequency = frequencyPreset === 'Custom' ? frequencyCustom.trim() : frequencyPreset
      const amount = parseFloat(doseAmount)
      if (!compoundName.trim()) throw new Error('Choose or name a compound.')
      if (!amount || amount <= 0) throw new Error('Enter a valid dose amount.')
      if (!frequency) throw new Error('Enter a frequency.')

      if (isEdit && editingItem) {
        const { error } = await supabase
          .from('cycle_items')
          .update({
            compound_id: compoundId,
            compound_name: compoundName.trim(),
            dose_amount: amount,
            dose_unit: doseUnit.trim(),
            frequency,
            route,
            start_date: startDate,
            end_date: endDate || null,
            notes: notes.trim() || null,
          })
          .eq('id', editingItem.id)
        if (error) throw error
        return
      }

      const { error } = await supabase.from('cycle_items').insert({
        cycle_id: cycleId,
        user_id: user.id,
        compound_id: compoundId,
        compound_name: compoundName.trim(),
        dose_amount: amount,
        dose_unit: doseUnit.trim(),
        frequency,
        route,
        start_date: startDate,
        end_date: endDate || null,
        notes: notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-items', cycleId] })
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
      onSaved()
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const onSubmitDetails = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    saveMutation.mutate()
  }

  const onSubmitCustom = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!customName.trim()) {
      setError('Name the compound.')
      return
    }
    createCompoundMutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit compound' : step === 'compound' ? 'Add compound or peptide' : 'Dosing details'}>
      {step === 'compound' && (
        <div className="space-y-4">
          {!showCustomForm ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-mist-2)]" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search compounds & peptides…"
                  className="pl-9"
                />
              </div>

              <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                {compoundsQuery.isLoading && <p className="text-sm text-[var(--color-mist)]">Searching…</p>}
                {!compoundsQuery.isLoading && (compoundsQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-[var(--color-mist)]">No matches in your library.</p>
                )}
                {Array.from(grouped.entries()).map(([category, list]) => (
                  <div key={category}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist-2)]">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <div className="space-y-1">
                      {list.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCompound(c)}
                          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-2 text-left text-sm text-[var(--color-paper)] transition-colors hover:border-[var(--color-gold-dim)]"
                        >
                          <span>
                            {c.name}
                            {c.user_id && <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--color-gold)]">custom</span>}
                          </span>
                          <span className="text-xs text-[var(--color-mist)]">{c.default_unit}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4 sm:flex-row">
                <Button type="button" variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => setShowCustomForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add custom compound
                </Button>
                {search.trim() && (
                  <Button type="button" variant="ghost" size="sm" className="flex-1 justify-center" onClick={pickCustomOneOff}>
                    Use “{search.trim()}” as one-off
                  </Button>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={onSubmitCustom} className="space-y-4">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="flex items-center gap-1 text-xs text-[var(--color-mist)] hover:text-[var(--color-paper)]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back to search
              </button>
              <Field label="Compound name">
                <Input autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. NPP" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <Select value={customCategory} onChange={(e) => setCustomCategory(e.target.value as CompoundCategory)}>
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default unit">
                  <Input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="mg, mcg, iu…" />
                </Field>
              </div>
              {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowCustomForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={createCompoundMutation.isPending}>
                  <Check className="h-3.5 w-3.5" /> Add & continue
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={onSubmitDetails} className="space-y-4">
          {!isEdit && (
            <button
              type="button"
              onClick={() => setStep('compound')}
              className="flex items-center gap-1 text-xs text-[var(--color-mist)] hover:text-[var(--color-paper)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Change compound
            </button>
          )}

          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-mist-2)]">Compound</p>
            <p className="text-sm text-[var(--color-paper)]">{compoundName || 'Untitled compound'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Dose amount">
              <Input type="number" step="any" min="0" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} required />
            </Field>
            <Field label="Unit">
              <Input value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} placeholder="mg" required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <Select value={frequencyPreset} onChange={(e) => setFrequencyPreset(e.target.value)}>
                {FREQUENCY_PRESETS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="Custom">Custom…</option>
              </Select>
            </Field>
            <Field label="Route">
              <Select value={route} onChange={(e) => setRoute(e.target.value as AdministrationRoute)}>
                {ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {frequencyPreset === 'Custom' && (
            <Field label="Custom frequency">
              <Input value={frequencyCustom} onChange={(e) => setFrequencyCustom(e.target.value)} placeholder="e.g. Mon/Wed/Fri" required />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
            <Field label="End date" hint="Optional">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
            </Field>
          </div>

          <Field label="Notes" hint="Optional">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>
              {isEdit ? 'Save changes' : 'Add compound'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// silence unused-import in case Label ends up unused across edits
void Label
void cx
