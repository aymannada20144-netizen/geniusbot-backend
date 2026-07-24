import { apiClient } from '../../api/apiClient'
import type { ApiSuccessResponse } from '../../api/apiTypes'

export async function changeOwnPassword(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}) {
  const response = await apiClient.post<ApiSuccessResponse<{ passwordChanged: boolean }>>(
    '/api/auth/change-password',
    input,
  )
  return response.data.data
}
