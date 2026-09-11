import { useState } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { LogTab } from './LogTab'
import { RoutinesTab } from './RoutinesTab'
import { HistoryTab } from './HistoryTab'
import { ExerciseLibrary } from './ExerciseLibrary'

const TABS = [
  { value: 'log', label: 'Log' },
  { value: 'routines', label: 'Routines' },
  { value: 'history', label: 'History' },
  { value: 'exercises', label: 'Exercises' },
]

export function WorkoutsPage() {
  const [tab, setTab] = useState('log')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="animate-fade-up">
        <p className="text-sm text-[var(--color-mist)]">Training</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">Workouts</h1>
        <p className="mt-2 max-w-2xl text-[var(--color-mist)]">Log sets as you lift, build routines, and track personal records over time.</p>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div key={tab} className="animate-fade-up">
        {tab === 'log' && <LogTab />}
        {tab === 'routines' && <RoutinesTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'exercises' && <ExerciseLibrary />}
      </div>
    </div>
  )
}
