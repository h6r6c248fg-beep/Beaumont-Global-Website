import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cx } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[var(--color-gold-bright)] to-[var(--color-gold)] text-[#1a1305] font-medium hover:brightness-105 active:brightness-95 shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset]',
  secondary: 'bg-[var(--color-panel-2)] text-[var(--color-paper)] border border-[var(--color-line)] hover:border-[var(--color-gold-dim)] hover:bg-[var(--color-obsidian-3)]',
  ghost: 'text-[var(--color-mist)] hover:text-[var(--color-paper)] hover:bg-white/5',
  outline: 'border border-[var(--color-line)] text-[var(--color-paper)] hover:border-[var(--color-gold-dim)] bg-transparent',
  danger: 'bg-[var(--color-rose)]/15 text-[var(--color-rose)] border border-[var(--color-rose)]/30 hover:bg-[var(--color-rose)]/25',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-sm rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg justify-center',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center whitespace-nowrap transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
})
