import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, isToday } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  Cookie,
  Flame,
  Moon,
  Plus,
  Settings2,
  Sun,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx, formatNumber, round } from '@/lib/utils'
import type { MealType, NutritionTargets } from '@/types/database'
import { FoodSearchModal } from './FoodSearchModal'
import { CustomFoodModal } from './CustomFoodModal'
import { TargetsModal } from './TargetsModal'
import { WeightPanel } from './WeightPanel'
import type { FoodLogEntryWithFood } from './types'

const DEFAULT_TARGETS = { calories: 2400, protein_g: 180, carbs_g: 250, fat_g: 70 }

const MEALS: { type: MealType; label: string; icon: typeof Coffee }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: Coffee },
  { type: 'lunch', label: 'Lunch', icon: Sun },
  { type: 'dinner', label: 'Dinner', icon: Moon },
  { type: 'snack', label: 'Snacks', icon: Cookie },
]

interface Totals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

function entryTotals(entries: FoodLogEntryWithFood[]): Totals {
  return entries.reduce<Totals>(
    (acc, e) => {
      const f = e.foods
      if (!f) return acc
      acc.calories += (f.calories ?? 0) * e.servings
      acc.protein += (f.protein_g ?? 0) * e.servings
      acc.carbs += (f.carbs_g ?? 0) * e.servings
      acc.fat += (f.fat_g ?? 0) * e.servings
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function MacroBar({
  label,
  consumed,
  target,
  color,
}: {
  label: string
  consumed: number
  target: number
  color: string
}) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-[var(--color-paper)]">{label}</span>
        <span className="text-[var(--color-mist)]">
          {formatNumber(round(consumed, 1), 1)}g <span className="text-[var(--color-mist-2)]">/ {formatNumber(target)}g</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-obsidian-2)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function NutritionPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const dateStr = format(selectedDate, 'yyyy-MM-dd')

  const [addFoodMeal, setAddFoodMeal] = useState<MealType | null>(null)
  const [customFoodOpen, setCustomFoodOpen] = useState(false)
  const [customFoodSeed, setCustomFoodSeed] = useState('')
  const [customFoodMeal, setCustomFoodMeal] = useState<MealType>('breakfast')
  const [targetsOpen, setTargetsOpen] = useState(false)

  const logQuery = useQuery({
    queryKey: ['nutrition', 'log', userId, dateStr],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_log_entries')
        .select('*, foods(*)')
        .eq('user_id', userId)
        .eq('log_date', dateStr)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as FoodLogEntryWithFood[]
    },
  })

  const targetsQuery = useQuery({
    queryKey: ['nutrition', 'targets', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('nutrition_targets').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (data) return data as NutritionTargets
      const { data: created, error: upsertError } = await supabase
        .from('nutrition_targets')
        .upsert({ user_id: userId, ...DEFAULT_TARGETS }, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (upsertError) throw upsertError
      return created as NutritionTargets
    },
  })

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('food_log_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition', 'log', userId, dateStr] }),
  })

  const entries = logQuery.data ?? []
  const targets: NutritionTargets =
    targetsQuery.data ?? { user_id: userId, updated_at: '', ...DEFAULT_TARGETS }

  const totals = useMemo(() => entryTotals(entries), [entries])
  const remaining = Math.round(targets.calories - totals.calories)
  const caloriePct = targets.calories > 0 ? Math.min(100, (totals.calories / targets.calories) * 100) : 0

  const entriesByMeal = useMemo(() => {
    const map: Record<MealType, FoodLogEntryWithFood[]> = { breakfast: [], lunch: [], dinner: [], snack: [] }
    for (const e of entries) map[e.meal]?.push(e)
    return map
  }, [entries])

  const openAddFood = (meal: MealType) => setAddFoodMeal(meal)
  const openCustomFood = (meal: MealType, seed: string) => {
    setCustomFoodMeal(meal)
    setCustomFoodSeed(seed)
    setCustomFoodOpen(true)
  }

  const dateLabel = isToday(selectedDate) ? `Today · ${format(selectedDate, 'EEEE, d MMMM')}` : format(selectedDate, 'EEEE, d MMMM')

  if (!userId) {
    return (
      <div className="mx-auto max-w-7xl">
        <p className="text-[var(--color-mist)]">Sign in to track your nutrition.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-mist)]">Nutrition</p>
            <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">{dateLabel}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-1">
              <Button variant="ghost" size="icon" onClick={() => setSelectedDate((d) => addDays(d, -1))} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                disabled={isToday(selectedDate)}
                className="px-3"
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSelectedDate((d) => addDays(d, 1))} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setTargetsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Edit targets
            </Button>
          </div>
        </div>
      </div>

      <Panel className="animate-fade-up">
        <PanelHeader>
          <PanelTitle>Daily summary</PanelTitle>
          <Flame className="h-4 w-4 text-[var(--color-gold)]" />
        </PanelHeader>
        <PanelBody>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Calories</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-4xl font-medium text-[var(--color-paper)]">
                  {formatNumber(round(totals.calories, 0))}
                </span>
                <span className="text-sm text-[var(--color-mist)]">/ {formatNumber(targets.calories)} kcal</span>
              </div>
              <p className={cx('mt-1 text-sm', remaining >= 0 ? 'text-[var(--color-emerald)]' : 'text-[var(--color-rose)]')}>
                {remaining >= 0 ? `${formatNumber(remaining)} kcal remaining` : `${formatNumber(Math.abs(remaining))} kcal over target`}
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-obsidian-2)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-bright)] transition-all"
                  style={{ width: `${caloriePct}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <MacroBar label="Protein" consumed={totals.protein} target={targets.protein_g} color="var(--color-azure)" />
              <MacroBar label="Carbs" consumed={totals.carbs} target={targets.carbs_g} color="var(--color-amber)" />
              <MacroBar label="Fat" consumed={totals.fat} target={targets.fat_g} color="var(--color-rose)" />
            </div>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {logQuery.isLoading ? (
            <Panel>
              <PanelBody>
                <p className="py-8 text-center text-sm text-[var(--color-mist)]">Loading today&apos;s log…</p>
              </PanelBody>
            </Panel>
          ) : (
            MEALS.map(({ type, label, icon: Icon }) => {
              const mealEntries = entriesByMeal[type]
              const mealTotals = entryTotals(mealEntries)
              return (
                <Panel key={type}>
                  <PanelHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--color-mist)]" />
                      <PanelTitle>{label}</PanelTitle>
                      {mealEntries.length > 0 && (
                        <Badge tone="neutral">{formatNumber(round(mealTotals.calories, 0))} kcal</Badge>
                      )}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => openAddFood(type)}>
                      <Plus className="h-3.5 w-3.5" /> Add food
                    </Button>
                  </PanelHeader>
                  <PanelBody>
                    {mealEntries.length === 0 ? (
                      <EmptyState
                        icon={<UtensilsCrossed className="h-7 w-7" strokeWidth={1.2} />}
                        title={`Nothing logged for ${label.toLowerCase()}`}
                        description="Search the food library or create a custom food to log it here."
                      />
                    ) : (
                      <ul className="divide-y divide-[var(--color-line-soft)]">
                        {mealEntries.map((entry) => {
                          const f = entry.foods
                          if (!f) return null
                          return (
                            <li key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-[var(--color-paper)]">{f.name}</p>
                                <p className="truncate text-xs text-[var(--color-mist)]">
                                  {f.brand ? `${f.brand} · ` : ''}
                                  {formatNumber(round(entry.servings, 2))} serving{entry.servings === 1 ? '' : 's'} ·{' '}
                                  {formatNumber(round(f.serving_size * entry.servings, 0))}
                                  {f.serving_unit}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-4">
                                <div className="text-right text-xs text-[var(--color-mist)]">
                                  <p className="text-sm font-medium text-[var(--color-paper)]">
                                    {formatNumber(round(f.calories * entry.servings, 0))} kcal
                                  </p>
                                  <p>
                                    P{round(f.protein_g * entry.servings, 0)} · C{round(f.carbs_g * entry.servings, 0)} · F
                                    {round(f.fat_g * entry.servings, 0)}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Remove entry"
                                  onClick={() => removeEntry.mutate(entry.id)}
                                  className="text-[var(--color-mist-2)] hover:text-[var(--color-rose)]"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </PanelBody>
                </Panel>
              )
            })
          )}
        </div>

        <div className="space-y-6">
          <WeightPanel userId={userId} />
        </div>
      </div>

      {addFoodMeal && (
        <FoodSearchModal
          open={!!addFoodMeal}
          onClose={() => setAddFoodMeal(null)}
          userId={userId}
          logDate={dateStr}
          meal={addFoodMeal}
          onCreateCustom={(seed) => openCustomFood(addFoodMeal, seed)}
        />
      )}

      <CustomFoodModal
        open={customFoodOpen}
        onClose={() => setCustomFoodOpen(false)}
        userId={userId}
        logDate={dateStr}
        meal={customFoodMeal}
        initialName={customFoodSeed}
      />

      <TargetsModal open={targetsOpen} onClose={() => setTargetsOpen(false)} userId={userId} targets={targets} />
    </div>
  )
}
