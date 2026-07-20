import { apiClient } from '../../api/apiClient'
import type { ApiSuccessResponse } from '../../api/apiTypes'
import type {
  BackendLoginData,
  LoginCredentials,
} from '../authTypes'

const STAFF_LOGIN_ENDPOINT = '/api/auth/staff/login'

export async function loginApi(
  credentials: LoginCredentials,
): Promise<BackendLoginData> {
  const response = await apiClient.post<
    ApiSuccessResponse<BackendLoginData>
  >(
    STAFF_LOGIN_ENDPOINT,
    credentials,
  )

  return response.data.data
}