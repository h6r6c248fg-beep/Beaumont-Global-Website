import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Eye, EyeOff, Plug, ShieldCheck, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Label } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx, formatCurrency } from '@/lib/utils'
import type { Integration, IntegrationProvider, IntegrationSnapshot } from '@/types/database'

const PROVIDER_META: Record<IntegrationProvider, { label: string; icon: typeof Wallet; description: string }> = {
  orgview: {
    label: 'OrgView',
    icon: Plug,
    description: 'Your organisation / operations overview tool.',
  },
  traderpro: {
    label: 'TraderPro',
    icon: TrendingUp,
    description: 'Your trading performance tool.',
  },
}

export function FinancePage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  const integrations = useQuery({
    queryKey: ['finance', 'integrations', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('integrations').select('*').eq('user_id', userId!)
      if (error) throw error
      let rows = (data ?? []) as Integration[]

      const providers: IntegrationProvider[] = ['orgview', 'traderpro']
      const missing = providers.filter((p) => !rows.some((r) => r.provider === p))
      if (missing.length > 0) {
        const inserts = missing.map((provider) => ({
          user_id: userId!,
          provider,
          display_name: PROVIDER_META[provider].label,
          status: 'not_connected',
        }))
        const { data: upserted, error: upsertError } = await supabase
          .from('integrations')
          .upsert(inserts, { onConflict: 'user_id,provider' })
          .select('*')
        if (upsertError) throw upsertError
        rows = [...rows, ...((upserted ?? []) as Integration[])]
      }

      return rows.sort((a, b) => a.provider.localeCompare(b.provider))
    },
  })

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-medium text-[var(--color-paper)]">Finance</h1>
        <p className="mt-2 max-w-2xl text-[var(--color-mist)]">
          Where your OrgView and TraderPro data will live once connected. Neither has a public API yet, so credentials
          are saved ready to activate — and in the meantime you can log figures by hand so this page stays useful
          today. Everything here is private to your account.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {(integrations.data ?? []).map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} userId={userId!} queryClient={queryClient} />
        ))}
        {integrations.isLoading && (
          <>
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-panel-2)]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-panel-2)]" />
          </>
        )}
      </div>
    </div>
  )
}

function IntegrationCard({
  integration,
  userId,
  queryClient,
}: {
  integration: Integration
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const meta = PROVIDER_META[integration.provider]
  const Icon = meta.icon
  const isConnected = integration.status === 'connected'

  const [editing, setEditing] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState(integration.api_base_url ?? '')
  const [apiKey, setApiKey] = useState(integration.api_key ?? '')
  const [showKey, setShowKey] = useState(false)

  const snapshots = useQuery({
    queryKey: ['finance', 'snapshots', integration.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_snapshots')
        .select('*')
        .eq('integration_id', integration.id)
        .order('snapshot_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as IntegrationSnapshot[]
    },
  })

  const saveCredentials = useMutation({
    mutationFn: async () => {
      const status = apiBaseUrl.trim() && apiKey.trim() ? 'connected' : 'not_connected'
      const { error } = await supabase
        .from('integrations')
        .update({ api_base_url: apiBaseUrl.trim() || null, api_key: apiKey.trim() || null, status })
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'integrations', userId] })
      setEditing(false)
    },
  })

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('integrations')
        .update({ api_base_url: null, api_key: null, status: 'not_connected' })
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'integrations', userId] })
      setApiBaseUrl('')
      setApiKey('')
    },
  })

  return (
    <Panel className="flex flex-col">
      <PanelHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-gold)]/10 text-[var(--color-gold-bright)]">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div>
            <PanelTitle>{integration.display_name || meta.label}</PanelTitle>
            <p className="text-xs text-[var(--color-mist)]">{meta.description}</p>
          </div>
        </div>
        <Badge tone={isConnected ? 'emerald' : 'neutral'}>{isConnected ? 'Connected' : 'Not connected'}</Badge>
      </PanelHeader>

      <PanelBody className="flex flex-1 flex-col gap-6">
        {/* Connector credentials */}
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-4">
          {!editing ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-[var(--color-paper)]">
                  {isConnected ? 'Credentials saved' : 'No credentials saved yet'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-mist)]">
                  {isConnected
                    ? 'Live sync will activate once ' + meta.label + "'s API is available."
                    : `Add ${meta.label}'s API base URL and key so this connector is ready to go live.`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  {isConnected ? 'Edit' : 'Connect'}
                </Button>
                {isConnected && (
                  <Button variant="danger" size="sm" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="API base URL" hint="Where the connector will point once live sync is available.">
                <Input
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder={`https://api.${integration.provider}.example.com`}
                />
              </Field>
              <div>
                <Label>API key</Label>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk_live_..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mist)] hover:text-[var(--color-paper)]"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-[var(--color-azure)]/8 px-3 py-2 text-xs text-[var(--color-azure)]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Credentials saved — live sync will activate once {meta.label}&apos;s API is available.</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setApiBaseUrl(integration.api_base_url ?? '')
                    setApiKey(integration.api_key ?? '')
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={() => saveCredentials.mutate()} loading={saveCredentials.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Manual snapshot entry */}
        {integration.provider === 'traderpro' ? (
          <TraderProSnapshotForm integrationId={integration.id} userId={userId} queryClient={queryClient} />
        ) : (
          <OrgViewSnapshotForm integrationId={integration.id} userId={userId} queryClient={queryClient} />
        )}

        {/* History */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">History</p>
          {snapshots.data && snapshots.data.length > 0 ? (
            <SnapshotHistory provider={integration.provider} snapshots={snapshots.data} />
          ) : (
            <EmptyState
              icon={<Wallet className="h-7 w-7" strokeWidth={1.2} />}
              title="No entries yet"
              description="Log your first data point above to start building history."
            />
          )}
        </div>
      </PanelBody>
    </Panel>
  )
}

