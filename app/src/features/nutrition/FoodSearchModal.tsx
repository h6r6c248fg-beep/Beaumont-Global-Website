import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, ChevronLeft, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { formatNumber, round, cx } from '@/lib/utils'
import type { Food, MealType } from '@/types/database'

interface FoodSearchModalProps {
  open: boolean
  onClose: () => void
  userId: string
  logDate: string
  meal: MealType
  onCreateCustom: (query: string) => void
}

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snacks',
}

export function FoodSearchModal({ open, onClose, userId, logDate, meal, onCreateCustom }: FoodSearchModalProps) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<Food | null>(null)
  const [servings, setServings] = useState('1')

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebounced('')
      setSelected(null)
      setServings('1')
    }
  }, [open])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const results = useQuery({
    queryKey: ['nutrition', 'food-search', userId, debounced],
    enabled: open && !!userId && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', `%${debounced}%`)
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('is_custom', { ascending: true })
        .order('name', { ascending: true })
        .limit(25)
      if (error) throw error
      return (data ?? []) as Food[]
    },
  })

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return
      const qty = Number(servings) || 0
      const { error } = await supabase.from('food_log_entries').insert({
        user_id: userId,
        food_id: selected.id,
        log_date: logDate,
        meal,
        servings: qty > 0 ? qty : 1,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'log', userId, logDate] })
      onClose()
    },
  })

  const closeAndOpenCustom = () => {
    const seed = query
    onClose()
    onCreateCustom(seed)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add food · ${MEAL_LABEL[meal]}`}>
      {!selected ? (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-mist-2)]" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods, e.g. chicken breast"
              className="pl-9"
            />
          </div>

          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {debounced.length < 2 && (
              <p className="px-1 py-6 text-center text-sm text-[var(--color-mist)]">
                Type at least 2 characters to search the food library.
              </p>
            )}

            {debounced.length >= 2 && results.isLoading && (
              <p className="px-1 py-6 text-center text-sm text-[var(--color-mist)]">Searching…</p>
            )}

            {debounced.length >= 2 && !results.isLoading && (results.data?.length ?? 0) === 0 && (
              <EmptyState
                icon={<UtensilsCrossed className="h-7 w-7" strokeWidth={1.2} />}
                title="No matches"
                description={`Nothing found for "${debounced}" in the shared library or your custom foods.`}
                action={
                  <Button variant="secondary" size="sm" onClick={closeAndOpenCustom}>
                    <Plus className="h-3.5 w-3.5" /> Create custom food
                  </Button>
                }
              />
            )}

            {results.data?.map((food) => (
              <button
                key={food.id}
                onClick={() => {
                  setSelected(food)
                  setServings('1')
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[var(--color-gold-dim)] hover:bg-white/5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-[var(--color-paper)]">{food.name}</p>
                    {food.is_custom && (
                      <Badge tone="gold" className="shrink-0">
                        Custom
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-[var(--color-mist)]">
                    {food.brand ? `${food.brand} · ` : ''}
                    per {formatNumber(food.serving_size)}
                    {food.serving_unit}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-[var(--color-mist)]">
                  <p className="text-sm font-medium text-[var(--color-paper)]">{formatNumber(round(food.calories, 0))} kcal</p>
                  <p>
                    P{round(food.protein_g, 0)} · C{round(food.carbs_g, 0)} · F{round(food.fat_g, 0)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--color-line)] pt-3 text-center">
            <button
              onClick={closeAndOpenCustom}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Can&apos;t find it? Create a custom food
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-xs text-[var(--color-mist)] hover:text-[var(--color-paper)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to search
          </button>

          <div>
            <p className="font-display text-lg text-[var(--color-paper)]">{selected.name}</p>
            <p className="text-xs text-[var(--color-mist)]">
              {selected.brand ? `${selected.brand} · ` : ''}
              per {formatNumber(selected.serving_size)}
              {selected.serving_unit}
            </p>
          </div>

          <Field label="Servings" hint={`1 serving = ${formatNumber(selected.serving_size)}${selected.serving_unit}`}>
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3 text-center">
            {[
              { label: 'Kcal', value: round((selected.calories || 0) * (Number(servings) || 0), 0) },
              { label: 'Protein', value: `${round((selected.protein_g || 0) * (Number(servings) || 0), 1)}g` },
              { label: 'Carbs', value: `${round((selected.carbs_g || 0) * (Number(servings) || 0), 1)}g` },
              { label: 'Fat', value: `${round((selected.fat_g || 0) * (Number(servings) || 0), 1)}g` },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-mist-2)]">{s.label}</p>
                <p className="mt-0.5 text-sm font-medium text-[var(--color-paper)]">{s.value}</p>
              </div>
            ))}
          </div>

          {logMutation.isError && (
            <p className="text-xs text-[var(--color-rose)]">Couldn&apos;t log that food. Please try again.</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={logMutation.isPending}
              disabled={!servings || Number(servings) <= 0}
              onClick={() => logMutation.mutate()}
              className={cx('capitalize')}
            >
              Log to {MEAL_LABEL[meal]}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
