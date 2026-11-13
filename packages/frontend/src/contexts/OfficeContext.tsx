import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/api/client'
import { useAuth } from './AuthContext'

export type Office = {
  id: string
  name: string
  cnpj: string
}

type OfficeContextValue = {
  offices: Office[]
  activeOffice: Office | null
  isLoading: boolean
  selectOffice: (officeId: string) => void
  refreshOffices: () => Promise<void>
}

const OfficeContext = createContext<OfficeContextValue | null>(null)

export function OfficeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [offices, setOffices] = useState<Office[]>([])
  const [activeOfficeId, setActiveOfficeId] = useState<string | null>(
    () => localStorage.getItem('activeOfficeId'),
  )
  const [isLoading, setIsLoading] = useState(false)

  const refreshOffices = useCallback(async () => {
    if (!user) {
      setOffices([])
      setActiveOfficeId(null)
      localStorage.removeItem('activeOfficeId')
      return
    }

    setIsLoading(true)
    try {
      const available = await api.get<Office[]>('/offices')
      setOffices(available)
      setActiveOfficeId(current => {
        const valid = available.some(office => office.id === current)
        const next = valid ? current : available.length === 1 ? available[0].id : null
        if (next) localStorage.setItem('activeOfficeId', next)
        else localStorage.removeItem('activeOfficeId')
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => { void refreshOffices() }, [refreshOffices])
  useEffect(() => {
    const handleRevoked = () => {
      localStorage.removeItem('activeOfficeId')
      setActiveOfficeId(null)
      void refreshOffices()
    }
    window.addEventListener('office-access-revoked', handleRevoked)
    return () => window.removeEventListener('office-access-revoked', handleRevoked)
  }, [refreshOffices])

  const selectOffice = useCallback((officeId: string) => {
    if (!offices.some(office => office.id === officeId)) return
    localStorage.setItem('activeOfficeId', officeId)
    setActiveOfficeId(officeId)
  }, [offices])

  const activeOffice = useMemo(
    () => offices.find(office => office.id === activeOfficeId) ?? null,
    [activeOfficeId, offices],
  )

  return (
    <OfficeContext.Provider value={{ offices, activeOffice, isLoading, selectOffice, refreshOffices }}>
      {children}
    </OfficeContext.Provider>
  )
}

export function useOffice(): OfficeContextValue {
  const context = useContext(OfficeContext)
  if (!context) throw new Error('useOffice must be used inside <OfficeProvider>')
  return context
}
