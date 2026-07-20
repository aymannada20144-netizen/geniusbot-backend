export type ApiErrorKind =
  | 'backend'
  | 'network'
  | 'timeout'
  | 'client'
  | 'unknown'

export interface ApiErrorOptions {
  status?: number
  name?: string
  code?: string
  details?: unknown
  kind?: ApiErrorKind
  isRetryable?: boolean
  cause?: unknown
}

export class ApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown
  readonly kind: ApiErrorKind
  readonly isRetryable: boolean
  override readonly cause?: unknown

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message)

    this.name = options.name ?? 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
    this.kind = options.kind ?? 'unknown'
    this.isRetryable = options.isRetryable ?? false
    this.cause = options.cause

    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}