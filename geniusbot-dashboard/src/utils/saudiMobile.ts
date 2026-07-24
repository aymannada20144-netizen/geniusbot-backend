export function normalizeSaudiMobile(value: string, optional = false): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '')
  if (!compact && optional) return null

  let local: string | undefined
  if (/^05\d{8}$/.test(compact)) local = compact
  if (/^(?:\+?966)5\d{8}$/.test(compact)) local = `0${compact.replace(/^\+?966/, '')}`

  return local ? `+966${local.slice(1)}` : null
}

export const saudiMobileHint = 'Enter a Saudi mobile number such as +9665XXXXXXXX.'
