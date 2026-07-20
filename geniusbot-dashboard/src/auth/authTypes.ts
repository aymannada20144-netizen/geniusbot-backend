export type AuthRole =
  | 'owner'
  | 'admin'
  | 'receptionist'

export interface AuthUser {
  id: string
  clinicId: string
  branchId: string | null
  email: string
  name: string
  role: AuthRole
}

export interface BackendStaff {
  id: string
  clinic_id: string
  branch_id: string | null
  email: string
  full_name: string
  role: AuthRole
  phone?: string | null
  is_active?: boolean
  last_login_at?: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface BackendLoginData {
  staff: BackendStaff
  accessToken: string
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
}

export interface AuthState {
  session: AuthSession | null
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
}

export interface AuthContextValue extends AuthState {
  setAuthenticatedSession: (
    session: AuthSession,
  ) => void
  logout: () => void
}