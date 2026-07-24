import type {
  AuthRole,
  AuthSession,
  AuthUser,
} from './authTypes'

const AUTH_SESSION_STORAGE_KEY =
  'geniusbot.auth.session'

const AUTH_ROLES: readonly AuthRole[] = [
  'platform_admin',
  'owner',
  'clinic_admin',
  'branch_manager',
  'receptionist',
  'doctor',
]

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
}

function isAuthRole(
  value: unknown,
): value is AuthRole {
  return (
    typeof value === 'string' &&
    AUTH_ROLES.includes(value as AuthRole)
  )
}

function isAuthUser(
  value: unknown,
): value is AuthUser {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const user = value as Partial<AuthUser>

  return (
    isNonEmptyString(user.id) &&
    isNonEmptyString(user.clinicId) &&
    (
      user.branchId === null ||
      isNonEmptyString(user.branchId)
    ) &&
    isNonEmptyString(user.email) &&
    isNonEmptyString(user.name) &&
    isAuthRole(user.role)
  )
}

function isAuthSession(
  value: unknown,
): value is AuthSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const session = value as Partial<AuthSession>

  return (
    isNonEmptyString(session.accessToken) &&
    isAuthUser(session.user)
  )
}

export function saveAuthSession(
  session: AuthSession,
): void {
  if (!isAuthSession(session)) {
    throw new Error(
      'Cannot save an invalid authentication session.',
    )
  }

  sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  )
}

export function getAuthSession():
  AuthSession | null {
  const serializedSession =
    sessionStorage.getItem(
      AUTH_SESSION_STORAGE_KEY,
    )

  if (!serializedSession) {
    return null
  }

  try {
    const parsedSession: unknown =
      JSON.parse(serializedSession)

    if (!isAuthSession(parsedSession)) {
      clearAuthSession()
      return null
    }

    return parsedSession
  } catch {
    clearAuthSession()
    return null
  }
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(
    AUTH_SESSION_STORAGE_KEY,
  )

  localStorage.removeItem(
    AUTH_SESSION_STORAGE_KEY,
  )
}

export function getAccessToken():
  string | null {
  return getAuthSession()?.accessToken ?? null
}

export function hasAuthSession(): boolean {
  return getAuthSession() !== null
}
