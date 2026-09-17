import { ExerciseCard, type RoutineTarget } from './ExerciseCard'
import { usePreviousExerciseSets } from './hooks'
import type { Exercise, WorkoutSet } from '@/types/database'

/**
 * Wraps ExerciseCard with the "previous performance" data fetch for one exercise —
 * split out so each exercise in a session list can call its own hook instance.
 */
export function ExerciseCardContainer({
  exerciseId,
  exercise,
  sessionId,
  sets,
  routineTarget,
  onAddSet,
  onUpdateSet,
  onToggleComplete,
  onDeleteSet,
  onRemoveExercise,
  addingSet,
}: {
  exerciseId: string
  exercise: Exercise | undefined
  sessionId: string
  sets: WorkoutSet[]
  routineTarget?: RoutineTarget
  onAddSet: () => void
  onUpdateSet: (id: string, patch: Partial<WorkoutSet>) => void
  onToggleComplete: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (id: string) => void
  onRemoveExercise?: () => void
  addingSet?: boolean
}) {
  const previous = usePreviousExerciseSets(exerciseId, sessionId)

  return (
    <ExerciseCard
      exerciseName={exercise?.name ?? 'Exercise'}
      exerciseMeta={exercise?.primary_muscle ?? exercise?.equipment ?? null}
      sets={sets}
      previousSets={previous.data ?? []}
      routineTarget={routineTarget}
      onAddSet={onAddSet}
      onUpdateSet={onUpdateSet}
      onToggleComplete={onToggleComplete}
      onDeleteSet={onDeleteSet}
      onRemoveExercise={onRemoveExercise}
      addingSet={addingSet}
    />
  )
}
