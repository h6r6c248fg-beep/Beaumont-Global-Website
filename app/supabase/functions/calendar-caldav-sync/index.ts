// supabase/functions/calendar-caldav-sync/index.ts
//
// POST { account_id } — syncs one Apple iCloud (or generic CalDAV) calendar
// account into calendar_events. Called right after connecting an iCloud
// account, and from the "Sync now" button in the Connected calendars panel.
//
// NOTE ON SCOPE: a real CalDAV client discovers a server's layout in
// several round trips — PROPFIND the well-known URL for the current-user
// principal, PROPFIND the principal for its calendar-home-set, then REPORT
// (or multiget) each individual calendar collection under that home. iCloud
// in particular expects that full discovery flow and can redirect
// per-account to a dedicated "pXX-caldav.icloud.com" host.
//
// This function is a pragmatic shortcut: it issues a single REPORT
// (calendar-query, time-range filtered) directly against the stored
// `caldav_url` (default "https://caldav.icloud.com") using HTTP Basic auth
// with the app-specific password. `fetch` follows the redirect iCloud may
// send back automatically. This covers the common case of a single primary
// calendar and is good enough for a first cut — it is NOT a full CalDAV
// client, and calendars split across multiple collections or requiring the
// full discovery flow will not be picked up.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, both auto-provided
// by the Supabase Edge Functions runtime. SUPABASE_ANON_KEY (also
// auto-provided) is used to verify the caller's identity from their
// Authorization header before touching their data with the service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function toICSTimestamp(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function unescapeICSText(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/** Un-fold ICS line continuations: a line break followed by a space/tab is
 * a soft wrap of the previous logical line, per RFC 5545. */
function unfold(ics: string) {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function extractVEvents(icsText: string): string[] {
  const blocks: string[] = []
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g
  let m: RegExpExecArray | null
  while ((m = re.exec(icsText))) blocks.push(m[1])
  return blocks
}

function parseLine(line: string): { name: string; params: string; value: string } | null {
  const idx = line.indexOf(':')
  if (idx === -1) return null
  const left = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const [name, ...paramParts] = left.split(';')
  return { name: name.toUpperCase().trim(), params: paramParts.join(';'), value }
}

function parseICSDate(value: string, isDateOnly: boolean): { iso: string; allDay: boolean } {
  const v = value.trim()
  if (isDateOnly || /^\d{8}$/.test(v)) {
    const y = v.slice(0, 4)
    const mo = v.slice(4, 6)
    const d = v.slice(6, 8)
    return { iso: `${y}-${mo}-${d}T00:00:00.000Z`, allDay: true }
  }
  const match = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (match) {
    const [, y, mo, d, h, mi, s] = match
    // Treat any timestamp — including a TZID-qualified local one — as UTC.
    // A fully correct implementation would resolve the VTIMEZONE block or
    // the named TZID's real offset; this is a pragmatic simplification,
    // consistent with the Google/Microsoft sync functions.
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false }
  }
  return { iso: new Date().toISOString(), allDay: false }
}

interface ParsedEvent {
  uid: string
  title: string
  description: string | null
  location: string | null
  startIso: string
  endIso: string
  allDay: boolean
}

