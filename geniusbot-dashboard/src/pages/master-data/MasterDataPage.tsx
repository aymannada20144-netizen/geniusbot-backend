import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../auth/hooks/useAuth'
import { createMasterData, deleteMasterData, listMasterData, updateMasterData } from '../../api/masterDataApi'
import type { MasterDataRecord } from '../../api/masterDataApi'
import { normalizeSaudiMobile, saudiMobileHint } from '../../utils/saudiMobile'
import { formatBranchLabel } from '../../utils/branch'
import { masterDataConfigs, roomTypeOptions } from './masterDataConfig'
import './MasterDataPage.css'
import { useLanguage } from '../../i18n/useLanguage'

const ROOM_PAGE_SIZE = 10

function display(value: unknown, field: string, lookups: Record<string, Map<string, string>>) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field === 'day_of_week') return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(value)] ?? String(value)
  if (field.endsWith('_id')) return lookups[field]?.get(String(value)) ?? 'Unavailable'
  if (field === 'room_type') return roomTypeOptions.find((item) => item.value === value)?.label ?? 'Unavailable'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export function MasterDataPage() {
  const { t } = useLanguage()
  const { resource = '' } = useParams()
  const config = masterDataConfigs[resource]
  const { user } = useAuth()
  const clinicId = user?.clinicId ?? ''
  const canManage = ['platform_admin', 'owner', 'clinic_admin'].includes(user?.role ?? '')
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MasterDataRecord | null | undefined>(undefined)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [feedback, setFeedback] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [branchFilter, setBranchFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortColumn, setSortColumn] = useState('room_number')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['master-data', clinicId, resource],
    queryFn: () => listMasterData(clinicId, resource),
    enabled: Boolean(clinicId && config),
  })
  const sources = [...new Set(config?.fields.map((field) => field.source).filter(Boolean) as string[])]
  const sourceResults = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['master-data', clinicId, source],
      queryFn: () => listMasterData(clinicId, source),
      enabled: Boolean(clinicId),
    })),
  })
  const sourceQueries = sources.map((source, index) => ({ source, result: sourceResults[index] }))
  const lookups = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {}
    for (const field of config?.fields ?? []) {
      if (!field.source) continue
      const records = sourceQueries.find((item) => item.source === field.source)?.result.data ?? []
      maps[field.name] = new Map(records.map((record) => [record.id, field.source === 'branches' ? formatBranchLabel(record) : String(record[field.sourceLabel ?? 'name'] ?? 'Unavailable')]))
    }
    return maps
  }, [config, sourceQueries])

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => {
        const field = config.fields.find((item) => item.name === key)
        if (field?.type === 'number' && value !== '' && value !== null) return [key, Number(value)]
        if (field?.type === 'array') return [key, String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)]
        return [key, value === '' ? null : value]
      }))
      if (editing) {
        for (const field of config.fields.filter((item) => item.readOnlyOnEdit)) {
          delete normalized[field.name]
        }
      }
      return editing
        ? updateMasterData(clinicId, resource, editing.id, normalized)
        : createMasterData(clinicId, resource, normalized)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId] })
      setEditing(undefined)
      setFeedback(resource === 'rooms' ? 'Room saved successfully.' : 'Saved successfully.')
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteMasterData(clinicId, resource, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId] })
      setFeedback(resource === 'rooms' ? 'Unused room deleted successfully.' : 'Deleted successfully.')
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateMasterData(clinicId, resource, id, { is_active: active }),
    onSuccess: async (_record, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId] })
      setFeedback(`Room ${variables.active ? 'activated' : 'deactivated'} successfully.`)
    },
  })

  if (!config) return <section className="master-data"><h2>Page not found</h2></section>
  const filteredRecords = (query.data ?? []).filter((record) =>
    (!search || config.columns.some((column) => display(record[column], column, lookups).toLowerCase().includes(search.toLowerCase()))) &&
    (resource !== 'branches' || !cityFilter || record.city === cityFilter) &&
    (resource !== 'rooms' || !branchFilter || record.branch_id === branchFilter) &&
    (resource !== 'rooms' || !statusFilter || String(record.is_active) === statusFilter) &&
    (resource !== 'rooms' || !typeFilter || record.room_type === typeFilter),
  )
  const orderedRecords = resource === 'rooms'
    ? [...filteredRecords].sort((left, right) => {
        const comparison = display(left[sortColumn], sortColumn, lookups)
          .localeCompare(display(right[sortColumn], sortColumn, lookups), undefined, { numeric: true })
        return sortDirection === 'asc' ? comparison : -comparison
      })
    : filteredRecords
  const totalPages = Math.max(1, Math.ceil(orderedRecords.length / ROOM_PAGE_SIZE))
  const records = resource === 'rooms'
    ? orderedRecords.slice((page - 1) * ROOM_PAGE_SIZE, page * ROOM_PAGE_SIZE)
    : orderedRecords
  const existingCities = resource === 'branches'
    ? [...new Set((query.data ?? []).map((record) => String(record.city ?? '').trim()).filter(Boolean))].sort()
    : []

  function open(record: MasterDataRecord | null) {
    setEditing(record)
    setForm(record
      ? Object.fromEntries(config.fields.map((field) => [field.name, record[field.name] ?? '']))
      : Object.fromEntries(config.fields.map((field) => [
          field.name,
          field.type === 'boolean' ? ['is_active', 'is_booking_enabled'].includes(field.name) : '',
        ])))
    setFeedback('')
    setFieldErrors({})
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    if (resource === 'clinics' && form.whatsapp_number) {
      const whatsapp = normalizeSaudiMobile(String(form.whatsapp_number), true)
      if (!whatsapp) {
        setFieldErrors({ whatsapp_number: saudiMobileHint })
        return
      }
      const normalizedForm = { ...form, whatsapp_number: whatsapp }
      setForm(normalizedForm)
      setFieldErrors({})
      mutation.mutate(normalizedForm)
      return
    }
    setFieldErrors({})
    mutation.mutate(form)
  }

  function changeSort(column: string) {
    setSortDirection(sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc')
    setSortColumn(column)
  }

  return (
    <section className="master-data">
      <header className="master-data__header">
        <div><p className="master-data__eyebrow">Master Data</p><h2>{t(config.title)}</h2><p>{t(config.description)}</p></div>
        {canManage && !config.singleton && <button type="button" className="master-data__primary" onClick={() => open(null)}>Add {config.singular}</button>}
      </header>
      {feedback && <div className="master-data__success" role="status">{feedback}</div>}
      {(remove.isError || statusMutation.isError) && <div className="master-data__state master-data__state--error" role="alert">{(remove.error ?? statusMutation.error)?.message}</div>}
      <div className="master-data__toolbar">
        <label><span className="sr-only">Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={t(`Search ${config.title.toLowerCase()}`)} /></label>
        {resource === 'rooms' && <>
          <select aria-label="Filter by branch" value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1) }}><option value="">All branches</option>{sourceQueries.find((item) => item.source === 'branches')?.result.data?.map((record) => <option key={record.id} value={record.id}>{formatBranchLabel(record)}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
          <select aria-label="Filter by room type" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1) }}><option value="">All room types</option>{roomTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </>}
        {resource === 'branches' && <select aria-label="Filter by city" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">All cities</option>{existingCities.map((city) => <option key={city} value={city} data-i18n-ignore>{city}</option>)}</select>}
        <button onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</button>
      </div>
      {query.isLoading && <div className="master-data__state">Loading {config.title.toLowerCase()}…</div>}
      {query.isError && <div className="master-data__state master-data__state--error">Unable to load data. <button onClick={() => query.refetch()}>Retry</button></div>}
      {!query.isLoading && !query.isError && records.length === 0 && <div className="master-data__state">No records found.</div>}
      {records.length > 0 && <div className="master-data__table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column}>{resource === 'rooms' ? <button type="button" className="master-data__sort" onClick={() => changeSort(column)}>{config.fields.find((field) => field.name === column)?.label ?? column}{sortColumn === column ? ` ${sortDirection === 'asc' ? '↑' : '↓'}` : ''}</button> : config.fields.find((field) => field.name === column)?.label ?? column}</th>)}<th>Actions</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.id}>{config.columns.map((column) => <td key={column}>{display(record[column], column, lookups)}</td>)}<td className="master-data__actions"><button type="button" onClick={() => open(record)}>{canManage ? 'View / edit' : 'View'}</button>{canManage && resource === 'rooms' && <button type="button" disabled={statusMutation.isPending} onClick={() => { const active = !record.is_active; if (window.confirm(`${active ? 'Activate' : 'Deactivate'} room ${String(record.room_number)}?`)) statusMutation.mutate({ id: record.id, active }) }}>{record.is_active ? 'Deactivate' : 'Activate'}</button>}{canManage && !config.singleton && <button type="button" className="master-data__danger" disabled={remove.isPending} onClick={() => window.confirm(resource === 'rooms' ? `Permanently delete unused room ${String(record.room_number)}? Used rooms must be deactivated instead.` : `Delete this ${config.singular.toLowerCase()}?`) && remove.mutate(record.id)}>Delete</button>}</td></tr>)}
      </tbody></table>{resource === 'rooms' && <div className="master-data__pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}</div>}
      {editing !== undefined && <div className="master-data__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !mutation.isPending && setEditing(undefined)}>
        <div className="master-data__dialog" role="dialog" aria-modal="true" aria-labelledby="master-data-form-title">
          <div className="master-data__dialog-header"><h3 id="master-data-form-title">{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</h3><button type="button" aria-label="Close" disabled={mutation.isPending} onClick={() => setEditing(undefined)}>×</button></div>
          <form onSubmit={submit}>
            <div className="master-data__form">{config.fields.map((field) => <label key={field.name} className={field.type === 'boolean' ? 'master-data__check' : ''}>
              {field.type === 'boolean' ? <><input type="checkbox" disabled={resource === 'rooms' && field.name === 'is_active'} checked={Boolean(form[field.name])} onChange={(event) => setForm({ ...form, [field.name]: event.target.checked })} /> {field.label}</> : <>
                <span>{field.label}{field.required ? ' *' : ''}</span>
                {field.type === 'textarea' ? <textarea required={field.required} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} /> : field.type === 'select' ? <select required={field.required} disabled={Boolean(editing && field.readOnlyOnEdit)} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}><option value="">Select…</option>{(field.options ?? sourceQueries.find((item) => item.source === field.source)?.result.data?.filter((record) => resource !== 'rooms' || field.name !== 'branch_id' || record.is_active || (editing && record.id === form.branch_id)).map((record) => ({ value: record.id, label: field.source === 'branches' ? formatBranchLabel(record) : String(record[field.sourceLabel ?? 'name'] ?? 'Unavailable') })) ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input list={resource === 'branches' && field.name === 'city' ? 'branch-city-options' : undefined} type={field.type === 'array' ? 'text' : field.type ?? 'text'} required={field.required} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} />}
                {resource === 'branches' && field.name === 'city' && <datalist id="branch-city-options">{existingCities.map((city) => <option key={city} value={city} data-i18n-ignore />)}</datalist>}
                {field.helper && <small>{t(field.helper)}</small>}
                {fieldErrors[field.name] && <small className="master-data__form-error">{fieldErrors[field.name]}</small>}
              </>}
            </label>)}</div>
            {mutation.isError && <p className="master-data__form-error">{mutation.error.message}</p>}
            <div className="master-data__dialog-actions"><button type="button" disabled={mutation.isPending} onClick={() => setEditing(undefined)}>Cancel</button>{canManage && <button type="submit" className="master-data__primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : editing ? 'Save Changes' : `Add ${config.singular}`}</button>}</div>
          </form>
        </div>
      </div>}
    </section>
  )
}
