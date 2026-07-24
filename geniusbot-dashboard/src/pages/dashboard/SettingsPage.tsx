import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { listMasterData, updateMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import './OperationalPages.css'

export function SettingsPage() {
  const { user } = useAuth()
  const clinicId = user!.clinicId
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['master-data', clinicId, 'clinics'], queryFn: () => listMasterData(clinicId, 'clinics') })
  const clinic = query.data?.[0]
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const values = draft ?? { name: String(clinic?.name ?? ''), phone: String(clinic?.phone ?? ''), whatsapp_number: String(clinic?.whatsapp_number ?? ''), timezone: String(clinic?.timezone ?? ''), default_language: String(clinic?.default_language ?? 'ar') }
  const save = useMutation({
    mutationFn: () => updateMasterData(clinicId, 'clinics', clinic!.id, values),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['master-data', clinicId, 'clinics'] }); setDraft(null) },
  })
  function change(name: string, value: string) { setDraft({ ...values, [name]: value }) }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate() }
  return <section className="operational-page">
    <header><div><p>System</p><h2>Settings</h2><span>Manage supported clinic profile settings. Secrets and integration credentials are not exposed.</span></div></header>
    {query.isLoading && <div className="operational-state">Loading settings…</div>}
    {query.isError && <div className="operational-state operational-error">Unable to load settings. <button onClick={() => query.refetch()}>Retry</button></div>}
    {clinic && <form className="settings-card" onSubmit={submit}><div className="operational-form"><label>Clinic name<input required value={values.name} onChange={(e) => change('name', e.target.value)} /></label><label>Phone<input value={values.phone} onChange={(e) => change('phone', e.target.value)} /></label><label>WhatsApp number<input value={values.whatsapp_number} onChange={(e) => change('whatsapp_number', e.target.value)} /></label><label>Timezone<input required value={values.timezone} onChange={(e) => change('timezone', e.target.value)} /></label><label>Default language<select value={values.default_language} onChange={(e) => change('default_language', e.target.value)}><option value="ar">Arabic</option><option value="en">English</option></select></label></div>{save.isError && <p className="operational-error">{save.error.message}</p>}<footer><button className="operational-primary" disabled={save.isPending || !draft}>{save.isPending ? 'Saving…' : 'Save Settings'}</button></footer></form>}
  </section>
}
