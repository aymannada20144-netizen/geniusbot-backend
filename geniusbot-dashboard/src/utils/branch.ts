export type BranchLabelSource = Record<string, unknown>

export function formatBranchLabel(branch: BranchLabelSource | null | undefined) {
  if (!branch) return 'Unavailable'
  const city = typeof branch.city === 'string' ? branch.city.trim() : ''
  const name = typeof branch.name === 'string' ? branch.name.trim() : ''
  if (city && name) return `${city} — ${name}`
  return city || name || 'Unavailable'
}
