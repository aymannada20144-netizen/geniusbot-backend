import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAssistantIdentity, updateAssistantIdentity, type AssistantGender } from '../../api/assistantIdentityApi'
import { listMasterData, updateMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import './OperationalPages.css'

interface IdentityDraft { assistantName: string; assistantGender: AssistantGender }

export function SettingsPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const queryClient = useQueryClient()
  const clinicQuery = useQuery({ queryKey: ['master-data', clinicId, 'clinics'], queryFn: () => listMasterData(clinicId, 'clinics') })
  const clinic = clinicQuery.data?.[0]
  const [clinicDraft, setClinicDraft] = useState<Record<string, string> | null>(null)
  const clinicValues = clinicDraft ?? { name: String(clinic?.name ?? ''), phone: String(clinic?.phone ?? ''), whatsapp_number: String(clinic?.whatsapp_number ?? ''), timezone: String(clinic?.timezone ?? ''), default_language: String(clinic?.default_language ?? 'ar') }
  const saveClinic = useMutation({ mutationFn: () => updateMasterData(clinicId, 'clinics', clinic!.id, clinicValues), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId, 'clinics'] }); setClinicDraft(null) } })
  const canViewIdentity = user!.permissions.includes('ai_settings:view')
  const canUpdateIdentity = user!.permissions.includes('ai_settings:update')
  const identityQuery = useQuery({ queryKey: ['assistant-identity', clinicId], queryFn: () => getAssistantIdentity(clinicId), enabled: canViewIdentity })
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null)
  const [identitySuccess, setIdentitySuccess] = useState<string | null>(null)
  const identityValues = identityDraft ?? (identityQuery.data ? { assistantName: identityQuery.data.assistantName, assistantGender: identityQuery.data.assistantGender } : null)
  const saveIdentity = useMutation({
    mutationFn: (draft: IdentityDraft) => updateAssistantIdentity(clinicId, { ...draft, expectedUpdatedAt: identityQuery.data?.updatedAt ?? null }),
    onMutate: () => setIdentitySuccess(null),
    onSuccess: (data) => { queryClient.setQueryData(['assistant-identity', clinicId], data); setIdentityDraft(null); setIdentitySuccess('Assistant identity saved successfully.') },
  })
  function changeClinic(name: string, value: string) { setClinicDraft({ ...clinicValues, [name]: value }) }
  function submitClinic(event: FormEvent) { event.preventDefault(); if (!saveClinic.isPending) saveClinic.mutate() }
  function submitIdentity(event: FormEvent) { event.preventDefault(); if (identityValues && canUpdateIdentity && !saveIdentity.isPending) saveIdentity.mutate(identityValues) }
  const role = identityValues?.assistantGender === 'male' ? 'موظف الاستقبال الذكي' : 'موظفة الاستقبال الذكية'

  return <section className="operational-page">
    <header><div><p>System</p><h2>Settings</h2><span>Manage supported clinic profile and assistant settings. Secrets and integration credentials are not exposed.</span></div></header>
    {clinicQuery.isLoading && <div className="operational-state">Loading settings…</div>}
    {clinicQuery.isError && <div className="operational-state operational-error">Unable to load settings. <button type="button" onClick={() => clinicQuery.refetch()}>Retry</button></div>}
    {clinic && <form className="settings-card" onSubmit={submitClinic}><h3>Clinic profile</h3><div className="operational-form"><label>Clinic name<input required value={clinicValues.name} onChange={(event) => changeClinic('name', event.target.value)} /></label><label>Phone<input value={clinicValues.phone} onChange={(event) => changeClinic('phone', event.target.value)} /></label><label>WhatsApp number<input value={clinicValues.whatsapp_number} onChange={(event) => changeClinic('whatsapp_number', event.target.value)} /></label><label>Timezone<input required value={clinicValues.timezone} onChange={(event) => changeClinic('timezone', event.target.value)} /></label><label>Default language<select value={clinicValues.default_language} onChange={(event) => changeClinic('default_language', event.target.value)}><option value="ar">Arabic</option><option value="en">English</option></select></label></div>{saveClinic.isError && <p className="operational-error" role="alert">{saveClinic.error.message}</p>}<footer><button className="operational-primary" disabled={saveClinic.isPending || !clinicDraft}>{saveClinic.isPending ? 'Saving…' : 'Save clinic settings'}</button></footer></form>}
    {canViewIdentity && <section className="settings-card" aria-labelledby="assistant-identity-title"><h3 id="assistant-identity-title">Assistant Identity</h3><p className="settings-card__description">Choose the identity used inside automated conversations. This does not change the WhatsApp Business display name managed by Meta.</p>
      {identityQuery.isLoading && <div className="operational-state">Loading assistant identity…</div>}
      {identityQuery.isError && <div className="operational-state operational-error" role="alert">Unable to load assistant identity. <button type="button" onClick={() => identityQuery.refetch()}>Retry</button></div>}
      {identityValues && <form onSubmit={submitIdentity}><div className="operational-form"><label htmlFor="assistant-name">Assistant name<input id="assistant-name" required minLength={2} maxLength={40} autoComplete="off" value={identityValues.assistantName} disabled={!canUpdateIdentity || saveIdentity.isPending} onChange={(event) => { setIdentitySuccess(null); setIdentityDraft({ ...identityValues, assistantName: event.target.value }) }} aria-describedby="assistant-name-help" /></label><label htmlFor="assistant-gender">Gender<select id="assistant-gender" value={identityValues.assistantGender} disabled={!canUpdateIdentity || saveIdentity.isPending} onChange={(event) => { setIdentitySuccess(null); setIdentityDraft({ ...identityValues, assistantGender: event.target.value as AssistantGender }) }}><option value="female">Female</option><option value="male">Male</option></select></label></div>
        <p id="assistant-name-help" className="settings-card__hint">2–40 Arabic or English letters; spaces and hyphens are allowed.</p><div className="assistant-identity-preview" dir="rtl" aria-live="polite"><strong>Preview</strong><span>معك {identityValues.assistantName.trim() || 'شادن'}، {role} في {String(clinic?.name ?? 'العيادة')}.</span></div>{identitySuccess && <p className="operational-success" role="status">{identitySuccess}</p>}{saveIdentity.isError && <p className="operational-error" role="alert">{saveIdentity.error.message}</p>}<footer>{!canUpdateIdentity && <span className="settings-card__hint">You have view-only access.</span>}<button className="operational-primary" disabled={!canUpdateIdentity || saveIdentity.isPending}>{saveIdentity.isPending ? 'Saving…' : 'Save assistant identity'}</button></footer></form>}
    </section>}
  </section>
}
