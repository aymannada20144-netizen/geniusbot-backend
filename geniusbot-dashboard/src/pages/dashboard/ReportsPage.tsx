import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { listMasterData, type MasterDataRecord } from '../../api/masterDataApi'
import {
  getAppointmentBreakdown,
  getAppointmentSummary,
  getAppointmentTrend,
  getConversationSummary,
  getPatientSummary,
  type ReportFilters,
} from '../../api/reportsApi'
import { useAuth } from '../../auth/hooks/useAuth'
import './ReportsPage.css'

type Preset = 'today' | 'yesterday' | 'thisWeek' | 'last7' | 'thisMonth' | 'custom'
type BreakdownGroup = 'city' | 'branch' | 'service' | 'doctor' | 'status' | 'source'
type DraftFilters = ReportFilters & { preset: Preset }

function dateParts(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function localDate(timezone: string) {
  const { year, month, day } = dateParts(timezone)
  return new Date(Date.UTC(year, month - 1, day))
}

function presetRange(preset: Preset, timezone: string) {
  const today = localDate(timezone)
  const from = new Date(today)
  const to = new Date(today)
  if (preset === 'yesterday') {
    from.setUTCDate(from.getUTCDate() - 1)
    to.setUTCDate(to.getUTCDate() - 1)
  } else if (preset === 'last7') {
    from.setUTCDate(from.getUTCDate() - 6)
  } else if (preset === 'thisMonth') {
    from.setUTCDate(1)
  } else if (preset === 'thisWeek') {
    const daysSinceSaturday = (from.getUTCDay() + 1) % 7
    from.setUTCDate(from.getUTCDate() - daysSinceSaturday)
    const thursday = new Date(from)
    thursday.setUTCDate(thursday.getUTCDate() + 5)
    if (to > thursday) to.setTime(thursday.getTime())
  }
  return { from: isoDate(from), to: isoDate(to) }
}

function stringValue(record: MasterDataRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function appliedFilters(draft: DraftFilters): ReportFilters {
  return Object.fromEntries(
    Object.entries({
      from: draft.from,
      to: draft.to,
      branchId: draft.branchId,
      city: draft.city,
      serviceId: draft.serviceId,
      doctorId: draft.doctorId,
      status: draft.status,
    }).filter(([, value]) => value),
  ) as ReportFilters
}

function SectionState({
  loading, error, empty, retry, children,
}: {
  loading: boolean
  error: Error | null
  empty?: boolean
  retry: () => void
  children: React.ReactNode
}) {
  if (loading) return <div className="reports-state" role="status">Loading report…</div>
  if (error) return <div className="reports-state reports-state--error" role="alert"><strong>This report could not be loaded.</strong><span>{error.message}</span><button className="reports-retry" onClick={retry}>Retry</button></div>
  if (empty) return <div className="reports-state">No data for the selected period.</div>
  return children
}

export function ReportsPage() {
  const { user } = useAuth()
  const clinicId = user?.clinicId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const masterData = useQueries({
    queries: ['clinics', 'branches', 'services', 'doctors'].map((resource) => ({
      queryKey: ['reports-options', clinicId, resource],
      queryFn: () => listMasterData(clinicId, resource),
      enabled: Boolean(clinicId),
    })),
  })
  const clinic = masterData[0].data?.find((item) => item.id === clinicId)
  const timezone = stringValue(clinic ?? { id: '' }, 'timezone') || 'Asia/Riyadh'
  const initialPreset = (searchParams.get('preset') as Preset) || 'last7'
  const initialRange = presetRange(initialPreset, timezone)
  const fromUrl = searchParams.get('from')
  const toUrl = searchParams.get('to')
  const initial: DraftFilters = {
    preset: initialPreset,
    from: fromUrl || initialRange.from,
    to: toUrl || initialRange.to,
    city: searchParams.get('city') || undefined,
    branchId: searchParams.get('branchId') || undefined,
    serviceId: searchParams.get('serviceId') || undefined,
    doctorId: searchParams.get('doctorId') || undefined,
    status: searchParams.get('status') || undefined,
  }
  const [draft, setDraft] = useState<DraftFilters>(initial)
  const [applied, setApplied] = useState<ReportFilters>(() => appliedFilters(initial))
  const [breakdownGroup, setBreakdownGroup] = useState<BreakdownGroup>('branch')
  const branches = masterData[1].data ?? []
  const services = masterData[2].data ?? []
  const doctors = masterData[3].data ?? []
  const cities = [...new Set(branches.map((item) => stringValue(item, 'city')).filter(Boolean))]
  const visibleBranches = draft.city
    ? branches.filter((item) => stringValue(item, 'city') === draft.city)
    : branches
  const isBranchManager = user?.role === 'branch_manager'
  const fixedBranch = branches.find((item) => item.id === user?.branchId)
  const effectiveApplied = isBranchManager && user?.branchId
    ? { ...applied, branchId: user.branchId, city: undefined }
    : applied
  const key = ['reports', clinicId, effectiveApplied]
  const summary = useQuery({
    queryKey: [...key, 'summary'],
    queryFn: () => getAppointmentSummary(clinicId, effectiveApplied),
    enabled: Boolean(clinicId),
  })
  const trend = useQuery({
    queryKey: [...key, 'trend', 'day'],
    queryFn: () => getAppointmentTrend(clinicId, effectiveApplied),
    enabled: Boolean(clinicId),
  })
  const breakdown = useQuery({
    queryKey: [...key, 'breakdown', breakdownGroup],
    queryFn: () => getAppointmentBreakdown(clinicId, effectiveApplied, breakdownGroup),
    enabled: Boolean(clinicId),
  })
  const patients = useQuery({
    queryKey: [...key, 'patients'],
    queryFn: () => getPatientSummary(clinicId, effectiveApplied),
    enabled: Boolean(clinicId),
  })
  const conversations = useQuery({
    queryKey: [...key, 'conversations'],
    queryFn: () => getConversationSummary(clinicId, effectiveApplied),
    enabled: Boolean(clinicId),
  })

  function changePreset(preset: Preset) {
    if (preset === 'custom') setDraft((current) => ({ ...current, preset }))
    else setDraft((current) => ({ ...current, preset, ...presetRange(preset, timezone) }))
  }

  function apply() {
    const { preset } = draft
    const cleaned = appliedFilters(draft)
    setApplied(cleaned)
    setSearchParams({ preset, ...cleaned })
  }

  function reset() {
    const range = presetRange('last7', timezone)
    const next: DraftFilters = { preset: 'last7', ...range }
    setDraft(next)
    setApplied(range)
    setSearchParams({ preset: 'last7', ...range })
  }

  const maxTrend = Math.max(
    0,
    ...(trend.data?.data.flatMap((point) => [point.appointments, point.newBookings]) ?? []),
  )
  const summaryCards = summary.data ? [
    ['Total appointments', summary.data.data.total],
    ['Pending', summary.data.data.pending],
    ['Confirmed', summary.data.data.confirmed],
    ['Checked in', summary.data.data.checkedIn],
    ['Completed', summary.data.data.completed],
    ['Cancelled', summary.data.data.cancelled],
    ['No-show', summary.data.data.noShow],
    ['Rescheduled (excluded)', summary.data.data.rescheduled],
    ['Completion rate', summary.data.data.completionRate === null ? 'No data' : `${summary.data.data.completionRate}%`],
  ] : []
  const patientCards = patients.data ? [
    ['New patient records', patients.data.data.newPatientRecords],
    ['Patients with appointments', patients.data.data.patientsWithAppointments],
    ['First-time booked patients', patients.data.data.firstTimeBookedPatients],
    ['Returning booked patients', patients.data.data.returningBookedPatients],
  ] : []
  const conversationCards = conversations.data ? [
    ['Total conversations', conversations.data.data.totalConversations],
    ['Human takeovers', conversations.data.data.humanTakeovers],
    ['AI-present conversations', conversations.data.data.aiPresentConversations],
  ] : []

  return (
    <section className="reports-page">
      <header className="reports-header">
        <p>Insights</p>
        <h2>Operational reports</h2>
        <p>Appointment, patient, and conversation activity in {timezone}. Revenue and patient details are not included.</p>
      </header>

      <form className="reports-filters" onSubmit={(event) => { event.preventDefault(); apply() }}>
        <div className="reports-filters__grid">
          <label>Period preset<select value={draft.preset} onChange={(event) => changePreset(event.target.value as Preset)}>
            <option value="today">Today</option><option value="yesterday">Yesterday</option>
            <option value="thisWeek">This Week (Sat–Thu)</option><option value="last7">Last 7 Days</option>
            <option value="thisMonth">This Month</option><option value="custom">Custom Range</option>
          </select></label>
          <label>From<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, preset: 'custom', from: event.target.value })} /></label>
          <label>To<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, preset: 'custom', to: event.target.value })} /></label>
          {isBranchManager ? <div className="reports-fixed-scope"><strong>Branch scope</strong><br />{stringValue(fixedBranch ?? { id: '' }, 'name') || 'Assigned branch'}</div> : <>
            <label>City<select value={draft.city ?? ''} onChange={(event) => setDraft({ ...draft, city: event.target.value || undefined, branchId: undefined })}><option value="">All cities</option>{cities.map((city) => <option key={city}>{city}</option>)}</select></label>
            <label>Branch<select value={draft.branchId ?? ''} onChange={(event) => setDraft({ ...draft, branchId: event.target.value || undefined })}><option value="">All branches</option>{visibleBranches.map((item) => <option key={item.id} value={item.id}>{stringValue(item, 'name')}</option>)}</select></label>
          </>}
          <label>Service<select value={draft.serviceId ?? ''} onChange={(event) => setDraft({ ...draft, serviceId: event.target.value || undefined })}><option value="">All services</option>{services.map((item) => <option key={item.id} value={item.id}>{stringValue(item, 'name')}</option>)}</select></label>
          <label>Doctor<select value={draft.doctorId ?? ''} onChange={(event) => setDraft({ ...draft, doctorId: event.target.value || undefined })}><option value="">All doctors</option>{doctors.map((item) => <option key={item.id} value={item.id}>{stringValue(item, 'full_name')}</option>)}</select></label>
          <label>Status<select value={draft.status ?? ''} onChange={(event) => setDraft({ ...draft, status: event.target.value || undefined })}><option value="">All statuses</option>{['pending','confirmed','checked_in','completed','cancelled','no_show','rescheduled'].map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="reports-actions"><button type="submit">Apply filters</button><button type="button" onClick={reset}>Reset</button></div>
      </form>

      <section aria-labelledby="appointment-summary-title">
        <h3 id="appointment-summary-title">Appointment summary</h3>
        <SectionState loading={summary.isLoading} error={summary.error} retry={() => summary.refetch()}>
          <div className="reports-summary">{summaryCards.map(([label, value]) => <article className="reports-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        </SectionState>
      </section>

      <section className="reports-panel" aria-labelledby="trend-title">
        <h3 id="trend-title">Appointments and new bookings trend</h3>
        <p>Appointments use service date; new bookings use record creation date.</p>
        <SectionState loading={trend.isLoading} error={trend.error} empty={maxTrend === 0} retry={() => trend.refetch()}>
          <div className="reports-legend"><span>Appointments</span><span>New bookings</span></div>
          <div className="reports-chart" role="img" aria-label="Daily appointment and new booking counts">
            {trend.data?.data.map((point) => <div className="reports-bar" key={point.periodStart}>
              <div className="reports-bar__columns"><i className="reports-bar__appointments" style={{ height: `${maxTrend ? point.appointments / maxTrend * 100 : 0}%` }} title={`${point.appointments} appointments`} /><i className="reports-bar__bookings" style={{ height: `${maxTrend ? point.newBookings / maxTrend * 100 : 0}%` }} title={`${point.newBookings} new bookings`} /></div>
              <small>{point.periodStart.slice(5)}</small><span className="sr-only">{point.periodStart}: {point.appointments} appointments, {point.newBookings} new bookings</span>
            </div>)}
          </div>
        </SectionState>
      </section>

      <section className="reports-panel" aria-labelledby="breakdown-title">
        <h3 id="breakdown-title">Appointment breakdown</h3>
        <label>Group by <select value={breakdownGroup} onChange={(event) => setBreakdownGroup(event.target.value as BreakdownGroup)}>
          <option value="city">City</option><option value="branch">Branch</option>
          <option value="service">Service</option><option value="doctor">Doctor</option>
          <option value="status">Status</option><option value="source">Source</option>
        </select></label>
        <SectionState loading={breakdown.isLoading} error={breakdown.error} empty={breakdown.data?.data.length === 0} retry={() => breakdown.refetch()}>
          <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>{breakdownGroup}</th><th>Total</th><th>Checked in</th><th>Completed</th><th>Cancelled</th><th>No-show</th><th>Rescheduled</th><th>Completion rate</th></tr></thead><tbody>{breakdown.data?.data.map((row) => <tr key={`${row.resourceId}-${row.label}`}><td>{row.label}</td><td>{row.count}</td><td>{row.checkedIn}</td><td>{row.completed}</td><td>{row.cancelled}</td><td>{row.noShow}</td><td>{row.rescheduled}</td><td title="Completed divided by total, excluding rescheduled">{row.completionRate === null ? 'No data' : `${row.completionRate}%`}</td></tr>)}</tbody></table></div>
        </SectionState>
      </section>

      <section className="reports-panel" aria-labelledby="patient-title">
        <h3 id="patient-title">Patient summary</h3>
        <SectionState loading={patients.isLoading} error={patients.error} retry={() => patients.refetch()}>
          <div className="reports-mini-grid">{patientCards.map(([label, value]) => <article className="reports-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        </SectionState>
      </section>

      <section className="reports-panel" aria-labelledby="conversation-title">
        <h3 id="conversation-title">Conversation operations</h3>
        <SectionState loading={conversations.isLoading} error={conversations.error} retry={() => conversations.refetch()}>
          <div className="reports-mini-grid">{conversationCards.map(([label, value]) => <article className="reports-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        </SectionState>
      </section>
    </section>
  )
}
