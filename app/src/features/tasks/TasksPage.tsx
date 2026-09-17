import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ListChecks, Plus, AlarmClockCheck, CalendarClock, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { syncTasksToWidget } from '@/lib/widgetSync'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx } from '@/lib/utils'
import type { Task } from '@/types/database'
import { TaskRow } from './TaskRow'
import { TaskModal } from './TaskModal'
import { INBOX, isTaskDueToday, isTaskOverdue, listNamesFrom, sortByDue } from './taskUtils'

type View = { kind: 'today' } | { kind: 'overdue' } | { kind: 'list'; name: string }

const viewKey = (v: View) => (v.kind === 'list' ? `list:${v.name}` : v.kind)

export function TasksPage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  const [view, setView] = useState<View>({ kind: 'today' })
  const [showCompleted, setShowCompleted] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const tasksQuery = useQuery({
    queryKey: ['tasks', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Task[]
    },
  })

  // Keep the iOS Home Screen widget's snapshot current whenever the
  // task list loads or changes (react-query re-runs this on every
  // invalidate, e.g. after add/edit/toggle/delete).
  useEffect(() => {
    if (tasksQuery.data) syncTasksToWidget(tasksQuery.data)
  }, [tasksQuery.data])

  const tasks = tasksQuery.data ?? []

  const listNames = useMemo(() => listNamesFrom(tasks), [tasks])

  const listCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (t.completed) continue
      const name = t.list_name || INBOX
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return counts
  }, [tasks])

  const todayCount = useMemo(() => tasks.filter((t) => !t.completed && isTaskDueToday(t)).length, [tasks])
  const overdueCount = useMemo(() => tasks.filter(isTaskOverdue).length, [tasks])

  const filteredTasks = useMemo(() => {
    if (view.kind === 'today') return tasks.filter(isTaskDueToday)
    if (view.kind === 'overdue') return tasks.filter(isTaskOverdue)
    return tasks.filter((t) => (t.list_name || INBOX) === view.name)
  }, [tasks, view])

  const activeTasks = useMemo(
    () => sortByDue(filteredTasks.filter((t) => !t.completed)),
    [filteredTasks]
  )
  const completedTasks = useMemo(
    () =>
      filteredTasks
        .filter((t) => t.completed)
        .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime()),
    [filteredTasks]
  )

  const quickAddMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!user) throw new Error('Not signed in')
      const list_name = view.kind === 'list' ? view.name : INBOX
      const { error } = await supabase.from('tasks').insert({
        user_id: user.id,
        title,
        list_name,
        priority: 'medium',
        due_at: null,
        completed: false,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', userId] }),
  })

  const toggleMutation = useMutation({
    mutationFn: async (task: Task) => {
      const completed = !task.completed
      const { error } = await supabase
        .from('tasks')
        .update({ completed, completed_at: completed ? new Date().toISOString() : null })
        .eq('id', task.id)
      if (error) throw error
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', userId] })
      const previous = queryClient.getQueryData<Task[]>(['tasks', userId])
      queryClient.setQueryData<Task[]>(['tasks', userId], (old) =>
        (old ?? []).map((t) =>
          t.id === task.id
            ? { ...t, completed: !t.completed, completed_at: !t.completed ? new Date().toISOString() : null }
            : t
        )
      )
      return { previous }
    },
    onError: (_err, _task, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks', userId], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks', userId] }),
  })

  const onQuickAdd = (e: FormEvent) => {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    setQuickTitle('')
    quickAddMutation.mutate(title)
  }

  const openCreateModal = () => {
    setEditingTask(null)
    setModalOpen(true)
  }
  const openEditModal = (task: Task) => {
    setEditingTask(task)
    setModalOpen(true)
  }

  const switchView = (next: View) => {
    setView(next)
    setShowCompleted(false)
  }

  const viewTitle = view.kind === 'today' ? 'Today' : view.kind === 'overdue' ? 'Overdue' : view.name

  const emptyCopy =
    view.kind === 'today'
      ? { title: 'Nothing due today', description: 'Enjoy the clear runway — add something above if you think of it.' }
      : view.kind === 'overdue'
        ? { title: "You're all caught up", description: 'No overdue tasks. Nice work.' }
        : { title: 'This list is empty', description: 'Add a task above to get started.' }

  const railButton = (key: string, label: string, count: number, active: boolean, onClick: () => void, icon?: React.ReactNode) => (
    <button
      key={key}
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors md:w-full',
        active
          ? 'bg-[var(--color-gold)]/12 text-[var(--color-gold-bright)]'
          : 'text-[var(--color-mist)] hover:bg-white/[0.04] hover:text-[var(--color-paper)]'
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span
          className={cx(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            active ? 'bg-[var(--color-gold)]/20 text-[var(--color-gold-bright)]' : 'bg-white/5 text-[var(--color-mist)]'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium text-[var(--color-paper)]">Tasks</h1>
          <p className="mt-1 text-[var(--color-mist)]">Capture it fast, sort it later.</p>
        </div>
        <Button variant="primary" size="md" onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      <form onSubmit={onQuickAdd} className="flex items-center gap-2">
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder={view.kind === 'list' ? `Add to ${view.name}…` : 'Quick add a task and press Enter…'}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="md" disabled={!quickTitle.trim()} loading={quickAddMutation.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 md:w-56 md:flex-col md:overflow-visible md:pb-0">
          {railButton('today', 'Today', todayCount, view.kind === 'today', () => switchView({ kind: 'today' }), <CalendarClock className="h-4 w-4 shrink-0" />)}
          {railButton('overdue', 'Overdue', overdueCount, view.kind === 'overdue', () => switchView({ kind: 'overdue' }), <AlarmClockCheck className="h-4 w-4 shrink-0" />)}
          <div className="mx-1 my-1 hidden h-px bg-[var(--color-line-soft)] md:block" />
          {listNames.map((name) =>
            railButton(
              `list:${name}`,
              name,
              listCounts.get(name) ?? 0,
              view.kind === 'list' && view.name === name,
              () => switchView({ kind: 'list', name }),
              <ListChecks className="h-4 w-4 shrink-0" />
            )
          )}
        </nav>

        <div className="min-w-0 flex-1" key={viewKey(view)}>
          <Panel>
            <PanelHeader>
              <PanelTitle>{viewTitle}</PanelTitle>
              <Badge tone="neutral">{activeTasks.length}</Badge>
            </PanelHeader>
            <PanelBody>
              {tasksQuery.isLoading ? (
                <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading…</p>
              ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-8 w-8" strokeWidth={1.2} />}
                  title={emptyCopy.title}
                  description={emptyCopy.description}
                />
              ) : (
                <>
                  {activeTasks.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[var(--color-mist)]">{emptyCopy.title}</p>
                  ) : (
                    <div className="divide-y divide-[var(--color-line-soft)]">
                      {activeTasks.map((task) => (
                        <TaskRow key={task.id} task={task} onToggleComplete={toggleMutation.mutate} onOpen={openEditModal} />
                      ))}
                    </div>
                  )}

                  {completedTasks.length > 0 && (
                    <div className="mt-3 border-t border-[var(--color-line-soft)] pt-2">
                      <button
                        onClick={() => setShowCompleted((v) => !v)}
                        className="flex items-center gap-1.5 py-2 text-xs font-medium text-[var(--color-mist)] transition-colors hover:text-[var(--color-paper)]"
                      >
                        <ChevronRight className={cx('h-3.5 w-3.5 transition-transform', showCompleted && 'rotate-90')} />
                        Completed ({completedTasks.length})
                      </button>
                      {showCompleted && (
                        <div className="divide-y divide-[var(--color-line-soft)]">
                          {completedTasks.map((task) => (
                            <TaskRow key={task.id} task={task} onToggleComplete={toggleMutation.mutate} onOpen={openEditModal} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        listNames={listNames}
        defaultListName={view.kind === 'list' ? view.name : INBOX}
      />
    </div>
  )
}
