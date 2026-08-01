import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { createPatient, deletePatient, getPatient, getPatientAppointments, getPatients, setPatientActive, updatePatient } from '../../api/patientsApi'
import type { PatientInput } from '../../api/patientsApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { normalizeSaudiMobile, saudiMobileHint } from '../../utils/saudiMobile'
import './PatientsPage.css'
import './PatientsManagement.css'

type HandlingFilter = 'all' | 'AI_HANDLING' | 'HUMAN_HANDLING' | 'NO_CONVERSATION'
type StatusFilter = 'all' | 'active' | 'inactive'
const emptyForm: PatientInput = { full_name: '', phone_number: '', whatsapp_id: '', email: '', gender: null, birth_date: '', notes: '', is_active: true }

export function PatientsPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [handling, setHandling] = useState<HandlingFilter>('all')
  const [patientStatus, setPatientStatus] = useState<StatusFilter>('all')
  const [feedback, setFeedback] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<PatientInput>(emptyForm)
  const [phoneErrors, setPhoneErrors] = useState<{ phone?: string; whatsapp?: string }>({})
  const patientsQuery = useQuery({ queryKey: ['patients', clinicId], queryFn: () => getPatients(clinicId) })
  const patientQuery = useQuery({ queryKey: ['patient', clinicId, selectedId], queryFn: () => getPatient(clinicId, selectedId!), enabled: Boolean(selectedId) })
  const appointmentsQuery = useQuery({ queryKey: ['patient-appointments', clinicId, selectedId], queryFn: () => getPatientAppointments(clinicId, selectedId!), enabled: Boolean(selectedId) })
  const save = useMutation({
    mutationFn: (payload: PatientInput) => creating ? createPatient(clinicId, payload) : updatePatient(clinicId, selectedId!, payload),
    onSuccess: async (patient) => {
      await queryClient.invalidateQueries({ queryKey: ['patients', clinicId] })
      queryClient.setQueryData(['patient', clinicId, patient.id], patient)
      setSelectedId(patient.id); setCreating(false); setEditing(false)
      setFeedback('Patient saved successfully.')
    },
  })
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPatientActive(clinicId, id, active),
    onSuccess: async (patient) => {
      await queryClient.invalidateQueries({ queryKey: ['patients', clinicId] })
      queryClient.setQueryData(['patient', clinicId, patient.id], patient)
      setFeedback(patient.is_active ? 'Patient reactivated successfully.' : 'Patient deactivated successfully. History was preserved.')
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deletePatient(clinicId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients', clinicId] })
      setSelectedId(null)
      setFeedback('Unused patient deleted successfully.')
    },
  })
  const patients = useMemo(
    () => patientsQuery.data ?? [],
    [patientsQuery.data],
  )
  const filtered = useMemo(() => patients.filter((patient) => {
    const term = search.trim().toLowerCase()
    const matches = !term || patient.fullName.toLowerCase().includes(term) || patient.phoneNumber.includes(search.trim()) || patient.email?.toLowerCase().includes(term)
    const mode = patient.handlingMode ?? 'NO_CONVERSATION'
    const matchesStatus = patientStatus === 'all' || (patientStatus === 'active' ? patient.isActive : !patient.isActive)
    return matches && matchesStatus && (handling === 'all' || mode === handling)
  }), [patients, search, handling, patientStatus])
  const now = new Date()
  const stats = {
    total: patients.length,
    newThisMonth: patients.filter((patient) => { const date = new Date(patient.createdAt); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() }).length,
    returning: patients.filter((patient) => patient.totalAppointments > 1).length,
    upcoming: patients.filter((patient) => patient.hasUpcomingAppointment).length,
  }
  function beginCreate() { setCreating(true); setEditing(true); setSelectedId(null); setForm({ ...emptyForm }); setPhoneErrors({}) }
  function beginEdit() {
    const patient = patientQuery.data
    if (!patient) return
    setForm({ full_name: patient.full_name ?? '', phone_number: patient.phone_number, whatsapp_id: patient.whatsapp_id ?? '', email: patient.email ?? '', gender: patient.gender, birth_date: patient.birth_date ?? '', notes: patient.notes ?? '', is_active: patient.is_active })
    setPhoneErrors({})
    setEditing(true)
  }
  function close() { setSelectedId(null); setCreating(false); setEditing(false) }
  function submit(event: FormEvent) {
    event.preventDefault()
    const phone = normalizeSaudiMobile(form.phone_number ?? '')
    const whatsapp = normalizeSaudiMobile(form.whatsapp_id ?? '', true)
    const errors = {
      phone: phone ? undefined : saudiMobileHint,
      whatsapp: form.whatsapp_id && !whatsapp ? saudiMobileHint : undefined,
    }
    setPhoneErrors(errors)
    if (errors.phone || errors.whatsapp) return
    const normalizedForm = { ...form, phone_number: phone!, whatsapp_id: whatsapp }
    if (!creating && patientQuery.data && phone !== patientQuery.data.phone_number &&
        !window.confirm('The phone number identifies this patient in WhatsApp. Save this phone change?')) return
    setForm(normalizedForm)
    save.mutate(normalizedForm)
  }

  return <section className="patients-page">
    <header className="patients-page__header"><div><p>Patient management</p><h2>Patients</h2><span>Manage patient records and continue WhatsApp conversations.</span></div><button className="patients-primary" onClick={beginCreate}>Add Patient</button></header>
    <div className="patients-stats">{Object.entries(stats).map(([key, value]) => <article key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></article>)}</div>
    {feedback && <div role="status">{feedback}</div>}
    {(status.isError || remove.isError) && <div className="patients-state patients-state--error" role="alert">{(status.error ?? remove.error)?.message}</div>}
    <div className="patients-toolbar"><input type="search" aria-label="Search patients" placeholder="Search name, phone, or email" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by status" value={patientStatus} onChange={(event) => setPatientStatus(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select aria-label="Filter by handling" value={handling} onChange={(event) => setHandling(event.target.value as HandlingFilter)}><option value="all">All handling</option><option value="AI_HANDLING">AI Handling</option><option value="HUMAN_HANDLING">Human Handling</option><option value="NO_CONVERSATION">No Conversation</option></select></div>
    {patientsQuery.isLoading && <div className="patients-state">Loading patients…</div>}
    {patientsQuery.isError && <div className="patients-state patients-state--error">Unable to load patients. <button onClick={() => patientsQuery.refetch()}>Retry</button></div>}
    {!patientsQuery.isLoading && !patientsQuery.isError && patients.length === 0 && <div className="patients-state">No patients found. Add the first patient to begin.</div>}
    {!patientsQuery.isLoading && !patientsQuery.isError && patients.length > 0 && filtered.length === 0 && <div className="patients-state">No patients match your search and filter.</div>}
    {filtered.length > 0 && <div className="patients-table-wrap"><table className="patients-table"><thead><tr><th>Patient</th><th>Phone</th><th>Status</th><th>Appointments</th><th>Last visit</th><th>Handling</th><th>Actions</th></tr></thead><tbody>{filtered.map((patient) => {
      const mode = patient.handlingMode ?? 'NO_CONVERSATION'
      const label = mode === 'AI_HANDLING' ? 'AI Handling' : mode === 'HUMAN_HANDLING' ? 'Human Handling' : 'No Conversation'
      return <tr key={patient.id}><td>{patient.fullName}</td><td>{patient.phoneNumber}</td><td><span className={`patient-status patient-status--${patient.isActive ? 'active' : 'inactive'}`}>{patient.isActive ? 'Active' : 'Inactive'}</span></td><td>{patient.totalAppointments}</td><td>{patient.latestAppointmentDate ? new Date(patient.latestAppointmentDate).toLocaleDateString('en-GB') : '—'}</td><td><span className={`handling-badge handling-badge--${mode === 'AI_HANDLING' ? 'ai' : mode === 'HUMAN_HANDLING' ? 'human' : 'none'}`}>{label}</span></td><td className="patients-actions"><button onClick={() => setSelectedId(patient.id)}>View / Edit</button><button disabled={status.isPending} onClick={() => window.confirm(patient.isActive ? 'Deactivate this patient? Their record and history will be preserved.' : 'Reactivate this patient?') && status.mutate({ id: patient.id, active: !patient.isActive })}>{patient.isActive ? 'Deactivate' : 'Reactivate'}</button><button className="patients-danger" disabled={remove.isPending} onClick={() => window.confirm('Permanently delete this patient? This is allowed only when no historical or operational records exist.') && remove.mutate(patient.id)}>Delete</button><Link className="patients-open" to={`/dashboard/patients/${patient.id}/conversation`}>Open Conversation</Link></td></tr>
    })}</tbody></table></div>}
    {(selectedId || creating) && <div className="patient-modal" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="patient-dialog" role="dialog" aria-modal="true" aria-labelledby="patient-dialog-title">
      <header><div><p>{creating ? 'New patient' : 'Patient record'}</p><h3 id="patient-dialog-title">{creating ? 'Add Patient' : patientQuery.data?.full_name ?? 'Patient details'}</h3></div><button type="button" aria-label="Close" onClick={close}>×</button></header>
      {selectedId && patientQuery.isLoading && <div className="patients-state">Loading patient…</div>}
      {!editing && patientQuery.data && <div className="patient-details">
        <dl><div><dt>Phone</dt><dd>{patientQuery.data.phone_number}</dd></div><div><dt>WhatsApp</dt><dd>{patientQuery.data.whatsapp_id ?? '—'}</dd></div><div><dt>Email</dt><dd>{patientQuery.data.email ?? '—'}</dd></div><div><dt>Gender</dt><dd>{patientQuery.data.gender ?? '—'}</dd></div><div><dt>Birth date</dt><dd>{patientQuery.data.birth_date ?? '—'}</dd></div><div><dt>Status</dt><dd>{patientQuery.data.is_active ? 'Active' : 'Inactive'}</dd></div><div><dt>First seen</dt><dd>{new Date(patientQuery.data.first_seen_at).toLocaleString()}</dd></div><div><dt>Last seen</dt><dd>{new Date(patientQuery.data.last_seen_at).toLocaleString()}</dd></div></dl>
        {patientQuery.data.notes && <div><strong>Notes</strong><p>{patientQuery.data.notes}</p></div>}
        <section><h4>Appointment history</h4>{appointmentsQuery.isLoading ? <p>Loading appointments…</p> : appointmentsQuery.data?.length ? <ul className="patient-appointments">{appointmentsQuery.data.map((appointment) => <li key={appointment.id}><strong>{appointment.service_name ?? 'Appointment'}</strong><span>{new Date(appointment.appointment_start).toLocaleString()} · {appointment.status}</span><small>{appointment.doctor_name ?? 'No doctor'} · {appointment.branch_name ?? 'No branch'}</small></li>)}</ul> : <p>No appointments recorded.</p>}</section>
        <div className="patient-dialog__actions"><button onClick={beginEdit}>Edit</button><button disabled={status.isPending} onClick={() => window.confirm(patientQuery.data!.is_active ? 'Deactivate this patient? Their record and history will be preserved.' : 'Reactivate this patient?') && status.mutate({ id: patientQuery.data!.id, active: !patientQuery.data!.is_active })}>{patientQuery.data.is_active ? 'Deactivate' : 'Reactivate'}</button><button className="patients-danger" disabled={remove.isPending} onClick={() => window.confirm('Permanently delete this patient? This is allowed only when no historical or operational records exist.') && remove.mutate(patientQuery.data!.id)}>Delete</button><Link className="patients-open" to={`/dashboard/patients/${patientQuery.data.id}/conversation`}>Open Conversation</Link></div>
      </div>}
      {editing && <form onSubmit={submit}><div className="patient-form">
        <label>Full name *<input required value={form.full_name ?? ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>Phone *<input dir="ltr" required aria-invalid={Boolean(phoneErrors.phone)} placeholder="+9665XXXXXXXX" value={form.phone_number ?? ''} onChange={(e) => { setForm({ ...form, phone_number: e.target.value }); setPhoneErrors({ ...phoneErrors, phone: undefined }) }} /><small>This number is used to identify the patient in WhatsApp.</small>{phoneErrors.phone && <small className="patient-form-error">{phoneErrors.phone}</small>}</label>
        <label>WhatsApp<input dir="ltr" aria-invalid={Boolean(phoneErrors.whatsapp)} placeholder="+9665XXXXXXXX" value={form.whatsapp_id ?? ''} onChange={(e) => { setForm({ ...form, whatsapp_id: e.target.value }); setPhoneErrors({ ...phoneErrors, whatsapp: undefined }) }} />{phoneErrors.whatsapp && <small className="patient-form-error">{phoneErrors.whatsapp}</small>}</label>
        <label>Email<input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Gender<select required value={form.gender ?? ''} onChange={(e) => setForm({ ...form, gender: e.target.value as 'female' | 'male' })}><option value="" disabled>Select gender</option><option value="female">Female</option><option value="male">Male</option></select></label>
        <label>Birth date<input type="date" max={new Date().toISOString().slice(0, 10)} value={form.birth_date ?? ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
        <label className="patient-form__wide">Notes<textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      </div>{save.isError && <p className="patient-form-error">{save.error.message}</p>}<div className="patient-dialog__actions"><button type="button" onClick={() => creating ? close() : setEditing(false)}>Cancel</button><button type="submit" className="patients-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : creating ? 'Add Patient' : 'Save Changes'}</button></div></form>}
    </div></div>}
  </section>
}
