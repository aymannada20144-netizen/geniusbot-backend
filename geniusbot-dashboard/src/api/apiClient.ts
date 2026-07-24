import axios from 'axios'

import { clearAuthSession, getAccessToken } from '../auth/authStorage'
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
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearAuthSession()
      apiClient.defaults.headers.common.Authorization = undefined

      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }

    return Promise.reject(mapToApiError(error))
  },
)