function TraderProSnapshotForm({
  integrationId,
  userId,
  queryClient,
}: {
  integrationId: string
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [profit, setProfit] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [notes, setNotes] = useState('')

  const addSnapshot = useMutation({
    mutationFn: async () => {
      const value = Number(profit)
      if (Number.isNaN(value)) throw new Error('Profit must be a number')
      const { error } = await supabase.from('integration_snapshots').insert({
        integration_id: integrationId,
        user_id: userId,
        snapshot_date: format(new Date(), 'yyyy-MM-dd'),
        data: { profit: value, currency, notes: notes.trim() || null },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'snapshots', integrationId] })
      setProfit('')
      setNotes('')
    },
  })

  return (
    <div className="rounded-xl border border-[var(--color-line)] p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Log today&apos;s figures</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Profit / loss">
          <Input type="number" step="0.01" value={profit} onChange={(e) => setProfit(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Currency">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="w-24" maxLength={3} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Notes (optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. closed EUR/USD swing position" />
        </Field>
      </div>
      {addSnapshot.isError && (
        <p className="mt-2 text-xs text-[var(--color-rose)]">
          {addSnapshot.error instanceof Error ? addSnapshot.error.message : 'Failed to save entry'}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          size="sm"
          disabled={!profit.trim()}
          loading={addSnapshot.isPending}
          onClick={() => addSnapshot.mutate()}
        >
          Add entry
        </Button>
      </div>
    </div>
  )
}

function OrgViewSnapshotForm({
  integrationId,
  userId,
  queryClient,
}: {
  integrationId: string
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [metric, setMetric] = useState('')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')

  const addSnapshot = useMutation({
    mutationFn: async () => {
      if (!metric.trim()) throw new Error('Metric name is required')
      const { error } = await supabase.from('integration_snapshots').insert({
        integration_id: integrationId,
        user_id: userId,
        snapshot_date: format(new Date(), 'yyyy-MM-dd'),
        data: { metric: metric.trim(), value: value.trim(), notes: notes.trim() || null },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'snapshots', integrationId] })
      setMetric('')
      setValue('')
      setNotes('')
    },
  })

  return (
    <div className="rounded-xl border border-[var(--color-line)] p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Log today&apos;s figures</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Metric name">
          <Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="e.g. active projects" />
        </Field>
        <Field label="Value">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 12" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Notes (optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context worth remembering" />
        </Field>
      </div>
      {addSnapshot.isError && (
        <p className="mt-2 text-xs text-[var(--color-rose)]">
          {addSnapshot.error instanceof Error ? addSnapshot.error.message : 'Failed to save entry'}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          size="sm"
          disabled={!metric.trim()}
          loading={addSnapshot.isPending}
          onClick={() => addSnapshot.mutate()}
        >
          Add entry
        </Button>
      </div>
    </div>
  )
}

function SnapshotHistory({ provider, snapshots }: { provider: IntegrationProvider; snapshots: IntegrationSnapshot[] }) {
  const isTraderPro = provider === 'traderpro'

  const chartData = useMemo(() => {
    if (!isTraderPro) return []
    return [...snapshots]
      .reverse()
      .filter((s) => typeof s.data.profit === 'number')
      .map((s) => ({
        date: format(new Date(s.snapshot_date), 'd MMM'),
        profit: s.data.profit as number,
      }))
  }, [snapshots, isTraderPro])

  return (
    <div className="space-y-4">
      {isTraderPro && chartData.length >= 2 && (
        <div className="h-48 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-mist)' }} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-mist)' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-panel-2)',
                  border: '1px solid var(--color-line)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--color-paper)',
                }}
                formatter={(v) => formatCurrency(typeof v === 'number' ? v : Number(v))}
              />
              <Line type="monotone" dataKey="profit" stroke="var(--color-gold)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-obsidian-2)] text-[11px] uppercase tracking-wide text-[var(--color-mist)]">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              {isTraderPro ? (
                <>
                  <th className="px-3 py-2 font-medium">Profit / loss</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line-soft)]">
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap px-3 py-2 text-[var(--color-mist)]">{format(new Date(s.snapshot_date), 'd MMM yyyy')}</td>
                {isTraderPro ? (
                  <>
                    <td
                      className={cx(
                        'px-3 py-2 font-medium',
                        typeof s.data.profit === 'number' && s.data.profit < 0 ? 'text-[var(--color-rose)]' : 'text-[var(--color-emerald)]'
                      )}
                    >
                      {typeof s.data.profit === 'number' ? formatCurrency(s.data.profit, (s.data.currency as string) || 'GBP') : '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-mist)]">{(s.data.notes as string) || '—'}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-[var(--color-paper)]">{(s.data.metric as string) || '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-paper)]">{(s.data.value as string) ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-mist)]">{(s.data.notes as string) || '—'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
