import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getAppointments,
  updateAppointmentStatus,
} from '../../api/appointmentsApi'
import type {
  Appointment,
  AppointmentStatus,
} from '../../api/appointmentsApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { Button } from '../../components/ui/Button/Button'
import './AppointmentsPage.css'

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No show',
}

type StatusFilter = 'all' | AppointmentStatus
type DateFilter = 'all' | 'today' | 'tomorrow'

function formatDate(value: string): string {
  const date = new Date(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${day}/${month}/${date.getFullYear()}`
}

function formatTime(start: string, end: string | null): string {
  const formatter = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const startTime = formatter.format(new Date(start))

  return end
    ? `${startTime} – ${formatter.format(new Date(end))}`
    : startTime
}

function localDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

export function AppointmentsPage() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(
    () => new Set(),
  )
  const updatingIdsRef = useRef(new Set<string>())
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true

    getAppointments(user!.clinicId)
      .then((data) => {
        if (active) {
          setAppointments(data)
          setLoadError(null)
        }
      })
      .catch(() => {
        if (active) {
          setLoadError('Unable to load appointments.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [user])

  const filteredAppointments = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const requiredDate = dateFilter === 'today'
      ? localDateKey(today)
      : dateFilter === 'tomorrow'
        ? localDateKey(tomorrow)
        : null

    return appointments.filter((appointment) => {
      const matchesSearch = !normalizedSearch ||
        appointment.patientName.toLocaleLowerCase().includes(normalizedSearch) ||
        appointment.phoneNumber.includes(search.trim())
      const matchesStatus = statusFilter === 'all' ||
        appointment.status === statusFilter
      const matchesDate = requiredDate === null ||
        localDateKey(new Date(appointment.appointmentStart)) === requiredDate

      return matchesSearch && matchesStatus && matchesDate
    })
  }, [appointments, dateFilter, search, statusFilter])

  const summary = useMemo(() => ({
    pending: filteredAppointments.filter((item) => item.status === 'pending').length,
    confirmed: filteredAppointments.filter((item) => item.status === 'confirmed').length,
    checkedIn: filteredAppointments.filter((item) => item.status === 'checked_in').length,
    completed: filteredAppointments.filter((item) => item.status === 'completed').length,
    cancelled: filteredAppointments.filter((item) => item.status === 'cancelled').length,
    noShow: filteredAppointments.filter((item) => item.status === 'no_show').length,
  }), [filteredAppointments])

  async function changeStatus(
    appointmentId: string,
    status: 'confirmed' | 'checked_in' | 'completed' | 'cancelled',
  ) {
    if (updatingIdsRef.current.has(appointmentId)) return

    updatingIdsRef.current.add(appointmentId)
    setUpdatingIds(new Set(updatingIdsRef.current))
    setRowErrors((current) => ({ ...current, [appointmentId]: '' }))

    try {
      const updated = await updateAppointmentStatus(
        user!.clinicId,
        appointmentId,
        status,
      )
      setAppointments((current) => current.map((item) =>
        item.id === appointmentId
          ? { ...item, status: updated.status }
          : item,
      ))
    } catch {
      setRowErrors((current) => ({
        ...current,
        [appointmentId]: 'Update failed. Please try again.',
      }))
    } finally {
      updatingIdsRef.current.delete(appointmentId)
      setUpdatingIds(new Set(updatingIdsRef.current))
    }
  }

  return (
    <section className="appointments-page">
      <header className="appointments-page__heading">
        <div>
          <p className="appointments-page__eyebrow">Clinic schedule</p>
          <h2>Appointments</h2>
          <p>Review upcoming visits and keep appointment statuses current.</p>
        </div>
      </header>

      <div className="appointments-summary" aria-label="Appointment summary">
        {Object.entries(summary).map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      {!loading && !loadError && appointments.length > 0 && (
        <div className="appointments-toolbar">
          <label className="appointments-toolbar__search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="Patient name or phone"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="no_show">No show</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
            </select>
          </label>
        </div>
      )}

      {loading && (
        <div className="appointments-state" role="status">
          Loading appointments…
        </div>
      )}
      {!loading && loadError && (
        <div className="appointments-state appointments-state--error" role="alert">
          {loadError}
        </div>
      )}
      {!loading && !loadError && appointments.length === 0 && (
        <div className="appointments-state">No appointments found.</div>
      )}
      {!loading && !loadError && appointments.length > 0 && filteredAppointments.length === 0 && (
        <div className="appointments-state">No appointments match your search and filters.</div>
      )}

      {!loading && !loadError && filteredAppointments.length > 0 && (
        <div className="appointments-table-wrap">
          <table className="appointments-table">
            <thead>
              <tr><th>Patient</th><th>Phone</th><th>Service</th><th>Doctor</th><th>Room</th><th>Date</th><th>Time</th><th>Payment</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appointment) => {
                const updating = updatingIds.has(appointment.id)
                const canConfirm = appointment.status === 'pending'
                const canCheckIn = appointment.status === 'confirmed'
                const canComplete = appointment.status === 'checked_in'
                const canCancel = appointment.status === 'pending' ||
                  appointment.status === 'confirmed' ||
                  appointment.status === 'checked_in'

                return (
                  <tr key={appointment.id}>
                    <td data-label="Patient" title={appointment.patientName}><strong>{appointment.patientName}</strong></td>
                    <td data-label="Phone">{appointment.phoneNumber}</td>
                    <td data-label="Service" title={appointment.serviceName}>{appointment.serviceName}</td>
                    <td data-label="Doctor" title={appointment.doctorName ?? '—'}>{appointment.doctorName ?? '—'}</td>
                    <td data-label="Room" title={appointment.roomName ?? '—'}>{appointment.roomName ?? '—'}</td>
                    <td data-label="Date">{formatDate(appointment.appointmentStart)}</td>
                    <td data-label="Time">{formatTime(appointment.appointmentStart, appointment.appointmentEnd)}</td>
                    <td data-label="Payment" title={appointment.paymentMethod ?? '—'}>{appointment.paymentMethod ?? '—'}</td>
                    <td data-label="Status"><span className={`appointment-status appointment-status--${appointment.status}`}>{STATUS_LABELS[appointment.status]}</span></td>
                    <td data-label="Actions">
                      <div className="appointment-actions">
                        {canConfirm && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'confirmed')}>Confirm</Button>}
                        {canCheckIn && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'checked_in')}>Check In</Button>}
                        {canComplete && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'completed')}>Complete</Button>}
                        {canCancel && <Button size="sm" variant="danger" disabled={updating} onClick={() => changeStatus(appointment.id, 'cancelled')}>Cancel</Button>}
                      </div>
                      {rowErrors[appointment.id] && <p className="appointment-row-error" role="alert">{rowErrors[appointment.id]}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
