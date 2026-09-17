// supabase/functions/calendar-microsoft-oauth/index.ts
//
// Microsoft Outlook Calendar OAuth connect + initial sync for Meridian,
// against Microsoft Graph. Mirrors calendar-google-oauth's shape.
//
// Requires these Supabase Edge Function secrets (Project Settings -> Edge
// Functions -> Secrets):
//   MICROSOFT_CLIENT_ID
//   MICROSOFT_CLIENT_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Supabase Edge Functions runtime.
//
// IMPORTANT: this function is hit by direct browser navigation — both the
// ?action=authorize redirect out to Microsoft, and Microsoft's
// ?action=callback redirect back — so no Authorization header is ever sent.
// Set, in supabase/config.toml:
//
//   [functions.calendar-microsoft-oauth]
//   verify_jwt = false
//
// otherwise the platform gateway will 401 the request before this code ever
// runs. (config.toml lives outside supabase/functions/calendar-*/ so it is
// intentionally not created by this change — add it yourself.)
//
// The app registration in Azure AD must allow "personal Microsoft accounts"
// and/or the relevant tenant, matching the `/common/` authority used below.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me'
const GRAPH_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events'
const SCOPE = 'Calendars.Read offline_access User.Read'

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
    return new Response(`Outlook Calendar connection failed: ${message}`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
    })
  }
}

// Microsoft Graph returns event start/end as a naive local timestamp (e.g.
// "2025-01-01T09:00:00.0000000") plus a separate IANA/Windows timeZone name
// (start.timeZone / end.timeZone). Converting that properly requires a
// timezone database; as a pragmatic simplification we treat the naive
// timestamp as UTC. A fuller implementation would resolve the named zone's
// offset (or request Prefer: outlook.timezone="UTC" on the request).
function graphDateTimeToIso(dateTime: string): string {
  const trimmed = dateTime.split('.')[0]
  return `${trimmed}Z`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')

  if (action === 'authorize') {
    const userId = url.searchParams.get('user_id')
    const redirectTo = url.searchParams.get('redirect_to') || '/'
    if (!userId) return new Response('Missing user_id', { status: 400, headers: CORS_HEADERS })
    if (!clientId) return errorRedirect(redirectTo, 'Microsoft OAuth is not configured on the server (missing MICROSOFT_CLIENT_ID).')

    const state = encodeState({ user_id: userId, redirect_to: redirectTo })
    const redirectUri = `${functionUrl(req)}?action=callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: SCOPE,
      state,
      prompt: 'consent',
    })
    return Response.redirect(`${MS_AUTH_URL}?${params.toString()}`, 302)
  }

  if (action === 'callback') {
    const oauthError = url.searchParams.get('error')
    const oauthErrorDesc = url.searchParams.get('error_description')
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

    if (oauthError) return errorRedirect(fallbackRedirect, `Microsoft sign-in was cancelled or denied (${oauthErrorDesc || oauthError}).`)
    if (!code || !state) return new Response('Missing code or state', { status: 400, headers: CORS_HEADERS })
    if (!clientId || !clientSecret) return errorRedirect(state.redirect_to, 'Microsoft OAuth is not configured on the server.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return errorRedirect(state.redirect_to, 'Supabase service credentials are missing on the server.')

    try {
      const redirectUri = `${functionUrl(req)}?action=callback`
      const tokenRes = await fetch(MS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: SCOPE,
        }),
      })
      const tokenJson = await tokenRes.json()
      if (!tokenRes.ok) {
        return errorRedirect(state.redirect_to, `Microsoft token exchange failed: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`)
      }
      const accessToken: string = tokenJson.access_token
      const refreshToken: string | undefined = tokenJson.refresh_token
      const expiresIn: number | undefined = tokenJson.expires_in
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

      let email: string | null = null
      let displayName = 'Outlook Calendar'
      try {
        const meRes = await fetch(GRAPH_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (meRes.ok) {
          const me = await meRes.json()
          email = me.mail || me.userPrincipalName || null
          displayName = me.displayName || email || displayName
        }
      } catch {
        // non-fatal
      }

      const admin = createClient(supabaseUrl, serviceKey)

      const { data: existing } = await admin
        .from('calendar_accounts')
        .select('id')
        .eq('user_id', state.user_id)
        .eq('provider', 'microsoft')
        .maybeSingle()

      const accountRow: Record<string, unknown> = {
        user_id: state.user_id,
        provider: 'microsoft',
        display_name: displayName,
        email,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        status: 'connected',
        last_error: null,
      }
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
          return errorRedirect(state.redirect_to, `Could not save Microsoft account: ${insertError?.message ?? 'unknown error'}`)
        }
        accountId = inserted.id
      }

      const eventsParams = new URLSearchParams({
        $top: '250',
        $select: 'id,subject,bodyPreview,location,start,end,isAllDay',
        $orderby: 'start/dateTime',
      })
      const eventsRes = await fetch(`${GRAPH_EVENTS_URL}?${eventsParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
      })

      if (eventsRes.ok) {
        const eventsJson = await eventsRes.json()
        const items = Array.isArray(eventsJson.value) ? eventsJson.value : []
        const rows = items
          .filter((item: any) => item.id && item.start?.dateTime)
          .map((item: any) => {
            const allDay = Boolean(item.isAllDay)
            const startAt = graphDateTimeToIso(item.start.dateTime)
            const endAt = item.end?.dateTime ? graphDateTimeToIso(item.end.dateTime) : startAt
            return {
              user_id: state!.user_id,
              calendar_account_id: accountId,
              external_id: item.id,
              title: item.subject || '(untitled)',
              description: item.bodyPreview || null,
              location: item.location?.displayName || null,
              start_at: startAt,
              end_at: endAt,
              all_day: allDay,
              source: 'microsoft',
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
