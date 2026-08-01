export const FINANCIAL_VIEW = 'financial:view'
export const FINANCIAL_CREATE = 'financial:create'
export const FINANCIAL_UPDATE = 'financial:update'

export function canViewPrices(permissions?: readonly string[]) {
  return Boolean(permissions?.includes(FINANCIAL_VIEW))
}

export function canCreatePrices(permissions?: readonly string[]) {
  return Boolean(permissions?.includes(FINANCIAL_CREATE))
}

export function canUpdatePrices(permissions?: readonly string[]) {
  return Boolean(permissions?.includes(FINANCIAL_UPDATE))
}
