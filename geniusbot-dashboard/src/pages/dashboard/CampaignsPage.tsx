import { useEffect, useMemo, useState } from 'react'
import { campaignErrorMessage } from '../../api/campaignErrors'
import {
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getCampaigns,
  getCampaignTemplates,
  previewCampaignAudience,
  sendCampaign,
  updateCampaign,
  type CampaignAudiencePreview,
  type CampaignAudienceType,
  type CampaignRecord,
  type CampaignStatus,
  type CampaignTemplate,
} from '../../api/campaignsApi'
import { listMasterData, type MasterDataRecord } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { canSendCampaigns } from '../../auth/notificationPermissions'
import { Button } from '../../components/ui/Button/Button'
import { useLanguage } from '../../i18n/useLanguage'
import './CampaignsPage.css'

const emptyPreview: CampaignAudiencePreview = {
  eligible: 0,
  inactive: 0,
  no_marketing_consent: 0,
  no_whatsapp: 0,
}

type CampaignDeliveryMode = 'sendNow' | 'schedule'

export function scheduledAtForCampaignSubmission(
  deliveryMode: CampaignDeliveryMode,
  scheduledAt: string,
) {
  if (deliveryMode === 'sendNow' || !scheduledAt) return null
  const date = new Date(scheduledAt)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function deliveryModeForCampaign(campaign: Pick<CampaignRecord, 'status' | 'scheduled_at'>): CampaignDeliveryMode {
  return campaign.status === 'scheduled' && Boolean(campaign.scheduled_at) ? 'schedule' : 'sendNow'
}

export function newCampaignComposerTiming() {
  return { deliveryMode: 'sendNow' as const, scheduledAt: '' }
}

export async function createAndDispatchCampaign(
  deliveryMode: CampaignDeliveryMode,
  create: () => Promise<Pick<CampaignRecord, 'id'>>,
  send: (campaignId: string) => Promise<unknown>,
) {
  const campaign = await create()
  if (deliveryMode === 'sendNow') await send(campaign.id)
  return campaign
}

export function toLocalDateTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatWhen(value: string | null, language: 'ar' | 'en') {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function CampaignsPage() {
  const { user } = useAuth()
  const { language } = useLanguage()
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [templates, setTemplates] = useState<CampaignTemplate[]>([])
  const [branches, setBranches] = useState<MasterDataRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [audienceType, setAudienceType] = useState<CampaignAudienceType>('all')
  const [branchId, setBranchId] = useState('')
  const [offerTitle, setOfferTitle] = useState('')
  const [priceOrDiscount, setPriceOrDiscount] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<CampaignDeliveryMode>('sendNow')
  const [scheduledAt, setScheduledAt] = useState('')
  const [preview, setPreview] = useState<CampaignAudiencePreview>(emptyPreview)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('')
  const [templateFilter, setTemplateFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const canSend = canSendCampaigns(user?.permissions)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const listFilters = useMemo(() => ({
    search: debouncedSearch,
    status: statusFilter,
    templateName: templateFilter,
    dateFrom,
    dateTo,
  }), [debouncedSearch, statusFilter, templateFilter, dateFrom, dateTo])
  const hasActiveFilters = Boolean(search.trim() || statusFilter || templateFilter || dateFrom || dateTo)

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.name === templateName) || null,
    [templateName, templates],
  )

  async function reloadCampaigns() {
    setLoading(true)
    setError(null)
    try {
      const [campaignRows, templateRows, branchRows] = await Promise.all([
        getCampaigns(user!.clinicId, listFilters),
        getCampaignTemplates(user!.clinicId),
        listMasterData(user!.clinicId, 'branches'),
      ])
      setCampaigns(campaignRows)
      setTemplates(templateRows)
      setBranches(branchRows.filter((item) => item.is_active !== false))
      setTemplateName((current) => current || templateRows[0]?.name || '')
    } catch {
      setError('Unable to load campaigns.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([
      getCampaigns(user!.clinicId, listFilters),
      getCampaignTemplates(user!.clinicId),
      listMasterData(user!.clinicId, 'branches'),
    ]).then(([campaignRows, templateRows, branchRows]) => {
      if (!active) return
      setCampaigns(campaignRows)
      setTemplates(templateRows)
      setBranches(branchRows.filter((item) => item.is_active !== false))
      setTemplateName((current) => current || templateRows[0]?.name || '')
    }).catch(() => {
      if (active) setError('Unable to load campaigns.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [user, listFilters])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) setPreviewLoading(true)
      return previewCampaignAudience(
        user!.clinicId,
        audienceType,
        audienceType === 'branch' ? branchId : null,
      )
    }).then((value) => {
      if (active) setPreview(value)
    }).catch(() => {
      if (active) setPreview(emptyPreview)
    }).finally(() => {
      if (active) setPreviewLoading(false)
    })
    return () => { active = false }
  }, [audienceType, branchId, user])

  function resetComposer() {
    const timing = newCampaignComposerTiming()
    setEditingCampaignId(null)
    setName('')
    setTemplateName(templates[0]?.name || '')
    setAudienceType('all')
    setBranchId('')
    setOfferTitle('')
    setPriceOrDiscount('')
    setValidUntil('')
    setDeliveryMode(timing.deliveryMode)
    setScheduledAt(timing.scheduledAt)
  }

  function openNewComposer() {
    resetComposer()
    setError(null)
    setShowComposer(true)
  }

  function openEditComposer(campaign: CampaignRecord) {
    if (!['draft', 'scheduled'].includes(campaign.status)) return
    setEditingCampaignId(campaign.id)
    setName(campaign.name)
    setTemplateName(campaign.template_name)
    setAudienceType(campaign.audience_type)
    setBranchId(campaign.branch_id || '')
    setOfferTitle(String(campaign.variables?.offerTitle || ''))
    setPriceOrDiscount(String(campaign.variables?.priceOrDiscount || ''))
    setValidUntil(String(campaign.variables?.validUntil || ''))
    const mode = deliveryModeForCampaign(campaign)
    setDeliveryMode(mode)
    setScheduledAt(mode === 'schedule' ? toLocalDateTimeInput(campaign.scheduled_at) : '')
    setError(null)
    setShowComposer(true)
  }

  function closeComposer() {
    if (saving) return
    setShowComposer(false)
    resetComposer()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!templateName || !name.trim() || preview.eligible < 1) return
    if (audienceType === 'branch' && !branchId) return
    const scheduledAtIso = scheduledAtForCampaignSubmission(deliveryMode, scheduledAt)
    if (deliveryMode === 'schedule' && !scheduledAtIso) {
      setError('Choose a valid date and time before scheduling.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input = {
        name: name.trim(),
        templateName,
        audienceType,
        branchId: audienceType === 'branch' ? branchId : null,
        variables: selectedTemplate?.kind === 'offer'
          ? { offerTitle, priceOrDiscount, validUntil }
          : {},
        scheduledAt: scheduledAtIso,
      }
      if (editingCampaignId) {
        await updateCampaign(user!.clinicId, editingCampaignId, input)
      } else {
        await createAndDispatchCampaign(
          deliveryMode,
          () => createCampaign(user!.clinicId, input),
          (campaignId) => sendCampaign(user!.clinicId, campaignId),
        )
      }
      setShowComposer(false)
      resetComposer()
      await reloadCampaigns()
    } catch (cause) {
      setError(campaignErrorMessage(cause, language))
    } finally {
      setSaving(false)
    }
  }

  async function sendNow(campaignId: string) {
    if (!window.confirm('Send this campaign now?')) return
    setRowBusy(campaignId)
    try {
      await sendCampaign(user!.clinicId, campaignId)
      await reloadCampaigns()
    } catch (cause) {
      setError(campaignErrorMessage(cause, language))
    } finally {
      setRowBusy(null)
    }
  }

  async function cancel(campaignId: string) {
    if (!window.confirm('Cancel this campaign?')) return
    setRowBusy(campaignId)
    try {
      await cancelCampaign(user!.clinicId, campaignId)
      await reloadCampaigns()
    } catch (cause) {
      setError(campaignErrorMessage(cause, language))
    } finally {
      setRowBusy(null)
    }
  }

  async function remove(campaign: CampaignRecord) {
    if (!window.confirm(`هل تريد حذف هذه الحملة؟\n${campaign.name}`)) return
    setRowBusy(campaign.id)
    try {
      await deleteCampaign(user!.clinicId, campaign.id)
      await reloadCampaigns()
    } catch (cause) {
      setError(campaignErrorMessage(cause, language))
    } finally {
      setRowBusy(null)
    }
  }

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('')
    setTemplateFilter('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="campaigns-page">
      {!showComposer && <>
      <section className="campaigns-hero">
        <div>
          <p className="campaigns-eyebrow">WhatsApp Marketing</p>
          <h1>Campaigns</h1>
          <p>Create approved-template broadcasts for marketing-consented patients only.</p>
        </div>
        {canSend && <Button onClick={openNewComposer}>New Campaign</Button>}
      </section>

      <section className="campaigns-kpis" aria-label="Campaign summary">
        <article><span>Campaigns</span><strong>{campaigns.length}</strong></article>
        <article><span>Scheduled</span><strong>{campaigns.filter((item) => item.status === 'scheduled').length}</strong></article>
        <article><span>Delivered</span><strong>{campaigns.reduce((sum, item) => sum + item.delivered_count, 0)}</strong></article>
        <article><span>Read</span><strong>{campaigns.reduce((sum, item) => sum + item.read_count, 0)}</strong></article>
      </section>

      {error && <p className="campaigns-error" role="alert" data-i18n-ignore>{error}</p>}

      <section className="campaigns-card">
        <header><div><h2>Campaign history</h2><p>Delivery and engagement from Meta status callbacks.</p></div><Button variant="secondary" onClick={() => void reloadCampaigns()}>Refresh</Button></header>
        <div className="campaigns-filters" aria-label="Campaign filters">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الحملة أو القالب..." aria-label="Search campaigns" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CampaignStatus | '')} aria-label="Campaign status"><option value="">All statuses</option><option value="draft">draft</option><option value="scheduled">scheduled</option><option value="running">running</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select>
          <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)} aria-label="Campaign template"><option value="">All templates</option>{templates.map((template) => <option key={template.name} value={template.name}>{template.label}</option>)}</select>
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button type="button" onClick={clearFilters} disabled={!hasActiveFilters}>مسح الفلاتر</button>
        </div>
        {loading ? <p className="campaigns-state">Loading campaigns…</p> : campaigns.length === 0 ? (
          <div className="campaigns-empty"><strong>{hasActiveFilters ? 'لا توجد حملات تطابق البحث أو الفلاتر' : 'No campaigns yet.'}</strong><span>{hasActiveFilters ? 'غيّر البحث أو الفلاتر لعرض حملات أخرى.' : 'Create your first occasion or promotional broadcast.'}</span></div>
        ) : (
          <div className="campaigns-table-wrap">
            <table className="campaigns-table">
              <thead><tr><th>Name</th><th>Template</th><th>Status</th><th>Audience</th><th>Scheduled</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Actions</th></tr></thead>
              <tbody>{campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td data-i18n-ignore><strong>{campaign.name}</strong></td>
                  <td data-i18n-ignore>{campaign.template_name}</td>
                  <td><span className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status}</span></td>
                  <td>{campaign.total_recipients}</td>
                  <td>{formatWhen(campaign.scheduled_at, language)}</td>
                  <td>{campaign.sent_count}</td><td>{campaign.delivered_count}</td><td>{campaign.read_count}</td><td>{campaign.failed_count}</td>
                  <td><div className="campaign-row-actions">
                    {canSend && ['draft','scheduled'].includes(campaign.status) && <button className="campaign-action-edit" disabled={rowBusy === campaign.id} onClick={() => openEditComposer(campaign)}>Edit</button>}
                    {canSend && campaign.status === 'draft' && <button disabled={rowBusy === campaign.id} onClick={() => void sendNow(campaign.id)}>Send now</button>}
                    {canSend && ['draft','scheduled'].includes(campaign.status) && <button className="campaign-action-danger campaign-action-cancel" disabled={rowBusy === campaign.id} onClick={() => void cancel(campaign.id)}>Cancel</button>}
                    {canSend && <button className="campaign-action-danger campaign-action-delete" title={campaign.status === 'running' ? 'Running campaigns cannot be deleted.' : undefined} disabled={rowBusy === campaign.id || campaign.status === 'running'} onClick={() => void remove(campaign)}>Delete</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      </>}
      {showComposer && <div className="campaign-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeComposer() }}>
        <form className="campaign-dialog" onSubmit={submit}>
          <header><div><p>Broadcast composer</p><h2>{editingCampaignId ? 'Edit Campaign' : 'New Campaign'}</h2></div><button type="button" aria-label="Close" onClick={closeComposer}>×</button></header>
          <div className="campaign-form">
            {error && <p className="campaigns-error campaign-form__wide" role="alert" data-i18n-ignore>{error}</p>}
            <label>Campaign name *<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="September laser offer" /></label>
            <label>Template *<select required value={templateName} onChange={(event) => setTemplateName(event.target.value)}>{templates.map((template) => <option key={template.name} value={template.name}>{template.label}</option>)}</select></label>
            <label>Audience *<select value={audienceType} onChange={(event) => setAudienceType(event.target.value as CampaignAudienceType)}><option value="all">All eligible patients</option><option value="branch">Patients of a branch</option></select></label>
            {audienceType === 'branch' && <label>Branch *<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select branch…</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{String(branch.name ?? branch.id)}</option>)}</select></label>}
            {selectedTemplate?.kind === 'offer' && <>
              <label className="campaign-form__wide">Offer *<input required value={offerTitle} onChange={(event) => setOfferTitle(event.target.value)} placeholder="Laser hair removal package" /></label>
              <label>Price / discount *<input required value={priceOrDiscount} onChange={(event) => setPriceOrDiscount(event.target.value)} placeholder="20% discount" /></label>
              <label>Valid until *<input required value={validUntil} onChange={(event) => setValidUntil(event.target.value)} placeholder="30 September 2026" /></label>
            </>}
            <label>Delivery *<select value={deliveryMode} onChange={(event) => {
              const mode = event.target.value as CampaignDeliveryMode
              setDeliveryMode(mode)
              if (mode === 'sendNow') setScheduledAt('')
            }}><option value="sendNow">Send now</option><option value="schedule">Schedule</option></select></label>
            {deliveryMode === 'schedule' && <label>Schedule date and time *<input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}
          </div>
          <aside className="campaign-audience-preview">
            <div><span>Eligible</span><strong>{previewLoading ? '…' : preview.eligible}</strong></div>
            <div><span>No marketing consent</span><strong>{preview.no_marketing_consent}</strong></div>
            <div><span>No WhatsApp</span><strong>{preview.no_whatsapp}</strong></div>
            <p>Only patients with recorded WhatsApp marketing consent are included.</p>
          </aside>
          <footer><button type="button" className="campaign-dialog-cancel" onClick={closeComposer}>Cancel</button><Button type="submit" disabled={saving || preview.eligible < 1}>{saving ? (editingCampaignId ? 'Updating…' : 'Creating…') : editingCampaignId ? 'Save Changes' : deliveryMode === 'schedule' ? 'Schedule Campaign' : 'Create Draft'}</Button></footer>
        </form>
      </div>}
    </div>
  )
}
