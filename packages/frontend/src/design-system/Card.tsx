import type { ReactNode } from 'react'
import clsx from 'clsx'

interface CardComponent {
  (props: { className?: string; children: ReactNode }): JSX.Element
  Header: (props: { children: ReactNode }) => JSX.Element
  Body: (props: { children: ReactNode }) => JSX.Element
}

export const Card: CardComponent = ({ className, children }) => (
  <div className={clsx('bg-white border border-graphite-200 rounded-xl shadow-sm', className)}>
    {children}
  </div>
)

Card.Header = function CardHeader({ children }) {
  return <div className="px-6 py-4 border-b border-graphite-100">{children}</div>
}

Card.Body = function CardBody({ children }) {
  return <div className="p-6">{children}</div>
}
