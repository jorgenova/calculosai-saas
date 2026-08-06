import type { ReactNode } from 'react'
import clsx from 'clsx'

type Status = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const statusClasses: Record<Status, string> = {
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-700',
  info: 'bg-info-50 text-info-700',
  neutral: 'bg-graphite-100 text-graphite-600',
}

export function Badge({ status = 'neutral', children }: { status?: Status; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusClasses[status])}>
      {children}
    </span>
  )
}
