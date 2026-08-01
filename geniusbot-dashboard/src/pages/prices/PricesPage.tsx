import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPrice, listPrices, setPriceActive, updatePrice } from '../../api/pricesApi'
import type { PriceRecord, PriceWrite } from '../../api/pricesApi'
import { listMasterData } from '../../api/masterDataApi'
import type { MasterDataRecord } from '../../api/masterDataApi'
import { canCreatePrices, canUpdatePrices } from '../../auth/pricePermissions'
import { useAuth } from '../../auth/hooks/useAuth'
import { priceErrorMessage, validatePriceForm } from './priceForm'
import type { PriceForm } from './priceForm'
import './PricesPage.css'

type Toast = { kind: 'success' | 'error'; message: string } | null

const emptyForm = (): PriceForm => ({
  service_id: '', payment_method_id: '', insurance_company_id: null,
  insurance_class_id: null, price: '', currency: 'SAR',
  valid_from: new Date().toISOString().slice(0, 10), valid_to: null,
  is_active: true,
})

export function PricesPage() {
  const { user } = useAuth()
  const clinicId = user?.clinicId ?? ''
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PriceRecord | null | undefined>(undefined)
  const [form, setForm] = useState<PriceForm>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<Toast>(null)
  const [serviceFilter, setServiceFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const prices = useQuery({
    queryKey: ['prices', clinicId],
    queryFn: () => listPrices(clinicId),
    enabled: Boolean(clinicId),
  })
  const optionQueries = useQueries({
    queries: ['services', 'payment-methods', 'insurance-companies', 'insurance-classes'].map((resource) => ({
      queryKey: ['master-data', clinicId, resource],
      queryFn: () => listMasterData(clinicId, resource),
      enabled: Boolean(clinicId),
    })),
  })
  const [services, methods, companies, classes] = optionQueries.map((query) => query.data ?? [])
  const method = methods.find((item) => item.id === form.payment_method_id)
  const isInsurance = String(method?.code ?? '').trim().toLowerCase() === 'insurance'
  const filteredClasses = classes.filter(
    (item) => item.insurance_company_id === form.insurance_company_id,
  )

  useEffect(() => {
    if (toast?.kind !== 'success') return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const save = useMutation({
    mutationFn: (data: PriceWrite) => editing
      ? updatePrice(clinicId, editing.id, data)
      : createPrice(clinicId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prices', clinicId] })
      setEditing(undefined)
      setToast({ kind: 'success', message: editing ? 'Price updated successfully.' : 'Price created successfully.' })
    },
    onError: (error) => setToast({ kind: 'error', message: priceErrorMessage(error) }),
  })
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setPriceActive(clinicId, id, active),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['prices', clinicId] })
      setToast({ kind: 'success', message: `Price ${variables.active ? 'activated' : 'deactivated'} successfully.` })
    },
    onError: (error) => setToast({ kind: 'error', message: priceErrorMessage(error) }),
  })

  const rows = useMemo(() => (prices.data ?? []).filter((price) =>
    (!serviceFilter || price.service_id === serviceFilter) &&
    (!methodFilter || price.payment_method_id === methodFilter) &&
    (!companyFilter || price.insurance_company_id === companyFilter) &&
    (!statusFilter || String(price.is_active) === statusFilter),
  ), [prices.data, serviceFilter, methodFilter, companyFilter, statusFilter])

  function open(price: PriceRecord | null) {
    setEditing(price)
    setErrors({})
    setForm(price ? {
      service_id: price.service_id,
      payment_method_id: price.payment_method_id,
      insurance_company_id: price.insurance_company_id,
      insurance_class_id: price.insurance_class_id,
      price: String(price.price), currency: price.currency,
      valid_from: price.valid_from.slice(0, 10),
      valid_to: price.valid_to?.slice(0, 10) ?? null,
      is_active: price.is_active,
    } : emptyForm())
  }

  function changePaymentMethod(paymentMethodId: string) {
    const selected = methods.find((item) => item.id === paymentMethodId)
    const insurance = String(selected?.code ?? '').trim().toLowerCase() === 'insurance'
    setForm((current) => ({
      ...current,
      payment_method_id: paymentMethodId,
      insurance_company_id: insurance ? current.insurance_company_id : null,
      insurance_class_id: null,
    }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    const nextErrors = validatePriceForm(form, isInsurance)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    save.mutate({ ...form, price: Number(form.price), currency: form.currency.trim().toUpperCase() })
  }

  const canCreate = canCreatePrices(user?.permissions)
  const canUpdate = canUpdatePrices(user?.permissions)

  return <section className="prices-page">
    <header><div><p>Billing Setup</p><h2>Prices</h2><span>Manage service prices, payment scopes, and validity periods.</span></div>
      {canCreate && <button className="prices-page__primary" type="button" onClick={() => open(null)}>Add price</button>}
    </header>

    {toast && <div className={`prices-page__toast prices-page__toast--${toast.kind}`} role={toast.kind === 'success' ? 'status' : 'alert'}>
      <span>{toast.message}</span>{toast.kind === 'error' && <button type="button" onClick={() => prices.refetch()}>Reload</button>}
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
    </div>}

    <div className="prices-page__filters" aria-label="Price filters">
      <select aria-label="Filter by service" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="">All services</option>{services.map(option('name'))}</select>
      <select aria-label="Filter by payment method" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">All payment methods</option>{methods.map(option('name'))}</select>
      <select aria-label="Filter by insurance company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="">All insurance companies</option>{companies.map(option('name'))}</select>
      <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
      <button type="button" disabled={prices.isFetching} onClick={() => prices.refetch()}>Refresh</button>
    </div>

    {prices.isLoading && <div className="prices-page__state" role="status">Loading prices…</div>}
    {prices.isError && <div className="prices-page__state prices-page__state--error" role="alert">Unable to load prices. <button onClick={() => prices.refetch()}>Reload</button></div>}
    {!prices.isLoading && !prices.isError && rows.length === 0 && <div className="prices-page__state">No prices found.</div>}
    {rows.length > 0 && <div className="prices-page__table"><table><thead><tr><th>Service</th><th>Payment method</th><th>Insurance company</th><th>Insurance class</th><th>Price</th><th>Currency</th><th>Valid from</th><th>Valid to</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {rows.map((price) => <tr key={price.id}><td>{price.service_name ?? label(services, price.service_id, 'name')}</td><td>{price.payment_method_name ?? label(methods, price.payment_method_id, 'name')}</td><td>{price.insurance_company_id ? price.insurance_company_name ?? label(companies, price.insurance_company_id, 'name') : '—'}</td><td>{price.insurance_class_id ? price.insurance_class_name ?? label(classes, price.insurance_class_id, 'class_name') : '—'}</td><td>{Number(price.price).toFixed(2)}</td><td>{price.currency}</td><td>{price.valid_from.slice(0, 10)}</td><td>{price.valid_to?.slice(0, 10) ?? 'Open-ended'}</td><td><span className={`prices-page__status prices-page__status--${price.is_active ? 'active' : 'inactive'}`}>{price.is_active ? 'Active' : 'Inactive'}</span></td><td className="prices-page__actions"><button type="button" onClick={() => open(price)}>{canUpdate ? 'Edit' : 'View'}</button>{canUpdate && <button type="button" disabled={status.isPending} onClick={() => window.confirm(`${price.is_active ? 'Deactivate' : 'Activate'} this price?`) && status.mutate({ id: price.id, active: !price.is_active })}>{price.is_active ? 'Deactivate' : 'Activate'}</button>}</td></tr>)}
    </tbody></table></div>}

    {editing !== undefined && <div className="prices-page__overlay" onMouseDown={(event) => event.target === event.currentTarget && !save.isPending && setEditing(undefined)}><div className="prices-page__dialog" role="dialog" aria-modal="true" aria-labelledby="price-dialog-title"><header><h3 id="price-dialog-title">{editing ? 'Edit price' : 'Add price'}</h3><button type="button" aria-label="Close" disabled={save.isPending} onClick={() => setEditing(undefined)}>×</button></header>
      <form onSubmit={submit}><div className="prices-page__form">
        <Field label="Service" error={errors.service_id}><select required disabled={!canUpdate && Boolean(editing)} value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value })}><option value="">Select service</option>{services.map(option('name'))}</select></Field>
        <Field label="Payment method" error={errors.payment_method_id}><select required disabled={!canUpdate && Boolean(editing)} value={form.payment_method_id} onChange={(event) => changePaymentMethod(event.target.value)}><option value="">Select payment method</option>{methods.map(option('name'))}</select></Field>
        {isInsurance && <><Field label="Insurance company" error={errors.insurance_company_id}><select required value={form.insurance_company_id ?? ''} onChange={(event) => setForm({ ...form, insurance_company_id: event.target.value || null, insurance_class_id: null })}><option value="">Select company</option>{companies.map(option('name'))}</select></Field>
        <Field label="Insurance class" error={errors.insurance_class_id}><select required value={form.insurance_class_id ?? ''} onChange={(event) => setForm({ ...form, insurance_class_id: event.target.value || null })}><option value="">Select class</option>{filteredClasses.map(option('class_name'))}</select></Field></>}
        <Field label="Price" error={errors.price}><input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
        <Field label="Currency" error={errors.currency}><input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></Field>
        <Field label="Valid from" error={errors.valid_from}><input required type="date" value={form.valid_from} onChange={(event) => setForm({ ...form, valid_from: event.target.value })} /></Field>
        <Field label="Valid to" error={errors.valid_to}><input type="date" min={form.valid_from} value={form.valid_to ?? ''} onChange={(event) => setForm({ ...form, valid_to: event.target.value || null })} /></Field>
        <label className="prices-page__check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label>
      </div><footer><button type="button" disabled={save.isPending} onClick={() => setEditing(undefined)}>Cancel</button>{(editing ? canUpdate : canCreate) && <button className="prices-page__primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save price'}</button>}</footer></form>
    </div></div>}
  </section>
}

function Field({ label: fieldLabel, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label>{fieldLabel}{children}{error && <span className="prices-page__field-error">{error}</span>}</label>
}

function option(field: string) {
  return (item: MasterDataRecord) => <option key={item.id} value={item.id}>{String(item[field] ?? 'Unavailable')}</option>
}

function label(items: MasterDataRecord[], id: string, field: string) {
  return String(items.find((item) => item.id === id)?.[field] ?? 'Unavailable')
}
