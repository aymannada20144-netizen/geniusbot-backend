import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'
import type { BackendStaff, AuthRole } from '../auth/authTypes'

const base = (clinicId: string) => `/api/clinics/${encodeURIComponent(clinicId)}/staff`

export async function getStaff(clinicId: string) {
  const response = await apiClient.get<ApiSuccessResponse<BackendStaff[]>>(base(clinicId))
  return response.data.data
}

export async function createStaff(clinicId: string, input: {
  fullName: string; username: string; email: string; phone?: string | null
  password: string; role: Exclude<AuthRole, 'platform_admin' | 'owner'>
  branchId?: string | null
}) {
  const response = await apiClient.post<ApiSuccessResponse<BackendStaff>>(base(clinicId), input)
  return response.data.data
}

export async function updateStaff(clinicId: string, staffId: string, input: {
  fullName?: string; username?: string; email?: string; phone?: string | null; branchId?: string | null
}) {
  const response = await apiClient.patch<ApiSuccessResponse<BackendStaff>>(`${base(clinicId)}/${staffId}`, input)
  return response.data.data
}

export async function changeStaffRole(
  clinicId: string,
  staffId: string,
  role: Exclude<AuthRole, 'platform_admin' | 'owner'>,
  branchId: string | null,
) {
  const response = await apiClient.patch<ApiSuccessResponse<BackendStaff>>(
    `${base(clinicId)}/${staffId}/role`,
    { role, branchId },
  )
  return response.data.data
}

export async function deleteStaff(clinicId: string, staffId: string) {
  const response = await apiClient.delete<ApiSuccessResponse<BackendStaff>>(
    `${base(clinicId)}/${staffId}`,
  )
  return response.data.data
}

export async function setStaffActive(clinicId: string, staffId: string, isActive: boolean) {
  const response = await apiClient.patch<ApiSuccessResponse<BackendStaff>>(
    `${base(clinicId)}/${staffId}/status`,
    { isActive },
  )
  return response.data.data
}

export async function resetStaffPassword(
  clinicId: string,
  staffId: string,
  input: { newPassword: string; confirmPassword: string },
) {
  const response = await apiClient.post<ApiSuccessResponse<{ id: string; passwordReset: boolean }>>(
    `${base(clinicId)}/${staffId}/reset-password`,
    input,
  )
  return response.data.data
}
