import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Globe, Building2, Cloud, PenLine, RefreshCw, Trash2, Plus, CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { CalendarAccount, CalendarProvider } from '@/types/database'
import { accountLabel, functionsBaseUrl, googleAuthorizeUrl, microsoftAuthorizeUrl, statusTone } from './utils'

const PROVIDER_ICON: Record<CalendarProvider, React.ComponentType<{ className?: string }>> = {
  google: Globe,
  microsoft: Building2,
  apple_caldav: Cloud,
  manual: PenLine,
}

async function callCaldavSync(accountId: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${functionsBaseUrl()}/calendar-caldav-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ account_id: accountId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Sync failed (${res.status})`)
  }
  return json
}

export function AccountsPanel({
  accounts,
  isLoading,
  onConnectClick,
}: {
  accounts: CalendarAccount[]
  isLoading: boolean
  onConnectClick: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] })
    queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
  }

  const disconnectMutation = useMutation({
    mutationFn: async (account: CalendarAccount) => {
      await supabase.from('calendar_events').delete().eq('calendar_account_id', account.id)
      const { error } = await supabase.from('calendar_accounts').delete().eq('id', account.id)
      if (error) throw error
    },
    onSuccess: invalidateAll,
  })

  const onSyncNow = async (account: CalendarAccount) => {
    if (!user) return
    setRowError(null)
    if (account.provider === 'apple_caldav') {
      setSyncingId(account.id)
      try {
        await callCaldavSync(account.id)
        invalidateAll()
      } catch (err) {
        setRowError({ id: account.id, message: err instanceof Error ? err.message : 'Sync failed.' })
      } finally {
        setSyncingId(null)
      }
      return
    }
    // Google/Microsoft don't have a standalone silent-resync endpoint here —
    // re-running the OAuth consent flow refreshes tokens and re-imports
    // events in one step, reusing the same authorize/callback function.
    const redirectTo = window.location.origin + '/calendar'
    window.location.href =
      account.provider === 'google' ? googleAuthorizeUrl(user.id, redirectTo) : microsoftAuthorizeUrl(user.id, redirectTo)
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Connected calendars</PanelTitle>
        <Button size="sm" variant="secondary" onClick={onConnectClick}>
          <Plus className="h-3.5 w-3.5" />
          Connect
        </Button>
      </PanelHeader>
      <PanelBody>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-obsidian-2)]" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" strokeWidth={1.2} />}
            title="No calendars connected"
            description="Connect Google, Outlook or iCloud so your schedule stays in one place."
            action={
              <Button size="sm" variant="secondary" onClick={onConnectClick}>
                Connect a calendar
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {accounts.map((account) => {
              const Icon = PROVIDER_ICON[account.provider]
              const isSyncing = syncingId === account.id
              const isDisconnecting = disconnectMutation.isPending && disconnectMutation.variables?.id === account.id
              return (
                <li key={account.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-mist)]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--color-paper)]">{accountLabel(account)}</p>
                        {account.email && <p className="truncate text-xs text-[var(--color-mist)]">{account.email}</p>}
                        <p className="mt-0.5 text-[11px] text-[var(--color-mist-2)]">
                          {account.last_synced_at
                            ? `Synced ${formatDistanceToNow(new Date(account.last_synced_at), { addSuffix: true })}`
                            : 'Never synced'}
                        </p>
                      </div>
                    </div>
                    <Badge tone={statusTone(account.status)} className="shrink-0 capitalize">
                      {account.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {account.last_error && account.status === 'error' && (
                    <p className="mt-2 truncate text-[11px] text-[var(--color-rose)]" title={account.last_error}>
                      {account.last_error}
                    </p>
                  )}
                  {rowError?.id === account.id && <p className="mt-2 text-[11px] text-[var(--color-rose)]">{rowError.message}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 justify-center" loading={isSyncing} onClick={() => onSyncNow(account)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync now
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={isDisconnecting}
                      onClick={() => {
                        if (window.confirm(`Disconnect ${accountLabel(account)}? Its synced events will be removed.`)) {
                          disconnectMutation.mutate(account)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}
