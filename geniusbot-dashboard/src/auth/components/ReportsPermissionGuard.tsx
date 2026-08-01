import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { canViewOperationalReports } from '../reportPermissions'

export function ReportsPermissionGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return canViewOperationalReports(user?.permissions)
    ? children
    : <Navigate to="/dashboard" replace />
}
