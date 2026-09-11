import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Field } from '@/components/ui/Input'
import { cx } from '@/lib/utils'
import { useCreateCustomExercise, useExercisesLibrary } from './hooks'
import type { Exercise } from '@/types/database'

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength',
  core: 'Core',
  cardio: 'Cardio',
}

const CATEGORY_ORDER = ['strength', 'core', 'cardio']

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

export function ExercisePickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (exercise: Exercise) => void
}) {
  const { exercises, isLoading } = useExercisesLibrary()
  const createExercise = useCreateCustomExercise()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'strength', primary_muscle: '', equipment: '' })

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
    const byCategory = new Map<string, Exercise[]>()
    for (const ex of filtered) {
      if (!byCategory.has(ex.category)) byCategory.set(ex.category, [])
      byCategory.get(ex.category)!.push(ex)
    }
    const categories = [...byCategory.keys()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b) || a.localeCompare(b)
    )
    return categories.map((category) => ({ category, items: byCategory.get(category)! }))
  }, [exercises, search])

  function reset() {
    setSearch('')
    setCreating(false)
    setForm({ name: '', category: 'strength', primary_muscle: '', equipment: '' })
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    const exercise = await createExercise.mutateAsync({
      name: form.name.trim(),
      category: form.category,
      primary_muscle: form.primary_muscle.trim() || null,
      equipment: form.equipment.trim() || null,
    })
    onSelect(exercise)
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add exercise" className="max-w-xl">
      {!creating ? (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-mist-2)]" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 pl-9"
            />
          </div>

          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-line)] py-2.5 text-sm text-[var(--color-gold)] transition-colors hover:border-[var(--color-gold-dim)] hover:text-[var(--color-gold-bright)]"
          >
            <Plus className="h-4 w-4" /> Create custom exercise
          </button>

          <div className="max-h-[50vh] space-y-5 overflow-y-auto">
            {isLoading && <p className="text-sm text-[var(--color-mist)]">Loading…</p>}
            {!isLoading && grouped.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-mist)]">No exercises match "{search}".</p>
            )}
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">
                  {categoryLabel(category)}
                </p>
                <div className="space-y-1">
                  {items.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => {
                        onSelect(ex)
                        handleClose()
                      }}
                      className="flex w-full min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[var(--color-paper)] transition-colors hover:bg-white/5"
                    >
                      <span>{ex.name}</span>
                      <span className="text-xs text-[var(--color-mist)]">{ex.primary_muscle ?? ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-paper)]">New custom exercise</p>
            <button onClick={() => setCreating(false)} className="rounded-lg p-1.5 text-[var(--color-mist)] hover:bg-white/5 hover:text-[var(--color-paper)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Cable Lateral Raise" autoFocus />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="strength">Strength</option>
              <option value="core">Core</option>
              <option value="cardio">Cardio</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary muscle">
              <Input value={form.primary_muscle} onChange={(e) => setForm((f) => ({ ...f, primary_muscle: e.target.value }))} placeholder="e.g. Shoulders" />
            </Field>
            <Field label="Equipment">
              <Input value={form.equipment} onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))} placeholder="e.g. Cable machine" />
            </Field>
          </div>
          <Button
            variant="primary"
            className={cx('w-full justify-center')}
            disabled={!form.name.trim()}
            loading={createExercise.isPending}
            onClick={handleCreate}
          >
            Create &amp; add
          </Button>
        </div>
      )}
    </Modal>
  )
}
