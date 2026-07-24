import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'

export interface Appointment {
  id: string
  patientName: string
  phoneNumber: string
  serviceName: string
  doctorName: string | null
  roomName: string | null
  appointmentStart: string
  appointmentEnd: string | null
  paymentMethod: string | null
  status: AppointmentStatus
}

export async function getAppointments(
  clinicId: string,
): Promise<Appointment[]> {
  const response = await apiClient.get<
    ApiSuccessResponse<Appointment[]>
  >(`/api/clinics/${encodeURIComponent(clinicId)}/appointments`)

  return response.data.data
}

export async function updateAppointmentStatus(
  clinicId: string,
  appointmentId: string,
  status: 'confirmed' | 'cancelled',
): Promise<{ id: string; status: AppointmentStatus }> {
  const response = await apiClient.patch<
    ApiSuccessResponse<{ id: string; status: AppointmentStatus }>
  >(
    `/api/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/status`,
    { status },
  )

  return response.data.data
}
