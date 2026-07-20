function readRequiredUrl(name: string, value: string | undefined): string {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(normalizedValue)
  } catch {
    throw new Error(
      `Environment variable ${name} must contain a valid absolute URL`,
    )
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Environment variable ${name} must use the HTTP or HTTPS protocol`,
    )
  }

  return normalizedValue.replace(/\/+$/, '')
}

export const env = Object.freeze({
  apiBaseUrl: readRequiredUrl(
    'VITE_API_BASE_URL',
    import.meta.env.VITE_API_BASE_URL,
  ),
})