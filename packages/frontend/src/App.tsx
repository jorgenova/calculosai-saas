import { Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { OfficeProvider } from '@/contexts/OfficeContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// Pages will be lazy-loaded later; they are currently direct imports.
import { LoginPage } from '@/pages/Login'
import { OnboardingPage } from '@/pages/Onboarding'
import { AcceptInvitePage } from '@/pages/AcceptInvite'
import { OwnerDashboard } from '@/pages/OwnerDashboard'

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { AppShell } from '@/design-system/AppShell'
import { WorkHome } from '@/pages/app/WorkHome'
import { CompaniesPanel } from '@/components/CompaniesPanel'
import { CompanyCreate } from '@/components/CompanyCreate'

const router = createBrowserRouter([
  ...['/login', '/entrar'].map(path => ({ path, element: <LoginPage /> })),
  ...['/onboarding', '/cadastro'].map(path => ({ path, element: <OnboardingPage /> })),
  ...['/invitation', '/convite'].map(path => ({ path, element: <AcceptInvitePage /> })),
  { path: '/dashboard', element: <ProtectedRoute requireOwner><Navigate to="/app" replace /></ProtectedRoute> },
  ...['/attendance', '/atendimento'].map(path => ({ path, element: <ProtectedRoute><Navigate to="/app" replace /></ProtectedRoute> })),
  { path: '/app', element: <ProtectedRoute><AppShell /></ProtectedRoute>, children: [
    { index: true, element: <WorkHome /> },
    { path: 'pillars/:pillarId', element: <WorkHome /> },
    { path: 'companies', element: <CompaniesPanel /> },
    { path: 'companies/new', element: <CompanyCreate /> },
    { path: 'companies/:companyId/:section?/:tab?', element: <CompaniesPanel /> },
    { path: 'administration', element: <ProtectedRoute requireOwner><OwnerDashboard /></ProtectedRoute> },
  ] },
  { path: '*', element: <Navigate to="/entrar" replace /> },
])
export function App() {
  return <AuthProvider><OfficeProvider><WorkspaceProvider><RouterProvider router={router} /></WorkspaceProvider></OfficeProvider></AuthProvider>
}
