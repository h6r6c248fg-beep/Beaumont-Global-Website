import type { HTMLAttributes } from 'react'
import { cx } from '@/lib/utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('glass-panel rounded-[22px]', className)} {...props} />
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('flex items-center justify-between gap-3 px-5 pt-5', className)} {...props} />
}

export function PanelTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('font-display text-base font-medium text-[var(--color-paper)]', className)} {...props} />
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-5', className)} {...props} />
}
