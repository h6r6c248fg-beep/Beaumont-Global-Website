import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  X,
  Mail,
  CalendarClock,
  ListTodo,
  Car,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  MapPin,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { fetchWeatherToday, weatherDescription } from '@/lib/weather'
import { isTaskOverdue } from '@/features/tasks/taskUtils'
import type { CalendarEvent, EmailMessage, Task, Vehicle } from '@/types/database'

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd')
}

const STORAGE_PREFIX = 'meridian_briefing_shown_'

export function shouldShowBriefingToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + todayKey()) !== '1'
  } catch {
    return false
  }
}

function markBriefingShown() {
  try {
    localStorage.setItem(STORAGE_PREFIX + todayKey(), '1')
  } catch {
    // private browsing / storage blocked — briefing will just show again next open, harmless
  }
}

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  if (code === 0 || code === 1) return <Sun className={className} />
  if ([61, 63, 65, 51, 53, 55, 80, 81, 82].includes(code)) return <CloudRain className={className} />
  if ([71, 73, 75].includes(code)) return <CloudSnow className={className} />
  if ([95, 96, 99].includes(code)) return <CloudLightning className={className} />
  return <Cloud className={className} />
}

export function DailyBriefing({ onClose }: { onClose: () => void }) {
  const { user, profile, refreshProfile } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [locatingNow, setLocatingNow] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    markBriefingShown()
  }, [])

  const tasksQuery = useQuery({
    queryKey: ['briefing', 'tasks', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select('*').eq('user_id', userId!).eq('completed', false)
      return (data ?? []) as Task[]
    },
  })

  const emailQuery = useQuery({
    queryKey: ['briefing', 'email', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('email_messages')
        .select('*')
        .eq('user_id', userId!)
        .eq('is_read', false)
        .order('received_at', { ascending: false })
        .limit(5)
      return (data ?? []) as EmailMessage[]
    },
  })

  const eventsQuery = useQuery({
    queryKey: ['briefing', 'events', userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end = new Date(); end.setHours(23, 59, 59, 999)
      const { data } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId!)
        .gte('start_at', start.toISOString())
        .lte('start_at', end.toISOString())
        .order('start_at', { ascending: true })
      return (data ?? []) as CalendarEvent[]
    },
  })

  const vehiclesQuery = useQuery({
    queryKey: ['briefing', 'vehicles', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('*').eq('user_id', userId!)
      return (data ?? []) as Vehicle[]
    },
  })

  const hasLocation = profile?.home_latitude != null && profile?.home_longitude != null
  const weatherQuery = useQuery({
    queryKey: ['briefing', 'weather', profile?.home_latitude, profile?.home_longitude],
    enabled: hasLocation,
    queryFn: () => fetchWeatherToday(profile!.home_latitude!, profile!.home_longitude!),
    staleTime: 30 * 60 * 1000,
  })

  async function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocationError('Location is not available in this browser.')
      return
    }
    setLocatingNow(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase
          .from('profiles')
          .update({ home_latitude: pos.coords.latitude, home_longitude: pos.coords.longitude })
          .eq('id', userId!)
        await refreshProfile()
        queryClient.invalidateQueries({ queryKey: ['briefing', 'weather'] })
        setLocatingNow(false)
      },
      (err) => {
        setLocationError(err.message || 'Could not get your location.')
        setLocatingNow(false)
      },
      { timeout: 10000 }
    )
  }

  const overdueTasks = (tasksQuery.data ?? []).filter(isTaskOverdue)
  const unreadEmail = emailQuery.data ?? []
  const events = eventsQuery.data ?? []
  const vehicles = vehiclesQuery.data ?? []
  const lowVehicles = vehicles.filter((v) => {
    const level = v.fuel_type === 'electric' ? v.battery_level_pct : v.fuel_level_pct
    return level != null && level < 25
  })

  const name = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const missedCount = overdueTasks.length + unreadEmail.length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/95 backdrop-blur-sm px-4 py-8 sm:items-center">
      <div className="glass-panel relative w-full max-w-lg rounded-[28px] bg-[var(--color-obsidian-2)] animate-fade-up">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-2 pt-7">
          <p className="text-sm text-[var(--color-mist)]">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--color-paper)]">
            {greeting}{name ? `, ${name}` : ''}.
          </h1>
        </div>

        <div className="space-y-4 px-6 pb-7 pt-3">
          {/* Weather */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-[var(--color-obsidian-3)] px-4 py-3.5">
            {hasLocation ? (
              weatherQuery.data ? (
                <>
                  <div className="flex items-center gap-3">
                    <WeatherIcon code={weatherQuery.data.weatherCode} className="h-8 w-8 text-[var(--color-amber)]" />
                    <div>
                      <p className="font-display text-xl text-[var(--color-paper)]">{weatherQuery.data.temperatureNow}°</p>
                      <p className="text-xs text-[var(--color-mist)]">{weatherDescription(weatherQuery.data.weatherCode)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-mist)]">
                    H {weatherQuery.data.high}° · L {weatherQuery.data.low}°
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--color-mist)]">Loading weather…</p>
              )
            ) : (
              <div className="flex w-full items-center justify-between">
                <p className="text-sm text-[var(--color-mist)]">Set your location to see today's weather here.</p>
                <Button variant="secondary" size="sm" disabled={locatingNow} onClick={() => void useMyLocation()}>
                  <MapPin className="h-3.5 w-3.5" />
                  {locatingNow ? 'Locating…' : 'Use my location'}
                </Button>
              </div>
            )}
          </div>
          {locationError && <p className="text-xs text-[var(--color-rose)]">{locationError}</p>}

          {/* What you missed */}
          <Section title={missedCount > 0 ? `What you've missed (${missedCount})` : "You're all caught up"}>
            {overdueTasks.length > 0 && (
              <BriefRow icon={<ListTodo className="h-4 w-4" />} tone="rose" to="/tasks">
                {overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'}
              </BriefRow>
            )}
            {unreadEmail.slice(0, 3).map((m) => (
              <BriefRow key={m.id} icon={<Mail className="h-4 w-4" />} tone="azure" to="/email">
                <span className="truncate">{m.from_name || m.from_address || 'Unknown sender'}</span>
                <span className="ml-1 truncate text-[var(--color-mist)]">— {m.subject || '(no subject)'}</span>
              </BriefRow>
            ))}
            {unreadEmail.length > 3 && (
              <p className="pl-6 text-xs text-[var(--color-mist-2)]">+{unreadEmail.length - 3} more unread</p>
            )}
            {missedCount === 0 && <p className="text-sm text-[var(--color-mist)]">No overdue tasks, no unread mail.</p>}
          </Section>

          {/* Today's meetings */}
          <Section title="Today">
            {events.length > 0 ? (
              events.map((e) => (
                <BriefRow key={e.id} icon={<CalendarClock className="h-4 w-4" />} tone="gold" to="/calendar">
                  <span className="text-[var(--color-mist)]">{format(new Date(e.start_at), 'HH:mm')}</span>
                  <span className="ml-2 truncate">{e.title}</span>
                </BriefRow>
              ))
            ) : (
              <p className="text-sm text-[var(--color-mist)]">Nothing on the calendar today.</p>
            )}
          </Section>

          {/* Vehicles */}
          {vehicles.length > 0 && (
            <Section title="Your cars">
              {vehicles.map((v) => {
                const level = v.fuel_type === 'electric' ? v.battery_level_pct : v.fuel_level_pct
                const low = level != null && level < 25
                return (
                  <BriefRow key={v.id} icon={<Car className="h-4 w-4" />} tone={low ? 'rose' : 'neutral'} to="/garage">
                    <span className="truncate">{v.name}</span>
                    <span className="ml-2 text-[var(--color-mist)]">
                      {level != null ? `${level}% ${v.fuel_type === 'electric' ? 'charged' : 'fuel'}` : 'not logged'}
                    </span>
                  </BriefRow>
                )
              })}
              {lowVehicles.length > 0 && (
                <p className="pl-6 text-xs text-[var(--color-rose)]">
                  {lowVehicles.map((v) => v.name).join(', ')} running low — worth a top-up before you need it.
                </p>
              )}
            </Section>
          )}

          <Button variant="primary" size="lg" className="w-full justify-center" onClick={onClose}>
            Continue to Beaumont One
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist-2)]">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function BriefRow({
  icon,
  tone,
  to,
  children,
}: {
  icon: React.ReactNode
  tone: 'rose' | 'azure' | 'gold' | 'neutral'
  to: string
  children: React.ReactNode
}) {
  const toneColor = {
    rose: 'text-[var(--color-rose)]',
    azure: 'text-[var(--color-azure)]',
    gold: 'text-[var(--color-gold)]',
    neutral: 'text-[var(--color-mist)]',
  }[tone]
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-sm text-[var(--color-paper)] transition-colors hover:bg-white/5"
    >
      <span className={toneColor}>{icon}</span>
      <span className="flex min-w-0 flex-1 items-baseline overflow-hidden">{children}</span>
    </Link>
  )
}
