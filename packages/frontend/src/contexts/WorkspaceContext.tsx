import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const WorkspaceContext = createContext({ dirty: false, dirtyRef: { current: false }, setDirty: (_value: boolean) => {} })
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyState] = useState(false)
  const dirtyRef = useRef(false)
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirtyState(value)
  }, [])
  return <WorkspaceContext.Provider value={{ dirty, dirtyRef, setDirty }}>{children}</WorkspaceContext.Provider>
}
export const useWorkspace = () => useContext(WorkspaceContext)
