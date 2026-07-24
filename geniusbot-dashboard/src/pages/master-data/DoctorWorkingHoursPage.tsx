import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getDoctorWorkingHours,
  replaceDoctorWorkingHours,
  type DoctorWorkingPeriod,
} from '../../api/doctorWorkingHoursApi'
import { listMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import './DoctorWorkingHoursPage.css'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type EditablePeriod = DoctorWorkingPeriod & { key: string }
type QuickPeriod = { key: string; start_time: string; end_time: string }

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

export function DoctorWorkingHoursPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const canManage = ['platform_admin', 'owner', 'clinic_admin'].includes(user!.role)
  const queryClient = useQueryClient()
  const [doctorId, setDoctorId] = useState('')
  const [periods, setPeriods] = useState<EditablePeriod[]>([])
  const [editedDoctorId, setEditedDoctorId] = useState('')
  const [validationError, setValidationError] = useState('')
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
      : ordered((schedule.data ?? []).map((period) => ({
        ...period,
        start_time: period.start_time.slice(0, 5),
        end_time: period.end_time.slice(0, 5),
        key: period.id ?? key(),
      }))),
    [doctorId, editedDoctorId, periods, schedule.data],
  )

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
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['doctor-working-hours', clinicId, doctorId] })
      setEditedDoctorId('')
    },
  })

  function updatePeriod(periodKey: string, patch: Partial<EditablePeriod>) {
    setPeriods(currentPeriods.map((period) =>
      period.key === periodKey ? { ...period, ...patch } : period))
    setEditedDoctorId(doctorId)
    setValidationError('')
  }

  function addPeriod(day: number) {
    setPeriods([...currentPeriods, {
      key: key(), branch_id: activeBranches[0]?.id ?? '', day_of_week: day,
      start_time: '', end_time: '',
    }])
    setEditedDoctorId(doctorId)
  }

  function submit() {
    const error = validatePeriods(currentPeriods)
    if (error) return setValidationError(error)
    if (currentPeriods.some((period) => !period.branch_id)) {
      return setValidationError('Every working period requires a branch.')
    }
    save.mutate()
  }

  function buildQuickPeriods() {
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

  return <section className="doctor-hours">
    <header>
      <div><p>Schedules</p><h2>Doctor Weekly Working Hours</h2><span>Assign recurring periods to the branch where the doctor actually works.</span></div>
      <label>Doctor<select value={doctorId} disabled={doctors.isLoading} onChange={(event) => setDoctorId(event.target.value)}>
        <option value="">Select doctor…</option>
        {(doctors.data ?? []).map((doctor) => <option key={doctor.id} value={doctor.id}>{String(doctor.full_name)}</option>)}
      </select></label>
    </header>

    {doctors.isError || branches.isError || schedule.isError
      ? <div className="doctor-hours__error" role="alert">Unable to load doctor schedule data.</div>
      : null}
    {(doctors.isLoading || branches.isLoading || (doctorId && schedule.isLoading)) &&
      <div className="doctor-hours__state">Loading weekly schedule…</div>}

    {canManage && doctorId && <section className="doctor-hours__quick">
      <h3>Quick Apply</h3>
      <label>Branch<select value={quickBranch} onChange={(event) => setQuickBranch(event.target.value)}>
        <option value="">Select branch…</option>
        {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{String(branch.name)}</option>)}
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
            <label>Branch<select disabled={!canManage} value={period.branch_id} onChange={(event) => updatePeriod(period.key, { branch_id: event.target.value })}><option value="">Select branch…</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{String(branch.name)}</option>)}</select></label>
            <label>From<input disabled={!canManage} type="time" value={period.start_time} onChange={(event) => updatePeriod(period.key, { start_time: event.target.value })} /></label>
            <label>To<input disabled={!canManage} type="time" value={period.end_time} onChange={(event) => updatePeriod(period.key, { end_time: event.target.value })} /></label>
            {canManage && <button type="button" onClick={() => { setPeriods(currentPeriods.filter((item) => item.key !== period.key)); setEditedDoctorId(doctorId) }}>Delete</button>}
          </div>)}
        </section>
      })}
    </div>}
    {validationError && <p className="doctor-hours__error" role="alert">{validationError}</p>}
    {save.isError && <p className="doctor-hours__error" role="alert">{save.error.message}</p>}
    {canManage && doctorId && <div className="doctor-hours__save"><button className="doctor-hours__primary" type="button" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving…' : 'Save Weekly Schedule'}</button></div>}

    {pendingQuick && <div className="doctor-hours__overlay"><div className="doctor-hours__dialog" role="dialog" aria-modal="true" aria-labelledby="quick-conflict-title">
      <h3 id="quick-conflict-title">Selected days already contain periods</h3>
      <p>Replace periods on the selected days, append the new periods, or cancel.</p>
      <div><button type="button" onClick={() => applyPending('replace')}>Replace</button><button type="button" onClick={() => applyPending('add')}>Add</button><button type="button" onClick={() => setPendingQuick(null)}>Cancel</button></div>
    </div></div>}
  </section>
}
