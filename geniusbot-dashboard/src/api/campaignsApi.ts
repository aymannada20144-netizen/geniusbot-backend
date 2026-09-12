import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled'
export type CampaignAudienceType = 'all' | 'branch'

export interface CampaignTemplate {
  name: string
  label: string
  category: 'marketing'
  language: 'ar'
  kind: 'occasion' | 'offer'
  variables: string[]
}

export interface CampaignRecord {
  id: string
  clinic_id: string
  name: string
  template_name: string
  template_language: string
  campaign_kind: 'occasion' | 'offer'
  audience_type: CampaignAudienceType
  branch_id: string | null
  variables: Record<string, string>
  status: CampaignStatus
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  total_recipients: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  skipped_count: number
}

export interface CampaignAudiencePreview {
  eligible: number
  inactive: number
  no_marketing_consent: number
  no_whatsapp: number
}

export interface CampaignInput {
  name: string
  templateName: string
  audienceType: CampaignAudienceType
  branchId?: string | null
  variables?: {
    offerTitle?: string
    priceOrDiscount?: string
    validUntil?: string
  }
  scheduledAt?: string | null
}

export interface CampaignListFilters {
  search?: string
  status?: CampaignStatus | ''
  templateName?: string
  dateFrom?: string
  dateTo?: string
}

const base = (clinicId: string) => `/api/clinics/${encodeURIComponent(clinicId)}/campaigns`

export async function getCampaignTemplates(clinicId: string) {
  const response = await apiClient.get<ApiSuccessResponse<CampaignTemplate[]>>(`${base(clinicId)}/templates`)
  return response.data.data
}

export async function getCampaigns(clinicId: string, filters: CampaignListFilters = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    const normalized = typeof value === 'string' ? value.trim() : value
    if (normalized) query.set(key, normalized)
  }
  const response = await apiClient.get<ApiSuccessResponse<CampaignRecord[]>>(`${base(clinicId)}${query.size ? `?${query}` : ''}`)
  return response.data.data
}

export async function previewCampaignAudience(clinicId: string, audienceType: CampaignAudienceType, branchId?: string | null) {
  const response = await apiClient.post<ApiSuccessResponse<CampaignAudiencePreview>>(
    `${base(clinicId)}/audience-preview`,
    { audienceType, branchId: branchId || null },
  )
  return response.data.data
}

export async function createCampaign(clinicId: string, input: CampaignInput) {
  const response = await apiClient.post<ApiSuccessResponse<CampaignRecord>>(base(clinicId), input)
  return response.data.data
}

export async function updateCampaign(clinicId: string, campaignId: string, input: CampaignInput) {
  const response = await apiClient.patch<ApiSuccessResponse<CampaignRecord>>(
    `${base(clinicId)}/${encodeURIComponent(campaignId)}`,
    input,
  )
  return response.data.data
}

export async function sendCampaign(clinicId: string, campaignId: string) {
  const response = await apiClient.post<ApiSuccessResponse<CampaignRecord>>(
    `${base(clinicId)}/${encodeURIComponent(campaignId)}/send`,
  )
  return response.data.data
}

export async function cancelCampaign(clinicId: string, campaignId: string) {
  const response = await apiClient.post<ApiSuccessResponse<CampaignRecord>>(
    `${base(clinicId)}/${encodeURIComponent(campaignId)}/cancel`,
  )
  return response.data.data
}

export async function deleteCampaign(clinicId: string, campaignId: string) {
  const response = await apiClient.delete<ApiSuccessResponse<CampaignRecord>>(
    `${base(clinicId)}/${encodeURIComponent(campaignId)}`,
  )
  return response.data.data
}

export async function setPatientMarketingConsent(clinicId: string, patientId: string, optIn: boolean) {
  const response = await apiClient.patch<ApiSuccessResponse<Record<string, unknown>>>(
    `/api/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/marketing-consent`,
    { optIn },
  )
  return response.data.data
}
