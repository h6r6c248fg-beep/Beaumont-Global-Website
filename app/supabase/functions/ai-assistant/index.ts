// Beaumont One — AI Assistant edge function.
//
// POST { conversation_id, messages: { role, content }[] }
//   -> builds a system prompt summarising the caller's own data (calendar,
//      nutrition, active cycles, most recent workout, connected finance
//      integrations), sends it + the message history to the Anthropic
//      Messages API, and returns { reply: string }.
//
// Auth: the caller's JWT (forwarded from the browser by supabase-js) is used
// to build a Supabase client that runs AS the calling user, so every query
// below is RLS-scoped to their own rows only. We never use the service-role
// key here — this function must only ever be able to see what the user
// themselves can see.
//
// Requires this Supabase Edge Function secret (see README):
//   ANTHROPIC_API_KEY
// Optional:
//   ANTHROPIC_MODEL (defaults to "claude-sonnet-5")
// (SUPABASE_URL / SUPABASE_ANON_KEY are provided automatically to every edge function.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function userClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization')
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader ?? '' } },
  })
}

async function buildSystemPrompt(sb: ReturnType<typeof userClient>): Promise<string> {
  const sections: string[] = []

  // Upcoming calendar events (next 7 days).
  try {
    const now = new Date()
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const { data: events } = await sb
      .from('calendar_events')
      .select('title, start_at, end_at, location')
      .gte('start_at', now.toISOString())
      .lte('start_at', weekOut.toISOString())
      .order('start_at', { ascending: true })
      .limit(10)
    if (events && events.length > 0) {
      const lines = events.map((e: { title: string; start_at: string; location: string | null }) => {
        const when = new Date(e.start_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        return `- ${e.title} — ${when}${e.location ? ` @ ${e.location}` : ''}`
      })
      sections.push(`Upcoming calendar events (next 7 days):\n${lines.join('\n')}`)
    } else {
      sections.push('Upcoming calendar events (next 7 days): none scheduled.')
    }
  } catch {
    // best-effort: omit section on error
  }

  // Today's nutrition vs targets.
  try {
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: entries }, { data: targets }] = await Promise.all([
      sb.from('food_log_entries').select('servings, meal, foods(name, calories, protein_g, carbs_g, fat_g)').eq('log_date', today),
      sb.from('nutrition_targets').select('*').maybeSingle(),
    ])
    if (entries) {
      const totals = entries.reduce(
        (acc: { calories: number; protein: number; carbs: number; fat: number }, e: any) => {
          const f = e.foods
          if (!f) return acc
          const s = e.servings ?? 1
          acc.calories += (f.calories ?? 0) * s
          acc.protein += (f.protein_g ?? 0) * s
          acc.carbs += (f.carbs_g ?? 0) * s
          acc.fat += (f.fat_g ?? 0) * s
          return acc
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
      const t = targets as { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null
      let line = `Today's nutrition so far: ${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)}g protein, ${Math.round(totals.carbs)}g carbs, ${Math.round(totals.fat)}g fat (${entries.length} food log entries).`
      if (t) {
        line += ` Targets: ${t.calories} kcal, ${t.protein_g}g protein, ${t.carbs_g}g carbs, ${t.fat_g}g fat.`
      } else {
        line += ' No nutrition targets set.'
      }
      sections.push(line)
    }
  } catch {
    // best-effort
  }

  // Active cycles + items.
  try {
    const { data: cycles } = await sb
      .from('cycles')
      .select('id, name, goal, start_date, cycle_items(compound_name, dose_amount, dose_unit, frequency)')
      .eq('status', 'active')
    if (cycles && cycles.length > 0) {
      const lines = cycles.map((c: any) => {
        const items = (c.cycle_items ?? [])
          .map((it: any) => `${it.compound_name} ${it.dose_amount}${it.dose_unit} ${it.frequency}`)
          .join('; ')
        return `- ${c.name}${c.goal ? ` (goal: ${c.goal})` : ''}, started ${c.start_date}${items ? `: ${items}` : ''}`
      })
      sections.push(`Active cycles:\n${lines.join('\n')}`)
    } else {
      sections.push('Active cycles: none.')
    }
  } catch {
    // best-effort
  }

  // Most recent workout.
  try {
    const { data: session } = await sb
      .from('workout_sessions')
      .select('id, name, started_at, ended_at, workout_sets(weight_kg, reps, completed)')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (session) {
      const sets = (session as any).workout_sets ?? []
      const completedSets = sets.filter((s: any) => s.completed)
      const volume = completedSets.reduce((sum: number, s: any) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
      sections.push(
        `Most recent workout: "${(session as any).name}" on ${new Date((session as any).started_at).toLocaleDateString('en-GB')}, ${completedSets.length} sets completed, ~${Math.round(volume)}kg total volume.`
      )
    } else {
      sections.push('Most recent workout: no sessions logged yet.')
    }
  } catch {
    // best-effort
  }

  // Tasks: overdue + due today, plus a completed-today count.
  try {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
    const [{ data: overdue }, { data: dueToday }, { data: completedToday }] = await Promise.all([
      sb.from('tasks').select('title, due_at, priority').eq('completed', false).lt('due_at', todayStart.toISOString()).order('due_at', { ascending: true }).limit(15),
      sb.from('tasks').select('title, due_at, priority').eq('completed', false).gte('due_at', todayStart.toISOString()).lte('due_at', todayEnd.toISOString()).order('due_at', { ascending: true }).limit(15),
      sb.from('tasks').select('id', { count: 'exact', head: true }).eq('completed', true).gte('completed_at', todayStart.toISOString()),
    ])
    const fmt = (t: { title: string; priority: string }) => `- ${t.title} (${t.priority} priority)`
    const lines: string[] = []
    if (overdue && overdue.length > 0) lines.push(`Overdue:\n${overdue.map(fmt).join('\n')}`)
    if (dueToday && dueToday.length > 0) lines.push(`Due today:\n${dueToday.map(fmt).join('\n')}`)
    if (lines.length === 0) lines.push('Nothing overdue and nothing due today.')
    lines.push(`Completed today: ${(completedToday as unknown as { count?: number })?.count ?? 0}.`)
    sections.push(`Tasks:\n${lines.join('\n')}`)
  } catch {
    // best-effort
  }

  // Vehicles: current levels and service status.
  try {
    const { data: vehicles } = await sb
      .from('vehicles')
      .select('name, fuel_type, fuel_level_pct, battery_level_pct, range_km, next_service_due')
    if (vehicles && vehicles.length > 0) {
      const lines = vehicles.map((v: any) => {
        const bits: string[] = []
        if (v.fuel_level_pct != null) bits.push(`fuel ${v.fuel_level_pct}%`)
        if (v.battery_level_pct != null) bits.push(`battery ${v.battery_level_pct}%`)
        if (v.range_km != null) bits.push(`~${v.range_km}km range`)
        if (v.next_service_due) bits.push(`service due ${v.next_service_due}`)
        return `- ${v.name}: ${bits.length > 0 ? bits.join(', ') : 'no levels logged yet'}`
      })
      sections.push(`Vehicles:\n${lines.join('\n')}`)
    }
  } catch {
    // best-effort
  }

  // Unread email count across connected accounts.
  try {
    const { count } = await sb.from('email_messages').select('*', { count: 'exact', head: true }).eq('is_read', false)
    sections.push(`Unread email: ${count ?? 0} across all connected accounts.`)
  } catch {
    // best-effort
  }

  // Connected finance integrations + latest snapshot.
  try {
    const { data: integrations } = await sb.from('integrations').select('id, provider, display_name, status').eq('status', 'connected')
    if (integrations && integrations.length > 0) {
      const lines: string[] = []
      for (const integ of integrations as any[]) {
        const { data: snapshot } = await sb
          .from('integration_snapshots')
          .select('snapshot_date, data')
          .eq('integration_id', integ.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (snapshot) {
          const dataStr = Object.entries((snapshot as any).data ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
          lines.push(`- ${integ.display_name} (${integ.provider}), latest snapshot ${(snapshot as any).snapshot_date}: ${dataStr}`)
        } else {
          lines.push(`- ${integ.display_name} (${integ.provider}): connected, no snapshots logged yet.`)
        }
      }
      sections.push(`Connected finance integrations:\n${lines.join('\n')}`)
    } else {
      sections.push('Connected finance integrations: none connected.')
    }
  } catch {
    // best-effort
  }

  return [
    "You are Beaumont One's assistant — a private, always-on aide embedded in the user's personal command-center app, " +
      'in the spirit of a sharp human chief-of-staff: composed, dry-witted when it fits, never fawning. ' +
      "You have live access to a summary of the user's own data below (calendar, tasks, nutrition, training, cycles, vehicles, email, finances) — that's your whole world, treat it as ground truth and reason across all of it together rather than answering only the literal question. " +
      "Be proactive: if something in the context is worth flagging unprompted — an overdue task, a meeting clash, a vehicle low on fuel before a long trip, a cycle dose that's overdue — say so, even if it wasn't asked. " +
      "Never invent data you weren't given; if something isn't in the context below, say plainly that you don't have it rather than guessing. " +
      'Keep replies tight and spoken-friendly (short sentences, no headers or bullet spam) since responses may be read aloud — lead with the answer, then the one or two supporting facts that matter.',
    '--- LIVE SYSTEM STATE ---',
    sections.join('\n\n'),
  ].join('\n\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let body: { conversation_id?: string; messages?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return jsonResponse({ error: 'messages is required and must be a non-empty array' }, 400)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY is not configured' }, 400)
  }

  const sb = userClient(req)

  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401)
  }

  const systemPrompt = await buildSystemPrompt(sb)

  try {
    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const message = data?.error?.message || `Anthropic API error (${res.status})`
      return jsonResponse({ error: message }, 502)
    }

    const reply = Array.isArray(data.content) && data.content[0]?.text ? data.content[0].text : ''
    if (!reply) {
      return jsonResponse({ error: 'Anthropic returned an empty response' }, 502)
    }

    return jsonResponse({ reply })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
