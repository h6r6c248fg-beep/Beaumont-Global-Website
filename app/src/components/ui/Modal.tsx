import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '@/lib/utils'

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-up" onClick={onClose} />
      <div
        className={cx(
          'glass-panel relative z-10 w-full max-w-lg rounded-2xl bg-[var(--color-obsidian-2)] animate-fade-up',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
            <h3 className="font-display text-lg text-[var(--color-paper)]">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}
