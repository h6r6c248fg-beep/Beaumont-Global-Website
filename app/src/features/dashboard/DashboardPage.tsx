import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, isToday } from 'date-fns'
import {
  CalendarDays,
  Mail,
  Syringe,
  UtensilsCrossed,
  Dumbbell,
  LineChart,
  Sparkles,
  ArrowRight,
  Flame,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatNumber, round } from '@/lib/utils'

export function DashboardPage() {
  const { user, profile } = useAuth()
  const userId = user?.id

  const greetName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const upcomingEvents = useQuery({
    queryKey: ['dashboard', 'events', userId],
    enabled: !!userId,
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId!)
        .gte('start_at', now)
        .order('start_at', { ascending: true })
        .limit(4)
      return data ?? []
    },
  })

  const unreadEmail = useQuery({
    queryKey: ['dashboard', 'unread-email', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('email_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .eq('is_read', false)
      return count ?? 0
    },
  })

  const activeCycle = useQuery({
    queryKey: ['dashboard', 'active-cycle', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cycles')
        .select('*, cycle_items(*)')
        .eq('user_id', userId!)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  const todayNutrition = useQuery({
    queryKey: ['dashboard', 'nutrition-today', userId],
    enabled: !!userId,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const [{ data: entries }, { data: targets }] = await Promise.all([
        supabase
          .from('food_log_entries')
          .select('servings, foods(calories, protein_g, carbs_g, fat_g)')
          .eq('user_id', userId!)
          .eq('log_date', today),
        supabase.from('nutrition_targets').select('*').eq('user_id', userId!).maybeSingle(),
      ])
      const totals = (entries ?? []).reduce(
        (acc, e: any) => {
          const f = e.foods
          if (!f) return acc
          acc.calories += (f.calories ?? 0) * e.servings
          acc.protein += (f.protein_g ?? 0) * e.servings
          return acc
        },
        { calories: 0, protein: 0 }
      )
      return { totals, targets: targets ?? { calories: 2400, protein_g: 180 } }
    },
  })

  const recentWorkout = useQuery({
    queryKey: ['dashboard', 'recent-workout', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('*, workout_sets(id)')
        .eq('user_id', userId!)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  const integrations = useQuery({
    queryKey: ['dashboard', 'integrations', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('integrations').select('*').eq('user_id', userId!)
      return data ?? []
    },
  })

  const connectedIntegrations = (integrations.data ?? []).filter((i) => i.status === 'connected')

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="animate-fade-up">
        <p className="text-sm text-[var(--color-mist)]">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">
          {greeting}
          {greetName ? `, ${greetName}` : ''}.
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--color-mist)]">
          Everything that matters — calendar, inbox, training, nutrition, cycles and capital — in one private view.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Next up"
          value={
            upcomingEvents.data?.[0]
              ? format(new Date(upcomingEvents.data[0].start_at), isToday(new Date(upcomingEvents.data[0].start_at)) ? 'HH:mm' : 'd MMM, HH:mm')
              : '—'
          }
          sub={upcomingEvents.data?.[0]?.title ?? 'Nothing scheduled'}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatTile
          label="Unread mail"
          value={formatNumber(unreadEmail.data ?? 0)}
          sub="Across all connected accounts"
          icon={<Mail className="h-4 w-4" />}
          accent="azure"
        />
        <StatTile
          label="Calories today"
          value={`${formatNumber(round(todayNutrition.data?.totals.calories ?? 0))}`}
          sub={`of ${formatNumber(todayNutrition.data?.targets.calories ?? 2400)} kcal target`}
          icon={<UtensilsCrossed className="h-4 w-4" />}
          accent="emerald"
        />
        <StatTile
          label="Active cycle"
          value={activeCycle.data ? activeCycle.data.name : 'None'}
          sub={activeCycle.data ? `${activeCycle.data.cycle_items?.length ?? 0} compound(s) running` : 'Nothing active'}
          icon={<Syringe className="h-4 w-4" />}
          accent="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader>
            <PanelTitle>Upcoming</PanelTitle>
            <Link to="/calendar" className="flex items-center gap-1 text-xs text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]">
              Open calendar <ArrowRight className="h-3 w-3" />
            </Link>
          </PanelHeader>
          <PanelBody>
            {upcomingEvents.data && upcomingEvents.data.length > 0 ? (
              <ul className="divide-y divide-[var(--color-line-soft)]">
                {upcomingEvents.data.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="flex w-16 shrink-0 flex-col items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] py-1.5 text-center">
                      <span className="text-[10px] uppercase text-[var(--color-mist)]">{format(new Date(ev.start_at), 'MMM')}</span>
                      <span className="font-display text-base text-[var(--color-paper)]">{format(new Date(ev.start_at), 'd')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--color-paper)]">{ev.title}</p>
                      <p className="text-xs text-[var(--color-mist)]">
                        {format(new Date(ev.start_at), 'HH:mm')} · {ev.location || 'No location'}
                      </p>
                    </div>
                    <Badge tone={isToday(new Date(ev.start_at)) ? 'gold' : 'neutral'}>
                      {isToday(new Date(ev.start_at)) ? 'Today' : format(new Date(ev.start_at), 'EEE')}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<CalendarDays className="h-8 w-8" strokeWidth={1.2} />}
                title="Nothing on the calendar"
                description="Connect Apple, Google or Outlook calendar, or add an event manually."
                action={
                  <Link to="/calendar">
                    <Button variant="secondary" size="sm">Go to calendar</Button>
                  </Link>
                }
              />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Ask Meridian</PanelTitle>
            <Sparkles className="h-4 w-4 text-[var(--color-gold)]" />
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-mist)]">
              Your assistant already sees your calendar, macros, training and cycle data. Ask it anything.
            </p>
            <div className="space-y-2">
              {['What does my day look like?', 'Am I on track with protein today?', 'Summarise this week\'s training'].map((p) => (
                <Link
                  key={p}
                  to="/assistant"
                  className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-2 text-xs text-[var(--color-mist)] transition-colors hover:border-[var(--color-gold-dim)] hover:text-[var(--color-paper)]"
                >
                  {p}
                </Link>
              ))}
            </div>
            <Link to="/assistant">
              <Button variant="primary" size="sm" className="w-full justify-center">
                Open assistant
              </Button>
            </Link>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel>
          <PanelHeader>
            <PanelTitle>Training</PanelTitle>
            <Dumbbell className="h-4 w-4 text-[var(--color-mist)]" />
          </PanelHeader>
          <PanelBody>
            {recentWorkout.data ? (
              <div>
                <p className="text-sm text-[var(--color-paper)]">{recentWorkout.data.name}</p>
                <p className="mt-1 text-xs text-[var(--color-mist)]">
                  {format(new Date(recentWorkout.data.started_at), 'd MMM')} · {recentWorkout.data.workout_sets?.length ?? 0} sets logged
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-mist)]">No workouts logged yet.</p>
            )}
            <Link to="/workouts" className="mt-4 flex items-center gap-1 text-xs text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]">
              Log a workout <ArrowRight className="h-3 w-3" />
            </Link>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Cycle status</PanelTitle>
            <Flame className="h-4 w-4 text-[var(--color-mist)]" />
          </PanelHeader>
          <PanelBody>
            {activeCycle.data ? (
              <div className="space-y-2">
                {activeCycle.data.cycle_items?.slice(0, 3).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-paper)]">{item.compound_name}</span>
                    <span className="text-xs text-[var(--color-mist)]">
                      {item.dose_amount}
                      {item.dose_unit} · {item.frequency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-mist)]">No active cycle right now.</p>
            )}
            <Link to="/cycles" className="mt-4 flex items-center gap-1 text-xs text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]">
              Manage cycles <ArrowRight className="h-3 w-3" />
            </Link>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Finance</PanelTitle>
            <LineChart className="h-4 w-4 text-[var(--color-mist)]" />
          </PanelHeader>
          <PanelBody>
            {connectedIntegrations.length > 0 ? (
              <div className="space-y-2">
                {connectedIntegrations.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-[var(--color-paper)]">{i.display_name}</span>
                    <Badge tone="emerald">Connected</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-mist)]">OrgView and TraderPro aren&apos;t connected yet.</p>
            )}
            <Link to="/finance" className="mt-4 flex items-center gap-1 text-xs text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]">
              Open finance <ArrowRight className="h-3 w-3" />
            </Link>
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}
