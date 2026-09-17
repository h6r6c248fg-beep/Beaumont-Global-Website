import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { AuthPage } from '@/features/auth/AuthPage'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })))
const GaragePage = lazy(() => import('@/features/garage/GaragePage').then((m) => ({ default: m.GaragePage })))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const EmailPage = lazy(() => import('@/features/email/EmailPage').then((m) => ({ default: m.EmailPage })))
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })))
const CyclesPage = lazy(() => import('@/features/cycles/CyclesPage').then((m) => ({ default: m.CyclesPage })))
const NutritionPage = lazy(() => import('@/features/nutrition/NutritionPage').then((m) => ({ default: m.NutritionPage })))
const WorkoutsPage = lazy(() => import('@/features/workouts/WorkoutsPage').then((m) => ({ default: m.WorkoutsPage })))
const FinancePage = lazy(() => import('@/features/integrations/FinancePage').then((m) => ({ default: m.FinancePage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Compass className="h-6 w-6 animate-spin text-[var(--color-gold)]" strokeWidth={1.5} />
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/tasks" element={<Protected><TasksPage /></Protected>} />
      <Route path="/garage" element={<Protected><GaragePage /></Protected>} />
      <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/email" element={<Protected><EmailPage /></Protected>} />
      <Route path="/assistant" element={<Protected><AssistantPage /></Protected>} />
      <Route path="/cycles" element={<Protected><CyclesPage /></Protected>} />
      <Route path="/nutrition" element={<Protected><NutritionPage /></Protected>} />
      <Route path="/workouts" element={<Protected><WorkoutsPage /></Protected>} />
      <Route path="/finance" element={<Protected><FinancePage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    </Routes>
  )
}
