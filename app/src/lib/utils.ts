import { clsx, type ClassValue } from 'clsx'

export function cx(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function initials(name: string | null | undefined, fallback = '?') {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatCurrency(value: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(value)
}

export function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
