import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, CalendarPlus, CalendarDays, TriangleAlert, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { cx } from '@/lib/utils'
import type { CalendarAccount, CalendarEvent } from '@/types/database'
import { EventModal } from './EventModal'
import { ConnectModal } from './ConnectModal'
import { AccountsPanel } from './AccountsPanel'
import { PROVIDER_LABEL, eventColor } from './utils'

type View = 'month' | 'agenda'

export function CalendarPage() {
  const { user } = useAuth()
  const userId = user?.id

  const [searchParams, setSearchParams] = useSearchParams()
  const calendarError = searchParams.get('calendar_error')
  const dismissError = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('calendar_error')
    setSearchParams(next, { replace: true })
  }

  const [view, setView] = useState<View>('month')
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [connectOpen, setConnectOpen] = useState(false)
  const [eventModal, setEventModal] = useState<{ open: boolean; event: CalendarEvent | null; defaultDate: Date }>({
    open: false,
    event: null,
    defaultDate: new Date(),
  })

  const gridStart = useMemo(() => startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }), [monthDate])
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }), [monthDate])
  const agendaStart = useMemo(() => startOfDay(new Date()), [])
  const agendaEnd = useMemo(() => addDays(agendaStart, 90), [agendaStart])

  const rangeStart = view === 'month' ? gridStart : agendaStart
  const rangeEnd = view === 'month' ? gridEnd : agendaEnd

  const accountsQuery = useQuery({
    queryKey: ['calendar', 'accounts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_accounts')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarAccount[]
    },
  })

  const eventsQuery = useQuery({
    queryKey: ['calendar', 'events', userId, view, rangeStart.toISOString(), rangeEnd.toISOString()],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId!)
        .gte('end_at', rangeStart.toISOString())
        .lte('start_at', rangeEnd.toISOString())
        .order('start_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarEvent[]
    },
  })

  const accounts = accountsQuery.data ?? []
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const events = eventsQuery.data ?? []

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      // An event may span multiple days — place it on every day it touches
      // within the visible range so both the grid and the agenda show it.
      let cursor = startOfDay(new Date(ev.start_at))
      const last = startOfDay(new Date(ev.end_at))
      let guard = 0
      while (cursor.getTime() <= last.getTime() && guard < 400) {
        const key = format(cursor, 'yyyy-MM-dd')
        const arr = map.get(key) ?? []
        arr.push(ev)
        map.set(key, arr)
        cursor = addDays(cursor, 1)
        guard++
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_at.localeCompare(b.start_at))
    return map
  }, [events])

  const gridDays = useMemo(() => {
    const days: Date[] = []
    let cursor = gridStart
    while (cursor.getTime() <= gridEnd.getTime()) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [gridStart, gridEnd])

  const agendaGroups = useMemo(() => {
    if (view !== 'agenda') return []
    const groups: { date: Date; events: CalendarEvent[] }[] = []
    let cursor = agendaStart
    while (cursor.getTime() <= agendaEnd.getTime()) {
      const key = format(cursor, 'yyyy-MM-dd')
      const dayEvents = eventsByDay.get(key)
      if (dayEvents && dayEvents.length > 0) groups.push({ date: cursor, events: dayEvents })
      cursor = addDays(cursor, 1)
    }
    return groups
  }, [view, agendaStart, agendaEnd, eventsByDay])

  const selectedDayEvents = eventsByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? []

  const openNewEvent = (date: Date) => setEventModal({ open: true, event: null, defaultDate: date })
  const openEditEvent = (ev: CalendarEvent) => setEventModal({ open: true, event: ev, defaultDate: new Date(ev.start_at) })
  const closeEventModal = () => setEventModal((s) => ({ ...s, open: false }))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-fade-up">
        <div>
          <p className="text-sm text-[var(--color-mist)]">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
          <h1 className="mt-1 font-display text-3xl font-medium text-[var(--color-paper)]">Calendar</h1>
          <p className="mt-2 max-w-xl text-[var(--color-mist)]">
            Every meeting, flight and reservation — from every connected calendar — in one view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConnectOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Connect a calendar
          </Button>
          <Button variant="primary" onClick={() => openNewEvent(selectedDay)}>
            <Plus className="h-4 w-4" />
            New event
          </Button>
        </div>
      </div>

      {calendarError && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-rose)]/30 bg-[var(--color-rose)]/10 px-4 py-3 text-sm text-[var(--color-rose)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{calendarError}</p>
          <button onClick={dismissError} className="text-[var(--color-rose)] transition-colors hover:text-[var(--color-paper)]" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              tabs={[
                { value: 'month', label: 'Month' },
                { value: 'agenda', label: 'Agenda' },
              ]}
              value={view}
              onChange={(v) => setView(v as View)}
            />
            {view === 'month' && (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="icon" onClick={() => setMonthDate((d) => subMonths(d, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[9rem] text-center font-display text-base text-[var(--color-paper)]">
                  {format(monthDate, 'MMMM yyyy')}
                </span>
                <Button variant="ghost" size="icon" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const t = new Date()
                    setMonthDate(t)
                    setSelectedDay(t)
                  }}
                >
                  Today
                </Button>
              </div>
            )}
          </div>

          {view === 'month' ? (
            <MonthGrid
              days={gridDays}
              monthDate={monthDate}
              eventsByDay={eventsByDay}
              accountsById={accountsById}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onEventClick={openEditEvent}
              loading={eventsQuery.isLoading}
            />
          ) : (
            <AgendaList
              groups={agendaGroups}
              accountsById={accountsById}
              onEventClick={openEditEvent}
              onNewEvent={openNewEvent}
              loading={eventsQuery.isLoading}
            />
          )}
        </div>

        <div className="space-y-6">
          {view === 'month' && (
            <Panel>
              <PanelHeader>
                <PanelTitle>{format(selectedDay, 'EEEE, d MMMM')}</PanelTitle>
                <Button size="sm" variant="ghost" onClick={() => openNewEvent(selectedDay)} aria-label="New event on this day">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </PanelHeader>
              <PanelBody>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-[var(--color-mist)]">Nothing scheduled.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedDayEvents.map((ev) => (
                      <EventRow key={ev.id} event={ev} accountsById={accountsById} onClick={() => openEditEvent(ev)} />
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>
          )}

          <AccountsPanel accounts={accounts} isLoading={accountsQuery.isLoading} onConnectClick={() => setConnectOpen(true)} />
        </div>
      </div>

      <EventModal
        open={eventModal.open}
        onClose={closeEventModal}
        event={eventModal.event}
        defaultDate={eventModal.defaultDate}
        account={eventModal.event?.calendar_account_id ? (accountsById.get(eventModal.event.calendar_account_id) ?? null) : null}
      />
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

function EventRow({
  event,
  accountsById,
  onClick,
}: {
  event: CalendarEvent
  accountsById: Map<string, CalendarAccount>
  onClick: () => void
}) {
  const color = eventColor(event, accountsById)
  const account = event.calendar_account_id ? accountsById.get(event.calendar_account_id) : null
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[var(--color-line)] hover:bg-white/5"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--color-paper)]">{event.title}</p>
          <p className="truncate text-xs text-[var(--color-mist)]">
            {event.all_day ? 'All day' : `${format(new Date(event.start_at), 'HH:mm')} – ${format(new Date(event.end_at), 'HH:mm')}`}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        {account && (
          <Badge tone="azure" className="shrink-0">
            {PROVIDER_LABEL[account.provider]}
          </Badge>
        )}
      </button>
    </li>
  )
}

function MonthGrid({
  days,
  monthDate,
  eventsByDay,
  accountsById,
  selectedDay,
  onSelectDay,
  onEventClick,
  loading,
}: {
  days: Date[]
  monthDate: Date
  eventsByDay: Map<string, CalendarEvent[]>
  accountsById: Map<string, CalendarAccount>
  selectedDay: Date
  onSelectDay: (d: Date) => void
  onEventClick: (ev: CalendarEvent) => void
  loading: boolean
}) {
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <Panel className="overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-[var(--color-line)] text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]">
        {weekdayLabels.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = eventsByDay.get(key) ?? []
          const inMonth = isSameMonth(day, monthDate)
          const selected = isSameDay(day, selectedDay)
          const today = isToday(day)
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(day)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectDay(day)
                }
              }}
              className={cx(
                'flex min-h-[76px] cursor-pointer flex-col items-stretch gap-1 border-b border-r border-[var(--color-line-soft)] p-1.5 text-left transition-colors sm:min-h-[104px] sm:p-2',
                !inMonth && 'bg-[var(--color-obsidian)]/40',
                selected && 'bg-[var(--color-gold)]/[0.07]'
              )}
            >
              <span
                className={cx(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  today ? 'bg-[var(--color-gold)] font-medium text-[#1a1305]' : inMonth ? 'text-[var(--color-paper)]' : 'text-[var(--color-mist-2)]',
                  selected && !today && 'ring-1 ring-[var(--color-gold-dim)]'
                )}
              >
                {format(day, 'd')}
              </span>
              <div className="flex-1 space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(ev)
                    }}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight text-[var(--color-paper)] hover:opacity-80 sm:text-[11px]"
                    style={{ backgroundColor: `${eventColor(ev, accountsById)}26` }}
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ backgroundColor: eventColor(ev, accountsById) }}
                    />
                    {!ev.all_day && <span className="hidden sm:inline">{format(new Date(ev.start_at), 'HH:mm ')}</span>}
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && <p className="px-1 text-[10px] text-[var(--color-mist-2)]">+{dayEvents.length - 3} more</p>}
              </div>
            </div>
          )
        })}
      </div>
      {loading && <div className="p-3 text-center text-xs text-[var(--color-mist)]">Loading events…</div>}
    </Panel>
  )
}

