import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Building2, Cloud, ShieldCheck, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { functionsBaseUrl, googleAuthorizeUrl, microsoftAuthorizeUrl } from './utils'

function OptionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-3)] text-[var(--color-gold)]">
          {icon}
        </span>
        <h4 className="font-display text-base text-[var(--color-paper)]">{title}</h4>
      </div>
      {children}
    </div>
  )
}

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [icloudEmail, setIcloudEmail] = useState('')
  const [icloudPassword, setIcloudPassword] = useState('')
  const [icloudError, setIcloudError] = useState<string | null>(null)
  const [icloudNotice, setIcloudNotice] = useState<string | null>(null)

  const redirectTo = window.location.origin + '/calendar'

  const connectIcloud = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      if (!icloudEmail.trim() || !icloudPassword.trim()) throw new Error('Enter your iCloud email and an app-specific password.')

      const { data: inserted, error: insertError } = await supabase
        .from('calendar_accounts')
        .insert({
          user_id: user.id,
          provider: 'apple_caldav',
          display_name: 'iCloud Calendar',
          email: icloudEmail.trim(),
          caldav_url: 'https://caldav.icloud.com',
          caldav_username: icloudEmail.trim(),
          caldav_app_password: icloudPassword.trim(),
          status: 'connected',
        })
        .select('id')
        .single()
      if (insertError || !inserted) throw insertError ?? new Error('Could not save the account.')

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${functionsBaseUrl()}/calendar-caldav-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ account_id: inserted.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.ok === false) {
        // The account is saved even if the first sync fails — surface a
        // warning but don't roll back the connection; "Sync now" can retry.
        throw new Error(json?.error || 'Connected, but the first sync failed. Try "Sync now" from the calendars list.')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
      setIcloudEmail('')
      setIcloudPassword('')
      setIcloudNotice('iCloud calendar connected and synced.')
      setTimeout(() => setIcloudNotice(null), 4000)
    },
    onError: (err: unknown) => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] })
      setIcloudError(err instanceof Error ? err.message : 'Could not connect iCloud calendar.')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Connect a calendar" className="max-w-xl">
      <div className="space-y-4">
        <OptionCard icon={<Globe className="h-4 w-4" />} title="Google Calendar">
          <p className="mb-3 text-sm text-[var(--color-mist)]">
            Sign in with Google and grant read access to your calendar. Beaumont One imports your upcoming events and keeps a
            copy in sync.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!user) return
              window.location.href = googleAuthorizeUrl(user.id, redirectTo)
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue with Google
          </Button>
          <p className="mt-2 text-[11px] text-[var(--color-mist-2)]">
            Requires your own Google Cloud OAuth credentials — add <code>GOOGLE_CLIENT_ID</code>/
            <code>GOOGLE_CLIENT_SECRET</code> as Supabase Edge Function secrets. See README.
          </p>
        </OptionCard>

        <OptionCard icon={<Building2 className="h-4 w-4" />} title="Microsoft Outlook Calendar">
          <p className="mb-3 text-sm text-[var(--color-mist)]">
            Sign in with Microsoft and grant read access to your Outlook calendar. Beaumont One imports your upcoming events
            and keeps a copy in sync.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!user) return
              window.location.href = microsoftAuthorizeUrl(user.id, redirectTo)
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue with Microsoft
          </Button>
          <p className="mt-2 text-[11px] text-[var(--color-mist-2)]">
            Requires your own Azure AD app registration — add <code>MICROSOFT_CLIENT_ID</code>/
            <code>MICROSOFT_CLIENT_SECRET</code> as Supabase Edge Function secrets. See README.
          </p>
        </OptionCard>

        <OptionCard icon={<Cloud className="h-4 w-4" />} title="Apple Calendar (iCloud)">
          <p className="mb-3 text-sm text-[var(--color-mist)]">
            Apple doesn&apos;t offer a public OAuth calendar API for third-party web apps, so this connects directly over
            CalDAV using an app-specific password.
          </p>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--color-amber)]/25 bg-[var(--color-amber)]/10 p-2.5 text-[11px] text-[var(--color-amber)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Generate an app-specific password at{' '}
              <span className="text-[var(--color-paper)]">appleid.apple.com → Sign-In and Security → App-Specific
              Passwords</span>
              . Never enter your real Apple ID password here.
            </span>
          </div>
          <div className="space-y-3">
            <Field label="iCloud email">
              <Input type="email" value={icloudEmail} onChange={(e) => setIcloudEmail(e.target.value)} placeholder="you@icloud.com" />
            </Field>
            <Field label="App-specific password">
              <Input
                type="password"
                value={icloudPassword}
                onChange={(e) => setIcloudPassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                autoComplete="off"
              />
            </Field>
            {icloudError && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{icloudError}</p>}
            {icloudNotice && (
              <p className="rounded-lg bg-[var(--color-emerald)]/10 px-3 py-2 text-xs text-[var(--color-emerald)]">{icloudNotice}</p>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={connectIcloud.isPending}
              onClick={() => {
                setIcloudError(null)
                connectIcloud.mutate()
              }}
            >
              Connect iCloud Calendar
            </Button>
          </div>
        </OptionCard>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
