import { apiClient } from './apiClient'

export type DoctorWorkingPeriod = {
  id?: string
  doctor_id?: string
  branch_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active?: boolean
}

type ApiEnvelope<T> = { success: true; data: T }

const endpoint = (clinicId: string, doctorId: string) =>
  `/api/clinics/${encodeURIComponent(clinicId)}/doctors/${encodeURIComponent(doctorId)}/working-hours`

export async function getDoctorWorkingHours(clinicId: string, doctorId: string) {
  const response = await apiClient.get<ApiEnvelope<DoctorWorkingPeriod[]>>(
    endpoint(clinicId, doctorId),
  )
  return response.data.data
}

export async function replaceDoctorWorkingHours(
  clinicId: string,
  doctorId: string,
  periods: DoctorWorkingPeriod[],
) {
  const response = await apiClient.put<ApiEnvelope<DoctorWorkingPeriod[]>>(
    endpoint(clinicId, doctorId),
    { periods },
  )
  return response.data.data
}