function AgendaList({
  groups,
  accountsById,
  onEventClick,
  onNewEvent,
  loading,
}: {
  groups: { date: Date; events: CalendarEvent[] }[]
  accountsById: Map<string, CalendarAccount>
  onEventClick: (ev: CalendarEvent) => void
  onNewEvent: (date: Date) => void
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--color-obsidian-2)]" />
        ))}
      </div>
    )
  }
  if (groups.length === 0) {
    return (
      <Panel>
        <PanelBody>
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" strokeWidth={1.2} />}
            title="Nothing coming up"
            description="The next 90 days are clear. Add an event to get started."
            action={
              <Button size="sm" variant="secondary" onClick={() => onNewEvent(new Date())}>
                <Plus className="h-3.5 w-3.5" />
                New event
              </Button>
            }
          />
        </PanelBody>
      </Panel>
    )
  }
  return (
    <div className="space-y-4">
      {groups.map(({ date, events }) => (
        <Panel key={date.toISOString()}>
          <PanelHeader>
            <PanelTitle>{isToday(date) ? `Today · ${format(date, 'd MMMM')}` : format(date, 'EEEE, d MMMM')}</PanelTitle>
            <Badge tone={isToday(date) ? 'gold' : 'neutral'}>{format(date, 'yyyy')}</Badge>
          </PanelHeader>
          <PanelBody>
            <ul className="space-y-1">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} accountsById={accountsById} onClick={() => onEventClick(ev)} />
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ))}
    </div>
  )
}
