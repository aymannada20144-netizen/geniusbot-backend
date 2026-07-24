import { apiClient } from './apiClient'

export type MasterDataRecord = Record<string, unknown> & { id: string }

type ApiEnvelope<T> = { success: true; data: T }

export async function listMasterData(
  clinicId: string,
  resource: string,
): Promise<MasterDataRecord[]> {
  const response = await apiClient.get<ApiEnvelope<MasterDataRecord[]>>(
    `/api/clinics/${clinicId}/master-data/${resource}`,
  )
  return response.data.data
}

export async function createMasterData(
  clinicId: string,
  resource: string,
  data: Record<string, unknown>,
): Promise<MasterDataRecord> {
  const response = await apiClient.post<ApiEnvelope<MasterDataRecord>>(
    `/api/clinics/${clinicId}/master-data/${resource}`,
    data,
  )
  return response.data.data
}

export async function updateMasterData(
  clinicId: string,
  resource: string,
  id: string,
  data: Record<string, unknown>,
): Promise<MasterDataRecord> {
  const response = await apiClient.patch<ApiEnvelope<MasterDataRecord>>(
    `/api/clinics/${clinicId}/master-data/${resource}/${id}`,
    data,
  )
  return response.data.data
}

export async function deleteMasterData(
  clinicId: string,
  resource: string,
  id: string,
): Promise<void> {
  await apiClient.delete(
    `/api/clinics/${clinicId}/master-data/${resource}/${id}`,
  )
}
