import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { canViewPrices } from '../pricePermissions'
import { useAuth } from '../hooks/useAuth'

export function PricesPermissionGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return canViewPrices(user?.permissions)
    ? children
    : <Navigate to="/dashboard" replace />
}
