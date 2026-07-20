import axios from 'axios'

import { getAccessToken } from '../auth/authStorage'
import { env } from '../config/env'
import { mapToApiError } from './errorMapper'

const DEFAULT_TIMEOUT_MS = 10_000

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken()

  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  } else {
    config.headers.delete('Authorization')
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    return Promise.reject(mapToApiError(error))
  },
)