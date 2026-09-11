import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Trash2, Plus, Syringe, Clock, CalendarRange, Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { cx, formatNumber } from '@/lib/utils'
import { NewCycleModal } from './NewCycleModal'
import { AddCycleItemModal } from './AddCycleItemModal'
import { DoseLogModal } from './DoseLogModal'
import { computeAdherence, daysElapsedAndRemaining, ROUTE_LABELS, STATUS_LABELS, STATUS_TONES } from './utils'
import type { Cycle, CycleItem, CycleStatus, DoseLog } from '@/types/database'

export function CycleDetail({
  cycleId,
  onBack,
  onDeleted,
  autoOpenAddCompound,
}: {
  cycleId: string
  onBack: () => void
  onDeleted: () => void
  autoOpenAddCompound?: boolean
}) {
  const queryClient = useQueryClient()
  const [editCycleOpen, setEditCycleOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(!!autoOpenAddCompound)
  const [editingItem, setEditingItem] = useState<CycleItem | null>(null)
  const [logDoseItem, setLogDoseItem] = useState<CycleItem | null>(null)

  const cycleQuery = useQuery({
    queryKey: ['cycle', cycleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycles').select('*').eq('id', cycleId).single()
      if (error) throw error
      return data as Cycle
    },
  })

  const itemsQuery = useQuery({
    queryKey: ['cycle-items', cycleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycle_items')
        .select('*')
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CycleItem[]
    },
  })

  const items = itemsQuery.data ?? []
  const itemIds = useMemo(() => items.map((i) => i.id), [items])

  const doseLogsQuery = useQuery({
    queryKey: ['cycle-dose-logs', cycleId, itemIds.join(',')],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dose_logs')
        .select('*')
        .in('cycle_item_id', itemIds)
        .order('logged_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DoseLog[]
    },
  })

  const logsByItem = useMemo(() => {
    const map = new Map<string, DoseLog[]>()
    for (const log of doseLogsQuery.data ?? []) {
      const arr = map.get(log.cycle_item_id) ?? []
      arr.push(log)
      map.set(log.cycle_item_id, arr)
    }
    return map
  }, [doseLogsQuery.data])

  const statusMutation = useMutation({
    mutationFn: async (status: CycleStatus) => {
      const { error } = await supabase.from('cycles').update({ status, updated_at: new Date().toISOString() }).eq('id', cycleId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle', cycleId] })
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
    },
  })

  const deleteCycleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cycles').delete().eq('id', cycleId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
      onDeleted()
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('cycle_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-items', cycleId] })
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
    },
  })

  const cycle = cycleQuery.data

  const adherence = useMemo(() => {
    let expected = 0
    let logged = 0
    let skipped = 0
    let anyExpected = false
    for (const item of items) {
      const logs = logsByItem.get(item.id) ?? []
      const result = computeAdherence(item.frequency, item.start_date, item.end_date, logs)
      if (result.hasExpected) {
        anyExpected = true
        expected += result.expected
      }
      logged += result.logged
      skipped += result.skipped
    }
    return { expected, logged, skipped, hasExpected: anyExpected }
  }, [items, logsByItem])

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const log of doseLogsQuery.data ?? []) {
      if (!log.taken) continue
      const key = format(new Date(log.logged_at), 'yyyy-MM-dd')
      byDay.set(key, (byDay.get(key) ?? 0) + 1)
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, count]) => ({ date: format(new Date(`${iso}T00:00:00`), 'd MMM'), count }))
  }, [doseLogsQuery.data])

  if (cycleQuery.isLoading || !cycle) {
    return (
      <div className="animate-fade-up">
        <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--color-mist)] hover:text-[var(--color-paper)]">
          <ArrowLeft className="h-4 w-4" /> Back to cycles
        </button>
        <p className="text-sm text-[var(--color-mist)]">Loading cycle…</p>
      </div>
    )
  }

  const { elapsed, remaining } = daysElapsedAndRemaining(cycle.start_date, cycle.end_date)

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--color-mist)] hover:text-[var(--color-paper)]">
          <ArrowLeft className="h-4 w-4" /> Back to cycles
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-medium text-[var(--color-paper)] sm:text-3xl">{cycle.name}</h1>
              <Badge tone="neutral" className="capitalize">
                {cycle.cycle_type}
              </Badge>
              <Badge tone={STATUS_TONES[cycle.status]}>{STATUS_LABELS[cycle.status]}</Badge>
            </div>
            {cycle.goal && <p className="mt-1.5 text-sm text-[var(--color-mist)]">{cycle.goal}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-mist-2)]">
              <span className="flex items-center gap-1">
                <CalendarRange className="h-3.5 w-3.5" />
                {format(new Date(`${cycle.start_date}T00:00:00`), 'd MMM yyyy')}
                {' – '}
                {cycle.end_date ? format(new Date(`${cycle.end_date}T00:00:00`), 'd MMM yyyy') : 'ongoing'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Day {elapsed + 1}
                {remaining !== null && remaining >= 0 ? ` · ${remaining} day${remaining === 1 ? '' : 's'} remaining` : ''}
                {remaining !== null && remaining < 0 ? ' · ended' : ''}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-40 shrink-0">
              <Select
                value={cycle.status}
                onChange={(e) => statusMutation.mutate(e.target.value as CycleStatus)}
                disabled={statusMutation.isPending}
              >
                {(Object.keys(STATUS_LABELS) as CycleStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" size="icon" onClick={() => setEditCycleOpen(true)} title="Edit cycle">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="danger"
              size="icon"
              title="Delete cycle"
              onClick={() => {
                if (window.confirm(`Delete "${cycle.name}" and all of its logged doses? This can't be undone.`)) {
                  deleteCycleMutation.mutate()
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {cycle.notes && <p className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3 text-sm text-[var(--color-mist)]">{cycle.notes}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Compounds"
          value={items.length}
          sub={items.length === 1 ? '1 item tracked' : `${items.length} items tracked`}
          icon={<Syringe className="h-4 w-4" />}
        />
        <StatTile
          label="Adherence"
          value={adherence.hasExpected ? `${formatNumber(adherence.logged)} / ${formatNumber(adherence.expected)}` : formatNumber(adherence.logged)}
          sub={adherence.hasExpected ? 'expected doses logged' : 'doses logged (custom schedule)'}
          icon={<Activity className="h-4 w-4" />}
          accent="emerald"
        />
        <StatTile label="Skipped" value={formatNumber(adherence.skipped)} sub="doses marked not taken" icon={<Clock className="h-4 w-4" />} accent="rose" />
        <StatTile label="Elapsed" value={`${elapsed + 1}d`} sub={remaining !== null ? `${Math.max(remaining, 0)}d remaining` : 'no end date set'} accent="azure" />
      </div>

      {chartData.length > 0 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Doses over time</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-obsidian-2)',
                      border: '1px solid var(--color-line)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--color-paper)',
                    }}
                  />
                  <Bar dataKey="count" name="Doses" fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>Compounds & Peptides</PanelTitle>
          <Button size="sm" variant="secondary" onClick={() => setAddItemOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add compound
          </Button>
        </PanelHeader>
        <PanelBody>
          {items.length === 0 ? (
            <EmptyState
              icon={<Syringe className="h-8 w-8" strokeWidth={1.2} />}
              title="Nothing added yet"
              description="Add the compounds or peptides that make up this cycle to start logging doses."
              action={
                <Button variant="secondary" size="sm" onClick={() => setAddItemOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add compound
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <CycleItemRow
                  key={item.id}
                  item={item}
                  logs={logsByItem.get(item.id) ?? []}
                  onLogDose={() => setLogDoseItem(item)}
                  onEdit={() => setEditingItem(item)}
                  onDelete={() => {
                    if (window.confirm(`Remove ${item.compound_name} from this cycle? Its dose history will be deleted too.`)) {
                      deleteItemMutation.mutate(item.id)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      <NewCycleModal open={editCycleOpen} onClose={() => setEditCycleOpen(false)} editingCycle={cycle} onSaved={() => setEditCycleOpen(false)} />

      <AddCycleItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        cycleId={cycleId}
        onSaved={() => setAddItemOpen(false)}
      />

      <AddCycleItemModal
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        cycleId={cycleId}
        editingItem={editingItem}
        onSaved={() => setEditingItem(null)}
      />

      {logDoseItem && (
        <DoseLogModal open={!!logDoseItem} onClose={() => setLogDoseItem(null)} cycleItem={logDoseItem} onSaved={() => setLogDoseItem(null)} />
      )}
    </div>
  )
}

function CycleItemRow({
  item,
  logs,
  onLogDose,
  onEdit,
  onDelete,
}: {
  item: CycleItem
  logs: DoseLog[]
  onLogDose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const recent = logs.slice(0, 3)

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base text-[var(--color-paper)]">{item.compound_name}</p>
            <Badge tone="neutral">{ROUTE_LABELS[item.route]}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-mist)]">
            {item.dose_amount}
            {item.dose_unit} · {item.frequency}
          </p>
          <p className="mt-1 text-xs text-[var(--color-mist-2)]">
            {format(new Date(`${item.start_date}T00:00:00`), 'd MMM yyyy')}
            {' – '}
            {item.end_date ? format(new Date(`${item.end_date}T00:00:00`), 'd MMM yyyy') : 'ongoing'}
          </p>
          {item.notes && <p className="mt-1.5 text-xs text-[var(--color-mist)]">{item.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="primary" onClick={onLogDose}>
            Log dose
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Remove">
            <Trash2 className="h-3.5 w-3.5 text-[var(--color-rose)]" />
          </Button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-line-soft)] pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-mist-2)]">Recent doses</p>
          <ul className="space-y-1">
            {recent.map((log) => (
              <li key={log.id} className="flex items-center justify-between text-xs">
                <span className={cx('text-[var(--color-mist)]', !log.taken && 'line-through opacity-60')}>
                  {format(new Date(log.logged_at), 'd MMM, HH:mm')} · {log.amount}
                  {log.unit}
                  {log.injection_site ? ` · ${log.injection_site}` : ''}
                </span>
                {!log.taken && <Badge tone="rose">Skipped</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
