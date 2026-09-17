import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ChevronDown, History, Layers, Trash2, Weight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { cx, formatNumber, round } from '@/lib/utils'
import { formatDuration, groupSetsByExercise, totalVolume } from './lib'
import { useDeleteSet, useExercisesLibrary, useInsertSet, useUpdateSet } from './hooks'
import { ExerciseCard } from './ExerciseCard'
import type { WorkoutSession, WorkoutSet } from '@/types/database'

type SessionWithSets = WorkoutSession & { workout_sets: WorkoutSet[] }

function useCompletedSessions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['workouts', 'history', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*, workout_sets(*)')
        .eq('user_id', user!.id)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionWithSets[]
    },
  })
}

export function HistoryTab() {
  const sessions = useCompletedSessions()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (sessions.isLoading) {
    return <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading…</p>
  }

  if ((sessions.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<History className="h-8 w-8" strokeWidth={1.2} />}
        title="No workouts logged yet"
        description="Finish a session in the Log tab and it'll show up here."
      />
    )
  }

  return (
    <div className="space-y-3">
      {(sessions.data ?? []).map((session) => (
        <SessionRow key={session.id} session={session} expanded={expandedId === session.id} onToggle={() => setExpandedId((id) => (id === session.id ? null : session.id))} />
      ))}
    </div>
  )
}

function SessionRow({ session, expanded, onToggle }: { session: SessionWithSets; expanded: boolean; onToggle: () => void }) {
  const qc = useQueryClient()
  const { map: exerciseMap } = useExercisesLibrary()
  const insertSet = useInsertSet()
  const updateSet = useUpdateSet()
  const deleteSet = useDeleteSet()
  const [addingSetFor, setAddingSetFor] = useState<string | null>(null)

  const deleteSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('workout_sessions').delete().eq('id', session.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  })

  const sets = session.workout_sets
  const completedSets = sets.filter((s) => s.completed)
  const volume = totalVolume(sets)
  const groups = groupSetsByExercise(sets)

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
        completed: true,
      })
    } finally {
      setAddingSetFor(null)
    }
  }

  return (
    <Panel>
      <button onClick={onToggle} className="flex w-full min-h-14 items-center justify-between gap-4 px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-paper)]">{session.name}</p>
          <p className="mt-0.5 text-xs text-[var(--color-mist)]">
            {format(new Date(session.started_at), 'EEE d MMM, yyyy · HH:mm')} · {formatDuration(session.started_at, session.ended_at)}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Badge tone="neutral">
            <Layers className="h-3 w-3" /> {completedSets.length} sets
          </Badge>
          <Badge tone="gold">
            <Weight className="h-3 w-3" /> {formatNumber(round(volume))}kg
          </Badge>
        </div>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-[var(--color-mist)] transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <PanelBody className="space-y-4 border-t border-[var(--color-line-soft)]">
          <div className="flex items-center justify-between sm:hidden">
            <Badge tone="neutral">{completedSets.length} sets</Badge>
            <Badge tone="gold">{formatNumber(round(volume))}kg volume</Badge>
          </div>

          {session.bodyweight_kg != null && (
            <p className="text-xs text-[var(--color-mist)]">Bodyweight: {round(session.bodyweight_kg, 1)}kg</p>
          )}
          {session.notes && <p className="text-sm text-[var(--color-mist)]">"{session.notes}"</p>}

          {groups.length === 0 ? (
            <p className="text-sm text-[var(--color-mist)]">No sets recorded.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <ExerciseCard
                  key={g.exerciseId}
                  exerciseName={exerciseMap.get(g.exerciseId)?.name ?? 'Exercise'}
                  exerciseMeta={exerciseMap.get(g.exerciseId)?.primary_muscle ?? null}
                  sets={g.sets}
                  onAddSet={() => handleAddSet(g.exerciseId, g.sets)}
                  onUpdateSet={(id, patch) => updateSet.mutate({ id, patch })}
                  onToggleComplete={(set, patch) => updateSet.mutate({ id: set.id, patch })}
                  onDeleteSet={(id) => deleteSet.mutate(id)}
                  addingSet={addingSetFor === g.exerciseId && insertSet.isPending}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (window.confirm('Delete this workout and all its sets? This can\'t be undone.')) deleteSession.mutate()
            }}
            className="flex items-center gap-1.5 text-xs text-[var(--color-mist)] transition-colors hover:text-[var(--color-rose)]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete workout
          </button>
        </PanelBody>
      )}
    </Panel>
  )
}
