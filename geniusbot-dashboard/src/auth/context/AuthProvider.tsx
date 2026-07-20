import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  clearAuthSession,
  getAuthSession,
  saveAuthSession,
} from '../authStorage'
import type {
  AuthContextValue,
  AuthSession,
} from '../authTypes'
import { AuthContext } from './AuthContext'

type AuthProviderProps = PropsWithChildren

function getInitialSession(): AuthSession | null {
  return getAuthSession()
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [session, setSession] =
    useState<AuthSession | null>(
      getInitialSession,
    )

  const setAuthenticatedSession =
    useCallback((nextSession: AuthSession) => {
      saveAuthSession(nextSession)
      setSession(nextSession)
    }, [])

  const logout = useCallback(() => {
    clearAuthSession()
    setSession(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      isInitializing: false,
      setAuthenticatedSession,
      logout,
    }),
    [
      session,
      setAuthenticatedSession,
      logout,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}