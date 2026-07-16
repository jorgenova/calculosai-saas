import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// Pages — importadas com lazy depois; por ora stubs
import { LoginPage } from '@/pages/Login'
import { OnboardingPage } from '@/pages/Onboarding'
import { OwnerDashboard } from '@/pages/OwnerDashboard'
import { AttendantDashboard } from '@/pages/AttendantDashboard'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/cadastro" element={<OnboardingPage />} />

          {/* Proprietário */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Atendente */}
          <Route
            path="/atendimento"
            element={
              <ProtectedRoute>
                <AttendantDashboard />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/entrar" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}