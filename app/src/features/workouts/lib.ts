import { differenceInSeconds } from 'date-fns'
import type { WorkoutSet } from '@/types/database'

/** Standard plates available (kg), heaviest first, for the greedy plate calculator. */
export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const

/** Default rest timer duration, in seconds. */
export const DEFAULT_REST_SECONDS = 90

/** Formats an elapsed/duration span as `1h 24m`, `24m 10s` or `42s`. */
export function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : new Date()
  const totalSeconds = Math.max(0, differenceInSeconds(end, start))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Formats a countdown/elapsed span in seconds as `mm:ss` (or `h:mm:ss` past an hour). */
export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  const s = clamped % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Total working volume (weight x reps) across completed, non-warmup sets. */
export function totalVolume(sets: WorkoutSet[]): number {
  return sets.filter((s) => s.completed && !s.is_warmup).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
}

/** Estimated one-rep max via the Epley formula. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg
  return weightKg * (1 + reps / 30)
}

/** Greedy plate breakdown (per side) for a target barbell load. Returns [] if under bar weight. */
export function calculatePlates(targetWeightKg: number, barWeightKg: number): number[] {
  let perSide = (targetWeightKg - barWeightKg) / 2
  if (!Number.isFinite(perSide) || perSide <= 0) return []
  const plates: number[] = []
  for (const plate of STANDARD_PLATES_KG) {
    while (perSide + 1e-6 >= plate) {
      plates.push(plate)
      perSide -= plate
    }
  }
  return plates
}

export interface ExerciseGroup {
  exerciseId: string
  sets: WorkoutSet[]
  /** Lower sorts first; routine-driven groups use their routine order_index, freeform adds append after. */
  order: number
}

/** Groups a flat list of sets by exercise, sets sorted by set_index, groups by first-appearance order. */
export function groupSetsByExercise(sets: WorkoutSet[]): ExerciseGroup[] {
  const byExercise = new Map<string, WorkoutSet[]>()
  const appearanceOrder: string[] = []
  const sorted = [...sets].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const set of sorted) {
    if (!byExercise.has(set.exercise_id)) {
      byExercise.set(set.exercise_id, [])
      appearanceOrder.push(set.exercise_id)
    }
    byExercise.get(set.exercise_id)!.push(set)
  }
  for (const group of byExercise.values()) {
    group.sort((a, b) => a.set_index - b.set_index)
  }
  return appearanceOrder.map((exerciseId, i) => ({
    exerciseId,
    sets: byExercise.get(exerciseId)!,
    order: 1000 + i,
  }))
}
