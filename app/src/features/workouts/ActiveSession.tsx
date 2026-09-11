import { useEffect, useState } from 'react'
import { CheckCircle2, Dumbbell, Layers, Scale, Timer, Weight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatTile } from '@/components/ui/StatTile'
import { formatNumber, round } from '@/lib/utils'
import { DEFAULT_REST_SECONDS, formatDuration, groupSetsByExercise, totalVolume } from './lib'
import {
  useDeleteExerciseFromSession,
  useDeleteSet,
  useExercisesLibrary,
  useInsertSet,
  useRoutineTargets,
  useSessionSets,
  useUpdateSession,
  useUpdateSet,
} from './hooks'
import { ExerciseCardContainer } from './ExerciseCardContainer'
import { ExercisePickerModal } from './ExercisePicker'
import { PlateCalculatorModal } from './PlateCalculator'
import { RestTimer, type ActiveRest } from './RestTimer'
import type { Exercise, WorkoutSession, WorkoutSet } from '@/types/database'

export function ActiveSession({ session, onFinished }: { session: WorkoutSession; onFinished: () => void }) {
  const setsQuery = useSessionSets(session.id)
  const { map: exerciseMap } = useExercisesLibrary()
  const routineTargets = useRoutineTargets(session.routine_id)

  const insertSet = useInsertSet()
  const updateSet = useUpdateSet()
  const deleteSet = useDeleteSet()
  const removeExercise = useDeleteExerciseFromSession()
  const updateSession = useUpdateSession()

  const [nameDraft, setNameDraft] = useState(session.name)
  useEffect(() => setNameDraft(session.name), [session.id, session.name])

  const [elapsed, setElapsed] = useState(() => formatDuration(session.started_at, null))
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatDuration(session.started_at, null)), 1000)
    return () => clearInterval(id)
  }, [session.started_at])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [platesOpen, setPlatesOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [addingSetFor, setAddingSetFor] = useState<string | null>(null)
  const [rest, setRest] = useState<(ActiveRest & { setId: string }) | null>(null)
  const [summary, setSummary] = useState<{ duration: string; exercises: number; sets: number; volume: number } | null>(null)

  const [bodyweight, setBodyweight] = useState('')
  const [notes, setNotes] = useState('')

  const sets = setsQuery.data ?? []
  const targetMap = new Map((routineTargets.data ?? []).map((t) => [t.exercise_id, t]))
  const groups = groupSetsByExercise(sets)
    .map((g) => ({ ...g, order: targetMap.get(g.exerciseId)?.order_index ?? g.order }))
    .sort((a, b) => a.order - b.order)

  function commitName() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== session.name) {
      updateSession.mutate({ id: session.id, patch: { name: trimmed } })
    } else if (!trimmed) {
      setNameDraft(session.name)
    }
  }

  async function handleAddExercise(exercise: Exercise) {
    await insertSet.mutateAsync({ session_id: session.id, exercise_id: exercise.id, set_index: 1 })
  }

  async function handleAddSet(exerciseId: string, currentSets: WorkoutSet[]) {
    const last = currentSets[currentSets.length - 1]
    setAddingSetFor(exerciseId)
    try {
      await insertSet.mutateAsync({
        session_id: session.id,
        exercise_id: exerciseId,
        set_index: (last?.set_index ?? 0) + 1,
        weight_kg: last?.weight_kg ?? 0,
        reps: last?.reps ?? 0,
      })
    } finally {
      setAddingSetFor(null)
    }
  }

  function handleToggleComplete(set: WorkoutSet, patch: Partial<WorkoutSet>) {
    const startingRest = !!patch.completed && !set.is_warmup
    updateSet.mutate({
      id: set.id,
      patch: startingRest ? { ...patch, rest_seconds: DEFAULT_REST_SECONDS } : patch,
    })
    if (startingRest) {
      const exercise = exerciseMap.get(set.exercise_id)
      setRest({
        setId: set.id,
        exerciseName: exercise?.name ?? 'Exercise',
        duration: DEFAULT_REST_SECONDS,
        endAt: Date.now() + DEFAULT_REST_SECONDS * 1000,
      })
    } else {
      setRest((r) => (r?.setId === set.id ? null : r))
    }
  }

  function handleDeleteSet(id: string) {
    deleteSet.mutate(id)
    setRest((r) => (r?.setId === id ? null : r))
  }

  function adjustRest(delta: number) {
    setRest((r) => (r ? { ...r, duration: Math.max(15, r.duration + delta), endAt: r.endAt + delta * 1000 } : r))
  }

  function skipRest() {
    if (rest) updateSet.mutate({ id: rest.setId, patch: { rest_seconds: rest.duration } })
    setRest(null)
  }

  async function handleFinish() {
    const endedAt = new Date().toISOString()
    await updateSession.mutateAsync({
      id: session.id,
      patch: {
        ended_at: endedAt,
        bodyweight_kg: bodyweight.trim() ? Number(bodyweight) : null,
        notes: notes.trim() || null,
      },
    })
    setSummary({
      duration: formatDuration(session.started_at, endedAt),
      exercises: groups.length,
      sets: sets.filter((s) => s.completed).length,
      volume: totalVolume(sets),
    })
    setFinishOpen(false)
    setRest(null)
  }

  if (summary) {
    return (
      <div className="mx-auto max-w-lg animate-fade-up py-10 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--color-emerald)]" strokeWidth={1.3} />
        <h2 className="mt-4 font-display text-2xl text-[var(--color-paper)]">Workout logged</h2>
        <p className="mt-1 text-sm text-[var(--color-mist)]">{session.name} · {summary.duration}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatTile label="Exercises" value={summary.exercises} icon={<Dumbbell className="h-4 w-4" />} />
          <StatTile label="Sets" value={summary.sets} icon={<Layers className="h-4 w-4" />} />
          <StatTile label="Volume" value={`${formatNumber(round(summary.volume))}kg`} icon={<Weight className="h-4 w-4" />} accent="emerald" />
        </div>
        <Button variant="primary" className="mt-8 w-full justify-center" onClick={onFinished}>
          Back to Log
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            className="w-full min-w-0 border-none bg-transparent font-display text-2xl font-medium text-[var(--color-paper)] outline-none focus:text-[var(--color-gold-bright)]"
          />
          <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-mist)]">
            <Timer className="h-3.5 w-3.5" />
            <span className="tabular-nums">{elapsed}</span>
            <span className="text-[var(--color-mist-2)]">· started {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={() => setPlatesOpen(true)}>
            <Scale className="h-4 w-4" /> Plates
          </Button>
          <Button variant="primary" size="md" onClick={() => setFinishOpen(true)}>
            Finish
          </Button>
        </div>
      </div>

      {setsQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading session…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-8 w-8" strokeWidth={1.2} />}
          title="No exercises yet"
          description="Add your first exercise to start logging sets."
          action={<Button variant="primary" onClick={() => setPickerOpen(true)}>Add exercise</Button>}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <ExerciseCardContainer
              key={g.exerciseId}
              exerciseId={g.exerciseId}
              exercise={exerciseMap.get(g.exerciseId)}
              sessionId={session.id}
              sets={g.sets}
              routineTarget={targetMap.get(g.exerciseId)}
              onAddSet={() => handleAddSet(g.exerciseId, g.sets)}
              onUpdateSet={(id, patch) => updateSet.mutate({ id, patch })}
              onToggleComplete={handleToggleComplete}
              onDeleteSet={handleDeleteSet}
              onRemoveExercise={() => removeExercise.mutate({ sessionId: session.id, exerciseId: g.exerciseId })}
              addingSet={addingSetFor === g.exerciseId && insertSet.isPending}
            />
          ))}
          <Button variant="secondary" size="lg" className="w-full justify-center" onClick={() => setPickerOpen(true)}>
            Add exercise
          </Button>
        </div>
      )}

      {rest && <RestTimer rest={rest} onAdjust={adjustRest} onSkip={skipRest} />}

      <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleAddExercise} />
      <PlateCalculatorModal open={platesOpen} onClose={() => setPlatesOpen(false)} />

      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title="Finish workout" className="max-w-sm">
        <div className="space-y-4">
          <Field label="Bodyweight (kg) — optional">
            <Input type="number" inputMode="decimal" value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} placeholder="e.g. 82.5" className="h-11" />
          </Field>
          <Field label="Notes — optional">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="How did it feel?" />
          </Field>
          <Button variant="primary" className="w-full justify-center" size="lg" loading={updateSession.isPending} onClick={handleFinish}>
            Finish workout
          </Button>
        </div>
      </Modal>
    </div>
  )
}
