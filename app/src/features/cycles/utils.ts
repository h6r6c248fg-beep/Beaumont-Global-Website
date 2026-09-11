import { differenceInCalendarDays } from 'date-fns'
import type { DoseLog } from '@/types/database'

// Preset dosing frequencies mapped to their interval in days. Anything not in
// this map (including free-text "Custom" entries) has no computable
// "expected dose" count — we just show the actual logged count for those.
export const FREQUENCY_PRESETS = ['Daily', 'EOD', 'E3D', 'E3.5D (Twice weekly)', 'Weekly'] as const

export const FREQUENCY_INTERVAL_DAYS: Record<string, number> = {
  Daily: 1,
  EOD: 2,
  E3D: 3,
  'E3.5D (Twice weekly)': 3.5,
  Weekly: 7,
}

export interface AdherenceResult {
  hasExpected: boolean
  expected: number
  logged: number
  skipped: number
}

/**
 * Computes a rough "expected dose count" from a frequency preset and the
 * elapsed portion of the item's active date range (clamped to today), then
 * compares it against the actually-logged doses. Purely a bookkeeping
 * convenience — not medical guidance.
 */
export function computeAdherence(
  frequency: string,
  startDate: string,
  endDate: string | null,
  logs: DoseLog[]
): AdherenceResult {
  const taken = logs.filter((l) => l.taken).length
  const skipped = logs.filter((l) => !l.taken).length

  const intervalDays = FREQUENCY_INTERVAL_DAYS[frequency]
  if (!intervalDays) {
    return { hasExpected: false, expected: 0, logged: taken, skipped }
  }

  const start = new Date(`${startDate}T00:00:00`)
  const today = new Date()
  const boundEnd = endDate ? new Date(`${endDate}T00:00:00`) : today
  const effectiveEnd = boundEnd < today ? boundEnd : today

  const elapsedDays = differenceInCalendarDays(effectiveEnd, start)
  const expected = elapsedDays < 0 ? 0 : Math.floor(elapsedDays / intervalDays) + 1

  return { hasExpected: true, expected, logged: taken, skipped }
}

export function daysElapsedAndRemaining(startDate: string, endDate: string | null) {
  const today = new Date()
  const start = new Date(`${startDate}T00:00:00`)
  const elapsed = Math.max(0, differenceInCalendarDays(today, start))
  if (!endDate) return { elapsed, remaining: null as number | null }
  const end = new Date(`${endDate}T00:00:00`)
  const remaining = differenceInCalendarDays(end, today)
  return { elapsed, remaining }
}

// Injection site rotation --------------------------------------------------

export const INJECTION_SITES = [
  'Left Glute',
  'Right Glute',
  'Left Ventrogluteal',
  'Right Ventrogluteal',
  'Left Delt',
  'Right Delt',
  'Left Quad',
  'Right Quad',
  'Left Abdomen (SubQ)',
  'Right Abdomen (SubQ)',
] as const

/** Suggests a site to encourage rotation away from whatever was used last. */
export function suggestNextSite(lastSite: string | null | undefined): string {
  if (!lastSite) return INJECTION_SITES[0]
  if (lastSite.startsWith('Left ')) {
    const mirrored = `Right ${lastSite.slice('Left '.length)}`
    if ((INJECTION_SITES as readonly string[]).includes(mirrored)) return mirrored
  }
  if (lastSite.startsWith('Right ')) {
    const mirrored = `Left ${lastSite.slice('Right '.length)}`
    if ((INJECTION_SITES as readonly string[]).includes(mirrored)) return mirrored
  }
  const fallback = INJECTION_SITES.find((s) => s !== lastSite)
  return fallback ?? INJECTION_SITES[0]
}

// Bloodwork marker parsing --------------------------------------------------

/** Pulls the leading numeric portion out of a value like "650 ng/dL" -> 650. */
export function parseMarkerNumber(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = value.match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const n = parseFloat(match[0])
  return Number.isFinite(n) ? n : null
}

export const SUGGESTED_MARKERS = [
  'Total Testosterone',
  'Free Testosterone',
  'Estradiol (E2)',
  'SHBG',
  'LH',
  'FSH',
  'Hematocrit',
  'Hemoglobin',
  'ALT',
  'AST',
  'Total Cholesterol',
  'LDL',
  'HDL',
  'Triglycerides',
  'Prolactin',
  'Cortisol',
] as const
