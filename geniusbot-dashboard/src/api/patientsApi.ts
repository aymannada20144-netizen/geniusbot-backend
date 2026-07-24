import { apiClient } from './apiClient'
import type { ApiSuccessResponse } from './apiTypes'

export type HandlingMode = 'AI_HANDLING' | 'HUMAN_HANDLING'
export interface PatientListItem {
  id: string; fullName: string; phoneNumber: string; createdAt: string
  email: string | null; isActive: boolean; updatedAt: string
  totalAppointments: number; latestAppointmentDate: string | null
  latestAppointmentStatus: string | null; hasUpcomingAppointment: boolean
  conversationId: string | null; handlingMode: HandlingMode | null
}
export interface PatientRecord {
  id: string; clinic_id: string; full_name: string | null
  phone_number: string; whatsapp_id: string | null; email: string | null
  gender: 'male' | 'female' | null
  birth_date: string | null; source: string | null; notes: string | null
  first_seen_at: string; last_seen_at: string; created_at: string
  updated_at: string; is_active: boolean
}
export interface PatientInput {
  full_name?: string; phone_number?: string; whatsapp_id?: string | null
  email?: string | null; gender?: PatientRecord['gender']
  birth_date?: string | null; notes?: string | null; is_active?: boolean
}
export interface PatientAppointment {
  id: string; appointment_start: string; appointment_end: string
  status: string; service_name: string | null; doctor_name: string | null
  branch_name: string | null
}
export interface ConversationMessage {
  id: string; senderType: 'patient' | 'bot' | 'staff' | 'system'
  messageText: string; createdAt: string
}
export interface PatientConversation {
  patient: { id: string; fullName: string; phoneNumber: string }
  conversation: { id: string; status: string } | null
  ownership: HandlingMode | null
  messages: ConversationMessage[]
}

const base = (clinicId: string) => `/api/clinics/${encodeURIComponent(clinicId)}`
export async function getPatients(clinicId: string) {
  const response = await apiClient.get<ApiSuccessResponse<PatientListItem[]>>(`${base(clinicId)}/patients`)
  return response.data.data
}
export async function getPatient(clinicId: string, patientId: string) {
  const response = await apiClient.get<ApiSuccessResponse<PatientRecord>>(
    `${base(clinicId)}/patients/${encodeURIComponent(patientId)}`,
  )
  return response.data.data
}
export async function createPatient(clinicId: string, input: PatientInput) {
  const response = await apiClient.post<ApiSuccessResponse<PatientRecord>>(
    `${base(clinicId)}/patients`,
    input,
  )
  return response.data.data
}
export async function updatePatient(clinicId: string, patientId: string, input: PatientInput) {
  const response = await apiClient.patch<ApiSuccessResponse<PatientRecord>>(
    `${base(clinicId)}/patients/${encodeURIComponent(patientId)}`,
    input,
  )
  return response.data.data
}
export async function setPatientActive(clinicId: string, patientId: string, isActive: boolean) {
  const response = await apiClient.patch<ApiSuccessResponse<PatientRecord>>(
    `${base(clinicId)}/patients/${encodeURIComponent(patientId)}/${isActive ? 'reactivate' : 'deactivate'}`,
  )
  return response.data.data
}
export async function getPatientAppointments(clinicId: string, patientId: string) {
  const response = await apiClient.get<ApiSuccessResponse<PatientAppointment[]>>(
    `${base(clinicId)}/patients/${encodeURIComponent(patientId)}/appointments`,
  )
  return response.data.data
}
export async function getPatientConversation(clinicId: string, patientId: string) {
  const response = await apiClient.get<ApiSuccessResponse<PatientConversation>>(`${base(clinicId)}/patients/${encodeURIComponent(patientId)}/conversation`)
  return response.data.data
}
export async function setConversationOwnership(clinicId: string, conversationId: string, action: 'takeover' | 'return-to-shaden') {
  const response = await apiClient.patch<ApiSuccessResponse<{ id: string; ownership: HandlingMode }>>(`${base(clinicId)}/conversations/${encodeURIComponent(conversationId)}/${action}`)
  return response.data.data
}
export async function startHumanConversation(clinicId: string, patientId: string) {
  const response = await apiClient.patch<ApiSuccessResponse<{ id: string; status: string; ownership: HandlingMode }>>(`${base(clinicId)}/patients/${encodeURIComponent(patientId)}/takeover`)
  return response.data.data
}
export async function sendHumanMessage(clinicId: string, conversationId: string, body: string) {
  const response = await apiClient.post<ApiSuccessResponse<{ message: ConversationMessage }>>(`${base(clinicId)}/conversations/${encodeURIComponent(conversationId)}/messages`, { body })
  return response.data.data.message
}
