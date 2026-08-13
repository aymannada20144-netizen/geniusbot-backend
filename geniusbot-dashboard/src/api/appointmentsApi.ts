import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rescheduled'

export interface Appointment {
  id: string
  patientName: string
  phoneNumber: string
  serviceName: string
  branchName: string
  doctorName: string | null
  roomName: string | null
  appointmentStart: string
  appointmentEnd: string | null
  paymentMethod: string | null
  status: AppointmentStatus
}

const rescheduleBase = (clinicId: string, appointmentId: string) =>
  `/api/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/reschedule`

export async function getRescheduleAvailableDates(
  clinicId: string,
  appointmentId: string,
  fromDate: string,
): Promise<string[]> {
  const response = await apiClient.get<ApiSuccessResponse<string[]>>(
    `${rescheduleBase(clinicId, appointmentId)}/available-dates`,
    { params: { fromDate } },
  )
  return response.data.data
}

export async function getRescheduleAvailableTimes(
  clinicId: string,
  appointmentId: string,
  date: string,
): Promise<string[]> {
  const response = await apiClient.get<ApiSuccessResponse<string[]>>(
    `${rescheduleBase(clinicId, appointmentId)}/available-times`,
    { params: { date } },
  )
  return response.data.data
}

export async function rescheduleAppointment(
  clinicId: string,
  appointmentId: string,
  appointmentStart: string,
  appointmentEnd: string,
): Promise<Appointment> {
  const response = await apiClient.put<ApiSuccessResponse<Appointment>>(
    rescheduleBase(clinicId, appointmentId),
    { appointmentStart, appointmentEnd },
  )
  return response.data.data
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
  status: 'confirmed' | 'checked_in' | 'completed' | 'cancelled',
  reason?: string,
): Promise<{ id: string; status: AppointmentStatus }> {
  const response = await apiClient.patch<
    ApiSuccessResponse<{ id: string; status: AppointmentStatus }>
  >(
    `/api/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/status`,
    {
      status,
      ...(reason ? { reason } : {}),
    },
  )

  return response.data.data
}
