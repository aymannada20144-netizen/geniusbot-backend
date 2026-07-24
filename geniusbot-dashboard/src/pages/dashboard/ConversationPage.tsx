import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPatientConversation, sendHumanMessage, setConversationOwnership, startHumanConversation } from '../../api/patientsApi'
import type { PatientConversation } from '../../api/patientsApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { Button } from '../../components/ui/Button/Button'
import { isApiError } from '../../api/apiError'
import './PatientsPage.css'

export function ConversationPage() {
  const { user } = useAuth()
  const { patientId = '' } = useParams()
  const [data, setData] = useState<PatientConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getPatientConversation(user!.clinicId, patientId)
      .then((value) => active && setData(value))
      .catch(() => active && setError('Unable to load conversation.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [patientId, user])

  async function changeOwnership(action: 'takeover' | 'return-to-shaden') {
    if (!data) return
    setBusy(true); setError('')
    try {
      if (!data.conversation) {
        const result = await startHumanConversation(user!.clinicId, patientId)
        setData({ ...data, conversation: { id: result.id, status: result.status }, ownership: result.ownership })
      } else {
        const result = await setConversationOwnership(user!.clinicId, data.conversation.id, action)
        setData({ ...data, ownership: result.ownership })
      }
    } catch (caughtError) {
      setError(isApiError(caughtError) ? caughtError.message : 'Unable to change conversation handling.')
    } finally { setBusy(false) }
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!data?.conversation || !body.trim()) return
    setBusy(true); setError('')
    try {
      const message = await sendHumanMessage(user!.clinicId, data.conversation.id, body.trim())
      const messages = [...data.messages, message].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      setData({ ...data, messages }); setBody('')
    } catch (caughtError) {
      setError(isApiError(caughtError) ? caughtError.message : 'Message could not be delivered. Please try again.')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="patients-state">Loading conversation…</div>
  if (!data) return <div className="patients-state patients-state--error">{error || 'Conversation not found.'}</div>
  const label = data.ownership === 'HUMAN_HANDLING' ? 'Human Handling' : data.ownership === 'AI_HANDLING' ? 'AI Handling' : 'No Conversation'
  const badge = data.ownership === 'HUMAN_HANDLING' ? 'human' : data.ownership === 'AI_HANDLING' ? 'ai' : 'none'

  return <section className="conversation-page">
    <Link className="conversation-back" to="/dashboard/patients">← Back to Patients</Link>
    <header className="conversation-header"><div><h2>{data.patient.fullName}</h2><p>{data.patient.phoneNumber}</p></div><div className="conversation-controls"><span className={`handling-badge handling-badge--${badge}`}>{label}</span>{data.ownership === 'HUMAN_HANDLING' ? <Button size="sm" disabled={busy} onClick={() => changeOwnership('return-to-shaden')}>Return to Shaden</Button> : <Button size="sm" disabled={busy} onClick={() => changeOwnership('takeover')}>{data.conversation ? 'Take Over' : 'Start Human Conversation'}</Button>}</div></header>
    {error && <p className="conversation-error" role="alert">{error}</p>}
    <div className="messages">{data.messages.length === 0 ? <div className="conversation-empty"><strong>{data.conversation ? 'No messages yet.' : 'No conversation yet.'}</strong><span>{data.conversation ? 'New messages will appear here.' : 'Start human handling to contact this patient.'}</span></div> : data.messages.map((message) => <article className={`message message--${message.senderType}`} key={message.id}><strong>{message.senderType === 'patient' ? 'Patient' : message.senderType === 'bot' ? 'Shaden' : message.senderType === 'staff' ? 'Human staff' : 'System'}</strong><p>{message.messageText}</p><time>{new Date(message.createdAt).toLocaleString()}</time></article>)}</div>
    {data.ownership === 'HUMAN_HANDLING' && <form className="message-composer" onSubmit={send}><textarea aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" disabled={busy} /><Button type="submit" isLoading={busy} disabled={busy || !body.trim()}>Send</Button></form>}
  </section>
}
