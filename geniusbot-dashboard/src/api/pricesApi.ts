import { apiClient } from './apiClient'

export type PriceRecord = {
  id: string
  clinic_id: string
  service_id: string
  service_name?: string
  payment_method_id: string
  payment_method_name?: string
  payment_method_code?: string
  insurance_company_id: string | null
  insurance_company_name?: string | null
  insurance_class_id: string | null
  insurance_class_name?: string | null
  price: string | number
  currency: string
  valid_from: string
  valid_to: string | null
  is_active: boolean
}

export type PriceWrite = {
  service_id: string
  payment_method_id: string
  insurance_company_id: string | null
  insurance_class_id: string | null
  price: number
  currency: string
  valid_from: string
  valid_to: string | null
  is_active: boolean
}

type ApiEnvelope<T> = { success: true; data: T }

const endpoint = (clinicId: string) =>
  `/api/clinics/${encodeURIComponent(clinicId)}/prices`

export async function listPrices(clinicId: string): Promise<PriceRecord[]> {
  const response = await apiClient.get<ApiEnvelope<PriceRecord[]>>(
    endpoint(clinicId),
  )
  return response.data.data
}

export async function getPrice(clinicId: string, priceId: string) {
  const response = await apiClient.get<ApiEnvelope<PriceRecord>>(
    `${endpoint(clinicId)}/${encodeURIComponent(priceId)}`,
  )
  return response.data.data
}

export async function createPrice(clinicId: string, data: PriceWrite) {
  const response = await apiClient.post<ApiEnvelope<PriceRecord>>(
    endpoint(clinicId),
    data,
  )
  return response.data.data
}

export async function updatePrice(
  clinicId: string,
  priceId: string,
  data: Partial<PriceWrite>,
) {
  const response = await apiClient.patch<ApiEnvelope<PriceRecord>>(
    `${endpoint(clinicId)}/${encodeURIComponent(priceId)}`,
    data,
  )
  return response.data.data
}

export async function setPriceActive(
  clinicId: string,
  priceId: string,
  isActive: boolean,
) {
  return updatePrice(clinicId, priceId, { is_active: isActive })
}
