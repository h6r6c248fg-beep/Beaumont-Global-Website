import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, Dumbbell, Search, TrendingUp, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx, round } from '@/lib/utils'
import { epley1RM } from './lib'
import { useExercisesLibrary } from './hooks'
import type { WorkoutSet } from '@/types/database'

const CATEGORY_LABELS: Record<string, string> = { strength: 'Strength', core: 'Core', cardio: 'Cardio' }
const CATEGORY_ORDER = ['strength', 'core', 'cardio']

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

export function ExerciseLibrary() {
  const { exercises, isLoading } = useExercisesLibrary()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
    const byCategory = new Map<string, typeof exercises>()
    for (const ex of filtered) {
      if (!byCategory.has(ex.category)) byCategory.set(ex.category, [])
      byCategory.get(ex.category)!.push(ex)
    }
    const categories = [...byCategory.keys()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b) || a.localeCompare(b)
    )
    return categories.map((category) => ({ category, items: byCategory.get(category)! }))
  }, [exercises, search])

  return (
    <div className="space-y-5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-mist-2)]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises…" className="h-11 pl-9" />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-mist)]">Loading…</p>
      ) : grouped.length === 0 ? (
        <EmptyState icon={<Dumbbell className="h-8 w-8" strokeWidth={1.2} />} title="No exercises found" description={`Nothing matches "${search}".`} />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">{categoryLabel(category)}</p>
              <div className="space-y-2">
                {items.map((ex) => (
                  <Panel key={ex.id}>
                    <button
                      onClick={() => setExpandedId((id) => (id === ex.id ? null : ex.id))}
                      className="flex w-full min-h-14 items-center justify-between gap-3 px-5 py-3.5 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--color-paper)]">{ex.name}</p>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-mist)]">
                          {[ex.primary_muscle, ex.equipment].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {ex.is_custom && <Badge tone="azure">Custom</Badge>}
                        <ChevronDown className={cx('h-4 w-4 text-[var(--color-mist)] transition-transform', expandedId === ex.id && 'rotate-180')} />
                      </div>
                    </button>
                    {expandedId === ex.id && <ExerciseDetail exerciseId={ex.id} instructions={ex.instructions} />}
                  </Panel>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function useExerciseHistory(exerciseId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['workouts', 'exercise-history', user?.id, exerciseId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('*, workout_sessions!inner(started_at)')
        .eq('user_id', user!.id)
        .eq('exercise_id', exerciseId)
        .eq('completed', true)
        .eq('is_warmup', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as (WorkoutSet & { workout_sessions: { started_at: string } })[]
    },
  })
}

function ExerciseDetail({ exerciseId, instructions }: { exerciseId: string; instructions: string | null }) {
  const history = useExerciseHistory(exerciseId)
  const sets = history.data ?? []

  const stats = useMemo(() => {
    if (sets.length === 0) return null
    let maxWeight = sets[0]
    let best1RM = epley1RM(sets[0].weight_kg, sets[0].reps)
    let best1RMSet = sets[0]
    for (const s of sets) {
      if (s.weight_kg > maxWeight.weight_kg) maxWeight = s
      const rm = epley1RM(s.weight_kg, s.reps)
      if (rm > best1RM) {
        best1RM = rm
        best1RMSet = s
      }
    }
    const bySession = new Map<string, number>()
    for (const s of sets) {
      const day = s.workout_sessions.started_at
      const prev = bySession.get(day)
      if (!prev || s.weight_kg > prev) bySession.set(day, s.weight_kg)
    }
    const chartData = [...bySession.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, weight]) => ({ date, label: format(new Date(date), 'd MMM'), weight }))
    return { maxWeight, best1RM, best1RMSet, chartData }
  }, [sets])

  return (
    <PanelBody className="space-y-4 border-t border-[var(--color-line-soft)]">
      {instructions && <p className="text-sm text-[var(--color-mist)]">{instructions}</p>}

      {history.isLoading ? (
        <p className="text-sm text-[var(--color-mist)]">Loading history…</p>
      ) : !stats ? (
        <EmptyState
          icon={<TrendingUp className="h-7 w-7" strokeWidth={1.2} />}
          title="Never logged"
          description="Log a set for this exercise to start tracking personal records."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--color-mist)]">
                <Trophy className="h-3 w-3 text-[var(--color-gold)]" /> Max weight
              </p>
              <p className="mt-1 font-display text-xl text-[var(--color-paper)]">{round(stats.maxWeight.weight_kg, 1)}kg</p>
              <p className="text-xs text-[var(--color-mist-2)]">× {stats.maxWeight.reps} reps</p>
            </div>
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-mist)]">Est. 1RM (Epley)</p>
              <p className="mt-1 font-display text-xl text-[var(--color-gold-bright)]">{round(stats.best1RM, 1)}kg</p>
              <p className="text-xs text-[var(--color-mist-2)]">
                from {round(stats.best1RMSet.weight_kg, 1)}kg × {stats.best1RMSet.reps}
              </p>
            </div>
          </div>

          {stats.chartData.length > 1 && (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-obsidian-2)',
                      border: '1px solid var(--color-line)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--color-paper)',
                    }}
                    formatter={(value) => [`${round(Number(value), 1)}kg`, 'Top set']}
                  />
                  <Line type="monotone" dataKey="weight" stroke="var(--color-gold)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-gold)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </PanelBody>
  )
}
