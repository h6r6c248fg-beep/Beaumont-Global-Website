import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Mail,
  Building2,
  Server,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  Star,
  Info,
  Inbox,
  MailWarning,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Field, Input, Select } from '@/components/ui/Input'
import { cx, initials, formatNumber } from '@/lib/utils'
import type { EmailAccount, EmailMessage, EmailProvider } from '@/types/database'

type Segment = 'all' | 'unread' | 'starred'

const PROVIDER_META: Record<EmailProvider, { label: string; tone: 'rose' | 'azure' | 'amber'; icon: typeof Mail }> = {
  gmail: { label: 'Gmail', tone: 'rose', icon: Mail },
  microsoft: { label: 'Outlook', tone: 'azure', icon: Building2 },
  imap: { label: 'IMAP', tone: 'amber', icon: Server },
}

const ICLOUD_DOMAINS = ['icloud.com', 'me.com', 'mac.com']

function hostForEmail(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (domain && ICLOUD_DOMAINS.includes(domain)) return 'imap.mail.me.com'
  return ''
}

function statusTone(status: string): 'emerald' | 'rose' | 'amber' {
  if (status === 'connected') return 'emerald'
  if (status === 'error') return 'rose'
  return 'amber'
}

function functionsUrl(name: string) {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return `${base ?? ''}/functions/v1/${name}`
}

interface ImapForm {
  email: string
  password: string
  host: string
  port: string
  hostTouched: boolean
}

const emptyImapForm: ImapForm = { email: '', password: '', host: '', port: '993', hostTouched: false }

