// Meridian — IMAP sync edge function (iCloud Mail / Yahoo / any other IMAP provider).
//
// POST { account_id: string }
//
// Approach: connects directly over IMAP using `imapflow` via Deno's `npm:` specifier
// support in Supabase Edge Functions, opens INBOX, and fetches ENVELOPE data (from,
// subject, date) for the most recent ~25 messages by UID. This is the correct
// real-world approach for talking to iCloud/Yahoo/generic IMAP without an OAuth API.
//
// Trade-off: we intentionally do NOT fetch/parse full message bodies here to get a
// text snippet — that requires streaming and parsing MIME (multipart, encodings,
// HTML-to-text, etc.), which is a meaningfully larger surface for an edge function
// on a tight execution budget. Since `email_messages.snippet` is just a preview
// string for a unified-inbox overview (we never render full bodies anywhere in this
// app), we fall back to reusing the subject as the snippet. A future iteration could
// fetch `BODY[1]` / `BODYSTRUCTURE` and extract a plain-text preview if richer
// previews are wanted.
//
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to every
// edge function — no extra secrets are required for IMAP, since credentials are
// supplied per-account by the user and stored on the `email_accounts` row.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ImapFlow } from 'npm:imapflow@1'

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

function addressFromEnvelope(env: { from?: Array<{ name?: string; address?: string; mailbox?: string; host?: string }> } | undefined) {
  const first = env?.from?.[0]
  if (!first) return { name: null as string | null, address: null as string | null }
  const address = first.address || (first.mailbox && first.host ? `${first.mailbox}@${first.host}` : null)
  return { name: first.name || null, address }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST { account_id }' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = admin()

  let accountId: string | undefined
  try {
    const body = await req.json()
    accountId = body.account_id
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!accountId) {
    return new Response(JSON.stringify({ error: 'account_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: account, error: loadError } = await sb.from('email_accounts').select('*').eq('id', accountId).maybeSingle()
  if (loadError || !account) {
    return new Response(JSON.stringify({ error: 'Account not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (account.provider !== 'imap') {
    return new Response(JSON.stringify({ error: 'Account is not an IMAP account' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!account.imap_host || !account.imap_port || !account.imap_username || !account.imap_app_password) {
    return new Response(JSON.stringify({ error: 'IMAP account is missing host/port/username/password' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let client: ImapFlow | null = null
  try {
    client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: true,
      auth: {
        user: account.imap_username,
        pass: account.imap_app_password,
      },
      logger: false,
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    let syncedCount = 0
    try {
      const status = client.mailbox
      const totalMessages = status && typeof status !== 'boolean' ? status.exists : 0
      if (totalMessages > 0) {
        const startSeq = Math.max(1, totalMessages - 24)
        const range = `${startSeq}:*`

        const uids: number[] = []
        const messages: Array<{ uid: number; from_name: string | null; from_address: string | null; subject: string | null; received_at: string }> = []

        for await (const msg of client.fetch(range, { envelope: true, uid: true })) {
          const { name, address } = addressFromEnvelope(msg.envelope)
          const subject = msg.envelope?.subject || '(no subject)'
          const date = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString()
          uids.push(msg.uid)
          messages.push({ uid: msg.uid, from_name: name, from_address: address, subject, received_at: date })
        }

        if (uids.length > 0) {
          const { data: existing } = await sb
            .from('email_messages')
            .select('external_id')
            .eq('email_account_id', accountId)
            .in(
              'external_id',
              uids.map((u) => String(u))
            )
          const existingIds = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id))
          const newRows = messages
            .filter((m) => !existingIds.has(String(m.uid)))
            .map((m) => ({
              user_id: account.user_id,
              email_account_id: accountId,
              external_id: String(m.uid),
              from_name: m.from_name,
              from_address: m.from_address,
              subject: m.subject,
              // See top-of-file note: no body fetch, so the snippet mirrors the subject.
              snippet: m.subject,
              received_at: m.received_at,
              is_read: true,
              is_starred: false,
              folder: 'inbox',
            }))

          if (newRows.length > 0) {
            const { error: insertError } = await sb.from('email_messages').insert(newRows)
            if (insertError) throw new Error(insertError.message)
          }
          syncedCount = newRows.length
        }
      }
    } finally {
      lock.release()
    }

    await sb
      .from('email_accounts')
      .update({ status: 'connected', last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', accountId)

    return new Response(JSON.stringify({ success: true, synced: syncedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sb.from('email_accounts').update({ status: 'error', last_error: message }).eq('id', accountId)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } finally {
    try {
      await client?.logout()
    } catch {
      try {
        client?.close()
      } catch {
        // ignore
      }
    }
  }
})
