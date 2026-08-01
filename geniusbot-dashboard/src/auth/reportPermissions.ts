export const REPORT_VIEW_OPERATIONAL = 'report:view_operational'

export function canViewOperationalReports(
  permissions?: readonly string[],
): boolean {
  return Boolean(
    permissions?.includes(REPORT_VIEW_OPERATIONAL),
  )
}
