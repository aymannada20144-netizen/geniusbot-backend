import axios, { AxiosError } from 'axios'

import { ApiError, isApiError } from './apiError'
import type { BackendErrorResponse } from './apiTypes'

const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred.'
const NETWORK_ERROR_MESSAGE = 'Unable to connect to the server.'
const TIMEOUT_ERROR_MESSAGE = 'The request timed out.'

function isBackendErrorResponse(value: unknown): value is BackendErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Partial<BackendErrorResponse>

  if (response.success !== false) {
    return false
  }

  if (typeof response.error !== 'object' || response.error === null) {
    return false
  }

  return (
    typeof response.error.name === 'string' &&
    typeof response.error.message === 'string' &&
    typeof response.error.statusCode === 'number'
  )
}

function isTimeoutError(error: AxiosError): boolean {
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    error.message.toLowerCase().includes('timeout')
  )
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) {
    return false
  }

  return status === 408 || status === 429 || status >= 500
}

function mapAxiosError(error: AxiosError<unknown>): ApiError {
  if (isTimeoutError(error)) {
    return new ApiError(TIMEOUT_ERROR_MESSAGE, {
      name: 'TimeoutError',
      code: error.code,
      kind: 'timeout',
      isRetryable: true,
      cause: error,
    })
  }

  if (!error.response) {
    return new ApiError(NETWORK_ERROR_MESSAGE, {
      name: 'NetworkError',
      code: error.code,
      kind: 'network',
      isRetryable: true,
      cause: error,
    })
  }

  const { status, data } = error.response

  if (isBackendErrorResponse(data)) {
    return new ApiError(data.error.message, {
      status: data.error.statusCode,
      name: data.error.name,
      code: data.error.code,
      details: data.error.details,
      kind: 'backend',
      isRetryable: isRetryableStatus(data.error.statusCode),
      cause: error,
    })
  }

  return new ApiError(error.message || DEFAULT_ERROR_MESSAGE, {
    status,
    name: 'HttpError',
    kind: 'client',
    isRetryable: isRetryableStatus(status),
    details: data,
    cause: error,
  })
}

export function mapToApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error
  }

  if (axios.isAxiosError(error)) {
    return mapAxiosError(error)
  }

  if (error instanceof Error) {
    return new ApiError(error.message || DEFAULT_ERROR_MESSAGE, {
      name: error.name || 'ClientError',
      kind: 'client',
      cause: error,
    })
  }

  return new ApiError(DEFAULT_ERROR_MESSAGE, {
    kind: 'unknown',
    cause: error,
  })
}