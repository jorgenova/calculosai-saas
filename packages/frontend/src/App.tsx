import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { OfficeProvider } from '@/contexts/OfficeContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// Pages will be lazy-loaded later; they are currently direct imports.
import { LoginPage } from '@/pages/Login'
import { OnboardingPage } from '@/pages/Onboarding'
import { AcceptInvitePage } from '@/pages/AcceptInvite'
import { OwnerDashboard } from '@/pages/OwnerDashboard'
import { AttendantDashboard } from '@/pages/AttendantDashboard'

export function App() {
  return (
    <AuthProvider>
      <OfficeProvider>
       <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/cadastro" element={<OnboardingPage />} />
          <Route path="/invitation" element={<AcceptInvitePage />} />
          <Route path="/convite" element={<AcceptInvitePage />} />

          {/* Owner */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireOwner>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Attendant */}
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <AttendantDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/atendimento"
            element={<ProtectedRoute><AttendantDashboard /></ProtectedRoute>}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      </OfficeProvider>
    </AuthProvider>
  )
}
