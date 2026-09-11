import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import type { Food, MealType } from '@/types/database'

interface CustomFoodModalProps {
  open: boolean
  onClose: () => void
  userId: string
  logDate: string
  meal: MealType
  initialName?: string
}

interface FormState {
  name: string
  brand: string
  serving_size: string
  serving_unit: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
  fiber_g: string
  sugar_g: string
  sodium_mg: string
}

const emptyForm: FormState = {
  name: '',
  brand: '',
  serving_size: '100',
  serving_unit: 'g',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
  fiber_g: '0',
  sugar_g: '0',
  sodium_mg: '0',
}

export function CustomFoodModal({ open, onClose, userId, logDate, meal, initialName }: CustomFoodModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (open) setForm({ ...emptyForm, name: initialName?.trim() ?? '' })
  }, [open, initialName])

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const num = (v: string) => (v.trim() === '' ? 0 : Number(v))

  const createAndLog = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId,
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        serving_size: num(form.serving_size) || 100,
        serving_unit: form.serving_unit.trim() || 'g',
        calories: num(form.calories),
        protein_g: num(form.protein_g),
        carbs_g: num(form.carbs_g),
        fat_g: num(form.fat_g),
        fiber_g: num(form.fiber_g),
        sugar_g: num(form.sugar_g),
        sodium_mg: num(form.sodium_mg),
        is_custom: true,
      }
      const { data: food, error: foodError } = await supabase.from('foods').insert(payload).select('*').single()
      if (foodError) throw foodError
      const created = food as Food

      const { error: logError } = await supabase.from('food_log_entries').insert({
        user_id: userId,
        food_id: created.id,
        log_date: logDate,
        meal,
        servings: 1,
      })
      if (logError) throw logError
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'log', userId, logDate] })
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'food-search'] })
      setForm(emptyForm)
      onClose()
    },
  })

  const canSubmit = form.name.trim().length > 0 && form.calories.trim() !== ''

  return (
    <Modal open={open} onClose={onClose} title="Create custom food">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit && !createAndLog.isPending) createAndLog.mutate()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Homemade protein bar" required />
          </Field>
          <Field label="Brand (optional)">
            <Input value={form.brand} onChange={set('brand')} placeholder="e.g. Optimum Nutrition" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Serving size">
            <Input type="number" min="0" step="0.1" value={form.serving_size} onChange={set('serving_size')} />
          </Field>
          <Field label="Unit">
            <Input value={form.serving_unit} onChange={set('serving_unit')} placeholder="g / ml / serving" />
          </Field>
          <Field label="Calories">
            <Input type="number" min="0" step="1" value={form.calories} onChange={set('calories')} required />
          </Field>
          <Field label="Sodium (mg)">
            <Input type="number" min="0" step="1" value={form.sodium_mg} onChange={set('sodium_mg')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Protein (g)">
            <Input type="number" min="0" step="0.1" value={form.protein_g} onChange={set('protein_g')} />
          </Field>
          <Field label="Carbs (g)">
            <Input type="number" min="0" step="0.1" value={form.carbs_g} onChange={set('carbs_g')} />
          </Field>
          <Field label="Fat (g)">
            <Input type="number" min="0" step="0.1" value={form.fat_g} onChange={set('fat_g')} />
          </Field>
          <Field label="Fiber (g)">
            <Input type="number" min="0" step="0.1" value={form.fiber_g} onChange={set('fiber_g')} />
          </Field>
          <Field label="Sugar (g)">
            <Input type="number" min="0" step="0.1" value={form.sugar_g} onChange={set('sugar_g')} />
          </Field>
        </div>

        {createAndLog.isError && (
          <p className="text-xs text-[var(--color-rose)]">Couldn&apos;t save that food. Please try again.</p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={createAndLog.isPending} disabled={!canSubmit}>
            Save &amp; log food
          </Button>
        </div>
      </form>
    </Modal>
  )
}
