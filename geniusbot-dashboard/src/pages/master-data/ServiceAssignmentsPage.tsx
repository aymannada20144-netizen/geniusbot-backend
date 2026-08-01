import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../auth/hooks/useAuth'
import { formatBranchLabel } from '../../utils/branch'
import {
  createServiceAssignment,
  deleteServiceAssignment,
  getServiceAssignmentOptions,
  listServiceAssignments,
  setServiceAssignmentActive,
  updateServiceAssignment,
  type ServiceAssignment,
} from '../../api/serviceAssignmentsApi'
import './ServiceAssignmentsPage.css'

type FormState = {
  branch_id: string
  service_id: string
  doctor_id: string
  room_id: string
  is_default: boolean
  is_active: boolean
}

const emptyForm: FormState = {
  branch_id: '',
  service_id: '',
  doctor_id: '',
  room_id: '',
  is_default: false,
  is_active: true,
}

export function ServiceAssignmentsPage() {
  const { user } = useAuth()
  const clinicId = user?.clinicId ?? ''
  const canManage = ['platform_admin', 'owner', 'clinic_admin'].includes(user?.role ?? '')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ServiceAssignment | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [message, setMessage] = useState('')
  const [localError, setLocalError] = useState('')
  const [city, setCity] = useState('')

  const assignments = useQuery({
    queryKey: ['service-assignments', clinicId],
    queryFn: () => listServiceAssignments(clinicId),
    enabled: Boolean(clinicId),
  })
  const options = useQuery({
    queryKey: ['service-assignment-options', clinicId, form.branch_id],
    queryFn: () => getServiceAssignmentOptions(clinicId, form.branch_id),
    enabled: Boolean(clinicId),
  })
  const selectedService = options.data?.services.find((item) => item.id === form.service_id)
  const cities = [...new Set((options.data?.branches ?? []).map((item) => item.city))].sort()
  const visibleBranches = (options.data?.branches ?? []).filter((item) => !city || item.city === city)
  const duplicate = useMemo(
    () => (assignments.data ?? []).some((item) =>
      item.id !== editing?.id &&
      item.branch_id === form.branch_id &&
      item.service_id === form.service_id &&
      (item.doctor_id ?? '') === form.doctor_id &&
      (item.room_id ?? '') === form.room_id),
    [assignments.data, editing?.id, form],
  )
  const duplicateDefault = useMemo(
    () => form.is_active && form.is_default && (assignments.data ?? []).some((item) =>
      item.id !== editing?.id && item.is_active && item.is_default &&
      item.branch_id === form.branch_id && item.service_id === form.service_id),
    [assignments.data, editing?.id, form],
  )

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        doctor_id: form.doctor_id || null,
        room_id: form.room_id || null,
      }
      return editing
        ? updateServiceAssignment(clinicId, editing.id, payload)
        : createServiceAssignment(clinicId, payload)
    },
    onMutate: () => {
      setMessage('')
      setLocalError('')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['service-assignments', clinicId] })
      setEditing(undefined)
      setMessage('Service assignment saved successfully.')
    },
  })
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setServiceAssignmentActive(clinicId, id, active),
    onSuccess: async (_item, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['service-assignments', clinicId] })
      setMessage(`Service assignment ${variables.active ? 'activated' : 'deactivated'} successfully.`)
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceAssignment(clinicId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['service-assignments', clinicId] })
      setMessage('Unused service assignment deleted successfully.')
    },
  })

  function open(item: ServiceAssignment | null) {
    setEditing(item)
    setForm(item ? {
      branch_id: item.branch_id,
      service_id: item.service_id,
      doctor_id: item.doctor_id ?? '',
      room_id: item.room_id ?? '',
      is_default: item.is_default,
      is_active: item.is_active,
    } : emptyForm)
    setMessage('')
    setLocalError('')
    setCity(item?.branch_city ?? '')
    save.reset()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    if (!form.branch_id || !form.service_id) {
      setLocalError('Select a branch and service.')
      return
    }
    if (selectedService?.requires_doctor && !form.doctor_id) {
      setLocalError('This service requires a doctor.')
      return
    }
    if (selectedService?.requires_room && !form.room_id) {
      setLocalError('This service requires a room.')
      return
    }
    if (duplicate) {
      setLocalError('This exact service assignment already exists.')
      return
    }
    if (duplicateDefault) {
      setLocalError('This branch and service already have an active default assignment.')
      return
    }
    save.mutate()
  }

  const actionError = status.error ?? remove.error

  return <section className="service-assignments">
    <header>
      <div>
        <p>Assignments</p>
        <h2>Service Assignments</h2>
        <span>Connect bookable services to eligible doctors and rooms by branch.</span>
      </div>
      {canManage && <button type="button" className="service-assignments__primary" onClick={() => open(null)}>Add assignment</button>}
    </header>

    {message && <div className="service-assignments__success" role="status">{message}</div>}
    {actionError && <div className="service-assignments__error" role="alert">{actionError.message}</div>}
    {assignments.isLoading && <div className="service-assignments__state">Loading service assignments…</div>}
    {assignments.isError && <div className="service-assignments__error" role="alert">Unable to load service assignments. <button type="button" onClick={() => assignments.refetch()}>Retry</button></div>}
    {!assignments.isLoading && !assignments.isError && assignments.data?.length === 0 && <div className="service-assignments__state">No service assignments found.</div>}

    {assignments.data && assignments.data.length > 0 && <div className="service-assignments__table-wrap">
      <table>
        <thead><tr><th>Branch</th><th>Service</th><th>Doctor</th><th>Room</th><th>Default</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{assignments.data.map((item) => <tr key={item.id}>
          <td>{formatBranchLabel({ name: item.branch_name, city: item.branch_city })}</td>
          <td>{item.service_name}</td>
          <td>{item.doctor_name ?? 'Not required'}</td>
          <td>{item.room_number ? `${item.room_number} — ${item.room_name ?? ''}` : 'Not required'}</td>
          <td>{item.is_default ? 'Default' : '—'}</td>
          <td>{item.is_active ? 'Active' : 'Inactive'}</td>
          <td className="service-assignments__actions">
            <button type="button" onClick={() => open(item)}>{canManage ? 'View / edit' : 'View'}</button>
            {canManage && <button type="button" disabled={status.isPending} onClick={() => status.mutate({ id: item.id, active: !item.is_active })}>{item.is_active ? 'Deactivate' : 'Activate'}</button>}
            {canManage && <button type="button" className="service-assignments__danger" disabled={remove.isPending} onClick={() => window.confirm('Delete this unused assignment? Used assignments must be deactivated instead.') && remove.mutate(item.id)}>Delete</button>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}

    {editing !== undefined && <div className="service-assignments__overlay" onMouseDown={(event) => event.target === event.currentTarget && !save.isPending && setEditing(undefined)}>
      <div className="service-assignments__dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title">
        <div className="service-assignments__dialog-header">
          <h3 id="assignment-dialog-title">{editing ? 'Edit service assignment' : 'Add service assignment'}</h3>
          <button type="button" aria-label="Close assignment dialog" disabled={save.isPending} onClick={() => setEditing(undefined)}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="service-assignments__form">
            <label>City *<select required value={city} onChange={(event) => { setCity(event.target.value); setForm({ ...form, branch_id: '', doctor_id: '', room_id: '' }) }}><option value="">Select city…</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Branch *<select required disabled={!city} value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value, doctor_id: '', room_id: '' })}><option value="">Select branch…</option>{visibleBranches.map((item) => <option key={item.id} value={item.id}>{formatBranchLabel(item)}</option>)}</select></label>
            <label>Service *<select required value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value, doctor_id: '', room_id: '' })}><option value="">Select service…</option>{options.data?.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Doctor{selectedService?.requires_doctor ? ' *' : ''}<select required={selectedService?.requires_doctor} disabled={!form.branch_id} value={form.doctor_id} onChange={(event) => setForm({ ...form, doctor_id: event.target.value })}><option value="">Not required</option>{options.data?.doctors.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
            <label>Room{selectedService?.requires_room ? ' *' : ''}<select required={selectedService?.requires_room} disabled={!form.branch_id} value={form.room_id} onChange={(event) => setForm({ ...form, room_id: event.target.value })}><option value="">Not required</option>{options.data?.rooms.map((item) => <option key={item.id} value={item.id}>{item.room_number} — {item.room_name}</option>)}</select></label>
            <label className="service-assignments__check"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /> Default assignment</label>
            <label className="service-assignments__check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
          </div>
          {(localError || save.isError) && <p className="service-assignments__error" role="alert">{localError || save.error?.message}</p>}
          <div className="service-assignments__dialog-actions">
            <button type="button" disabled={save.isPending} onClick={() => setEditing(undefined)}>Cancel</button>
            {canManage && <button type="submit" className="service-assignments__primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save assignment'}</button>}
          </div>
        </form>
      </div>
    </div>}
  </section>
}