export function EmailPage() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  const [segment, setSegment] = useState<Segment>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectTab, setConnectTab] = useState<'gmail' | 'microsoft' | 'imap'>('gmail')
  const [imapForm, setImapForm] = useState<ImapForm>(emptyImapForm)
  const [imapError, setImapError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['email-accounts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as EmailAccount[]
    },
  })

  const messagesQuery = useQuery({
    queryKey: ['email-messages', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('user_id', userId!)
        .order('received_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as EmailMessage[]
    },
  })

  const accounts = accountsQuery.data ?? []
  const messages = messagesQuery.data ?? []
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const unreadCount = useMemo(() => messages.filter((m) => !m.is_read).length, [messages])
  const starredCount = useMemo(() => messages.filter((m) => m.is_starred).length, [messages])

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter((m) => {
      if (segment === 'unread' && m.is_read) return false
      if (segment === 'starred' && !m.is_starred) return false
      if (accountFilter !== 'all' && m.email_account_id !== accountFilter) return false
      if (q) {
        const hay = `${m.subject ?? ''} ${m.from_name ?? ''} ${m.from_address ?? ''} ${m.snippet ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [messages, segment, accountFilter, search])

  // ---- mutations -----------------------------------------------------

  const toggleStar = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase.from('email_messages').update({ is_starred: next }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, next }) => {
      const key = ['email-messages', userId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<EmailMessage[]>(key)
      queryClient.setQueryData<EmailMessage[]>(key, (old) =>
        (old ?? []).map((m) => (m.id === id ? { ...m, is_starred: next } : m))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['email-messages', userId], context.previous)
    },
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_messages').update({ is_read: true }).eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      const key = ['email-messages', userId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<EmailMessage[]>(key)
      queryClient.setQueryData<EmailMessage[]>(key, (old) => (old ?? []).map((m) => (m.id === id ? { ...m, is_read: true } : m)))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['email-messages', userId], context.previous)
    },
  })

  const syncAccount = useMutation({
    mutationFn: async (account: EmailAccount) => {
      const fn = account.provider === 'gmail' ? 'email-google-oauth' : account.provider === 'microsoft' ? 'email-microsoft-oauth' : 'email-imap-sync'
      const { error, data } = await supabase.functions.invoke(fn, { body: { account_id: account.id } })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts', userId] })
      queryClient.invalidateQueries({ queryKey: ['email-messages', userId] })
    },
  })

  const disconnectAccount = useMutation({
    mutationFn: async (accountId: string) => {
      await supabase.from('email_messages').delete().eq('email_account_id', accountId)
      const { error } = await supabase.from('email_accounts').delete().eq('id', accountId)
      if (error) throw error
    },
    onSuccess: (_data, accountId) => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts', userId] })
      queryClient.invalidateQueries({ queryKey: ['email-messages', userId] })
      if (accountFilter === accountId) setAccountFilter('all')
    },
  })

  const connectImap = useMutation({
    mutationFn: async (form: ImapForm) => {
      if (!user) throw new Error('Not signed in')
      const { data: inserted, error } = await supabase
        .from('email_accounts')
        .insert({
          user_id: user.id,
          provider: 'imap',
          display_name: form.email,
          email_address: form.email,
          imap_host: form.host,
          imap_port: Number(form.port) || 993,
          imap_username: form.email,
          imap_app_password: form.password,
          status: 'connected',
        })
        .select('id')
        .single()
      if (error || !inserted) throw new Error(error?.message || 'Failed to save the account')

      const { error: syncError } = await supabase.functions.invoke('email-imap-sync', {
        body: { account_id: inserted.id },
      })
      if (syncError) throw new Error(syncError.message)
      return inserted.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts', userId] })
      queryClient.invalidateQueries({ queryKey: ['email-messages', userId] })
      setImapForm(emptyImapForm)
      setImapError(null)
      setConnectOpen(false)
    },
    onError: (err) => setImapError(err instanceof Error ? err.message : String(err)),
  })

  // ---- handlers -------------------------------------------------------

  const openMessage = (m: EmailMessage) => {
    setSelectedMessage(m)
    if (!m.is_read) markRead.mutate(m.id)
  }

  const onImapSubmit = (e: FormEvent) => {
    e.preventDefault()
    setImapError(null)
    if (!imapForm.email || !imapForm.password || !imapForm.host || !imapForm.port) {
      setImapError('Fill in every field before connecting.')
      return
    }
    connectImap.mutate(imapForm)
  }

  const gmailAuthUrl = user
    ? `${functionsUrl('email-google-oauth')}?action=authorize&user_id=${encodeURIComponent(user.id)}&redirect_to=${encodeURIComponent(
        window.location.origin + '/email'
      )}`
    : undefined

  const microsoftAuthUrl = user
    ? `${functionsUrl('email-microsoft-oauth')}?action=authorize&user_id=${encodeURIComponent(user.id)}&redirect_to=${encodeURIComponent(
        window.location.origin + '/email'
      )}`
    : undefined

  // Surface an OAuth error passed back via ?error= on the redirect.
  const urlError = new URLSearchParams(window.location.search).get('error')

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--color-mist)]">Unified inbox</p>
          <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">Email</h1>
          <p className="mt-2 max-w-2xl text-[var(--color-mist)]">
            Every connected mailbox in one private view. We sync message metadata only — subject, sender and a
            snippet — never full bodies.
          </p>
        </div>
        <Button variant="primary" onClick={() => setConnectOpen(true)}>
          <Plus className="h-4 w-4" /> Connect account
        </Button>
      </div>

      {urlError && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-rose)]/30 bg-[var(--color-rose)]/10 p-3 text-xs text-[var(--color-rose)]">
          <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{decodeURIComponent(urlError)}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Unread" value={formatNumber(unreadCount)} sub="Across all accounts" icon={<Mail className="h-4 w-4" />} accent="azure" />
        <StatTile label="Starred" value={formatNumber(starredCount)} sub="Marked important" icon={<Star className="h-4 w-4" />} accent="gold" />
        <StatTile label="Accounts" value={formatNumber(accounts.length)} sub="Connected mailboxes" icon={<ShieldCheck className="h-4 w-4" />} accent="emerald" />
        <StatTile label="Loaded" value={formatNumber(messages.length)} sub="Most recent messages" icon={<Inbox className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader className="flex-wrap gap-3">
            <PanelTitle>Inbox</PanelTitle>
            <Tabs
              tabs={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread' },
                { value: 'starred', label: 'Starred' },
              ]}
              value={segment}
              onChange={(v) => setSegment(v as Segment)}
            />
          </PanelHeader>
          <PanelBody className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-mist-2)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject, sender or snippet…"
                  className="pl-9"
                />
              </div>
              <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="sm:w-56">
                <option value="all">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name}
                  </option>
                ))}
              </Select>
            </div>

            {messagesQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-obsidian-2)]" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-8 w-8" strokeWidth={1.2} />}
                title="No accounts connected yet"
                description="Connect Gmail, Outlook or any IMAP mailbox (iCloud, Yahoo, etc.) to start pulling in your unified inbox."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setConnectOpen(true)}>
                    Connect an account
                  </Button>
                }
              />
            ) : filteredMessages.length === 0 ? (
              <EmptyState
                icon={<Search className="h-8 w-8" strokeWidth={1.2} />}
                title="Nothing to show"
                description={
                  messages.length === 0
                    ? 'Your inbox is empty — try syncing an account from the panel on the right.'
                    : 'No messages match the current filters.'
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line-soft)]">
                {filteredMessages.map((m) => {
                  const account = accountsById.get(m.email_account_id)
                  const meta = account ? PROVIDER_META[account.provider] : null
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => openMessage(m)}
                        className="flex w-full items-start gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 hover:bg-white/[0.02]"
                      >
                        <div
                          className={cx(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium',
                            m.is_read
                              ? 'border-[var(--color-line)] bg-[var(--color-obsidian-2)] text-[var(--color-mist)]'
                              : 'border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 text-[var(--color-gold-bright)]'
                          )}
                        >
                          {initials(m.from_name || m.from_address)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cx('truncate text-sm', m.is_read ? 'text-[var(--color-mist)]' : 'font-semibold text-[var(--color-paper)]')}>
                              {m.from_name || m.from_address || 'Unknown sender'}
                            </p>
                            {meta && account && (
                              <Badge tone={meta.tone} className="shrink-0">
                                {account.display_name}
                              </Badge>
                            )}
                          </div>
                          <p className={cx('mt-0.5 truncate text-sm', m.is_read ? 'text-[var(--color-mist)]' : 'font-medium text-[var(--color-paper)]')}>
                            {m.subject || '(no subject)'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--color-mist-2)]">{m.snippet}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-[11px] text-[var(--color-mist-2)]">
                            {formatDistanceToNow(new Date(m.received_at), { addSuffix: true })}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleStar.mutate({ id: m.id, next: !m.is_starred })
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                toggleStar.mutate({ id: m.id, next: !m.is_starred })
                              }
                            }}
                            className="rounded-md p-1 text-[var(--color-mist-2)] transition-colors hover:text-[var(--color-gold)]"
                          >
                            <Star className={cx('h-4 w-4', m.is_starred && 'fill-[var(--color-gold)] text-[var(--color-gold)]')} />
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Connected accounts</PanelTitle>
            <Mail className="h-4 w-4 text-[var(--color-mist)]" />
          </PanelHeader>
          <PanelBody>
            {accountsQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-obsidian-2)]" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <EmptyState
                icon={<Mail className="h-8 w-8" strokeWidth={1.2} />}
                title="Nothing connected"
                description="Add Gmail, Outlook or IMAP to see mail here."
              />
            ) : (
              <ul className="space-y-3">
                {accounts.map((a) => {
                  const meta = PROVIDER_META[a.provider]
                  const Icon = meta.icon
                  return (
                    <li key={a.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-3)]">
                            <Icon className="h-4 w-4 text-[var(--color-mist)]" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-[var(--color-paper)]">{a.display_name}</p>
                            <p className="truncate text-xs text-[var(--color-mist)]">{a.email_address}</p>
                          </div>
                        </div>
                        <Badge tone={statusTone(a.status)} className="shrink-0 capitalize">
                          {a.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--color-mist-2)]">
                        {a.last_error ? (
                          <span className="text-[var(--color-rose)]">{a.last_error}</span>
                        ) : a.last_synced_at ? (
                          `Synced ${formatDistanceToNow(new Date(a.last_synced_at), { addSuffix: true })}`
                        ) : (
                          'Never synced'
                        )}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={syncAccount.isPending && syncAccount.variables?.id === a.id}
                          onClick={() => syncAccount.mutate(a)}
                          className="flex-1 justify-center"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Sync now
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={disconnectAccount.isPending && disconnectAccount.variables === a.id}
                          onClick={() => {
                            if (window.confirm(`Disconnect ${a.display_name}? This removes its synced messages too.`)) {
                              disconnectAccount.mutate(a.id)
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
            <Button variant="outline" size="sm" className="mt-4 w-full justify-center" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Connect an account
            </Button>
          </PanelBody>
        </Panel>
      </div>

      {/* ---- reading drawer ---- */}
      <Modal open={!!selectedMessage} onClose={() => setSelectedMessage(null)} title={selectedMessage?.subject || '(no subject)'}>
        {selectedMessage && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--color-paper)]">{selectedMessage.from_name || 'Unknown sender'}</p>
                <p className="text-xs text-[var(--color-mist)]">{selectedMessage.from_address}</p>
              </div>
              <p className="shrink-0 text-xs text-[var(--color-mist-2)]">{format(new Date(selectedMessage.received_at), 'd MMM yyyy, HH:mm')}</p>
            </div>
            {(() => {
              const account = accountsById.get(selectedMessage.email_account_id)
              return account ? (
                <Badge tone={PROVIDER_META[account.provider].tone}>{account.display_name}</Badge>
              ) : null
            })()}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-paper)]">{selectedMessage.snippet}</p>
            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-3 text-xs text-[var(--color-mist)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Beaumont One syncs message metadata only (subject, sender, date and a short snippet) — not the full body.
                Open the message in Gmail, Outlook or your mail app for the complete content.
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- connect account modal ---- */}
      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect an email account">
        <Tabs
          tabs={[
            { value: 'gmail', label: 'Gmail' },
            { value: 'microsoft', label: 'Outlook' },
            { value: 'imap', label: 'IMAP' },
          ]}
          value={connectTab}
          onChange={(v) => setConnectTab(v as typeof connectTab)}
          className="mb-5 w-full"
        />

        {connectTab === 'gmail' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-mist)]">
              Sign in with Google to sync your Gmail inbox read-only. Beaumont One requests only the
              <code className="mx-1 rounded bg-white/5 px-1 py-0.5 text-xs">gmail.readonly</code>
              scope.
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-amber)]/25 bg-[var(--color-amber)]/10 p-3 text-xs text-[var(--color-amber)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Requires your own Google Cloud OAuth credentials (<code>GOOGLE_CLIENT_ID</code> /{' '}
                <code>GOOGLE_CLIENT_SECRET</code> as Supabase Edge Function secrets, with the Gmail API enabled) — see
                the README.
              </span>
            </div>
            <Button
              variant="primary"
              className="w-full justify-center"
              disabled={!gmailAuthUrl}
              onClick={() => gmailAuthUrl && (window.location.href = gmailAuthUrl)}
            >
              <Mail className="h-4 w-4" /> Continue with Gmail <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {connectTab === 'microsoft' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-mist)]">
              Sign in with Microsoft to sync Outlook / Microsoft 365 mail read-only via Microsoft Graph.
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-amber)]/25 bg-[var(--color-amber)]/10 p-3 text-xs text-[var(--color-amber)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Requires your own Microsoft Entra app registration (<code>MICROSOFT_CLIENT_ID</code> /{' '}
                <code>MICROSOFT_CLIENT_SECRET</code> as Supabase Edge Function secrets, with{' '}
                <code>Mail.Read</code> delegated permission) — see the README.
              </span>
            </div>
            <Button
              variant="primary"
              className="w-full justify-center"
              disabled={!microsoftAuthUrl}
              onClick={() => microsoftAuthUrl && (window.location.href = microsoftAuthUrl)}
            >
              <Building2 className="h-4 w-4" /> Continue with Microsoft <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {connectTab === 'imap' && (
          <form onSubmit={onImapSubmit} className="space-y-4">
            <p className="text-sm text-[var(--color-mist)]">
              For iCloud Mail or any other IMAP provider without OAuth. No credentials leave your database — they're
              stored on your account row, scoped to you by row-level security.
            </p>
            <Field label="Email address">
              <Input
                type="email"
                required
                value={imapForm.email}
                onChange={(e) => {
                  const email = e.target.value
                  setImapForm((prev) => ({
                    ...prev,
                    email,
                    host: prev.hostTouched ? prev.host : hostForEmail(email),
                  }))
                }}
                placeholder="you@icloud.com"
              />
            </Field>
            <Field
              label="App-specific password"
              hint="For iCloud, generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords. For other providers it's usually your normal password, or an app password if 2FA is on."
            >
              <Input
                type="password"
                required
                value={imapForm.password}
                onChange={(e) => setImapForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••••••••••"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IMAP host" hint="e.g. imap.mail.yahoo.com for Yahoo">
                <Input
                  required
                  value={imapForm.host}
                  onChange={(e) => setImapForm((prev) => ({ ...prev, host: e.target.value, hostTouched: true }))}
                  placeholder="imap.mail.me.com"
                />
              </Field>
              <Field label="Port">
                <Input
                  required
                  inputMode="numeric"
                  value={imapForm.port}
                  onChange={(e) => setImapForm((prev) => ({ ...prev, port: e.target.value }))}
                  placeholder="993"
                />
              </Field>
            </div>
            {imapError && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{imapError}</p>}
            <Button type="submit" variant="primary" className="w-full justify-center" loading={connectImap.isPending}>
              Connect mailbox
            </Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
