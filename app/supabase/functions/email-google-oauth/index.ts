// Meridian — Gmail OAuth + sync edge function.
//
// GET  ?action=authorize&user_id=...&redirect_to=...   -> 302 to Google's consent screen
// GET  ?action=callback&code=...&state=...              -> exchanges the code, stores the
//                                                          account, pulls the most recent
//                                                          ~30 messages, then 302s back to
//                                                          `redirect_to`
// POST { account_id }                                   -> re-syncs an already-connected
//                                                          Gmail account ("Sync now" in the UI)
//
// Requires these Supabase Edge Function secrets (see README):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to every edge function.)
//
// Scope note: we only store metadata (from/subject/snippet/date), never the full message
// body — this powers a unified-inbox overview, not a full webmail client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

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

function parseFromHeader(raw: string | undefined): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null }
  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/)
  if (match) {
    const name = match[1].trim()
    return { name: name || null, address: match[2].trim() }
  }
  return { name: null, address: raw.trim() }
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets.')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Google token exchange failed')
  return json as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string }
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets.')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Google token refresh failed')
  return json as { access_token: string; expires_in: number }
}

async function fetchUserEmail(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google account email')
  const json = await res.json()
  return json.email as string
}

async function syncGmailMessages(sb: ReturnType<typeof admin>, accountId: string, userId: string, accessToken: string) {
  const listRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=30', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const listJson = await listRes.json()
  if (!listRes.ok) throw new Error(listJson.error?.message || 'Failed to list Gmail messages')
  const ids: string[] = (listJson.messages ?? []).map((m: { id: string }) => m.id)
  if (ids.length === 0) return 0

  const { data: existing } = await sb
    .from('email_messages')
    .select('external_id')
    .eq('email_account_id', accountId)
    .in('external_id', ids)
  const existingIds = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id))
  const newIds = ids.filter((id) => !existingIds.has(id))
  if (newIds.length === 0) return 0

  const rows: Record<string, unknown>[] = []
  for (const id of newIds) {
    const detailRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!detailRes.ok) continue
    const detail = await detailRes.json()
    const headers: { name: string; value: string }[] = detail.payload?.headers ?? []
    const fromHeader = headers.find((h) => h.name === 'From')?.value
    const subjectHeader = headers.find((h) => h.name === 'Subject')?.value
    const { name, address } = parseFromHeader(fromHeader)
    const receivedAt = detail.internalDate
      ? new Date(Number(detail.internalDate)).toISOString()
      : new Date().toISOString()

    rows.push({
      user_id: userId,
      email_account_id: accountId,
      external_id: id,
      from_name: name,
      from_address: address,
      subject: subjectHeader || '(no subject)',
      snippet: detail.snippet || '',
      received_at: receivedAt,
      is_read: !(detail.labelIds ?? []).includes('UNREAD'),
      is_starred: (detail.labelIds ?? []).includes('STARRED'),
      folder: 'inbox',
    })
  }

  if (rows.length > 0) {
    const { error } = await sb.from('email_messages').insert(rows)
    if (error) throw new Error(error.message)
  }
  return rows.length
}

async function handleSync(sb: ReturnType<typeof admin>, accountId: string) {
  const { data: account, error } = await sb.from('email_accounts').select('*').eq('id', accountId).maybeSingle()
  if (error || !account) throw new Error('Account not found')
  if (account.provider !== 'gmail') throw new Error('Account is not a Gmail account')
  if (!account.refresh_token) throw new Error('No refresh token stored for this account — reconnect Gmail.')

  const refreshed = await refreshAccessToken(account.refresh_token)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  const count = await syncGmailMessages(sb, account.id, account.user_id, refreshed.access_token)

  await sb
    .from('email_accounts')
    .update({
      access_token: refreshed.access_token,
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

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      if (!clientId) {
        const back = new URL(redirectTo)
        back.searchParams.set('error', 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID).')
        return new Response(null, { status: 302, headers: { ...corsHeaders, Location: back.toString() } })
      }

      const state = b64urlEncode({ user_id: userId, redirect_to: redirectTo })
      const redirectUri = `${functionSelfUrl(req)}?action=callback`

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('scope', GMAIL_SCOPES)
      authUrl.searchParams.set('state', state)

      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl.toString() } })
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code')
      const stateRaw = url.searchParams.get('state')
      const oauthError = url.searchParams.get('error')
      if (!stateRaw) return new Response('Missing state', { status: 400, headers: corsHeaders })
      const { user_id, redirect_to } = b64urlDecode(stateRaw)

      if (oauthError || !code) {
        const back = new URL(redirect_to)
        back.searchParams.set('error', oauthError || 'Google sign-in was cancelled.')
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
        .eq('provider', 'gmail')
        .eq('email_address', email)
        .maybeSingle()

      let accountId: string
      if (existing) {
        accountId = existing.id
        await sb
          .from('email_accounts')
          .update({
            access_token: tokens.access_token,
            // Google only returns a refresh_token on the first consent; keep the old one otherwise.
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
            provider: 'gmail',
            display_name: email,
            email_address: email,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            token_expires_at: expiresAt,
            status: 'connected',
          })
          .select('id')
          .single()
        if (insertError || !inserted) throw new Error(insertError?.message || 'Failed to save Gmail account')
        accountId = inserted.id
      }

      try {
        const count = await syncGmailMessages(sb, accountId, user_id, tokens.access_token)
        await sb.from('email_accounts').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', accountId)
        void count
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
    // Best-effort redirect back with the error if we have a state to decode; else plain JSON.
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
