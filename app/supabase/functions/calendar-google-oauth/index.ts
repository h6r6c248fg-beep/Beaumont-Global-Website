// supabase/functions/calendar-google-oauth/index.ts
//
// Google Calendar OAuth connect + initial sync for Meridian.
//
// Requires these Supabase Edge Function secrets (Project Settings -> Edge
// Functions -> Secrets):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Supabase Edge Functions runtime — nothing to configure there.
//
// IMPORTANT: this function is hit by direct browser navigation — both the
// ?action=authorize redirect out to Google, and Google's ?action=callback
// redirect back — so no Authorization header is ever sent. Set, in
// supabase/config.toml:
//
//   [functions.calendar-google-oauth]
//   verify_jwt = false
//
// otherwise the platform gateway will 401 the request before this code ever
// runs. (config.toml lives outside supabase/functions/calendar-*/ so it is
// intentionally not created by this change — add it yourself.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function functionUrl(req: Request) {
  const url = new URL(req.url)
  return `${url.origin}${url.pathname}`
}

function encodeState(state: Record<string, string>) {
  const json = JSON.stringify(state)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeState(state: string): { user_id: string; redirect_to: string } {
  const padded = state.replace(/-/g, '+').replace(/_/g, '/')
  const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const parsed = JSON.parse(json)
  if (!parsed || typeof parsed.user_id !== 'string' || typeof parsed.redirect_to !== 'string') {
    throw new Error('Malformed state')
  }
  return parsed
}

function errorRedirect(redirectTo: string, message: string) {
  try {
    const url = new URL(redirectTo)
    url.searchParams.set('calendar_error', message)
    return Response.redirect(url.toString(), 302)
  } catch {
    return new Response(`Google Calendar connection failed: ${message}`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (action === 'authorize') {
    const userId = url.searchParams.get('user_id')
    const redirectTo = url.searchParams.get('redirect_to') || '/'
    if (!userId) return new Response('Missing user_id', { status: 400, headers: CORS_HEADERS })
    if (!clientId) return errorRedirect(redirectTo, 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID).')

    const state = encodeState({ user_id: userId, redirect_to: redirectTo })
    const redirectUri = `${functionUrl(req)}?action=callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPE,
      state,
    })
    return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302)
  }

  if (action === 'callback') {
    const oauthError = url.searchParams.get('error')
    const stateParam = url.searchParams.get('state')
    const code = url.searchParams.get('code')

    let state: { user_id: string; redirect_to: string } | null = null
    if (stateParam) {
      try {
        state = decodeState(stateParam)
      } catch {
        state = null
      }
    }
    const fallbackRedirect = state?.redirect_to ?? '/'

    if (oauthError) return errorRedirect(fallbackRedirect, `Google sign-in was cancelled or denied (${oauthError}).`)
    if (!code || !state) return new Response('Missing code or state', { status: 400, headers: CORS_HEADERS })
    if (!clientId || !clientSecret) return errorRedirect(state.redirect_to, 'Google OAuth is not configured on the server.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return errorRedirect(state.redirect_to, 'Supabase service credentials are missing on the server.')

    try {
      const redirectUri = `${functionUrl(req)}?action=callback`
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      const tokenJson = await tokenRes.json()
      if (!tokenRes.ok) {
        return errorRedirect(state.redirect_to, `Google token exchange failed: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`)
      }
      const accessToken: string = tokenJson.access_token
      const refreshToken: string | undefined = tokenJson.refresh_token
      const expiresIn: number | undefined = tokenJson.expires_in
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

      // The primary calendar endpoint returns the account email as `id` and
      // a friendly name as `summary`, and only needs calendar.readonly scope
      // (unlike the separate userinfo endpoint, which can be scope-limited).
      let email: string | null = null
      let displayName = 'Google Calendar'
      try {
        const calRes = await fetch(GOOGLE_CALENDAR_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (calRes.ok) {
          const cal = await calRes.json()
          email = cal.id ?? null
          displayName = cal.summary || email || displayName
        }
      } catch {
        // non-fatal — fall through to userinfo
      }
      if (!email) {
        try {
          const uiRes = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
          if (uiRes.ok) {
            const ui = await uiRes.json()
            email = ui.email ?? null
            displayName = ui.name || email || displayName
          }
        } catch {
          // non-fatal
        }
      }

      const admin = createClient(supabaseUrl, serviceKey)

      const { data: existing } = await admin
        .from('calendar_accounts')
        .select('id')
        .eq('user_id', state.user_id)
        .eq('provider', 'google')
        .maybeSingle()

      const accountRow: Record<string, unknown> = {
        user_id: state.user_id,
        provider: 'google',
        display_name: displayName,
        email,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        status: 'connected',
        last_error: null,
      }
      // Google only returns a refresh_token on the first consent (or when
      // prompt=consent forces re-consent, which we always request) — still,
      // guard against clobbering a previously stored one if it's absent.
      if (refreshToken) accountRow.refresh_token = refreshToken

      let accountId: string
      if (existing?.id) {
        accountId = existing.id
        await admin.from('calendar_accounts').update(accountRow).eq('id', accountId)
      } else {
        const { data: inserted, error: insertError } = await admin
          .from('calendar_accounts')
          .insert({ ...accountRow, refresh_token: refreshToken ?? null })
          .select('id')
          .single()
        if (insertError || !inserted) {
          return errorRedirect(state.redirect_to, `Could not save Google account: ${insertError?.message ?? 'unknown error'}`)
        }
        accountId = inserted.id
      }

      // Mirror upcoming events: fetch, then fully replace this account's rows.
      const eventsParams = new URLSearchParams({
        timeMin: new Date().toISOString(),
        maxResults: '250',
        singleEvents: 'true',
        orderBy: 'startTime',
      })
      const eventsRes = await fetch(`${GOOGLE_EVENTS_URL}?${eventsParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (eventsRes.ok) {
        const eventsJson = await eventsRes.json()
        const items = Array.isArray(eventsJson.items) ? eventsJson.items : []
        const rows = items
          .filter((item: any) => item.id && (item.start?.date || item.start?.dateTime))
          .map((item: any) => {
            const allDay = Boolean(item.start?.date && !item.start?.dateTime)
            const startAt = item.start?.dateTime || `${item.start.date}T00:00:00.000Z`
            const endAt = item.end?.dateTime || (item.end?.date ? `${item.end.date}T00:00:00.000Z` : startAt)
            return {
              user_id: state!.user_id,
              calendar_account_id: accountId,
              external_id: item.id,
              title: item.summary || '(untitled)',
              description: item.description ?? null,
              location: item.location ?? null,
              start_at: startAt,
              end_at: endAt,
              all_day: allDay,
              source: 'google',
              color: null,
            }
          })

        await admin.from('calendar_events').delete().eq('calendar_account_id', accountId)
        if (rows.length > 0) await admin.from('calendar_events').insert(rows)

        await admin
          .from('calendar_accounts')
          .update({ last_synced_at: new Date().toISOString(), status: 'connected', last_error: null })
          .eq('id', accountId)
      } else {
        const errJson = await eventsRes.json().catch(() => ({}))
        await admin
          .from('calendar_accounts')
          .update({ status: 'error', last_error: `Could not fetch events: ${errJson.error?.message ?? eventsRes.status}` })
          .eq('id', accountId)
      }

      return Response.redirect(state.redirect_to, 302)
    } catch (err) {
      return errorRedirect(state.redirect_to, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return new Response('Not found. Use ?action=authorize or ?action=callback.', { status: 404, headers: CORS_HEADERS })
})
