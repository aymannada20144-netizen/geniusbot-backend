import { apiClient } from './apiClient'

export type ReportFilters = {
  from: string
  to: string
  branchId?: string
  city?: string
  serviceId?: string
  doctorId?: string
  status?: string
}

export type ReportMeta = ReportFilters & {
  timezone: string
  filters: Omit<ReportFilters, 'from' | 'to'>
  groupBy?: string
}

export type AppointmentSummary = {
  total: number
  pending: number
  confirmed: number
  checkedIn: number
  completed: number
  cancelled: number
  noShow: number
  rescheduled: number
  completionRate: number | null
  cancellationRate: number | null
  noShowRate: number | null
}

export type TrendPoint = {
  periodStart: string
  appointments: number
  newBookings: number
}

export type BreakdownRow = {
  resourceId: string | null
  label: string
  count: number
  checkedIn: number
  completed: number
  cancelled: number
  noShow: number
  rescheduled: number
  completionRate: number | null
  cancellationRate: number | null
  noShowRate: number | null
}

export type PatientSummary = {
  newPatientRecords: number
  patientsWithAppointments: number
  firstTimeBookedPatients: number
  returningBookedPatients: number
}

export type ConversationSummary = {
  totalConversations: number
  humanTakeovers: number
  aiPresentConversations: number
}

type Envelope<T> = { success: true; data: T; meta: ReportMeta }

const COMMON_FILTER_KEYS: readonly (keyof ReportFilters)[] = [
  'from',
  'to',
  'branchId',
  'city',
  'serviceId',
  'doctorId',
  'status',
]

function commonParameters(filters: ReportFilters): Record<string, string> {
  return Object.fromEntries(
    COMMON_FILTER_KEYS
      .map((key) => [key, filters[key]])
      .filter((entry): entry is [keyof ReportFilters, string] =>
        typeof entry[1] === 'string' && entry[1].length > 0),
  )
}

function summaryParameters(filters: ReportFilters) {
  return commonParameters(filters)
}

function trendParameters(filters: ReportFilters) {
  return { ...commonParameters(filters), groupBy: 'day' }
}

function breakdownParameters(filters: ReportFilters, groupBy: string) {
  return { ...commonParameters(filters), groupBy }
}

function patientParameters(filters: ReportFilters) {
  return commonParameters(filters)
}

function conversationParameters(filters: ReportFilters) {
  return commonParameters(filters)
}

async function get<T>(
  clinicId: string,
  path: string,
  params: Record<string, string>,
): Promise<Envelope<T>> {
  const response = await apiClient.get<Envelope<T>>(
    `/api/clinics/${clinicId}/reports/${path}`,
    { params },
  )
  return response.data
}

export const getAppointmentSummary = (clinicId: string, filters: ReportFilters) =>
  get<AppointmentSummary>(
    clinicId,
    'appointments/summary',
    summaryParameters(filters),
  )

export const getAppointmentTrend = (clinicId: string, filters: ReportFilters) =>
  get<TrendPoint[]>(
    clinicId,
    'appointments/trend',
    trendParameters(filters),
  )

export const getAppointmentBreakdown = (
  clinicId: string,
  filters: ReportFilters,
  groupBy: string,
) => get<BreakdownRow[]>(
  clinicId,
  'appointments/breakdown',
  breakdownParameters(filters, groupBy),
)

export const getPatientSummary = (clinicId: string, filters: ReportFilters) =>
  get<PatientSummary>(
    clinicId,
    'patients/summary',
    patientParameters(filters),
  )

export const getConversationSummary = (clinicId: string, filters: ReportFilters) =>
  get<ConversationSummary>(
    clinicId,
    'conversations/summary',
    conversationParameters(filters),
  )
