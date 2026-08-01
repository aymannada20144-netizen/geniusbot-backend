import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'

export type AssistantGender = 'female' | 'male'
export interface AssistantIdentity { assistantName: string; assistantGender: AssistantGender; updatedAt: string | null }
export interface AssistantIdentityInput { assistantName: string; assistantGender: AssistantGender; expectedUpdatedAt: string | null }
const endpoint = (clinicId: string) => `/api/clinics/${encodeURIComponent(clinicId)}/assistant-identity`
export async function getAssistantIdentity(clinicId: string) {
  const response = await apiClient.get<ApiSuccessResponse<AssistantIdentity>>(endpoint(clinicId))
  return response.data.data
}
export async function updateAssistantIdentity(clinicId: string, input: AssistantIdentityInput) {
  const response = await apiClient.put<ApiSuccessResponse<AssistantIdentity>>(endpoint(clinicId), input)
  return response.data.data
}
