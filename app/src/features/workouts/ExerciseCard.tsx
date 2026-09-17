import { useState } from 'react'
import { Check, Flame, Plus, Trash2, X } from 'lucide-react'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cx, round } from '@/lib/utils'
import type { WorkoutSet } from '@/types/database'

export interface RoutineTarget {
  target_sets: number
  target_reps: number
  target_weight_kg: number | null
}

function SetRow({
  set,
  index,
  hint,
  onUpdate,
  onToggleComplete,
  onDelete,
}: {
  set: WorkoutSet
  index: number
  hint: { weight: number | null; reps: number; label: string } | null
  onUpdate: (patch: Partial<WorkoutSet>) => void
  onToggleComplete: (patch: Partial<WorkoutSet>) => void
  onDelete: () => void
}) {
  const [weight, setWeight] = useState(set.weight_kg ? String(set.weight_kg) : '')
  const [reps, setReps] = useState(set.reps ? String(set.reps) : '')
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : '')

  function commit() {
    onUpdate({
      weight_kg: Number(weight) || 0,
      reps: Number(reps) || 0,
      rpe: rpe.trim() === '' ? null : Number(rpe),
    })
  }

  function toggleComplete() {
    const patch: Partial<WorkoutSet> = {
      weight_kg: Number(weight) || 0,
      reps: Number(reps) || 0,
      rpe: rpe.trim() === '' ? null : Number(rpe),
      completed: !set.completed,
    }
    onToggleComplete(patch)
  }

  return (
    <div
      className={cx(
        'grid grid-cols-[1.75rem_1fr_1fr_2.5rem_2.5rem_2.5rem_2.5rem] items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors sm:gap-2',
        set.completed && 'bg-[var(--color-emerald)]/[0.06]'
      )}
    >
      <div className="flex flex-col items-center justify-center leading-none">
        {set.is_warmup ? (
          <Flame className="h-3.5 w-3.5 text-[var(--color-amber)]" />
        ) : (
          <span className="text-xs text-[var(--color-mist)]">{index + 1}</span>
        )}
      </div>

      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={commit}
        placeholder={hint?.weight != null ? String(hint.weight) : '0'}
        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-2 text-center text-sm text-[var(--color-paper)] outline-none placeholder:text-[var(--color-mist-2)] focus:border-[var(--color-gold-dim)]"
      />

      <input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={commit}
        placeholder={hint ? String(hint.reps) : '0'}
        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-2 text-center text-sm text-[var(--color-paper)] outline-none placeholder:text-[var(--color-mist-2)] focus:border-[var(--color-gold-dim)]"
      />

      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min="1"
        max="10"
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        onBlur={commit}
        placeholder="RPE"
        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-1 text-center text-[11px] text-[var(--color-paper)] outline-none placeholder:text-[var(--color-mist-2)] focus:border-[var(--color-gold-dim)]"
      />

      <button
        onClick={() => onUpdate({ is_warmup: !set.is_warmup })}
        title="Toggle warmup"
        className={cx(
          'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
          set.is_warmup
            ? 'border-[var(--color-amber)]/40 bg-[var(--color-amber)]/12 text-[var(--color-amber)]'
            : 'border-[var(--color-line)] text-[var(--color-mist-2)] hover:text-[var(--color-mist)]'
        )}
      >
        <Flame className="h-4 w-4" />
      </button>

      <button
        onClick={toggleComplete}
        title="Mark set complete"
        className={cx(
          'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
          set.completed
            ? 'border-[var(--color-emerald)]/40 bg-[var(--color-emerald)]/15 text-[var(--color-emerald)]'
            : 'border-[var(--color-line)] text-[var(--color-mist-2)] hover:border-[var(--color-emerald)]/40 hover:text-[var(--color-emerald)]'
        )}
      >
        <Check className="h-4 w-4" />
      </button>

      <button
        onClick={onDelete}
        title="Delete set"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-mist-2)] transition-colors hover:bg-[var(--color-rose)]/10 hover:text-[var(--color-rose)]"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ExerciseCard({
  exerciseName,
  exerciseMeta,
  sets,
  previousSets,
  routineTarget,
  onAddSet,
  onUpdateSet,
  onToggleComplete,
  onDeleteSet,
  onRemoveExercise,
  addingSet,
}: {
  exerciseName: string
  exerciseMeta?: string | null
  sets: WorkoutSet[]
  previousSets?: WorkoutSet[]
  routineTarget?: RoutineTarget
  onAddSet: () => void
  onUpdateSet: (id: string, patch: Partial<WorkoutSet>) => void
  onToggleComplete: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (id: string) => void
  onRemoveExercise?: () => void
  addingSet?: boolean
}) {
  const workingSets = sets.filter((s) => !s.is_warmup && s.completed)
  const bestSet = workingSets.reduce<WorkoutSet | null>((best, s) => (!best || s.weight_kg > best.weight_kg ? s : best), null)

  function hintFor(index: number) {
    if (previousSets && previousSets.length > 0) {
      const prev = previousSets[index] ?? previousSets[previousSets.length - 1]
      return { weight: prev.weight_kg, reps: prev.reps, label: `last: ${round(prev.weight_kg, 1)}kg × ${prev.reps}` }
    }
    if (routineTarget) {
      return {
        weight: routineTarget.target_weight_kg,
        reps: routineTarget.target_reps,
        label: `target: ${routineTarget.target_weight_kg != null ? `${round(routineTarget.target_weight_kg, 1)}kg × ` : ''}${routineTarget.target_reps}`,
      }
    }
    return null
  }

  const topHint = hintFor(0)

  return (
    <Panel className="animate-fade-up">
      <PanelHeader className="flex-wrap gap-2">
        <div>
          <PanelTitle>{exerciseName}</PanelTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-mist)]">
            {exerciseMeta && <span>{exerciseMeta}</span>}
            {bestSet && <Badge tone="gold">Top set: {round(bestSet.weight_kg, 1)}kg × {bestSet.reps}</Badge>}
            {topHint && sets.length === 0 && <span className="text-[var(--color-mist-2)]">{topHint.label}</span>}
          </div>
        </div>
        {onRemoveExercise && (
          <button
            onClick={onRemoveExercise}
            title="Remove exercise"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist-2)] transition-colors hover:bg-[var(--color-rose)]/10 hover:text-[var(--color-rose)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </PanelHeader>
      <PanelBody className="space-y-1">
        {sets.length > 0 && (
          <div className="grid grid-cols-[1.75rem_1fr_1fr_2.5rem_2.5rem_2.5rem_2.5rem] gap-1.5 px-1.5 text-[10px] uppercase tracking-wide text-[var(--color-mist-2)] sm:gap-2">
            <span>Set</span>
            <span className="text-center">kg</span>
            <span className="text-center">Reps</span>
            <span className="text-center">RPE</span>
            <span />
            <span />
            <span />
          </div>
        )}
        {sets.map((set, i) => (
          <SetRow
            key={set.id}
            set={set}
            index={i}
            hint={hintFor(i)}
            onUpdate={(patch) => onUpdateSet(set.id, patch)}
            onToggleComplete={(patch) => onToggleComplete(set, patch)}
            onDelete={() => onDeleteSet(set.id)}
          />
        ))}
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-center" onClick={onAddSet} loading={addingSet}>
          <Plus className="h-3.5 w-3.5" /> Add set
        </Button>
      </PanelBody>
    </Panel>
  )
}
