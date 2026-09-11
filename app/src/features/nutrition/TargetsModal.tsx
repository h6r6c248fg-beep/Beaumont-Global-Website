import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import type { NutritionTargets } from '@/types/database'

interface TargetsModalProps {
  open: boolean
  onClose: () => void
  userId: string
  targets: NutritionTargets
}

export function TargetsModal({ open, onClose, userId, targets }: TargetsModalProps) {
  const queryClient = useQueryClient()
  const [calories, setCalories] = useState(String(targets.calories))
  const [protein, setProtein] = useState(String(targets.protein_g))
  const [carbs, setCarbs] = useState(String(targets.carbs_g))
  const [fat, setFat] = useState(String(targets.fat_g))

  useEffect(() => {
    if (open) {
      setCalories(String(targets.calories))
      setProtein(String(targets.protein_g))
      setCarbs(String(targets.carbs_g))
      setFat(String(targets.fat_g))
    }
  }, [open, targets])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('nutrition_targets').upsert(
        {
          user_id: userId,
          calories: Number(calories) || 0,
          protein_g: Number(protein) || 0,
          carbs_g: Number(carbs) || 0,
          fat_g: Number(fat) || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'targets', userId] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Edit daily targets">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!save.isPending) save.mutate()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories (kcal)">
            <Input type="number" min="0" step="10" value={calories} onChange={(e) => setCalories(e.target.value)} autoFocus />
          </Field>
          <Field label="Protein (g)">
            <Input type="number" min="0" step="1" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </Field>
          <Field label="Carbs (g)">
            <Input type="number" min="0" step="1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </Field>
          <Field label="Fat (g)">
            <Input type="number" min="0" step="1" value={fat} onChange={(e) => setFat(e.target.value)} />
          </Field>
        </div>

        {save.isError && <p className="text-xs text-[var(--color-rose)]">Couldn&apos;t save your targets. Please try again.</p>}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save targets
          </Button>
        </div>
      </form>
    </Modal>
  )
}
