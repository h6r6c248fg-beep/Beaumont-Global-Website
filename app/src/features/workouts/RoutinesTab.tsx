import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/Panel'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExercisePickerModal } from './ExercisePicker'
import type { Exercise, Routine, RoutineExercise } from '@/types/database'

interface BuilderRow {
  tempId: string
  exercise: Exercise
  target_sets: number
  target_reps: number
  target_weight_kg: number | null
}

function useRoutinesWithCounts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['workouts', 'routines-with-counts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routines')
        .select('*, routine_exercises(id)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as (Routine & { routine_exercises: { id: string }[] })[]
    },
  })
}

export function RoutinesTab() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const routines = useRoutinesWithCounts()
  const [editorRoutineId, setEditorRoutineId] = useState<string | null | undefined>(undefined) // undefined = closed, null = new

  const deleteRoutine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('routines').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-mist)]">Reusable templates you can start a session from.</p>
        <Button variant="primary" onClick={() => setEditorRoutineId(null)}>
          <Plus className="h-4 w-4" /> New routine
        </Button>
      </div>

      {routines.isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading…</p>
      ) : (routines.data ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" strokeWidth={1.2} />}
          title="No routines yet"
          description="Build a routine once and start from it every time you train."
          action={<Button variant="primary" onClick={() => setEditorRoutineId(null)}>New routine</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(routines.data ?? []).map((routine) => (
            <Panel key={routine.id}>
              <PanelHeader>
                <PanelTitle className="truncate">{routine.name}</PanelTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditorRoutineId(routine.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${routine.name}"? This can't be undone.`)) deleteRoutine.mutate(routine.id)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-[var(--color-rose)]/10 hover:text-[var(--color-rose)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </PanelHeader>
              <PanelBody>
                {routine.description && <p className="mb-2 text-sm text-[var(--color-mist)]">{routine.description}</p>}
                <p className="text-xs text-[var(--color-mist-2)]">{routine.routine_exercises.length} exercise{routine.routine_exercises.length === 1 ? '' : 's'}</p>
              </PanelBody>
            </Panel>
          ))}
        </div>
      )}

      {editorRoutineId !== undefined && (
        <RoutineEditorModal
          routineId={editorRoutineId}
          userId={user!.id}
          onClose={() => setEditorRoutineId(undefined)}
        />
      )}
    </div>
  )
}

function RoutineEditorModal({
  routineId,
  userId,
  onClose,
}: {
  routineId: string | null
  userId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isNew = routineId === null

  const existing = useQuery({
    queryKey: ['workouts', 'routine-editor', routineId],
    enabled: !isNew,
    queryFn: async () => {
      const [{ data: routine, error: rErr }, { data: exercises, error: eErr }] = await Promise.all([
        supabase.from('routines').select('*').eq('id', routineId!).single(),
        supabase
          .from('routine_exercises')
          .select('*, exercises(*)')
          .eq('routine_id', routineId!)
          .order('order_index', { ascending: true }),
      ])
      if (rErr) throw rErr
      if (eErr) throw eErr
      return {
        routine: routine as Routine,
        rows: ((exercises ?? []) as (RoutineExercise & { exercises: Exercise })[]).map((re) => ({
          tempId: re.id,
          exercise: re.exercises,
          target_sets: re.target_sets,
          target_reps: re.target_reps,
          target_weight_kg: re.target_weight_kg,
        })) as BuilderRow[],
      }
    },
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<BuilderRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hydrated, setHydrated] = useState(isNew)

  if (!hydrated && existing.data) {
    setName(existing.data.routine.name)
    setDescription(existing.data.routine.description ?? '')
    setRows(existing.data.rows)
    setHydrated(true)
  }

  function addExercise(exercise: Exercise) {
    setRows((r) => [...r, { tempId: crypto.randomUUID(), exercise, target_sets: 3, target_reps: 10, target_weight_kg: null }])
  }

  function updateRow(tempId: string, patch: Partial<BuilderRow>) {
    setRows((r) => r.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)))
  }

  function removeRow(tempId: string) {
    setRows((r) => r.filter((row) => row.tempId !== tempId))
  }

  function moveRow(tempId: string, dir: -1 | 1) {
    setRows((r) => {
      const i = r.findIndex((row) => row.tempId === tempId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= r.length) return r
      const copy = [...r]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim() || 'Untitled routine'
      let id = routineId
      if (isNew) {
        const { data, error } = await supabase
          .from('routines')
          .insert({ user_id: userId, name: trimmedName, description: description.trim() || null })
          .select('*')
          .single()
        if (error) throw error
        id = (data as Routine).id
      } else {
        const { error } = await supabase
          .from('routines')
          .update({ name: trimmedName, description: description.trim() || null })
          .eq('id', id!)
        if (error) throw error
        const { error: delErr } = await supabase.from('routine_exercises').delete().eq('routine_id', id!)
        if (delErr) throw delErr
      }

      if (rows.length > 0) {
        const insertRows = rows.map((row, i) => ({
          routine_id: id!,
          user_id: userId,
          exercise_id: row.exercise.id,
          order_index: i,
          target_sets: row.target_sets,
          target_reps: row.target_reps,
          target_weight_kg: row.target_weight_kg,
        }))
        const { error } = await supabase.from('routine_exercises').insert(insertRows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] })
      onClose()
    },
  })

  return (
    <Modal open onClose={onClose} title={isNew ? 'New routine' : 'Edit routine'} className="max-w-2xl">
      {!isNew && existing.isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--color-mist)]">Loading…</p>
      ) : (
        <div className="space-y-5">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" className="h-11" autoFocus />
          </Field>
          <Field label="Description — optional">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Chest, shoulders, triceps" />
          </Field>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Exercises</p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={row.tempId} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm text-[var(--color-paper)]">{row.exercise.name}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        disabled={i === 0}
                        onClick={() => moveRow(row.tempId, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)] disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        disabled={i === rows.length - 1}
                        onClick={() => moveRow(row.tempId, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)] disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeRow(row.tempId)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-mist)] transition-colors hover:bg-[var(--color-rose)]/10 hover:text-[var(--color-rose)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase text-[var(--color-mist-2)]">Sets</span>
                      <input
                        type="number"
                        min={1}
                        value={row.target_sets}
                        onChange={(e) => updateRow(row.tempId, { target_sets: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-3)] px-2 text-center text-sm text-[var(--color-paper)] outline-none focus:border-[var(--color-gold-dim)]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase text-[var(--color-mist-2)]">Reps</span>
                      <input
                        type="number"
                        min={1}
                        value={row.target_reps}
                        onChange={(e) => updateRow(row.tempId, { target_reps: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-3)] px-2 text-center text-sm text-[var(--color-paper)] outline-none focus:border-[var(--color-gold-dim)]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase text-[var(--color-mist-2)]">Weight (kg)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={row.target_weight_kg ?? ''}
                        onChange={(e) => updateRow(row.tempId, { target_weight_kg: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="—"
                        className="h-10 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-3)] px-2 text-center text-sm text-[var(--color-paper)] outline-none placeholder:text-[var(--color-mist-2)] focus:border-[var(--color-gold-dim)]"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-2 w-full justify-center" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add exercise
            </Button>
          </div>

          <Button variant="primary" size="lg" className="w-full justify-center" loading={save.isPending} onClick={() => save.mutate()}>
            Save routine
          </Button>
        </div>
      )}

      <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addExercise} />
    </Modal>
  )
}
