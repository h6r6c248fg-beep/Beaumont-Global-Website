import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import type { Cycle, CycleType } from '@/types/database'

const CYCLE_TYPES: { value: CycleType; label: string }[] = [
  { value: 'steroid', label: 'Steroid' },
  { value: 'peptide', label: 'Peptide' },
  { value: 'mixed', label: 'Mixed' },
]

export function NewCycleModal({
  open,
  onClose,
  onSaved,
  editingCycle,
}: {
  open: boolean
  onClose: () => void
  onSaved: (cycle: Cycle) => void
  editingCycle?: Cycle | null
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isEdit = !!editingCycle

  const [name, setName] = useState(editingCycle?.name ?? '')
  const [cycleType, setCycleType] = useState<CycleType>(editingCycle?.cycle_type ?? 'steroid')
  const [goal, setGoal] = useState(editingCycle?.goal ?? '')
  const [startDate, setStartDate] = useState(editingCycle?.start_date ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(editingCycle?.end_date ?? '')
  const [notes, setNotes] = useState(editingCycle?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const resetForm = (c?: Cycle | null) => {
    setName(c?.name ?? '')
    setCycleType(c?.cycle_type ?? 'steroid')
    setGoal(c?.goal ?? '')
    setStartDate(c?.start_date ?? new Date().toISOString().slice(0, 10))
    setEndDate(c?.end_date ?? '')
    setNotes(c?.notes ?? '')
    setError(null)
  }

  useEffect(() => {
    if (open) resetForm(editingCycle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCycle?.id])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      if (isEdit && editingCycle) {
        const { data, error } = await supabase
          .from('cycles')
          .update({
            name: name.trim(),
            cycle_type: cycleType,
            goal: goal.trim() || null,
            start_date: startDate,
            end_date: endDate || null,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCycle.id)
          .select('*')
          .single()
        if (error) throw error
        return data as Cycle
      }
      const { data, error } = await supabase
        .from('cycles')
        .insert({
          user_id: user.id,
          name: name.trim(),
          cycle_type: cycleType,
          goal: goal.trim() || null,
          start_date: startDate,
          end_date: endDate || null,
          status: 'planned',
          notes: notes.trim() || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Cycle
    },
    onSuccess: (cycle) => {
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['cycle', cycle.id] })
      onSaved(cycle)
      if (!isEdit) resetForm(null)
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give the cycle a name.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        resetForm(editingCycle)
        onClose()
      }}
      title={isEdit ? 'Edit cycle' : 'New cycle'}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Autumn Test/Anavar" required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={cycleType} onChange={(e) => setCycleType(e.target.value as CycleType)}>
              {CYCLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Goal" hint="Optional">
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Lean recomposition" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="End date" hint="Optional">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
          </Field>
        </div>

        <Field label="Notes" hint="Optional">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this cycle" />
        </Field>

        {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create cycle'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
