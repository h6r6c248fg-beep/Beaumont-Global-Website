import { registerPlugin, Capacitor } from '@capacitor/core'
import type { Session } from '@supabase/supabase-js'
import type { Task } from '@/types/database'
import { isTaskOverdue, isTaskDueToday, formatDueLabel, sortByDue } from '@/features/tasks/taskUtils'

// Bridges the signed-in session and today's tasks into the shared App
// Group storage the iOS Home Screen widget reads from (see
// ios/App/App/SharedStorePlugin.swift + ios/App/MeridianWidgets/). A no-op
// everywhere except the native iOS build.

interface SharedStorePlugin {
  save(options: { json: string }): Promise<void>
}

const NativeSharedStore = registerPlugin<SharedStorePlugin>('SharedStore')

interface SharedTaskItem {
  id: string
  title: string
  completed: boolean
  dueLabel: string | null
  overdue: boolean
}

let lastSnapshot: { session: Session | null; tasksJson: string } = { session: null, tasksJson: '[]' }

async function push() {
  if (!Capacitor.isNativePlatform()) return
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const payload = {
    tasks: JSON.parse(lastSnapshot.tasksJson) as SharedTaskItem[],
    supabaseUrl: url || null,
    supabaseAnonKey: anonKey || null,
    accessToken: lastSnapshot.session?.access_token ?? null,
    updatedAt: new Date().toISOString(),
  }
  try {
    await NativeSharedStore.save({ json: JSON.stringify(payload) })
  } catch {
    // best-effort — the widget just shows stale data until the next successful sync
  }
}

/** Call whenever the auth session changes (sign in, sign out, token refresh). */
export function syncSessionToWidget(session: Session | null) {
  lastSnapshot.session = session
  void push()
}

/** Call whenever the user's tasks are loaded or change. */
export function syncTasksToWidget(tasks: Task[]) {
  const relevant = tasks.filter((t) => !t.completed && (isTaskOverdue(t) || isTaskDueToday(t)))
  const items: SharedTaskItem[] = sortByDue(relevant)
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      title: t.title,
      completed: t.completed,
      dueLabel: t.due_at ? formatDueLabel(t.due_at) : null,
      overdue: isTaskOverdue(t),
    }))
  lastSnapshot.tasksJson = JSON.stringify(items)
  void push()
}
