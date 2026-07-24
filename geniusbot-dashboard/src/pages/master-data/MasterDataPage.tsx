import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../auth/hooks/useAuth'
import { createMasterData, deleteMasterData, listMasterData, updateMasterData } from '../../api/masterDataApi'
import type { MasterDataRecord } from '../../api/masterDataApi'
import { normalizeSaudiMobile, saudiMobileHint } from '../../utils/saudiMobile'
import { masterDataConfigs } from './masterDataConfig'
import './MasterDataPage.css'

function display(value: unknown, field: string, lookups: Record<string, Map<string, string>>) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field === 'day_of_week') return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(value)] ?? String(value)
  if (field.endsWith('_id')) return lookups[field]?.get(String(value)) ?? String(value)
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export function MasterDataPage() {
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
      maps[field.name] = new Map(records.map((record) => [record.id, String(record[field.sourceLabel ?? 'name'] ?? record.id)]))
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
      return editing
        ? updateMasterData(clinicId, resource, editing.id, normalized)
        : createMasterData(clinicId, resource, normalized)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId] })
      setEditing(undefined)
      setFeedback('Saved successfully.')
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteMasterData(clinicId, resource, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['master-data', clinicId] }),
  })

  if (!config) return <section className="master-data"><h2>Page not found</h2></section>
  const records = (query.data ?? []).filter((record) =>
    !search || config.columns.some((column) => display(record[column], column, lookups).toLowerCase().includes(search.toLowerCase())),
  )
  function open(record: MasterDataRecord | null) {
    setEditing(record)
    setForm(record
      ? Object.fromEntries(config.fields.map((field) => [field.name, record[field.name] ?? '']))
      : Object.fromEntries(config.fields.map((field) => [
          field.name,
          field.type === 'boolean'
            ? ['is_active', 'is_booking_enabled'].includes(field.name)
            : '',
        ])))
    setFeedback('')
    setFieldErrors({})
  }
  function submit(event: FormEvent) {
    event.preventDefault()
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

  return (
    <section className="master-data">
      <header className="master-data__header">
        <div><p className="master-data__eyebrow">Master Data</p><h2>{config.title}</h2><p>{config.description}</p></div>
        {canManage && !config.singleton && <button type="button" className="master-data__primary" onClick={() => open(null)}>Add {config.singular}</button>}
      </header>
      {feedback && <div className="master-data__success" role="status">{feedback}</div>}
      {remove.isError && <div className="master-data__state master-data__state--error" role="alert">{remove.error.message}</div>}
      <div className="master-data__toolbar">
        <label><span className="sr-only">Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}`} /></label>
        <button onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</button>
      </div>
      {query.isLoading && <div className="master-data__state">Loading {config.title.toLowerCase()}…</div>}
      {query.isError && <div className="master-data__state master-data__state--error">Unable to load data. <button onClick={() => query.refetch()}>Retry</button></div>}
      {!query.isLoading && !query.isError && records.length === 0 && <div className="master-data__state">No records found.</div>}
      {records.length > 0 && <div className="master-data__table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column}>{config.fields.find((field) => field.name === column)?.label ?? column}</th>)}<th>Actions</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.id}>{config.columns.map((column) => <td key={column}>{display(record[column], column, lookups)}</td>)}<td className="master-data__actions"><button type="button" onClick={() => open(record)}>{canManage ? 'View / edit' : 'View'}</button>{canManage && !config.singleton && <button type="button" className="master-data__danger" disabled={remove.isPending} onClick={() => window.confirm(`Delete this ${config.singular.toLowerCase()}?`) && remove.mutate(record.id)}>Delete</button>}</td></tr>)}
      </tbody></table></div>}
      {editing !== undefined && <div className="master-data__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditing(undefined)}>
        <div className="master-data__dialog" role="dialog" aria-modal="true" aria-labelledby="master-data-form-title">
          <div className="master-data__dialog-header"><h3 id="master-data-form-title">{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</h3><button type="button" aria-label="Close" onClick={() => setEditing(undefined)}>×</button></div>
          <form onSubmit={submit}>
            <div className="master-data__form">{config.fields.map((field) => <label key={field.name} className={field.type === 'boolean' ? 'master-data__check' : ''}>
              {field.type === 'boolean' ? <><input type="checkbox" checked={Boolean(form[field.name])} onChange={(event) => setForm({ ...form, [field.name]: event.target.checked })} /> {field.label}</> : <>
                <span>{field.label}{field.required ? ' *' : ''}</span>
                {field.type === 'textarea' ? <textarea required={field.required} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} /> : field.type === 'select' ? <select required={field.required} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}><option value="">Select…</option>{(field.options ?? sourceQueries.find((item) => item.source === field.source)?.result.data?.map((record) => ({ value: record.id, label: String(record[field.sourceLabel ?? 'name'] ?? record.id) })) ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === 'array' ? 'text' : field.type ?? 'text'} required={field.required} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} />}
                {fieldErrors[field.name] && <small className="master-data__form-error">{fieldErrors[field.name]}</small>}
              </>}
            </label>)}</div>
            {mutation.isError && <p className="master-data__form-error">{mutation.error.message}</p>}
            <div className="master-data__dialog-actions"><button type="button" onClick={() => setEditing(undefined)}>Cancel</button>{canManage && <button type="submit" className="master-data__primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : editing ? 'Save Changes' : `Add ${config.singular}`}</button>}</div>
          </form>
        </div>
      </div>}
    </section>
  )
}
