import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import type { FuelType, Vehicle } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  /** null = creating a new vehicle. */
  vehicle: Vehicle | null
}

const FUEL_TYPE_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'other', label: 'Other' },
]

function toStrOrEmpty(v: number | null) {
  return v === null ? '' : String(v)
}
function toNumOrNull(v: string) {
  return v === '' ? null : Number(v)
}

export function VehicleModal({ open, onClose, vehicle }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isEditing = !!vehicle

  const [name, setName] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('petrol')
  const [fuelLevel, setFuelLevel] = useState('')
  const [batteryLevel, setBatteryLevel] = useState('')
  const [odometer, setOdometer] = useState('')
  const [range, setRange] = useState('')
  const [lastServiceDate, setLastServiceDate] = useState('')
  const [nextServiceDue, setNextServiceDue] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (vehicle) {
      setName(vehicle.name)
      setMake(vehicle.make ?? '')
      setModel(vehicle.model ?? '')
      setYear(vehicle.year === null ? '' : String(vehicle.year))
      setColor(vehicle.color ?? '')
      setLicensePlate(vehicle.license_plate ?? '')
      setFuelType(vehicle.fuel_type)
      setFuelLevel(toStrOrEmpty(vehicle.fuel_level_pct))
      setBatteryLevel(toStrOrEmpty(vehicle.battery_level_pct))
      setOdometer(toStrOrEmpty(vehicle.odometer_km))
      setRange(toStrOrEmpty(vehicle.range_km))
      setLastServiceDate(vehicle.last_service_date ?? '')
      setNextServiceDue(vehicle.next_service_due ?? '')
      setNotes(vehicle.notes ?? '')
    } else {
      setName('')
      setMake('')
      setModel('')
      setYear('')
      setColor('')
      setLicensePlate('')
      setFuelType('petrol')
      setFuelLevel('')
      setBatteryLevel('')
      setOdometer('')
      setRange('')
      setLastServiceDate('')
      setNextServiceDue('')
      setNotes('')
    }
    setFormError(null)
  }, [open, vehicle])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['garage', 'vehicles', user?.id] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      if (!name.trim()) throw new Error('Give the vehicle a name.')

      const payload = {
        name: name.trim(),
        make: make.trim() || null,
        model: model.trim() || null,
        year: toNumOrNull(year),
        color: color.trim() || null,
        license_plate: licensePlate.trim() || null,
        fuel_type: fuelType,
        fuel_level_pct: toNumOrNull(fuelLevel),
        battery_level_pct: toNumOrNull(batteryLevel),
        odometer_km: toNumOrNull(odometer),
        range_km: toNumOrNull(range),
        last_service_date: lastServiceDate || null,
        next_service_due: nextServiceDue || null,
        notes: notes.trim() || null,
      }

      if (isEditing && vehicle) {
        const { error } = await supabase
          .from('vehicles')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', vehicle.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vehicles').insert({ ...payload, user_id: user.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setFormError(err instanceof Error ? err.message : 'Could not save the vehicle.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle) return
      const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => setFormError(err instanceof Error ? err.message : 'Could not delete the vehicle.'),
  })

  const onDelete = () => {
    if (!vehicle) return
    if (window.confirm(`Remove ${vehicle.name} from the garage? This cannot be undone.`)) {
      deleteMutation.mutate()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit vehicle' : 'Add vehicle'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Model 3, The Range Rover"
            required
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Make">
            <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Tesla" />
          </Field>
          <Field label="Model">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model 3" />
          </Field>
          <Field label="Year">
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2023" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Color">
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="License plate">
            <Input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Fuel type">
            <Select value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)}>
              {FUEL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fuelType !== 'electric' && (
            <Field label="Fuel level %" hint="0–100, leave blank if unknown">
              <Input
                type="number"
                min={0}
                max={100}
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          )}
          {(fuelType === 'electric' || fuelType === 'hybrid') && (
            <Field label="Battery level %" hint="0–100, leave blank if unknown">
              <Input
                type="number"
                min={0}
                max={100}
                value={batteryLevel}
                onChange={(e) => setBatteryLevel(e.target.value)}
                placeholder="Optional"
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Last service">
            <Input type="date" value={lastServiceDate} onChange={(e) => setLastServiceDate(e.target.value)} />
          </Field>
          <Field label="Next service due">
            <Input type="date" value={nextServiceDue} onChange={(e) => setNextServiceDue(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Insurance renewal, MOT reminders, anything else worth keeping track of…"
          />
        </Field>

        {formError && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{formError}</p>}

        <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-4">
          {isEditing ? (
            <Button type="button" variant="danger" size="sm" onClick={onDelete} loading={deleteMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>
              {isEditing ? 'Save changes' : 'Add vehicle'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
