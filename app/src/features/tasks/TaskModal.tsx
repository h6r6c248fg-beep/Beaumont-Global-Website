import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Input'
import type { Task, TaskPriority } from '@/types/database'
import { INBOX, fromLocalInputValue, toLocalInputValue } from './taskUtils'

const NEW_LIST_VALUE = '__new__'

export function TaskModal({
  open,
  onClose,
  task,
  listNames,
  defaultListName,
}: {
  open: boolean
  onClose: () => void
  /** null/undefined creates a new task; passing a task edits it. */
  task?: Task | null
  listNames: string[]
  defaultListName?: string
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isEditing = !!task

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [listName, setListName] = useState(INBOX)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setNotes(task?.notes ?? '')
    setListName(task?.list_name ?? defaultListName ?? INBOX)
    setShowNewList(false)
    setNewListName('')
    setPriority(task?.priority ?? 'medium')
    setDueAt(toLocalInputValue(task?.due_at ?? null))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const trimmedTitle = title.trim()
      if (!trimmedTitle) throw new Error('Give the task a title.')
      const finalListName = (showNewList ? newListName.trim() : listName) || INBOX

      const payload = {
        title: trimmedTitle,
        notes: notes.trim() || null,
        list_name: finalListName,
        priority,
        due_at: fromLocalInputValue(dueAt),
      }

      if (isEditing && task) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tasks').insert({ ...payload, user_id: user.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!task) return
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    saveMutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit task' : 'New task'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus required />
        </Field>

        <Field label="Notes" hint="Optional">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add details…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="List">
            {showNewList ? (
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name"
                autoFocus
              />
            ) : (
              <Select
                value={listName}
                onChange={(e) => {
                  if (e.target.value === NEW_LIST_VALUE) {
                    setShowNewList(true)
                    setNewListName('')
                  } else {
                    setListName(e.target.value)
                  }
                }}
              >
                {listNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={NEW_LIST_VALUE}>+ New list</option>
              </Select>
            )}
            {showNewList && (
              <button
                type="button"
                onClick={() => setShowNewList(false)}
                className="mt-1 text-xs text-[var(--color-mist)] hover:text-[var(--color-paper)]"
              >
                Choose existing list
              </button>
            )}
          </Field>

          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>

        <Field label="Due" hint="Optional — leave blank for no due date">
          <div className="flex items-center gap-2">
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="flex-1" />
            {dueAt && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDueAt('')}>
                Clear
              </Button>
            )}
          </div>
        </Field>

        {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {isEditing ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>
              {isEditing ? 'Save changes' : 'Add task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
