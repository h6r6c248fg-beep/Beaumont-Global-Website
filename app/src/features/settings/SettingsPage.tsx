import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { CalendarDays, Mail, LineChart, UtensilsCrossed, LogOut, User as UserIcon, ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { cx, initials } from '@/lib/utils'
import type { Profile } from '@/types/database'

const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Zurich',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-medium text-[var(--color-paper)]">Settings</h1>
        <p className="mt-2 max-w-2xl text-[var(--color-mist)]">Manage your profile, security and connected accounts.</p>
      </div>

      <ProfileSection />
      <SecuritySection />
      <ConnectedAccountsSection />
      <NutritionSection />
    </div>
  )
}

function ProfileSection() {
  const { user, profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'UTC')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setTimezone(profile.timezone ?? 'UTC')
      setAvatarUrl(profile.avatar_url ?? '')
    }
  }, [profile])

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const update: Partial<Profile> = {
        full_name: fullName.trim() || null,
        timezone,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Profile</PanelTitle>
        <UserIcon className="h-4 w-4 text-[var(--color-mist)]" />
      </PanelHeader>
      <PanelBody className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-obsidian-2)]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <span className="font-display text-lg text-[var(--color-gold-bright)]">{initials(fullName || user?.email, 'ME')}</span>
            )}
          </div>
          <div className="flex-1">
            <Field label="Avatar URL">
              <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {save.isError && (
          <p className="text-xs text-[var(--color-rose)]">{save.error instanceof Error ? save.error.message : 'Failed to save profile'}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-emerald)]">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )
}

function SecuritySection() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) throw new Error('Password must be at least 8 characters')
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    },
    onSuccess: () => {
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 2000)
    },
  })

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Security</PanelTitle>
      </PanelHeader>
      <PanelBody className="space-y-5">
        <Field label="Account email">
          <Input value={user?.email ?? ''} readOnly disabled className="opacity-70" />
        </Field>

        <div className="border-t border-[var(--color-line-soft)] pt-5">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">Change password</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="New password">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>
          {changePassword.isError && (
            <p className="mt-2 text-xs text-[var(--color-rose)]">
              {changePassword.error instanceof Error ? changePassword.error.message : 'Failed to update password'}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-3">
            {passwordSaved && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-emerald)]">
                <Check className="h-3.5 w-3.5" /> Password updated
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!newPassword || !confirmPassword}
              loading={changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              Update password
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-line-soft)] pt-5">
          <div>
            <p className="text-sm text-[var(--color-paper)]">Sign out</p>
            <p className="text-xs text-[var(--color-mist)]">End your session on this device.</p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              await signOut()
              navigate('/auth')
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )
}

function ConnectedAccountsSection() {
  const { user } = useAuth()
  const userId = user?.id

  const counts = useQuery({
    queryKey: ['settings', 'connected-counts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [calendars, emails, integrations] = await Promise.all([
        supabase.from('calendar_accounts').select('*', { count: 'exact', head: true }).eq('user_id', userId!),
        supabase.from('email_accounts').select('*', { count: 'exact', head: true }).eq('user_id', userId!),
        supabase.from('integrations').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('status', 'connected'),
      ])
      return {
        calendars: calendars.count ?? 0,
        emails: emails.count ?? 0,
        integrations: integrations.count ?? 0,
      }
    },
  })

  const cards = [
    {
      to: '/calendar',
      icon: CalendarDays,
      label: 'Calendar',
      summary: `${counts.data?.calendars ?? 0} calendar${counts.data?.calendars === 1 ? '' : 's'} connected`,
    },
    {
      to: '/email',
      icon: Mail,
      label: 'Email',
      summary: `${counts.data?.emails ?? 0} account${counts.data?.emails === 1 ? '' : 's'} connected`,
    },
    {
      to: '/finance',
      icon: LineChart,
      label: 'Finance',
      summary: `${counts.data?.integrations ?? 0} integration${counts.data?.integrations === 1 ? '' : 's'} connected`,
    },
  ]

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Connected accounts</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.to}
              className={cx('flex flex-col justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-4')}
            >
              <div className="flex items-center gap-2 text-[var(--color-paper)]">
                <c.icon className="h-4 w-4 text-[var(--color-gold)]" />
                <span className="text-sm font-medium">{c.label}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--color-mist)]">{c.summary}</p>
              <Link to={c.to} className="mt-3">
                <Button variant="outline" size="sm" className="w-full justify-center">
                  Manage <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  )
}

function NutritionSection() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Nutrition targets</PanelTitle>
        <UtensilsCrossed className="h-4 w-4 text-[var(--color-mist)]" />
      </PanelHeader>
      <PanelBody>
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-md text-sm text-[var(--color-mist)]">
            Calorie and macro targets are managed from the Nutrition page, not here.
          </p>
          <Link to="/nutrition">
            <Button variant="outline" size="sm">
              Open nutrition <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </PanelBody>
    </Panel>
  )
}
