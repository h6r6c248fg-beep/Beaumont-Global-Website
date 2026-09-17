import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Trash2, CalendarClock, MapPin, AlignLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Label } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import type { CalendarAccount, CalendarEvent } from '@/types/database'
import { COLOR_PRESETS, DEFAULT_EVENT_COLOR, PROVIDER_LABEL, accountLabel } from './utils'

interface Props {
  open: boolean
  onClose: () => void
  /** null = creating a new manual event. */
  event: CalendarEvent | null
  /** Day to prefill when creating a new event (e.g. the currently selected day). */
  defaultDate: Date
  account: CalendarAccount | null
}

function toDateInput(d: Date) {
  return format(d, 'yyyy-MM-dd')
}
function toTimeInput(d: Date) {
  return format(d, 'HH:mm')
}

function combine(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr || '00:00'}:00`)
}

export function EventModal({ open, onClose, event, defaultDate, account }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isEditing = !!event
  const isReadOnly = isEditing && event!.calendar_account_id !== null

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startDate, setStartDate] = useState(toDateInput(defaultDate))
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState(toDateInput(defaultDate))
  const [endTime, setEndTime] = useState('10:00')
  const [color, setColor] = useState(DEFAULT_EVENT_COLOR)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (event) {
      const s = new Date(event.start_at)
      const e = new Date(event.end_at)
      setTitle(event.title)
      setDescription(event.description ?? '')
      setLocation(event.location ?? '')
      setAllDay(event.all_day)
      setStartDate(toDateInput(s))
      setStartTime(toTimeInput(s))
      setEndDate(toDateInput(e))
      setEndTime(toTimeInput(e))
      setColor(event.color ?? DEFAULT_EVENT_COLOR)
    } else {
      setTitle('')
      setDescription('')
      setLocation('')
      setAllDay(false)
      setStartDate(toDateInput(defaultDate))
      setStartTime('09:00')
      setEndDate(toDateInput(defaultDate))
      setEndTime('10:00')
      setColor(DEFAULT_EVENT_COLOR)
    }
    setFormError(null)
  }, [open, event, defaultDate])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const start = allDay ? combine(startDate, '00:00') : combine(startDate, startTime)
      const end = allDay ? combine(endDate, '23:59') : combine(endDate, endTime)
      if (end.getTime() < start.getTime()) throw new Error('End must be after start.')

      const payload = {
        title: title.trim() || 'Untitled event',
        description: description.trim() || null,
        location: location.trim() || null,
        all_day: allDay,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        color,
      }

      if (isEditing && event) {
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', event.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('calendar_events').insert({
          ...payload,
          user_id: user.id,
          calendar_account_id: null,
          external_id: null,
          source: 'manual',
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not save the event.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!event) return
      const { error } = await supabase.from('calendar_events').delete().eq('id', event.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not delete the event.')
    },
  })

  const onDelete = () => {
    if (!event) return
    if (window.confirm('Delete this event? This cannot be undone.')) {
      deleteMutation.mutate()
    }
  }

  if (isReadOnly && event) {
    const s = new Date(event.start_at)
    const e = new Date(event.end_at)
    return (
      <Modal open={open} onClose={onClose} title={event.title}>
        <div className="space-y-4">
          <Badge tone="azure">{account ? accountLabel(account) : PROVIDER_LABEL[event.source]}</Badge>
          <div className="flex items-start gap-2.5 text-sm text-[var(--color-paper)]">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-mist)]" />
            <span>
              {event.all_day
                ? `${format(s, 'EEEE, d MMMM yyyy')} · All day`
                : `${format(s, 'EEEE, d MMMM yyyy · HH:mm')} – ${format(e, 'HH:mm')}`}
            </span>
          </div>
          {event.location && (
            <div className="flex items-start gap-2.5 text-sm text-[var(--color-mist)]">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-mist)]" />
              <span>{event.location}</span>
            </div>
          )}
          {event.description && (
            <div className="flex items-start gap-2.5 text-sm text-[var(--color-mist)]">
              <AlignLeft className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-mist)]" />
              <span className="whitespace-pre-wrap">{event.description}</span>
            </div>
          )}
          <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-obsidian-2)] px-3 py-2 text-xs text-[var(--color-mist)]">
            This event was synced from a connected calendar and can&apos;t be edited here — changes will be overwritten
            on the next sync. Edit it in the source calendar instead.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit event' : 'New event'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner with the board" required autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </Field>
          <div>
            <Label>All day</Label>
            <button
              type="button"
              onClick={() => setAllDay((v) => !v)}
              className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors ${
                allDay
                  ? 'border-[var(--color-gold-dim)] bg-[var(--color-gold)]/10 text-[var(--color-gold-bright)]'
                  : 'border-[var(--color-line)] bg-[var(--color-obsidian-2)] text-[var(--color-mist)]'
              }`}
            >
              {allDay ? 'All day' : 'Timed'}
              <span
                className={`ml-2 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  allDay ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-line)]'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${allDay ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <div className="flex gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              {!allDay && <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-28" />}
            </div>
          </Field>
          <Field label="Ends">
            <div className="flex gap-2">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              {!allDay && <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="w-28" />}
            </div>
          </Field>
        </div>

        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional notes" />
        </Field>

        <div>
          <Label>Color</Label>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-[var(--color-paper)] ring-offset-2 ring-offset-[var(--color-obsidian-2)]' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={`Choose color ${c}`}
              />
            ))}
            <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-[var(--color-line)]">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute -left-1 -top-1 h-9 w-9 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>

        {formError && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{formError}</p>}

        <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-4">
          {isEditing ? (
            <Button type="button" variant="danger" size="sm" onClick={onDelete} loading={deleteMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>
              {isEditing ? 'Save changes' : 'Create event'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
