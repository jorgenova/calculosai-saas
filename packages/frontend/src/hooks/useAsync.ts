import { useEffect, useState } from 'react'

type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; data: T }

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], isEmpty?: (data: T) => boolean): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fn()
      .then((data) => {
        if (!active) return
        setState(isEmpty?.(data) ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((err: Error) => {
        if (!active) return
        setState({ status: 'error', error: err.message })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
