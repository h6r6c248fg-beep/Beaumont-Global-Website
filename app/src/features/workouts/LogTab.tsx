import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ClipboardList, Dumbbell, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useActiveSession, useRoutines } from './hooks'
import { ActiveSession } from './ActiveSession'
import type { Routine, RoutineExercise, WorkoutSession } from '@/types/database'

export function LogTab() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const activeSession = useActiveSession()
  const routines = useRoutines()
  const [routinePickerOpen, setRoutinePickerOpen] = useState(false)
  const [startingRoutineId, setStartingRoutineId] = useState<string | null>(null)

  // Kept separately from the live query result so the "workout finished" summary
  // screen (rendered inside ActiveSession) survives the session flipping to
  // ended_at != null / the active-session query going null on invalidation.
  const [displaySession, setDisplaySession] = useState<WorkoutSession | null>(null)
  useEffect(() => {
    if (activeSession.data) setDisplaySession(activeSession.data)
  }, [activeSession.data])

  const startEmpty = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .insert({ user_id: user!.id, name: `Workout · ${format(new Date(), 'd MMM')}`, started_at: new Date().toISOString() })
        .select('*')
        .single()
      if (error) throw error
      return data as WorkoutSession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  })

  const startFromRoutine = useMutation({
    mutationFn: async (routine: Routine) => {
      setStartingRoutineId(routine.id)
      const { data: session, error: sessionErr } = await supabase
        .from('workout_sessions')
        .insert({ user_id: user!.id, routine_id: routine.id, name: routine.name, started_at: new Date().toISOString() })
        .select('*')
        .single()
      if (sessionErr) throw sessionErr

      const { data: routineExercises, error: reErr } = await supabase
        .from('routine_exercises')
        .select('*')
        .eq('routine_id', routine.id)
        .order('order_index', { ascending: true })
      if (reErr) throw reErr

      const rows = ((routineExercises ?? []) as RoutineExercise[]).flatMap((re) =>
        Array.from({ length: Math.max(1, re.target_sets) }, (_, i) => ({
          session_id: (session as WorkoutSession).id,
          user_id: user!.id,
          exercise_id: re.exercise_id,
          set_index: i + 1,
          weight_kg: 0,
          reps: 0,
          is_warmup: false,
          completed: false,
        }))
      )
      if (rows.length > 0) {
        const { error: setsErr } = await supabase.from('workout_sets').insert(rows)
        if (setsErr) throw setsErr
      }
      return session as WorkoutSession
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] })
      setRoutinePickerOpen(false)
      setStartingRoutineId(null)
    },
    onError: () => setStartingRoutineId(null),
  })

  if (activeSession.isLoading && !displaySession) {
    return <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading…</p>
  }

  if (displaySession) {
    return <ActiveSession session={displaySession} onFinished={() => setDisplaySession(null)} />
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <EmptyState
        icon={<Dumbbell className="h-8 w-8" strokeWidth={1.2} />}
        title="Ready to train"
        description="Start an empty workout and log as you go, or kick off from a saved routine."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={startEmpty.isPending}
          onClick={() => startEmpty.mutate()}
        >
          <Play className="h-4 w-4" /> Start empty workout
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full justify-center"
          disabled={!routines.data || routines.data.length === 0}
          onClick={() => setRoutinePickerOpen(true)}
        >
          <ClipboardList className="h-4 w-4" /> Start from routine
        </Button>
      </div>

      <Modal open={routinePickerOpen} onClose={() => setRoutinePickerOpen(false)} title="Start from routine" className="max-w-md">
        <div className="space-y-2">
          {(routines.data ?? []).map((routine) => (
            <Panel key={routine.id} className="!bg-[var(--color-obsidian-2)]">
              <PanelBody className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--color-paper)]">{routine.name}</p>
                  {routine.description && <p className="truncate text-xs text-[var(--color-mist)]">{routine.description}</p>}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={startingRoutineId === routine.id}
                  onClick={() => startFromRoutine.mutate(routine)}
                >
                  Start
                </Button>
              </PanelBody>
            </Panel>
          ))}
        </div>
      </Modal>
    </div>
  )
}
