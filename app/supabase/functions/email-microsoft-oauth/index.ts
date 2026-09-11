// Meridian — Outlook / Microsoft 365 OAuth + sync edge function.
//
// GET  ?action=authorize&user_id=...&redirect_to=...   -> 302 to Microsoft's consent screen
// GET  ?action=callback&code=...&state=...              -> exchanges the code, stores the
//                                                          account, pulls the most recent
//                                                          ~30 messages via Microsoft Graph,
//                                                          then 302s back to `redirect_to`
// POST { account_id }                                   -> re-syncs an already-connected
//                                                          Microsoft account ("Sync now")
//
// Requires these Supabase Edge Function secrets (see README):
//   MICROSOFT_CLIENT_ID
//   MICROSOFT_CLIENT_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to every edge function.)
//
// Scope note: we only store metadata (from/subject/snippet/date), never the full message
// body — this powers a unified-inbox overview, not a full webmail client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MS_SCOPES = ['Mail.Read', 'offline_access', 'User.Read'].join(' ')
const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

function b64urlEncode(obj: unknown) {
  const json = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): { user_id: string; redirect_to: string } {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json)
}

function functionSelfUrl(req: Request) {
  const url = new URL(req.url)
  return `${url.origin}${url.pathname}`
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth is not configured: missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET secrets.')
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MS_SCOPES,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Microsoft token exchange failed')
  return json as { access_token: string; refresh_token?: string; expires_in: number }
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth is not configured: missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET secrets.')
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      scope: MS_SCOPES,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Microsoft token refresh failed')
  return json as { access_token: string; refresh_token?: string; expires_in: number }
}

async function fetchUserEmail(accessToken: string) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Microsoft account profile')
  const json = await res.json()
  return (json.mail || json.userPrincipalName) as string
}

async function syncOutlookMessages(sb: ReturnType<typeof admin>, accountId: string, userId: string, accessToken: string) {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/messages?$top=30&$select=id,subject,bodyPreview,from,receivedDateTime,isRead&$orderby=receivedDateTime desc',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Failed to list Outlook messages')
  const messages: Array<{
    id: string
    subject?: string
    bodyPreview?: string
    from?: { emailAddress?: { name?: string; address?: string } }
    receivedDateTime?: string
    isRead?: boolean
  }> = json.value ?? []
  if (messages.length === 0) return 0

  const ids = messages.map((m) => m.id)
  const { data: existing } = await sb
    .from('email_messages')
    .select('external_id')
    .eq('email_account_id', accountId)
    .in('external_id', ids)
  const existingIds = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id))
  const newMessages = messages.filter((m) => !existingIds.has(m.id))
  if (newMessages.length === 0) return 0

  const rows = newMessages.map((m) => ({
    user_id: userId,
    email_account_id: accountId,
    external_id: m.id,
    from_name: m.from?.emailAddress?.name || null,
    from_address: m.from?.emailAddress?.address || null,
    subject: m.subject || '(no subject)',
    snippet: m.bodyPreview || '',
    received_at: m.receivedDateTime || new Date().toISOString(),
    is_read: m.isRead ?? true,
    is_starred: false,
    folder: 'inbox',
  }))

  const { error } = await sb.from('email_messages').insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

async function handleSync(sb: ReturnType<typeof admin>, accountId: string) {
  const { data: account, error } = await sb.from('email_accounts').select('*').eq('id', accountId).maybeSingle()
  if (error || !account) throw new Error('Account not found')
  if (account.provider !== 'microsoft') throw new Error('Account is not a Microsoft account')
  if (!account.refresh_token) throw new Error('No refresh token stored for this account — reconnect Outlook.')

  const refreshed = await refreshAccessToken(account.refresh_token)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  const count = await syncOutlookMessages(sb, account.id, account.user_id, refreshed.access_token)

  await sb
    .from('email_accounts')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: expiresAt,
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', account.id)

  return count
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const sb = admin()
  const url = new URL(req.url)

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const accountId = body.account_id
      if (!accountId) return new Response(JSON.stringify({ error: 'account_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const count = await handleSync(sb, accountId)
      return new Response(JSON.stringify({ success: true, synced: count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const action = url.searchParams.get('action')

    if (action === 'authorize') {
      const userId = url.searchParams.get('user_id')
      const redirectTo = url.searchParams.get('redirect_to') || '/'
      if (!userId) return new Response('user_id is required', { status: 400, headers: corsHeaders })

      const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
      if (!clientId) {
        const back = new URL(redirectTo)
        back.searchParams.set('error', 'Microsoft OAuth is not configured on the server (missing MICROSOFT_CLIENT_ID).')
        return new Response(null, { status: 302, headers: { ...corsHeaders, Location: back.toString() } })
      }

      const state = b64urlEncode({ user_id: userId, redirect_to: redirectTo })
      const redirectUri = `${functionSelfUrl(req)}?action=callback`

      const authUrl = new URL(AUTHORIZE_URL)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('response_mode', 'query')
      authUrl.searchParams.set('scope', MS_SCOPES)
      authUrl.searchParams.set('state', state)

      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl.toString() } })
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code')
      const stateRaw = url.searchParams.get('state')
      const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')
      if (!stateRaw) return new Response('Missing state', { status: 400, headers: corsHeaders })
      const { user_id, redirect_to } = b64urlDecode(stateRaw)

      if (oauthError || !code) {
        const back = new URL(redirect_to)
        back.searchParams.set('error', oauthError || 'Microsoft sign-in was cancelled.')
        return new Response(null, { status: 302, headers: { ...corsHeaders, Location: back.toString() } })
      }

      const redirectUri = `${functionSelfUrl(req)}?action=callback`
      const tokens = await exchangeCodeForTokens(code, redirectUri)
      const email = await fetchUserEmail(tokens.access_token)
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

      const { data: existing } = await sb
        .from('email_accounts')
        .select('id, refresh_token')
        .eq('user_id', user_id)
        .eq('provider', 'microsoft')
        .eq('email_address', email)
        .maybeSingle()

      let accountId: string
      if (existing) {
        accountId = existing.id
        await sb
          .from('email_accounts')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || existing.refresh_token,
            token_expires_at: expiresAt,
            status: 'connected',
            last_error: null,
          })
          .eq('id', accountId)
      } else {
        const { data: inserted, error: insertError } = await sb
          .from('email_accounts')
          .insert({
            user_id,
            provider: 'microsoft',
            display_name: email,
            email_address: email,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            token_expires_at: expiresAt,
            status: 'connected',
          })
          .select('id')
          .single()
        if (insertError || !inserted) throw new Error(insertError?.message || 'Failed to save Microsoft account')
        accountId = inserted.id
      }

      try {
        await syncOutlookMessages(sb, accountId, user_id, tokens.access_token)
        await sb.from('email_accounts').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', accountId)
      } catch (syncErr) {
        await sb
          .from('email_accounts')
          .update({ last_error: syncErr instanceof Error ? syncErr.message : String(syncErr) })
          .eq('id', accountId)
      }

      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirect_to } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use ?action=authorize or ?action=callback.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      const stateRaw = url.searchParams.get('state')
      if (stateRaw) {
        const { redirect_to } = b64urlDecode(stateRaw)
        const back = new URL(redirect_to)
        back.searchParams.set('error', message)
        return new Response(null, { status: 302, headers: { ...corsHeaders, Location: back.toString() } })
      }
    } catch {
      // fall through to JSON error
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
