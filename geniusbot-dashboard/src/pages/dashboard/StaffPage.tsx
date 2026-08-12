import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { changeStaffRole, createStaff, deleteStaff, getStaff, resetStaffPassword, setStaffActive, updateStaff } from '../../api/staffApi'
import { listMasterData } from '../../api/masterDataApi'
import type { BackendStaff } from '../../auth/authTypes'
import { useAuth } from '../../auth/hooks/useAuth'
import { normalizeSaudiMobile, saudiMobileHint } from '../../utils/saudiMobile'
import { formatBranchLabel } from '../../utils/branch'
import './OperationalPages.css'

const emptyForm = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  role: 'clinic_admin',
  branchId: '',
}
const branchScopedRoles = new Set(['branch_manager', 'receptionist', 'doctor'])

export function StaffPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<BackendStaff | null | undefined>(undefined)
  const [form, setForm] = useState(emptyForm)
  const [phoneError, setPhoneError] = useState('')
  const [branchError, setBranchError] = useState('')
  const [resetting, setResetting] = useState<BackendStaff | null>(null)
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' })
  const query = useQuery({ queryKey: ['staff', clinicId], queryFn: () => getStaff(clinicId) })
  const branchesQuery = useQuery({
    queryKey: ['master-data', clinicId, 'branches'],
    queryFn: () => listMasterData(clinicId, 'branches'),
  })
  const activeBranches = (branchesQuery.data ?? []).filter((branch) => branch.is_active === true)
  const requiresBranch = branchScopedRoles.has(form.role)
  const canManageStatusAndRole = ['owner', 'platform_admin'].includes(user!.role)
  const canResetPasswords = ['owner', 'clinic_admin', 'platform_admin'].includes(user!.role)
  const save = useMutation({
    mutationFn: async (payload: typeof form) => {
      if (editing) {
        if (payload.role !== editing.role) {
          await changeStaffRole(
            clinicId,
            editing.id,
            payload.role as 'clinic_admin' | 'branch_manager' | 'receptionist' | 'doctor',
            payload.branchId || null,
          )
        }
        return updateStaff(clinicId, editing.id, {
          fullName: payload.fullName,
          username: payload.username,
          email: payload.email,
          phone: payload.phone || null,
          branchId: payload.branchId || null,
        })
      }
      return createStaff(clinicId, {
          fullName: payload.fullName,
          username: payload.username,
          email: payload.email,
          phone: payload.phone || null,
          password: payload.password,
          role: payload.role as 'clinic_admin' | 'branch_manager' | 'receptionist' | 'doctor',
          branchId: payload.branchId || null,
        })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff', clinicId] })
      setEditing(undefined)
    },
  })
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setStaffActive(clinicId, id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', clinicId] }),
  })
  const remove = useMutation({
    mutationFn: (staff: BackendStaff) => deleteStaff(clinicId, staff.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', clinicId] }),
  })
  const resetPassword = useMutation({
    mutationFn: () => resetStaffPassword(clinicId, resetting!.id, resetForm),
    onSuccess: () => {
      setResetting(null)
      setResetForm({ newPassword: '', confirmPassword: '' })
    },
  })

  function closeResetDialog() {
    setResetting(null)
    setResetForm({ newPassword: '', confirmPassword: '' })
    resetPassword.reset()
  }
  const records = (query.data ?? []).filter((staff) =>
    !search || `${staff.full_name} ${staff.username} ${staff.email} ${staff.role}`.toLowerCase().includes(search.toLowerCase()))

  function open(staff: BackendStaff | null) {
    setEditing(staff)
    setForm(staff ? {
      fullName: staff.full_name,
      username: staff.username,
      email: staff.email,
      phone: staff.phone ?? '',
      password: '',
      role: staff.role,
      branchId: staff.branch_id ?? '',
    } : { ...emptyForm })
    setPhoneError('')
    setBranchError('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const phone = normalizeSaudiMobile(form.phone, true)
    if (form.phone && !phone) {
      setPhoneError(saudiMobileHint)
      return
    }
    if (requiresBranch && !form.branchId) {
      setBranchError(activeBranches.length
        ? 'Select a branch for this role.'
        : 'No active branches are available. Add or activate a branch first.')
      return
    }
    const normalizedForm = { ...form, phone: phone ?? '' }
    setPhoneError('')
    setBranchError('')
    setForm(normalizedForm)
    save.mutate(normalizedForm)
  }

  return <section className="operational-page">
    <header>
      <div>
        <p>Clinic team</p>
        <h2>Staff</h2>
        <span>Manage authorized clinic staff accounts. Passwords are never displayed.</span>
      </div>
      <button type="button" className="operational-primary" onClick={() => open(null)}>Add Staff</button>
    </header>
    <div className="operational-toolbar">
      <input aria-label="Search staff" placeholder="Search name, username, email, or role" value={search} onChange={(event) => setSearch(event.target.value)} />
    </div>
    {query.isLoading && <div className="operational-state">Loading staff…</div>}
    {query.isError && <div className="operational-state operational-error">Unable to load staff. <button type="button" onClick={() => query.refetch()}>Retry</button></div>}
    {query.data && records.length === 0 && <div className="operational-state">No staff records found.</div>}
    {records.length > 0 && <div className="operational-table"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{records.map((staff) => <tr key={staff.id}>
        <td>{staff.full_name}</td><td>{staff.username}</td><td>{staff.email}</td><td>{staff.role.replaceAll('_', ' ')}</td>
        <td>{staff.is_active ? 'Active' : 'Inactive'}</td>
        <td><button type="button" onClick={() => open(staff)}>View / edit</button>{' '}
          {canManageStatusAndRole && <button type="button" disabled={status.isPending || staff.id === user!.id} onClick={() => status.mutate({ id: staff.id, active: !staff.is_active })}>{staff.is_active ? 'Deactivate' : 'Reactivate'}</button>}{' '}
          {canManageStatusAndRole && <button type="button" disabled={remove.isPending || staff.id === user!.id || staff.role === 'owner' || staff.role === 'platform_admin'} onClick={() => window.confirm(`Delete ${staff.full_name}? This cannot be undone.`) && remove.mutate(staff)}>Delete</button>}
          {canResetPasswords && staff.id !== user!.id && staff.role !== 'owner' && staff.role !== 'platform_admin' && <button type="button" onClick={() => { setResetting(staff); setResetForm({ newPassword: '', confirmPassword: '' }) }}>Reset password</button>}
        </td>
      </tr>)}</tbody>
    </table></div>}
    {status.isError && <div className="operational-state operational-error" role="alert">{status.error.message}</div>}
    {remove.isError && <div className="operational-state operational-error" role="alert">{remove.error.message}</div>}
    {editing !== undefined && <div className="operational-modal">
      <div className="operational-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <header>
          <h3 id="staff-dialog-title">{editing ? 'Edit Staff' : 'Add Staff'}</h3>
          <button type="button" aria-label="Close" onClick={() => setEditing(undefined)}>×</button>
        </header>
        <form onSubmit={submit}>
          <div className="operational-form">
            <label>Full name *<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
            <label>Username *<input dir="ltr" required minLength={3} maxLength={50} pattern="[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} /></label>
            <label>Email *<input dir="ltr" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Phone<input dir="ltr" aria-invalid={Boolean(phoneError)} value={form.phone} onChange={(event) => { setForm({ ...form, phone: event.target.value }); setPhoneError('') }} />{phoneError && <small className="operational-error">{phoneError}</small>}</label>
            {!editing && <label>Password *<input type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
              <label>Role *<select disabled={Boolean(editing) && !canManageStatusAndRole} value={form.role} onChange={(event) => {
                const role = event.target.value
                setForm({ ...form, role, branchId: branchScopedRoles.has(role) ? form.branchId : '' })
                setBranchError('')
              }}>
                <option value="clinic_admin">Clinic admin</option><option value="branch_manager">Branch manager</option>
                <option value="receptionist">Receptionist</option><option value="doctor">Doctor</option>
              </select></label>
            {requiresBranch && <label>Branch *
              <select
                required
                disabled={branchesQuery.isLoading || branchesQuery.isError || activeBranches.length === 0}
                value={form.branchId}
                onChange={(event) => {
                  setForm({ ...form, branchId: event.target.value })
                  setBranchError('')
                }}
              >
                <option value="">{branchesQuery.isLoading ? 'Loading branches...' : 'Select branch'}</option>
        {activeBranches.map((branch) => <option key={branch.id} value={branch.id} data-i18n-ignore>{formatBranchLabel(branch)}</option>)}
              </select>
              {branchesQuery.isError && <small className="operational-error">Unable to load branches. Try again before saving.</small>}
              {!branchesQuery.isLoading && !branchesQuery.isError && activeBranches.length === 0 && <small className="operational-error">No active branches are available.</small>}
              {branchError && <small className="operational-error">{branchError}</small>}
            </label>}
          </div>
          {save.isError && <p className="operational-error">{save.error.message}</p>}
          <footer>
            <button type="button" onClick={() => setEditing(undefined)}>Cancel</button>
            <button type="submit" className="operational-primary" disabled={save.isPending || (requiresBranch && (branchesQuery.isLoading || branchesQuery.isError || activeBranches.length === 0))}>
              {save.isPending ? 'Saving...' : editing ? 'Save Changes' : 'Add Staff'}
            </button>
          </footer>
        </form>
      </div>
    </div>}
    {resetting && <div className="operational-modal">
      <div className="operational-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <header><h3 id="reset-password-title">Reset password for {resetting.full_name}</h3><button type="button" aria-label="Close" onClick={closeResetDialog}>×</button></header>
        <form onSubmit={(event) => { event.preventDefault(); resetPassword.mutate() }}>
          <div className="operational-form">
            <label>New password *<input type="password" required minLength={8} value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} /></label>
            <label>Confirm password *<input type="password" required minLength={8} value={resetForm.confirmPassword} onChange={(event) => setResetForm({ ...resetForm, confirmPassword: event.target.value })} /></label>
          </div>
          {resetPassword.isError && <p className="operational-error" role="alert">{resetPassword.error.message}</p>}
          <footer><button type="button" onClick={closeResetDialog}>Cancel</button><button className="operational-primary" type="submit" disabled={resetPassword.isPending || resetForm.newPassword !== resetForm.confirmPassword}>{resetPassword.isPending ? 'Resetting...' : 'Reset password'}</button></footer>
        </form>
      </div>
    </div>}
  </section>
}
