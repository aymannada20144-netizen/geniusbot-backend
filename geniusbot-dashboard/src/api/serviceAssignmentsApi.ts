import { apiClient } from './apiClient'

export type ServiceAssignment = {
  id: string
  branch_id: string
  branch_name: string
  branch_city: string
  service_id: string
  service_name: string
  requires_doctor: boolean
  requires_room: boolean
  doctor_id: string | null
  doctor_name: string | null
  room_id: string | null
  room_number: string | null
  room_name: string | null
  is_default: boolean
  is_active: boolean
}

export type AssignmentOptions = {
  branches: Array<{ id: string; name: string; city: string }>
  services: Array<{
    id: string
    name: string
    requires_doctor: boolean
    requires_room: boolean
  }>
  doctors: Array<{ id: string; full_name: string }>
  rooms: Array<{ id: string; room_number: string; room_name: string }>
}

type Envelope<T> = { success: true; data: T }
const endpoint = (clinicId: string) =>
  `/api/clinics/${encodeURIComponent(clinicId)}/master-data/service-assignments`

export async function listServiceAssignments(clinicId: string) {
  return (await apiClient.get<Envelope<ServiceAssignment[]>>(endpoint(clinicId))).data.data
}

export async function getServiceAssignmentOptions(clinicId: string, branchId = '') {
  return (await apiClient.get<Envelope<AssignmentOptions>>(
    `${endpoint(clinicId)}/options`,
    { params: branchId ? { branchId } : undefined },
  )).data.data
}

export async function createServiceAssignment(
  clinicId: string,
  data: Record<string, unknown>,
) {
  return (await apiClient.post<Envelope<ServiceAssignment>>(endpoint(clinicId), data)).data.data
}

export async function updateServiceAssignment(
  clinicId: string,
  id: string,
  data: Record<string, unknown>,
) {
  return (await apiClient.patch<Envelope<ServiceAssignment>>(
    `${endpoint(clinicId)}/${encodeURIComponent(id)}`,
    data,
  )).data.data
}

export async function setServiceAssignmentActive(
  clinicId: string,
  id: string,
  active: boolean,
) {
  return (await apiClient.patch<Envelope<ServiceAssignment>>(
    `${endpoint(clinicId)}/${encodeURIComponent(id)}/status`,
    { is_active: active },
  )).data.data
}

export async function deleteServiceAssignment(clinicId: string, id: string) {
  await apiClient.delete(`${endpoint(clinicId)}/${encodeURIComponent(id)}`)
}
