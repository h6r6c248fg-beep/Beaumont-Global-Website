import type { CalendarAccount, CalendarEvent, CalendarProvider } from '@/types/database'

export const DEFAULT_EVENT_COLOR = '#cba15c'

export const COLOR_PRESETS = ['#cba15c', '#59b895', '#d97a7a', '#6fa4d9', '#d9a55b', '#b0794f']

export const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  microsoft: 'Outlook Calendar',
  apple_caldav: 'iCloud Calendar',
  manual: 'Manual',
}

/** Resolve the color a given event should render with: its own color, else
 * its connected account's color, else the app default gold. */
export function eventColor(event: CalendarEvent, accountsById: Map<string, CalendarAccount>): string {
  if (event.color) return event.color
  if (event.calendar_account_id) {
    const acc = accountsById.get(event.calendar_account_id)
    if (acc?.color) return acc.color
  }
  return DEFAULT_EVENT_COLOR
}

export function accountLabel(account: CalendarAccount): string {
  return account.display_name || PROVIDER_LABEL[account.provider]
}

export function statusTone(status: string): 'emerald' | 'rose' | 'amber' | 'neutral' {
  if (status === 'connected') return 'emerald'
  if (status === 'error') return 'rose'
  if (status === 'not_connected') return 'amber'
  return 'neutral'
}

export function functionsBaseUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  return `${url.replace(/\/$/, '')}/functions/v1`
}

export function googleAuthorizeUrl(userId: string, redirectTo: string): string {
  const params = new URLSearchParams({ action: 'authorize', user_id: userId, redirect_to: redirectTo })
  return `${functionsBaseUrl()}/calendar-google-oauth?${params.toString()}`
}

export function microsoftAuthorizeUrl(userId: string, redirectTo: string): string {
  const params = new URLSearchParams({ action: 'authorize', user_id: userId, redirect_to: redirectTo })
  return `${functionsBaseUrl()}/calendar-microsoft-oauth?${params.toString()}`
}
