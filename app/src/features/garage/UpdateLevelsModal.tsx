import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import type { Vehicle } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  vehicle: Vehicle | null
}

function toStrOrEmpty(v: number | null) {
  return v === null ? '' : String(v)
}
function toNumOrNull(v: string) {
  return v === '' ? null : Number(v)
}

export function UpdateLevelsModal({ open, onClose, vehicle }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [fuelLevel, setFuelLevel] = useState('')
  const [batteryLevel, setBatteryLevel] = useState('')
  const [odometer, setOdometer] = useState('')
  const [range, setRange] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !vehicle) return
    setFuelLevel(toStrOrEmpty(vehicle.fuel_level_pct))
    setBatteryLevel(toStrOrEmpty(vehicle.battery_level_pct))
    setOdometer(toStrOrEmpty(vehicle.odometer_km))
    setRange(toStrOrEmpty(vehicle.range_km))
    setFormError(null)
  }, [open, vehicle])

  const showFuel = !!vehicle && vehicle.fuel_type !== 'electric'
  const showBattery = !!vehicle && (vehicle.fuel_type === 'electric' || vehicle.fuel_type === 'hybrid')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !vehicle) throw new Error('Not signed in')
      const payload = {
        fuel_level_pct: showFuel ? toNumOrNull(fuelLevel) : vehicle.fuel_level_pct,
        battery_level_pct: showBattery ? toNumOrNull(batteryLevel) : vehicle.battery_level_pct,
        odometer_km: toNumOrNull(odometer),
        range_km: toNumOrNull(range),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicle.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['garage', 'vehicles', user?.id] })
      onClose()
    },
    onError: (err: unknown) => setFormError(err instanceof Error ? err.message : 'Could not update levels.'),
  })

  if (!vehicle) return null

  return (
    <Modal open={open} onClose={onClose} title={`Update ${vehicle.name}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          {showFuel && (
            <Field label="Fuel %" hint="0–100">
              <Input
                type="number"
                min={0}
                max={100}
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                placeholder="e.g. 65"
                autoFocus
              />
            </Field>
          )}
          {showBattery && (
            <Field label="Battery %" hint="0–100">
              <Input
                type="number"
                min={0}
                max={100}
                value={batteryLevel}
                onChange={(e) => setBatteryLevel(e.target.value)}
                placeholder="e.g. 80"
                autoFocus={!showFuel}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Odometer (km)">
            <Input type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Range (km)">
            <Input type="number" min={0} value={range} onChange={(e) => setRange(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <p className="text-xs text-[var(--color-mist-2)]">
          Manual entry — there&apos;s no live connection to this vehicle, so these numbers only change when you update them.
        </p>

        {formError && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{formError}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
