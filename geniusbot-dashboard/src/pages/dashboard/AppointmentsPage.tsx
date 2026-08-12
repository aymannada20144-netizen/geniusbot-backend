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
  const [cancellationTarget, setCancellationTarget] = useState<Appointment | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationError, setCancellationError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

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

  function openCancellationDialog(appointment: Appointment) {
    setCancellationTarget(appointment)
    setCancellationReason('')
    setCancellationError(null)
    setFeedback(null)
  }

  function closeCancellationDialog() {
    if (cancellationTarget && updatingIdsRef.current.has(cancellationTarget.id)) {
      return
    }
    setCancellationTarget(null)
    setCancellationReason('')
    setCancellationError(null)
  }

  async function confirmCancellation() {
    if (!cancellationTarget || updatingIdsRef.current.has(cancellationTarget.id)) {
      return
    }

    const appointmentId = cancellationTarget.id
    const reason = cancellationReason.trim()
    updatingIdsRef.current.add(appointmentId)
    setUpdatingIds(new Set(updatingIdsRef.current))
    setCancellationError(null)

    try {
      const updated = await updateAppointmentStatus(
        user!.clinicId,
        appointmentId,
        'cancelled',
        reason || undefined,
      )
      setAppointments((current) => current.map((item) =>
        item.id === appointmentId
          ? { ...item, status: updated.status }
          : item,
      ))
      setCancellationTarget(null)
      setCancellationReason('')
      setFeedback('Appointment cancelled successfully.')
    } catch {
      setCancellationError('Cancellation failed. Please try again.')
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

      {feedback && (
        <div className="appointments-feedback appointments-feedback--success" role="status">
          {feedback}
        </div>
      )}

      <div className="appointments-summary" aria-label="Appointment summary">
        {Object.entries(summary).map(([label, value]) => (
          <article key={label}>
            <span data-i18n-domain-value>{label}</span>
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
                    <td data-label="Patient" title={appointment.patientName} data-i18n-ignore><strong>{appointment.patientName}</strong></td>
                    <td data-label="Phone" data-i18n-ignore>{appointment.phoneNumber}</td>
                    <td data-label="Service" title={appointment.serviceName} data-i18n-ignore>{appointment.serviceName}</td>
                    <td data-label="Doctor" title={appointment.doctorName ?? '—'} data-i18n-ignore>{appointment.doctorName ?? '—'}</td>
                    <td data-label="Room" title={appointment.roomName ?? '—'} data-i18n-ignore>{appointment.roomName ?? '—'}</td>
                    <td data-label="Date">{formatDate(appointment.appointmentStart)}</td>
                    <td data-label="Time">{formatTime(appointment.appointmentStart, appointment.appointmentEnd)}</td>
                    <td data-label="Payment" title={appointment.paymentMethod ?? '—'} data-i18n-ignore>{appointment.paymentMethod ?? '—'}</td>
                    <td data-label="Status"><span className={`appointment-status appointment-status--${appointment.status}`}>{STATUS_LABELS[appointment.status]}</span></td>
                    <td data-label="Actions">
                      <div className="appointment-actions">
                        {canConfirm && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'confirmed')}>Confirm</Button>}
                        {canCheckIn && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'checked_in')}>Check In</Button>}
                        {canComplete && <Button size="sm" isLoading={updating} disabled={updating} onClick={() => changeStatus(appointment.id, 'completed')}>Complete</Button>}
                        {canCancel && <Button size="sm" variant="danger" disabled={updating} onClick={() => openCancellationDialog(appointment)}>Cancel</Button>}
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


      {cancellationTarget && (
        <div className="appointment-cancel-dialog__backdrop">
          <section
            className="appointment-cancel-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-cancel-dialog-title"
          >
            <header>
              <h3 id="appointment-cancel-dialog-title">Cancel appointment?</h3>
              <p>
                This will cancel the appointment for {cancellationTarget.patientName}.
                Pending reminders will also be cancelled.
              </p>
            </header>

            <label htmlFor="appointment-cancellation-reason">
              Cancellation reason <span>(optional)</span>
            </label>
            <textarea
              id="appointment-cancellation-reason"
              value={cancellationReason}
              rows={4}
              maxLength={1000}
              placeholder="Add a reason for this cancellation"
              disabled={updatingIds.has(cancellationTarget.id)}
              onChange={(event) => setCancellationReason(event.target.value)}
            />

            {cancellationError && (
              <p className="appointment-cancel-dialog__error" role="alert">
                {cancellationError}
              </p>
            )}

            <footer>
              <Button
                variant="secondary"
                disabled={updatingIds.has(cancellationTarget.id)}
                onClick={closeCancellationDialog}
              >
                Back
              </Button>
              <Button
                variant="danger"
                isLoading={updatingIds.has(cancellationTarget.id)}
                loadingText="Cancelling..."
                onClick={confirmCancellation}
              >
                Confirm Cancellation
              </Button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
