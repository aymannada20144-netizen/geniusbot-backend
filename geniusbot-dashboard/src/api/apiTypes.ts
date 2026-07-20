export interface ApiSuccessResponse<T> {
  success: true
  data: T
  count?: number
}

export interface PaginatedApiResponse<T> {
  success: true
  data: T[]
  count: number
  limit?: number
  offset?: number
}

export interface BackendErrorPayload {
  name: string
  message: string
  statusCode: number
  code?: string
  details?: unknown
}

export interface BackendErrorResponse {
  success: false
  error: BackendErrorPayload
}