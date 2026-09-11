import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ChevronDown, FlaskConical, Plus, Trash2, X, LineChart as LineChartIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea, Label } from '@/components/ui/Input'
import { cx } from '@/lib/utils'
import { parseMarkerNumber, SUGGESTED_MARKERS } from './utils'
import type { BloodworkLog, Cycle } from '@/types/database'

export function BloodworkPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [trendMarker, setTrendMarker] = useState<string>('')

  const logsQuery = useQuery({
    queryKey: ['bloodwork-logs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bloodwork_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('test_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as BloodworkLog[]
    },
  })

  const cyclesQuery = useQuery({
    queryKey: ['cycles-for-select', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycles')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Pick<Cycle, 'id' | 'name'>[]
    },
  })

  const cycleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of cyclesQuery.data ?? []) map.set(c.id, c.name)
    return map
  }, [cyclesQuery.data])

  const logs = logsQuery.data ?? []

  const trendableMarkers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const log of logs) {
      for (const key of Object.keys(log.panel ?? {})) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .map(([key]) => key)
      .sort()
  }, [logs])

  const trendData = useMemo(() => {
    if (!trendMarker) return []
    return logs
      .filter((l) => l.panel && l.panel[trendMarker] !== undefined)
      .map((l) => ({ date: l.test_date, value: parseMarkerNumber(l.panel[trendMarker]) }))
      .filter((d) => d.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, label: format(new Date(`${d.date}T00:00:00`), 'd MMM yy') }))
  }, [logs, trendMarker])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bloodwork_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloodwork-logs', user?.id] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[var(--color-paper)]">Bloodwork</h2>
          <p className="mt-1 text-sm text-[var(--color-mist)]">Lab panels you've logged, across every cycle.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add bloodwork
        </Button>
      </div>

      {trendableMarkers.length > 0 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Marker trend</PanelTitle>
            <LineChartIcon className="h-4 w-4 text-[var(--color-mist)]" />
          </PanelHeader>
          <PanelBody>
            <div className="mb-3 w-full max-w-xs">
              <Select value={trendMarker} onChange={(e) => setTrendMarker(e.target.value)}>
                <option value="">Select a marker…</option>
                {trendableMarkers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            {trendMarker && trendData.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-mist)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-obsidian-2)',
                        border: '1px solid var(--color-line)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--color-paper)',
                      }}
                    />
                    <Line type="monotone" dataKey="value" name={trendMarker} stroke="var(--color-azure)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              trendMarker && <p className="text-sm text-[var(--color-mist)]">No numeric values found for this marker.</p>
            )}
          </PanelBody>
        </Panel>
      )}

      {logs.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-8 w-8" strokeWidth={1.2} />}
          title="No bloodwork logged yet"
          description="Record lab panels here to track markers over time, optionally linked to a cycle."
          action={
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add bloodwork
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const expanded = expandedId === log.id
            const entries = Object.entries(log.panel ?? {})
            return (
              <Panel key={log.id}>
                <button
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base text-[var(--color-paper)]">
                        {format(new Date(`${log.test_date}T00:00:00`), 'd MMM yyyy')}
                      </p>
                      {log.lab_name && <span className="text-sm text-[var(--color-mist)]">{log.lab_name}</span>}
                      {log.cycle_id && cycleNameById.get(log.cycle_id) && <Badge tone="gold">{cycleNameById.get(log.cycle_id)}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-mist-2)]">{entries.length} marker{entries.length === 1 ? '' : 's'} recorded</p>
                  </div>
                  <ChevronDown className={cx('h-4 w-4 shrink-0 text-[var(--color-mist)] transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <PanelBody className="pt-0">
                    {entries.length > 0 ? (
                      <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--color-line-soft)] pt-4 sm:grid-cols-2">
                        {entries.map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between rounded-lg bg-[var(--color-obsidian-2)] px-3 py-2 text-sm">
                            <span className="text-[var(--color-mist)]">{key}</span>
                            <span className="font-medium text-[var(--color-paper)]">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="border-t border-[var(--color-line-soft)] pt-4 text-sm text-[var(--color-mist)]">No markers recorded.</p>
                    )}
                    {log.notes && <p className="mt-3 text-sm text-[var(--color-mist)]">{log.notes}</p>}
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('Delete this bloodwork entry?')) deleteMutation.mutate(log.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--color-rose)]" /> Delete
                      </Button>
                    </div>
                  </PanelBody>
                )}
              </Panel>
            )
          })}
        </div>
      )}

      <AddBloodworkModal open={addOpen} onClose={() => setAddOpen(false)} cycles={cyclesQuery.data ?? []} />
    </div>
  )
}

interface PanelRow {
  id: string
  key: string
  value: string
}

let rowSeq = 0
function newRow(key = ''): PanelRow {
  rowSeq += 1
  return { id: `row-${rowSeq}`, key, value: '' }
}

function AddBloodworkModal({
  open,
  onClose,
  cycles,
}: {
  open: boolean
  onClose: () => void
  cycles: Pick<Cycle, 'id' | 'name'>[]
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10))
  const [labName, setLabName] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<PanelRow[]>([newRow()])
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setTestDate(new Date().toISOString().slice(0, 10))
    setLabName('')
    setCycleId('')
    setNotes('')
    setRows([newRow()])
    setError(null)
  }

  const addChip = (marker: string) => {
    setRows((prev) => {
      if (prev.some((r) => r.key.trim().toLowerCase() === marker.toLowerCase())) return prev
      const empty = prev.find((r) => !r.key.trim())
      if (empty) return prev.map((r) => (r.id === empty.id ? { ...r, key: marker } : r))
      return [...prev, newRow(marker)]
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const panel: Record<string, string> = {}
      for (const row of rows) {
        const key = row.key.trim()
        if (!key) continue
        panel[key] = row.value.trim()
      }
      const { error } = await supabase.from('bloodwork_logs').insert({
        user_id: user.id,
        cycle_id: cycleId || null,
        test_date: testDate,
        lab_name: labName.trim() || null,
        panel,
        notes: notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bloodwork-logs', user?.id] })
      resetForm()
      onClose()
    },
    onError: (e: any) => setError(e?.message ?? 'Something went wrong'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!testDate) {
      setError('Set a test date.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title="Add bloodwork"
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Test date">
            <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} required />
          </Field>
          <Field label="Lab" hint="Optional">
            <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Quest Diagnostics" />
          </Field>
          <Field label="Link to cycle" hint="Optional">
            <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">None</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <Label>Quick add markers</Label>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_MARKERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => addChip(m)}
                className="rounded-full border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-2.5 py-1 text-[11px] text-[var(--color-mist)] transition-colors hover:border-[var(--color-gold-dim)] hover:text-[var(--color-paper)]"
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Panel values</Label>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <Input
                  value={row.key}
                  onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))}
                  placeholder="Marker name"
                  className="flex-1"
                />
                <Input
                  value={row.value}
                  onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
                  placeholder="Value"
                  className="w-32 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  className="shrink-0 rounded-lg p-2 text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-rose)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setRows((prev) => [...prev, newRow()])}>
            <Plus className="h-3.5 w-3.5" /> Add row
          </Button>
        </div>

        <Field label="Notes" hint="Optional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Save bloodwork
          </Button>
        </div>
      </form>
    </Modal>
  )
}
