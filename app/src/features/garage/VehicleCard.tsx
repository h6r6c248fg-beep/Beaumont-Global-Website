import type { ReactNode } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { BatteryCharging, Fuel, Gauge, Pencil, Route, Trash2, Wrench } from 'lucide-react'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatNumber } from '@/lib/utils'
import type { Vehicle } from '@/types/database'

interface Props {
  vehicle: Vehicle
  onUpdateLevels: () => void
  onEdit: () => void
  onDelete: () => void
}

function LevelBar({ label, pct, icon }: { label: string; pct: number | null; icon: ReactNode }) {
  if (pct === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-mist-2)]">
        {icon}
        <span>{label}: Not logged yet</span>
      </div>
    )
  }
  const clamped = Math.max(0, Math.min(100, pct))
  const tone = clamped >= 50 ? 'var(--color-emerald)' : clamped >= 20 ? 'var(--color-amber)' : 'var(--color-rose)'
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-[var(--color-mist)]">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-medium text-[var(--color-paper)]">{clamped}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-obsidian-2)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, backgroundColor: tone }} />
      </div>
    </div>
  )
}

export function VehicleCard({ vehicle, onUpdateLevels, onEdit, onDelete }: Props) {
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  const showFuel = vehicle.fuel_type !== 'electric'
  const showBattery = vehicle.fuel_type === 'electric' || vehicle.fuel_type === 'hybrid'

  let serviceBadge: { tone: 'rose' | 'amber' | 'neutral'; label: string } | null = null
  if (vehicle.next_service_due) {
    const due = new Date(vehicle.next_service_due)
    const days = differenceInCalendarDays(due, new Date())
    if (days < 0) {
      serviceBadge = { tone: 'rose', label: `Overdue since ${format(due, 'd MMM yyyy')}` }
    } else if (days <= 30) {
      serviceBadge = { tone: 'amber', label: `Due ${format(due, 'd MMM yyyy')}` }
    } else {
      serviceBadge = { tone: 'neutral', label: `Next service ${format(due, 'd MMM yyyy')}` }
    }
  }

  return (
    <Panel className="flex flex-col">
      <PanelHeader className="items-start">
        <div className="min-w-0">
          <PanelTitle className="truncate">{vehicle.name}</PanelTitle>
          {subtitle && <p className="mt-0.5 truncate text-xs text-[var(--color-mist)]">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {vehicle.license_plate && <Badge tone="neutral">{vehicle.license_plate}</Badge>}
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${vehicle.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${vehicle.name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PanelHeader>
      <PanelBody className="flex flex-1 flex-col gap-4">
        <div className="space-y-3">
          {showBattery && <LevelBar label="Battery" pct={vehicle.battery_level_pct} icon={<BatteryCharging className="h-3.5 w-3.5" />} />}
          {showFuel && <LevelBar label="Fuel" pct={vehicle.fuel_level_pct} icon={<Fuel className="h-3.5 w-3.5" />} />}
        </div>

        {(vehicle.range_km !== null || vehicle.odometer_km !== null) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-mist)]">
            {vehicle.range_km !== null && (
              <span className="flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5" />
                {formatNumber(vehicle.range_km)} km range
              </span>
            )}
            {vehicle.odometer_km !== null && (
              <span className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" />
                {formatNumber(vehicle.odometer_km)} km on the clock
              </span>
            )}
          </div>
        )}

        {serviceBadge && (
          <div>
            <Badge tone={serviceBadge.tone}>
              <Wrench className="h-3 w-3" />
              {serviceBadge.label}
            </Badge>
          </div>
        )}

        <div className="mt-auto pt-2">
          <Button variant="primary" size="sm" className="w-full justify-center" onClick={onUpdateLevels}>
            <Fuel className="h-3.5 w-3.5" />
            Update levels
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )
}
