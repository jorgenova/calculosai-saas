import type { ReactNode } from 'react'
import clsx from 'clsx'

interface TableComponent {
  (props: { children: ReactNode }): JSX.Element
  Head: (props: { children: ReactNode }) => JSX.Element
  Row: (props: { children: ReactNode; className?: string }) => JSX.Element
  Cell: (props: { children: ReactNode; align?: 'left' | 'right'; mono?: boolean }) => JSX.Element
}

export const Table: TableComponent = ({ children }) => (
  <div className="overflow-x-auto border border-graphite-200 rounded-xl">
    <table className="w-full text-sm">{children}</table>
  </div>
)

Table.Head = function TableHead({ children }) {
  return <thead className="bg-graphite-50 text-xs font-medium text-graphite-500 uppercase tracking-wide">{children}</thead>
}

Table.Row = function TableRow({ children, className }) {
  return <tr className={clsx('border-t border-graphite-100 hover:bg-graphite-50/60', className)}>{children}</tr>
}

Table.Cell = function TableCell({ children, align = 'left', mono = false }) {
  return (
    <td className={clsx('px-3 py-2', align === 'right' && 'text-right', mono && 'font-mono tabular-nums')}>
      {children}
    </td>
  )
}
