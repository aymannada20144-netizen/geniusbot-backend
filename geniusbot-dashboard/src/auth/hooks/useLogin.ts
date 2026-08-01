import { useCallback, useState } from 'react'

import type { ApiError } from '../../api/apiError'
import { loginApi } from '../api/loginApi'
import type {
  AuthSession,
  AuthUser,
  BackendStaff,
  LoginCredentials,
} from '../authTypes'
import { useAuth } from './useAuth'

function mapBackendStaffToAuthUser(
  staff: BackendStaff,
): AuthUser {
  return {
    id: staff.id,
    clinicId: staff.clinic_id,
    branchId: staff.branch_id,
    email: staff.email,
    username: staff.username,
    name: staff.full_name,
    role: staff.role,
    permissions: staff.permissions,
  }
}

export function useLogin() {
  const { setAuthenticatedSession } = useAuth()

  const [isLoading, setIsLoading] =
    useState(false)

  const [error, setError] =
    useState<ApiError | null>(null)

  const login = useCallback(
    async (
      credentials: LoginCredentials,
    ): Promise<AuthSession> => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await loginApi(credentials)

        const session: AuthSession = {
          accessToken: data.accessToken,
          user: mapBackendStaffToAuthUser(
            data.staff,
          ),
        }

        setAuthenticatedSession(session)

        return session
      } catch (caughtError) {
        const apiError =
          caughtError as ApiError

        setError(apiError)

        throw apiError
      } finally {
        setIsLoading(false)
      }
    },
    [setAuthenticatedSession],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    login,
    isLoading,
    error,
    clearError,
  }
}
