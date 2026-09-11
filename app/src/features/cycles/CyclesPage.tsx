import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Syringe, CalendarRange, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { daysElapsedAndRemaining, STATUS_LABELS, STATUS_TONES } from './utils'
import { NewCycleModal } from './NewCycleModal'
import { CycleDetail } from './CycleDetail'
import { BloodworkPanel } from './BloodworkPanel'
import type { Cycle, CycleItem, CycleStatus } from '@/types/database'

type CycleWithItems = Cycle & { cycle_items: CycleItem[] }

const STATUS_TABS: { value: CycleStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
  { value: 'discontinued', label: 'Discontinued' },
]

export function CyclesPage() {
  const { user } = useAuth()
  const [topTab, setTopTab] = useState<'cycles' | 'bloodwork'>('cycles')
  const [statusTab, setStatusTab] = useState<CycleStatus>('active')
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [newCycleOpen, setNewCycleOpen] = useState(false)
  const [freshCycleId, setFreshCycleId] = useState<string | null>(null)

  const cyclesQuery = useQuery({
    queryKey: ['cycles', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycles')
        .select('*, cycle_items(*)')
        .eq('user_id', user!.id)
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CycleWithItems[]
    },
  })

  const filtered = useMemo(
    () => (cyclesQuery.data ?? []).filter((c) => c.status === statusTab),
    [cyclesQuery.data, statusTab]
  )

  const counts = useMemo(() => {
    const map = new Map<CycleStatus, number>()
    for (const c of cyclesQuery.data ?? []) map.set(c.status, (map.get(c.status) ?? 0) + 1)
    return map
  }, [cyclesQuery.data])

  if (selectedCycleId && topTab === 'cycles') {
    return (
      <div className="mx-auto max-w-5xl">
        <CycleDetail
          cycleId={selectedCycleId}
          autoOpenAddCompound={selectedCycleId === freshCycleId}
          onBack={() => {
            setSelectedCycleId(null)
            setFreshCycleId(null)
          }}
          onDeleted={() => {
            setSelectedCycleId(null)
            setFreshCycleId(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="animate-fade-up flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-[var(--color-paper)] sm:text-3xl">Cycles</h1>
          <p className="mt-1.5 max-w-xl text-sm text-[var(--color-mist)]">
            A private, structured log of your compounds, doses and bloodwork — nothing more.
          </p>
        </div>
        <Tabs
          tabs={[
            { value: 'cycles', label: 'Cycles' },
            { value: 'bloodwork', label: 'Bloodwork' },
          ]}
          value={topTab}
          onChange={(v) => setTopTab(v as 'cycles' | 'bloodwork')}
        />
      </div>

      {topTab === 'cycles' ? (
        <div className="space-y-5 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={STATUS_TABS} value={statusTab} onChange={(v) => setStatusTab(v as CycleStatus)} />
            <Button variant="primary" size="sm" onClick={() => setNewCycleOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New cycle
            </Button>
          </div>

          {cyclesQuery.isLoading ? (
            <p className="text-sm text-[var(--color-mist)]">Loading cycles…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Syringe className="h-8 w-8" strokeWidth={1.2} />}
              title={(cyclesQuery.data ?? []).length === 0 ? 'No cycles yet' : `No ${STATUS_LABELS[statusTab].toLowerCase()} cycles`}
              description="Create a cycle to start tracking compounds, doses and bloodwork over time."
              action={
                <Button variant="secondary" size="sm" onClick={() => setNewCycleOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> New cycle
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtered.map((cycle) => (
                <CycleCard key={cycle.id} cycle={cycle} onClick={() => setSelectedCycleId(cycle.id)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="animate-fade-up">
          <BloodworkPanel />
        </div>
      )}

      <NewCycleModal
        open={newCycleOpen}
        onClose={() => setNewCycleOpen(false)}
        onSaved={(cycle) => {
          setNewCycleOpen(false)
          setStatusTab(cycle.status)
          setFreshCycleId(cycle.id)
          setSelectedCycleId(cycle.id)
        }}
      />
    </div>
  )
}

function CycleCard({ cycle, onClick }: { cycle: CycleWithItems; onClick: () => void }) {
  const { elapsed, remaining } = daysElapsedAndRemaining(cycle.start_date, cycle.end_date)
  const preview = cycle.cycle_items
    .slice(0, 3)
    .map((i) => `${i.compound_name} ${i.dose_amount}${i.dose_unit} · ${i.frequency}`)
    .join(', ')
  const extra = cycle.cycle_items.length - 3

  return (
    <button onClick={onClick} className="text-left">
      <Panel className="h-full p-5 transition-colors hover:border-[var(--color-gold-dim)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-[var(--color-paper)]">{cycle.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" className="capitalize">
                {cycle.cycle_type}
              </Badge>
              <Badge tone={STATUS_TONES[cycle.status]}>{STATUS_LABELS[cycle.status]}</Badge>
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1 text-xs text-[var(--color-mist-2)]">
          <CalendarRange className="h-3.5 w-3.5 shrink-0" />
          {format(new Date(`${cycle.start_date}T00:00:00`), 'd MMM yyyy')}
          {' – '}
          {cycle.end_date ? format(new Date(`${cycle.end_date}T00:00:00`), 'd MMM yyyy') : 'ongoing'}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-mist-2)]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Day {elapsed + 1}
          {remaining !== null && remaining >= 0 ? ` · ${remaining} day${remaining === 1 ? '' : 's'} left` : ''}
          {remaining !== null && remaining < 0 ? ' · ended' : ''}
        </p>

        <p className="mt-3 line-clamp-2 text-sm text-[var(--color-mist)]">
          {cycle.cycle_items.length === 0 ? 'No compounds added yet' : preview}
          {extra > 0 ? ` +${extra} more` : ''}
        </p>
      </Panel>
    </button>
  )
}
