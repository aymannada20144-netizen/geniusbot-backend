export function canViewCampaigns(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes('notification:view'))
}

export function canSendCampaigns(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes('notification:send'))
}
