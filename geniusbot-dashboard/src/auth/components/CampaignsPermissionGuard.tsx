import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { canViewCampaigns } from '../notificationPermissions'

export function CampaignsPermissionGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!canViewCampaigns(user?.permissions)) return <Navigate to="/dashboard" replace />
  return children
}
