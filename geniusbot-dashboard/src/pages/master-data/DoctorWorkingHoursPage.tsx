import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { isApiError } from '../../api/apiError'
import {
  getDoctorWorkingHours,
  replaceDoctorWorkingHours,
  type DoctorWorkingPeriod,
  type DoctorWorkingSchedule,
} from '../../api/doctorWorkingHoursApi'
import { listMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { formatBranchLabel } from '../../utils/branch'
import './DoctorWorkingHoursPage.css'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type EditablePeriod = DoctorWorkingPeriod & { key: string }
type QuickPeriod = { key: string; start_time: string; end_time: string }
type ToastKind = 'success' | 'error' | 'conflict'

const SUCCESS_TOAST_DURATION_MS = 4_000
const VERSION_CONFLICT_CODE = 'DOCTOR_WORKING_HOURS_VERSION_CONFLICT'
const key = () => `${Date.now()}-${Math.random()}`
const ordered = (periods: EditablePeriod[]) => [...periods].sort((a, b) =>
  a.day_of_week - b.day_of_week ||
  a.start_time.localeCompare(b.start_time) ||
  a.end_time.localeCompare(b.end_time))

function validatePeriods(periods: Array<Pick<DoctorWorkingPeriod, 'day_of_week' | 'start_time' | 'end_time'>>) {
  for (const period of periods) {
    if (!period.start_time || !period.end_time || period.start_time >= period.end_time) {
      return 'Every period must have a valid From time before its To time.'
    }
  }
  const sorted = [...periods].sort((a, b) =>
    a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
  for (let index = 1; index < sorted.length; index += 1) {
    if (
      sorted[index].day_of_week === sorted[index - 1].day_of_week &&
      sorted[index].start_time < sorted[index - 1].end_time
    ) return 'Working periods cannot overlap, including periods in different branches.'
  }
  return ''
}

function editablePeriods(schedule: DoctorWorkingSchedule): EditablePeriod[] {
  return ordered(schedule.periods.map((period) => ({
    ...period,
    start_time: period.start_time.slice(0, 5),
    end_time: period.end_time.slice(0, 5),
    key: period.id ?? key(),
  })))
}

function publicErrorMessage(error: unknown, fallback: string) {
  return isApiError(error) && error.message.trim() ? error.message : fallback
}

export function DoctorWorkingHoursPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const canManage = ['platform_admin', 'owner', 'clinic_admin'].includes(user!.role)
  const queryClient = useQueryClient()
  const [doctorId, setDoctorId] = useState('')
  const [periods, setPeriods] = useState<EditablePeriod[]>([])
  const [editedDoctorId, setEditedDoctorId] = useState('')
  const [validationError, setValidationError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isReloading, setIsReloading] = useState(false)
  const [quickBranch, setQuickBranch] = useState('')
  const [quickDays, setQuickDays] = useState<number[]>([])
  const [quickPeriods, setQuickPeriods] = useState<QuickPeriod[]>([
    { key: key(), start_time: '', end_time: '' },
  ])
  const [pendingQuick, setPendingQuick] = useState<EditablePeriod[] | null>(null)

  const doctors = useQuery({
    queryKey: ['master-data', clinicId, 'doctors'],
    queryFn: () => listMasterData(clinicId, 'doctors'),
  })
  const branches = useQuery({
    queryKey: ['master-data', clinicId, 'branches'],
    queryFn: () => listMasterData(clinicId, 'branches'),
  })
  const schedule = useQuery({
    queryKey: ['doctor-working-hours', clinicId, doctorId],
    queryFn: () => getDoctorWorkingHours(clinicId, doctorId),
    enabled: Boolean(doctorId),
  })
  const activeBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => branch.is_active === true),
    [branches.data],
  )

  const currentPeriods = useMemo(
    () => editedDoctorId === doctorId
      ? periods
      : schedule.data
        ? editablePeriods(schedule.data)
        : [],
    [doctorId, editedDoctorId, periods, schedule.data],
  )

  useEffect(() => {
    if (!successMessage) return
    const timer = window.setTimeout(() => setSuccessMessage(''), SUCCESS_TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  const save = useMutation({
    mutationFn: () => replaceDoctorWorkingHours(
      clinicId,
      doctorId,
      currentPeriods.map((period) => ({
        branch_id: period.branch_id,
        day_of_week: period.day_of_week,
        start_time: period.start_time,
        end_time: period.end_time,
      })),
      schedule.data?.version ?? '',
    ),
    onMutate: () => {
      setValidationError('')
      setSuccessMessage('')
    },
    onSuccess: async (latestSchedule) => {
      queryClient.setQueryData(
        ['doctor-working-hours', clinicId, doctorId],
        latestSchedule,
      )
      await queryClient.invalidateQueries({
        queryKey: ['doctor-working-hours', clinicId, doctorId],
      })
      setEditedDoctorId('')
      setSuccessMessage('Weekly schedule saved successfully.')
    },
  })

  function saveConflict(error: unknown) {
    return isApiError(error) && error.code === VERSION_CONFLICT_CODE
  }

  const conflict = saveConflict(save.isError ? save.error : null)
  const loadError = doctors.isError || branches.isError || schedule.isError
  const toastKind: ToastKind | null = successMessage
    ? 'success'
    : conflict
      ? 'conflict'
      : validationError || save.isError || loadError
        ? 'error'
        : null
  const toastMessage = successMessage ||
    (conflict
      ? 'This schedule was updated by someone else. Reload the latest schedule before saving again.'
      : validationError ||
        (save.isError
          ? publicErrorMessage(save.error, 'Unable to save the weekly schedule. Please try again.')
          : loadError
            ? 'Unable to load doctor schedule data.'
            : ''))

  function clearResultMessages() {
    setValidationError('')
    setSuccessMessage('')
    save.reset()
  }

  function dismissToast() {
    clearResultMessages()
  }

  function updatePeriod(periodKey: string, patch: Partial<EditablePeriod>) {
    setPeriods(currentPeriods.map((period) =>
      period.key === periodKey ? { ...period, ...patch } : period))
    setEditedDoctorId(doctorId)
  }

  function addPeriod(day: number) {
    setPeriods([...currentPeriods, {
      key: key(), branch_id: activeBranches[0]?.id ?? '', day_of_week: day,
      start_time: '', end_time: '',
    }])
    setEditedDoctorId(doctorId)
  }

  function submit() {
    if (save.isPending) return
    clearResultMessages()
    const error = validatePeriods(currentPeriods)
    if (error) return setValidationError(error)
    if (currentPeriods.some((period) => !period.branch_id)) {
      return setValidationError('Every working period requires a branch.')
    }
    save.mutate()
  }

  function buildQuickPeriods() {
    clearResultMessages()
    if (!quickBranch || quickDays.length === 0) {
      return setValidationError('Quick Apply requires a branch and at least one selected day.')
    }
    const generated = quickDays.flatMap((day) => quickPeriods.map((period) => ({
      key: key(),
      branch_id: quickBranch,
      day_of_week: day,
      start_time: period.start_time,
      end_time: period.end_time,
    })))
    const error = validatePeriods(generated)
    if (error) return setValidationError(error)
    if (quickDays.some((day) => currentPeriods.some((period) => period.day_of_week === day))) {
      setPendingQuick(generated)
    } else {
      setPeriods(ordered([...currentPeriods, ...generated]))
      setEditedDoctorId(doctorId)
    }
  }

  function applyPending(mode: 'replace' | 'add') {
    if (!pendingQuick) return
    clearResultMessages()
    const selected = new Set(quickDays)
    const candidate = mode === 'replace'
      ? [...currentPeriods.filter((period) => !selected.has(period.day_of_week)), ...pendingQuick]
      : [...currentPeriods, ...pendingQuick]
    const error = validatePeriods(candidate)
    if (error) {
      setValidationError(error)
    } else {
      setPeriods(ordered(candidate))
      setEditedDoctorId(doctorId)
    }
    setPendingQuick(null)
  }

  async function reloadSchedule() {
    if (isReloading) return
    setIsReloading(true)
    setValidationError('')
    setSuccessMessage('')
    try {
      const latestSchedule = await getDoctorWorkingHours(clinicId, doctorId)
      queryClient.setQueryData(
        ['doctor-working-hours', clinicId, doctorId],
        latestSchedule,
      )
      setPeriods(editablePeriods(latestSchedule))
      setEditedDoctorId(doctorId)
      save.reset()
    } catch (error) {
      save.reset()
      setValidationError(publicErrorMessage(
        error,
        'Unable to reload the latest schedule. Please try again.',
      ))
    } finally {
      setIsReloading(false)
    }
  }

  return <section className="doctor-hours">
    {toastKind && <div
      className={`doctor-hours__toast doctor-hours__toast--${toastKind}`}
      role={toastKind === 'success' ? 'status' : 'alert'}
      aria-live={toastKind === 'success' ? 'polite' : 'assertive'}
      aria-atomic="true"
    >
      <span className="doctor-hours__toast-icon" aria-hidden="true">
        {toastKind === 'success' ? '✓' : toastKind === 'conflict' ? '!' : '×'}
      </span>
      <div className="doctor-hours__toast-content">
        <strong>{toastKind === 'success'
          ? 'Schedule saved'
          : toastKind === 'conflict'
            ? 'Schedule changed'
            : 'Action failed'}</strong>
        <span>{toastMessage}</span>
      </div>
      {toastKind === 'conflict' && <button
        type="button"
        className="doctor-hours__toast-action"
        disabled={isReloading}
        onClick={() => void reloadSchedule()}
      >{isReloading ? 'Reloading…' : 'Reload Schedule'}</button>}
      <button
        type="button"
        className="doctor-hours__toast-close"
        aria-label="Close notification"
        onClick={dismissToast}
      >×</button>
    </div>}

    <header>
      <div><p>Schedules</p><h2>Doctor Weekly Working Hours</h2><span>Assign recurring periods to the branch where the doctor actually works.</span></div>
      <label>Doctor<select value={doctorId} disabled={doctors.isLoading} onChange={(event) => {
        setDoctorId(event.target.value)
        clearResultMessages()
      }}>
        <option value="">Select doctor…</option>
        {(doctors.data ?? []).map((doctor) => <option key={doctor.id} value={doctor.id}>{String(doctor.full_name)}</option>)}
      </select></label>
    </header>

    {(doctors.isLoading || branches.isLoading || (doctorId && schedule.isLoading)) &&
      <div className="doctor-hours__state">Loading weekly schedule…</div>}

    {canManage && doctorId && <section className="doctor-hours__quick">
      <h3>Quick Apply</h3>
      <label>Branch<select value={quickBranch} onChange={(event) => setQuickBranch(event.target.value)}>
        <option value="">Select branch…</option>
        {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{formatBranchLabel(branch)}</option>)}
      </select></label>
      <fieldset><legend>Selected Days</legend>
        <div className="doctor-hours__days">{days.map((day, index) => <label key={day}><input type="checkbox" checked={quickDays.includes(index)} onChange={(event) => setQuickDays((current) => event.target.checked ? [...current, index] : current.filter((value) => value !== index))} />{day}</label>)}</div>
        <button type="button" onClick={() => setQuickDays(days.map((_, index) => index))}>Select All</button>
        <button type="button" onClick={() => setQuickDays([])}>Clear All</button>
      </fieldset>
      {quickPeriods.map((period) => <div className="doctor-hours__quick-period" key={period.key}>
        <label>From<input type="time" value={period.start_time} onChange={(event) => setQuickPeriods((current) => current.map((item) => item.key === period.key ? { ...item, start_time: event.target.value } : item))} /></label>
        <label>To<input type="time" value={period.end_time} onChange={(event) => setQuickPeriods((current) => current.map((item) => item.key === period.key ? { ...item, end_time: event.target.value } : item))} /></label>
        <button type="button" onClick={() => setQuickPeriods((current) => current.filter((item) => item.key !== period.key))}>Delete</button>
      </div>)}
      <div><button type="button" onClick={() => setQuickPeriods((current) => [...current, { key: key(), start_time: '', end_time: '' }])}>Add Period</button> <button type="button" className="doctor-hours__primary" onClick={buildQuickPeriods}>Apply</button></div>
    </section>}

    {doctorId && !schedule.isLoading && <div className="doctor-hours__week">
      {days.map((day, dayIndex) => {
        const dayPeriods = currentPeriods.filter((period) => period.day_of_week === dayIndex)
        return <section className="doctor-hours__day" key={day}>
          <div className="doctor-hours__day-title"><h3>{day}</h3>{canManage && <button type="button" onClick={() => addPeriod(dayIndex)}>Add Period</button>}</div>
          {dayPeriods.length === 0 && <p>Not Working</p>}
          {dayPeriods.map((period) => <div className="doctor-hours__period" key={period.key}>
            <label>Branch<select disabled={!canManage} value={period.branch_id} onChange={(event) => updatePeriod(period.key, { branch_id: event.target.value })}><option value="">Select branch…</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{formatBranchLabel(branch)}</option>)}</select></label>
            <label>From<input disabled={!canManage} type="time" value={period.start_time} onChange={(event) => updatePeriod(period.key, { start_time: event.target.value })} /></label>
            <label>To<input disabled={!canManage} type="time" value={period.end_time} onChange={(event) => updatePeriod(period.key, { end_time: event.target.value })} /></label>
            {canManage && <button type="button" onClick={() => { setPeriods(currentPeriods.filter((item) => item.key !== period.key)); setEditedDoctorId(doctorId) }}>Delete</button>}
          </div>)}
        </section>
      })}
    </div>}
    {canManage && doctorId && <div className="doctor-hours__save"><button className="doctor-hours__primary" type="button" disabled={save.isPending || isReloading} onClick={submit}>{save.isPending ? 'Saving…' : 'Save Weekly Schedule'}</button></div>}

    {pendingQuick && <div className="doctor-hours__overlay"><div className="doctor-hours__dialog" role="dialog" aria-modal="true" aria-labelledby="quick-conflict-title">
      <h3 id="quick-conflict-title">Selected days already contain periods</h3>
      <p>Replace periods on the selected days, append the new periods, or cancel.</p>
      <div><button type="button" onClick={() => applyPending('replace')}>Replace</button><button type="button" onClick={() => applyPending('add')}>Add</button><button type="button" onClick={() => setPendingQuick(null)}>Cancel</button></div>
    </div></div>}
  </section>
}
