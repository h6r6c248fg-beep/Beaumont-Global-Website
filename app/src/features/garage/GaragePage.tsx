import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Car as CarIcon, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Vehicle } from '@/types/database'
import { VehicleCard } from './VehicleCard'
import { VehicleModal } from './VehicleModal'
import { UpdateLevelsModal } from './UpdateLevelsModal'

export function GaragePage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  // undefined = closed, null = creating a new vehicle, Vehicle = editing that vehicle.
  const [editVehicle, setEditVehicle] = useState<Vehicle | null | undefined>(undefined)
  const [levelsVehicle, setLevelsVehicle] = useState<Vehicle | null>(null)

  const vehiclesQuery = useQuery({
    queryKey: ['garage', 'vehicles', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId!)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as Vehicle[]
    },
  })

  const vehicles = vehiclesQuery.data ?? []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garage', 'vehicles', userId] }),
  })

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--color-mist)]">Garage</p>
          <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">Your vehicles</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-mist)]">
            Keep levels current by updating them here — there&apos;s no live connection to your car yet, so fuel,
            battery, range and odometer only change when you log them.
          </p>
        </div>
        {vehicles.length > 0 && (
          <Button variant="primary" onClick={() => setEditVehicle(null)}>
            <Plus className="h-4 w-4" />
            Add vehicle
          </Button>
        )}
      </div>

      {vehiclesQuery.isLoading ? (
        <p className="text-sm text-[var(--color-mist)]">Loading vehicles…</p>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<CarIcon className="h-8 w-8" strokeWidth={1.2} />}
          title="No vehicles yet"
          description="Add a car, bike or van to start tracking fuel, battery, range and service dates by hand."
          action={
            <Button variant="primary" onClick={() => setEditVehicle(null)}>
              <Plus className="h-4 w-4" />
              Add vehicle
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onUpdateLevels={() => setLevelsVehicle(vehicle)}
              onEdit={() => setEditVehicle(vehicle)}
              onDelete={() => {
                if (window.confirm(`Remove ${vehicle.name} from the garage? This cannot be undone.`)) {
                  deleteMutation.mutate(vehicle.id)
                }
              }}
            />
          ))}
        </div>
      )}

      <VehicleModal open={editVehicle !== undefined} onClose={() => setEditVehicle(undefined)} vehicle={editVehicle ?? null} />

      <UpdateLevelsModal open={!!levelsVehicle} onClose={() => setLevelsVehicle(null)} vehicle={levelsVehicle} />
    </div>
  )
}
