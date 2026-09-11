import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from '@/lib/utils'

const fieldBase =
  'w-full rounded-lg bg-[var(--color-obsidian-2)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-paper)] placeholder:text-[var(--color-mist-2)] outline-none transition-colors focus:border-[var(--color-gold-dim)] focus:ring-1 focus:ring-[var(--color-gold-dim)]/40'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cx(fieldBase, className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx(fieldBase, 'resize-none', className)} {...props} />
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select ref={ref} className={cx(fieldBase, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cx('mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-mist)]', className)}
      {...props}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-[var(--color-mist-2)]">{hint}</p>}
    </div>
  )
}
