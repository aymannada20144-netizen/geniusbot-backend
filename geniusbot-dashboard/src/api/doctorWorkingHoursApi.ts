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

export type DoctorWorkingSchedule = {
  periods: DoctorWorkingPeriod[]
  version: string
}

type ApiEnvelope<T> = {
  success: true
  data: T
  meta: { version: string }
}

const endpoint = (clinicId: string, doctorId: string) =>
  `/api/clinics/${encodeURIComponent(clinicId)}/doctors/${encodeURIComponent(doctorId)}/working-hours`

export async function getDoctorWorkingHours(clinicId: string, doctorId: string) {
  const response = await apiClient.get<ApiEnvelope<DoctorWorkingPeriod[]>>(
    endpoint(clinicId, doctorId),
  )
  return {
    periods: response.data.data,
    version: response.data.meta.version,
  }
}

export async function replaceDoctorWorkingHours(
  clinicId: string,
  doctorId: string,
  periods: DoctorWorkingPeriod[],
  version: string,
) {
  const response = await apiClient.put<ApiEnvelope<DoctorWorkingPeriod[]>>(
    endpoint(clinicId, doctorId),
    { periods, version },
  )
  return {
    periods: response.data.data,
    version: response.data.meta.version,
  }
}
