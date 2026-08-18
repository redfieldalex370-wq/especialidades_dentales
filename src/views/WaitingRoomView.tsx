import { FormEvent, useDeferredValue, useMemo, useState } from 'react'
import type { CalendarAppointment, CrmLead, KioskFlow, KioskLeadStatus } from '../types'

interface Props {
  leads: CrmLead[]
  calendarAppointments: CalendarAppointment[]
  calendarLoading: boolean
  loading: boolean
  onRefresh: () => void
  onOpenLead: (leadId: string) => void
  onRegisterWalkIn: (name: string, phone: string) => Promise<CrmLead>
  onUpdateLeadStatus: (leadId: string, kioskStatus: KioskLeadStatus, kioskFlow?: KioskFlow) => Promise<void>
}

export function WaitingRoomView({
  leads,
  calendarAppointments,
  calendarLoading,
  loading,
  onRefresh,
  onOpenLead,
  onRegisterWalkIn,
  onUpdateLeadStatus,
}: Props) {
  const [mode, setMode] = useState<KioskFlow>('con_cita')
  const [nameSearch, setNameSearch] = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busyLeadId, setBusyLeadId] = useState('')
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false)

  const deferredNameSearch = useDeferredValue(nameSearch)
  const deferredPhoneSearch = useDeferredValue(phoneSearch)

  const todayAppointments = useMemo(
    () =>
      calendarAppointments
        .filter((item) => isSameDay(item.start, new Date()) && isActiveCalendarAppointment(item.status))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [calendarAppointments],
  )

  const visiblePatients = useMemo(() => {
    const normalizedName = deferredNameSearch.trim().toLowerCase()
    const normalizedPhone = deferredPhoneSearch.trim().replace(/\D/g, '')
    if (!normalizedName && !normalizedPhone) return []

    const source = mode === 'con_cita'
      ? leads.filter((lead) => calendarAppointments.some((item) => item.matchedLeadId === lead.id))
      : leads

    return source
      .filter((lead) => {
        const matchesName = normalizedName ? lead.name.toLowerCase().includes(normalizedName) : true
        const phoneHaystack = `${lead.phone} ${lead.waId}`.replace(/\D/g, '')
        const matchesPhone = normalizedPhone ? phoneHaystack.includes(normalizedPhone) : true
        return matchesName && matchesPhone
      })
      .sort((a, b) => comparePreferred(a, b))
      .slice(0, 8)
  }, [deferredNameSearch, deferredPhoneSearch, leads, mode])

  const currentPatient = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'en_consulta')
        .sort((a, b) => compareByArrival(a, b))[0] ?? null,
    [leads],
  )

  const waitingPatients = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'en_espera')
        .sort((a, b) => compareByArrival(a, b)),
    [leads],
  )

  const finishedPatients = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'finalizada')
        .sort((a, b) => compareByArrival(b, a))
        .slice(0, 6),
    [leads],
  )

  const pendingToday = useMemo(() => {
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
    return todayAppointments
      .filter((item) => {
        const lead = item.matchedLeadId ? leadsById.get(item.matchedLeadId) : null
        return !lead || lead.kioskStatus === 'pendiente'
      })
      .slice(0, 8)
  }, [todayAppointments, leads])

  async function handleArrival(lead: CrmLead, kioskFlow: KioskFlow) {
    setBusyLeadId(lead.id)
    setActionMessage('')

    try {
      await onUpdateLeadStatus(lead.id, 'en_espera', kioskFlow)
      setActionMessage(`Llegada registrada para ${lead.name}.`)
      setNameSearch('')
      setPhoneSearch('')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo registrar la llegada.')
    } finally {
      setBusyLeadId('')
    }
  }

  async function handleStatusChange(leadId: string, status: KioskLeadStatus) {
    setBusyLeadId(leadId)
    setActionMessage('')

    try {
      await onUpdateLeadStatus(leadId, status)
      setActionMessage('Estado actualizado en Supabase.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo actualizar el estado.')
    } finally {
      setBusyLeadId('')
    }
  }

  async function handleWalkInSubmit(event: FormEvent) {
    event.preventDefault()
    if (!walkInName.trim() || !walkInPhone.trim()) {
      setActionMessage('Escribe nombre y telefono para registrar al paciente.')
      return
    }

    setSubmittingWalkIn(true)
    setActionMessage('')

    try {
      const lead = await onRegisterWalkIn(walkInName.trim(), walkInPhone.trim())
      setActionMessage(`Paciente registrado en espera: ${lead.name}.`)
      setWalkInName('')
      setWalkInPhone('')
      onOpenLead(lead.id)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo registrar el paciente sin cita.')
    } finally {
      setSubmittingWalkIn(false)
    }
  }

  return (
    <div className="view-stack">
      <section className="panel kiosk-entry-panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Kiosko</span>
            <h2>Llegada del paciente</h2>
          </div>
          <div className="hero-actions">
            <span className="soft-pill">{todayAppointments.length} citas confirmadas hoy</span>
            <button className="secondary-button" onClick={onRefresh} disabled={loading}>
              {loading || calendarLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div className="kiosk-mode-switch">
          <button className={mode === 'con_cita' ? 'mode-pill active' : 'mode-pill'} onClick={() => setMode('con_cita')}>Tengo cita</button>
          <button className={mode === 'sin_cita' ? 'mode-pill active' : 'mode-pill'} onClick={() => setMode('sin_cita')}>No tengo cita</button>
        </div>

        {mode === 'con_cita' ? (
          <div className="kiosk-search-block">
            <div className="patient-browser-bar patient-browser-bar-compact">
              <input
                className="patient-search-input"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Nombre"
              />
              <input
                className="patient-search-input"
                value={phoneSearch}
                onChange={(event) => setPhoneSearch(event.target.value)}
                placeholder="Telefono"
              />
            </div>

            <div className="patient-browser-list">
              {nameSearch.trim() || phoneSearch.trim() ? (
                visiblePatients.length > 0 ? (
                  visiblePatients.map((lead) => (
                    <article className="patient-browser-row patient-browser-card" key={lead.id}>
                      <button className="patient-browser-main" onClick={() => onOpenLead(lead.id)}>
                        <strong>{lead.name}</strong>
                        <span>{lead.phone || lead.waId || 'Sin telefono'}</span>
                      </button>

                      <div className="patient-browser-date">
                        <strong>{lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Sin cita'}</strong>
                        <span>{lead.kioskStatus.replaceAll('_', ' ')}</span>
                      </div>

                      <div className="patient-browser-actions">
                        <button
                          className="primary-button"
                          onClick={() => void handleArrival(lead, 'con_cita')}
                          disabled={busyLeadId === lead.id}
                        >
                          {busyLeadId === lead.id ? 'Guardando...' : 'Marcar llegada'}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state empty-state-compact">
                    <h3>No encontramos una cita</h3>
                    <p>Prueba con otro nombre o telefono.</p>
                  </div>
                )
              ) : (
                <div className="empty-state empty-state-compact">
                  <h3>Busca al paciente</h3>
                  <p>Escribe nombre o telefono para marcar llegada.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form className="walkin-panel" onSubmit={handleWalkInSubmit}>
            <label className="field-row field-row-editable">
              <span>Nombre</span>
              <input className="field-input" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} />
            </label>
            <label className="field-row field-row-editable">
              <span>Telefono</span>
              <input className="field-input" value={walkInPhone} onChange={(event) => setWalkInPhone(event.target.value)} />
            </label>
            <button className="primary-button" type="submit" disabled={submittingWalkIn}>
              {submittingWalkIn ? 'Registrando...' : 'Registrar en espera'}
            </button>
          </form>
        )}

        {actionMessage && <p className="inline-helper">{actionMessage}</p>}
      </section>

      <section className="metric-grid">
          <MetricCard label="Citas de hoy" value={todayAppointments.length} hint="confirmadas" />
        <MetricCard label="Ya llegaron" value={waitingPatients.length + (currentPatient ? 1 : 0)} hint="recepcion" />
        <MetricCard label="En consulta" value={currentPatient ? 1 : 0} hint="doctor" />
        <MetricCard label="Pendientes" value={pendingToday.length} hint="sin llegada" />
      </section>

      <section className="crm-dashboard-grid waiting-room-grid">
        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Consulta actual</span>
              <h2>{currentPatient ? currentPatient.name : 'Sin paciente en consulta'}</h2>
            </div>
          </div>

          {currentPatient ? (
            <div className="waiting-current-card">
              <div className="field-grid">
                <Field label="Telefono" value={currentPatient.phone || currentPatient.waId || 'Sin telefono'} />
                <Field label="Hora de cita" value={currentPatient.appointmentDate ? formatTime(currentPatient.appointmentDate) : 'Sin cita'} />
                <Field label="Llegada" value={currentPatient.arrivalAt ? formatTime(currentPatient.arrivalAt) : 'Sin registro'} />
                <Field label="Tratamiento" value={currentPatient.treatment || 'Pendiente'} />
              </div>
              <div className="patient-browser-actions">
                <button className="secondary-button" onClick={() => onOpenLead(currentPatient.id)}>Abrir ficha</button>
                <button className="primary-button" onClick={() => void handleStatusChange(currentPatient.id, 'finalizada')} disabled={busyLeadId === currentPatient.id}>
                  {busyLeadId === currentPatient.id ? 'Guardando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state empty-state-compact">
              <h3>No hay consulta en curso</h3>
              <p>Cuando recepcion marque llegada, podras pasar al paciente desde esta vista.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Sala de espera</span>
              <h2>Quien sigue</h2>
            </div>
            <span className="soft-pill">{waitingPatients.length} esperando</span>
          </div>

          <div className="appointment-list">
            {waitingPatients.length > 0 ? (
              waitingPatients.map((lead) => (
                <article className="appointment-card appointment-card-static" key={lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{lead.appointmentDate ? formatTime(lead.appointmentDate) : 'Sin cita'} · llegó {lead.arrivalAt ? formatTime(lead.arrivalAt) : 'ahora'}</span>
                  </div>
                  <div className="patient-browser-actions">
                    <button className="secondary-button" onClick={() => onOpenLead(lead.id)}>Ficha</button>
                    <button className="primary-button" onClick={() => void handleStatusChange(lead.id, 'en_consulta')} disabled={busyLeadId === lead.id}>
                      Pasar
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyCopy title="Sin pacientes en espera" text="No hay llegadas registradas en este momento." compact />
            )}
          </div>
        </article>
      </section>

      <section className="crm-dashboard-grid waiting-room-grid">
        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Agenda del dia</span>
              <h2>Pacientes de hoy</h2>
            </div>
          </div>

          <div className="appointment-list">
            {todayAppointments.length > 0 ? (
              todayAppointments.map((appointment) => (
                <button
                  className="appointment-card"
                  key={appointment.id}
                  onClick={() => appointment.matchedLeadId && onOpenLead(appointment.matchedLeadId)}
                  disabled={!appointment.matchedLeadId}
                >
                  <div>
                    <strong>{appointment.patientName || appointment.title}</strong>
                    <span>{appointment.title}</span>
                  </div>
                  <div className="appointment-card-meta">
                    <strong>{formatTime(appointment.start)}</strong>
                    <span>{appointment.matchedLeadId ? 'Ficha disponible' : 'Solo Calendar'}</span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyCopy title="Sin citas del dia" text="Aun no hay citas confirmadas para hoy." compact />
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Cerradas</span>
              <h2>Atenciones finalizadas</h2>
            </div>
            <span className="soft-pill">{finishedPatients.length} recientes</span>
          </div>

          <div className="appointment-list">
            {finishedPatients.length > 0 ? (
              finishedPatients.map((lead) => (
                <button className="appointment-card" key={lead.id} onClick={() => onOpenLead(lead.id)}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{lead.treatment || 'Consulta finalizada'}</span>
                  </div>
                  <div className="appointment-card-meta">
                    <strong>{lead.arrivalAt ? formatTime(lead.arrivalAt) : 'Sin hora'}</strong>
                    <span>Finalizada</span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyCopy title="Nada finalizado" text="Todavia no se ha cerrado una atencion hoy." compact />
            )}
          </div>
        </article>
      </section>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  )
}

function EmptyCopy({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function isSameDay(value: string, target: Date): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toDateString() === target.toDateString()
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function compareByArrival(left: CrmLead, right: CrmLead): number {
  const leftTime = left.arrivalAt ? new Date(left.arrivalAt).getTime() : Number.POSITIVE_INFINITY
  const rightTime = right.arrivalAt ? new Date(right.arrivalAt).getTime() : Number.POSITIVE_INFINITY
  return leftTime - rightTime
}

function comparePreferred(left: CrmLead, right: CrmLead): number {
  const leftScore = left.appointmentConfirmed ? 0 : 1
  const rightScore = right.appointmentConfirmed ? 0 : 1
  if (leftScore !== rightScore) return leftScore - rightScore
  return compareByArrival(left, right)
}

function labelForKioskStatus(status: KioskLeadStatus): string {
  switch (status) {
    case 'en_espera':
      return 'Ya llegó'
    case 'en_consulta':
      return 'En consulta'
    case 'finalizada':
      return 'Finalizada'
    default:
      return 'Pendiente'
  }
}

function isActiveCalendarAppointment(status: string): boolean {
  const normalized = status.toLowerCase()
  return !normalized.includes('cancel')
}