function parseICS(rawResponseText: string): ParsedEvent[] {
  const text = unescapeXml(rawResponseText)
  const events: ParsedEvent[] = []

  for (const block of extractVEvents(text)) {
    const body = unfold(block)
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const fields: Record<string, { params: string; value: string }> = {}
    for (const line of lines) {
      const parsed = parseLine(line)
      if (!parsed) continue
      if (!(parsed.name in fields)) fields[parsed.name] = { params: parsed.params, value: parsed.value }
    }

    const uid = fields.UID?.value?.trim()
    if (!uid) continue
    const dtstart = fields.DTSTART
    if (!dtstart) continue

    const startIsDate = /VALUE=DATE\b/i.test(dtstart.params) && !/VALUE=DATE-TIME/i.test(dtstart.params)
    const start = parseICSDate(dtstart.value, startIsDate)

    let end = start
    if (fields.DTEND) {
      const endIsDate = /VALUE=DATE\b/i.test(fields.DTEND.params) && !/VALUE=DATE-TIME/i.test(fields.DTEND.params)
      end = parseICSDate(fields.DTEND.value, endIsDate)
    } else {
      // No DTEND (and we're not bothering to parse DURATION): approximate —
      // all-day events span one day, timed events span one hour.
      const endDate = new Date(start.iso)
      endDate.setUTCMinutes(endDate.getUTCMinutes() + (start.allDay ? 24 * 60 : 60))
      end = { iso: endDate.toISOString(), allDay: start.allDay }
    }

    events.push({
      uid,
      title: fields.SUMMARY ? unescapeICSText(fields.SUMMARY.value) : '(untitled)',
      description: fields.DESCRIPTION ? unescapeICSText(fields.DESCRIPTION.value) : null,
      location: fields.LOCATION ? unescapeICSText(fields.LOCATION.value) : null,
      startIso: start.iso,
      endIso: end.iso,
      allDay: start.allDay,
    })
  }

  return events
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: 'Supabase service credentials are missing on the server.' }, 500)

  let accountId: string | undefined
  try {
    const body = await req.json()
    accountId = body?.account_id
  } catch {
    return json({ ok: false, error: 'Invalid JSON body — expected { account_id }.' }, 400)
  }
  if (!accountId) return json({ ok: false, error: 'Missing account_id.' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: account, error: accountError } = await admin
    .from('calendar_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle()

  if (accountError || !account) return json({ ok: false, error: 'Calendar account not found.' }, 404)
  if (account.provider !== 'apple_caldav') return json({ ok: false, error: 'This function only syncs apple_caldav accounts.' }, 400)

  // Verify the caller actually owns this account before using the service
  // role to touch it — the gateway already checked the JWT is *valid*, but
  // not that it belongs to this account's user.
  if (anonKey) {
    const authHeader = req.headers.get('Authorization') ?? ''
    try {
      const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: userData } = await authed.auth.getUser()
      if (!userData?.user || userData.user.id !== account.user_id) {
        return json({ ok: false, error: 'Not authorized to sync this calendar account.' }, 403)
      }
    } catch {
      return json({ ok: false, error: 'Could not verify caller identity.' }, 401)
    }
  }

  if (!account.caldav_url || !account.caldav_username || !account.caldav_app_password) {
    return json({ ok: false, error: 'This account is missing CalDAV connection details.' }, 400)
  }

  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)

  const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${toICSTimestamp(timeMin)}" end="${toICSTimestamp(timeMax)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`

  const basicAuth = 'Basic ' + btoa(`${account.caldav_username}:${account.caldav_app_password}`)

  try {
    const res = await fetch(account.caldav_url, {
      method: 'REPORT',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1',
        Authorization: basicAuth,
      },
      body: reportBody,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const message = `CalDAV server responded ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`
      await admin.from('calendar_accounts').update({ status: 'error', last_error: message }).eq('id', accountId)
      return json({ ok: false, error: message }, 502)
    }

    const xml = await res.text()
    const parsed = parseICS(xml)

    const rows = parsed.map((ev) => ({
      user_id: account.user_id,
      calendar_account_id: account.id,
      external_id: ev.uid,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      start_at: ev.startIso,
      end_at: ev.endIso,
      all_day: ev.allDay,
      source: 'apple_caldav',
      color: null,
    }))

    await admin.from('calendar_events').delete().eq('calendar_account_id', accountId)
    if (rows.length > 0) {
      const { error: insertError } = await admin.from('calendar_events').insert(rows)
      if (insertError) {
        await admin.from('calendar_accounts').update({ status: 'error', last_error: insertError.message }).eq('id', accountId)
        return json({ ok: false, error: `Could not save events: ${insertError.message}` }, 500)
      }
    }

    await admin
      .from('calendar_accounts')
      .update({ last_synced_at: new Date().toISOString(), status: 'connected', last_error: null })
      .eq('id', accountId)

    return json({ ok: true, synced: rows.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('calendar_accounts').update({ status: 'error', last_error: message }).eq('id', accountId)
    return json({ ok: false, error: message }, 502)
  }
})
