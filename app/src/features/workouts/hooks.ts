import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Exercise, WorkoutSet } from '@/types/database'

/** Invalidates every workouts query. Simple and correct at this app's scale. */
function useInvalidateWorkouts() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['workouts'] })
}

/** Global + this user's custom exercise library, as a list and an id-keyed lookup map. */
export function useExercisesLibrary() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['workouts', 'exercises', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .or(`user_id.eq.${user!.id},user_id.is.null`)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as Exercise[]
    },
  })
  const map = new Map<string, Exercise>()
  for (const ex of query.data ?? []) map.set(ex.id, ex)
  return { ...query, exercises: query.data ?? [], map }
}

export function useCreateCustomExercise() {
  const { user } = useAuth()
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async (input: { name: string; category: string; primary_muscle: string | null; equipment: string | null }) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...input, user_id: user!.id, is_custom: true })
        .select('*')
        .single()
      if (error) throw error
      return data as Exercise
    },
    onSuccess: () => invalidate(),
  })
}

export function useInsertSet() {
  const { user } = useAuth()
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async (input: {
      session_id: string
      exercise_id: string
      set_index: number
      weight_kg?: number
      reps?: number
      is_warmup?: boolean
      completed?: boolean
    }) => {
      const { data, error } = await supabase
        .from('workout_sets')
        .insert({
          session_id: input.session_id,
          exercise_id: input.exercise_id,
          set_index: input.set_index,
          weight_kg: input.weight_kg ?? 0,
          reps: input.reps ?? 0,
          is_warmup: input.is_warmup ?? false,
          completed: input.completed ?? false,
          user_id: user!.id,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as WorkoutSet
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateSet() {
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<WorkoutSet> }) => {
      const { data, error } = await supabase.from('workout_sets').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      return data as WorkoutSet
    },
    onSuccess: () => invalidate(),
  })
}

export function useDeleteSet() {
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_sets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

export function useDeleteExerciseFromSession() {
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async ({ sessionId, exerciseId }: { sessionId: string; exerciseId: string }) => {
      const { error } = await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', exerciseId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * The most recent completed, non-warmup sets logged for this exercise in an earlier
 * session (one full set-by-set array), used to render "last: 60kg x 8" style hints.
 */
export function usePreviousExerciseSets(exerciseId: string | undefined, excludeSessionId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['workouts', 'previous-sets', user?.id, exerciseId, excludeSessionId],
    enabled: !!user && !!exerciseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('user_id', user!.id)
        .eq('exercise_id', exerciseId!)
        .eq('completed', true)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      const rows = ((data ?? []) as WorkoutSet[]).filter((s) => s.session_id !== excludeSessionId)
      if (rows.length === 0) return [] as WorkoutSet[]
      const latestSessionId = rows[0].session_id
      return rows.filter((s) => s.session_id === latestSessionId).sort((a, b) => a.set_index - b.set_index)
    },
  })
}
