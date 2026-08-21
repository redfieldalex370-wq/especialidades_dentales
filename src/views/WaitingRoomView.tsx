import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { CalendarAppointment, CrmLead, KioskFlow, KioskLeadStatus } from '../types'
import { canonicalMxPhoneKey, phonesMatchMx } from '../lib/phone'

interface Props {
  leads: CrmLead[]
  calendarAppointments: CalendarAppointment[]
  calendarLoading: boolean
  loading: boolean
  onRefresh: () => void
  onOpenLead: (leadId: string) => void
  onRegisterWalkIn: (
    name: string,
    phone: string,
    appointmentType?: 'valoracion' | 'limpieza',
    appointmentStart?: string,
  ) => Promise<CrmLead>
  onUpdateLeadStatus: (leadId: string, kioskStatus: KioskLeadStatus, kioskFlow?: KioskFlow) => Promise<void>
  onCallNextPatient: (mode: 'automatico' | 'manual') => Promise<CrmLead | null>
  onFinalizeConsultationByLead: (leadId: string, mode: 'manual' | 'telegram') => Promise<{ finalizedLead: CrmLead | null; calledNextLead: CrmLead | null }>
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
  onCallNextPatient,
  onFinalizeConsultationByLead,
}: Props) {
  const [mode, setMode] = useState<KioskFlow>('con_cita')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [searchedPhone, setSearchedPhone] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInAppointmentType, setWalkInAppointmentType] = useState<'valoracion' | 'limpieza'>('valoracion')
  const [walkInAppointmentDate, setWalkInAppointmentDate] = useState('')
  const [walkInAppointmentTime, setWalkInAppointmentTime] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busyLeadId, setBusyLeadId] = useState('')
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [welcomeName, setWelcomeName] = useState('')

  const todayAppointments = useMemo(
    () =>
      calendarAppointments
        .filter((item) => isSameDay(item.start, new Date()) && isActiveCalendarAppointment(item.status) && isWithinClinicSchedule(new Date(item.start)))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [calendarAppointments],
  )

  const availableAppointmentSlots = useMemo(
    () => getAvailableAppointmentSlots(walkInAppointmentDate, calendarAppointments),
    [calendarAppointments, walkInAppointmentDate],
  )

  const todayAppointmentLeadIds = useMemo(
    () => new Set(todayAppointments.map((item) => item.matchedLeadId).filter(Boolean)),
    [todayAppointments],
  )

  const todayScheduledLeads = useMemo(
    () =>
      leads
        .filter((lead) => todayAppointmentLeadIds.has(lead.id))
        .sort((a, b) => compareByAppointment(a, b)),
    [leads, todayAppointmentLeadIds],
  )

  const currentPatient = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'en_consulta' && isRelevantForToday(lead, todayAppointmentLeadIds))
        .sort((a, b) => compareByArrival(a, b))[0] ?? null,
    [leads, todayAppointmentLeadIds],
  )

  const waitingPatients = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'en_espera' && isRelevantForToday(lead, todayAppointmentLeadIds))
        .sort((a, b) => compareWaitingOrder(a, b)),
    [leads, todayAppointmentLeadIds],
  )

  const finishedPatients = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskStatus === 'finalizada' && isRelevantForToday(lead, todayAppointmentLeadIds))
        .sort((a, b) => compareRecentActivity(b, a))
        .slice(0, 6),
    [leads, todayAppointmentLeadIds],
  )

  const walkInPatients = useMemo(
    () =>
      [...leads]
        .filter((lead) => lead.kioskFlow === 'sin_cita' && lead.kioskStatus !== 'finalizada' && isTodayLead(lead))
        .sort((a, b) => compareWaitingOrder(a, b))
        .slice(0, 8),
    [leads],
  )

  const currentConsultationMinutes = currentPatient ? minutesSince(currentPatient.consultaInicioAt || currentPatient.arrivalAt, now) : 0
  const hasConsultationDelay = currentConsultationMinutes >= 30

  const visiblePatients = useMemo(() => {
    const normalizedPhone = canonicalMxPhoneKey(searchedPhone)
    if (!normalizedPhone) return []

    const source = mode === 'con_cita' ? todayScheduledLeads : leads.filter((lead) => isTodayLead(lead) || lead.kioskFlow === 'sin_cita')

    return source
      .filter((lead) => {
        const matchesPhone = normalizedPhone
          ? [lead.phone, lead.waId].some((value) => canonicalMxPhoneKey(value) === normalizedPhone)
          : true
        return matchesPhone
      })
      .sort((a, b) => comparePreferred(a, b))
      .slice(0, 8)
  }, [leads, mode, searchedPhone, todayScheduledLeads])

  const searchedAppointments = useMemo(
    () => searchedPhone
      ? todayAppointments.filter((appointment) => phonesMatchMx(appointment.patientPhone, searchedPhone))
      : [],
    [searchedPhone, todayAppointments],
  )

  function handleAppointmentSearch(event: FormEvent) {
    event.preventDefault()
    const digits = phoneSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setActionMessage('Escribe un teléfono de 10 dígitos para buscar tu cita.')
      setSearchedPhone('')
      return
    }
    setActionMessage('')
    setSearchedPhone(phoneSearch)
  }

  async function handleArrival(lead: CrmLead, kioskFlow: KioskFlow) {
    setBusyLeadId(lead.id)
    setActionMessage('')

    try {
      await onUpdateLeadStatus(lead.id, 'en_espera', kioskFlow)
      setPhoneSearch('')
      setSearchedPhone('')
      setMode('con_cita')
      setWelcomeName(lead.name)
      window.setTimeout(() => setWelcomeName(''), 3500)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo registrar la llegada.')
    } finally {
      setBusyLeadId('')
    }
  }

  async function handleAdvanceQueue() {
    setActionMessage('')

    if (currentPatient) {
      setActionMessage('Ya hay un paciente en consulta. El cierre normal lo hace n8n cuando el doctor confirma el informe.')
      return
    }

    if (!waitingPatients.length) {
      setActionMessage('No hay pacientes esperando en este momento.')
      return
    }

    setBusyLeadId(waitingPatients[0].id)
    try {
      const selected = await onCallNextPatient('manual')
      setActionMessage(selected ? `Se llamó a ${selected.name}.` : 'No había un turno disponible para pasar en este momento.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo llamar al siguiente paciente.')
    } finally {
      setBusyLeadId('')
    }
  }

  async function handleManualFinalizeCurrent() {
    if (!currentPatient) {
      setActionMessage('No hay una consulta activa para cerrar manualmente.')
      return
    }

    setBusyLeadId(currentPatient.id)
    setActionMessage('')

    try {
      const result = await onFinalizeConsultationByLead(currentPatient.id, 'manual')
      if (result.calledNextLead) {
        setActionMessage(`Cierre manual aplicado. Terminó ${currentPatient.name} y entró ${result.calledNextLead.name}.`)
      } else if (result.finalizedLead) {
        setActionMessage(`Cierre manual aplicado. Terminó ${currentPatient.name}. No hay más pacientes esperando.`)
      } else {
        setActionMessage('Ese paciente ya no estaba en consulta. La vista se actualizó con Supabase.')
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo cerrar manualmente la atención.')
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

    const appointmentStart = walkInAppointmentDate && walkInAppointmentTime
      ? `${walkInAppointmentDate}T${walkInAppointmentTime}`
      : ''

    if (walkInAppointmentDate && !walkInAppointmentTime) {
      setActionMessage('Selecciona uno de los horarios disponibles.')
      return
    }

    setSubmittingWalkIn(true)
    setActionMessage('')

    try {
      const lead = await onRegisterWalkIn(
        walkInName.trim(),
        walkInPhone.trim(),
        appointmentStart ? walkInAppointmentType : undefined,
        appointmentStart ? toIsoDateTime(appointmentStart) : undefined,
      )
      setActionMessage(
        appointmentStart
          ? `Paciente registrado en espera y cita enviada a Calendar: ${lead.name}.`
          : `Paciente registrado en espera: ${lead.name}.`,
      )
      setWalkInName('')
      setWalkInPhone('')
      setWalkInAppointmentDate('')
      setWalkInAppointmentTime('')
      setWalkInAppointmentType('valoracion')
      setMode('con_cita')
      setWelcomeName(lead.name)
      window.setTimeout(() => setWelcomeName(''), 3500)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'No se pudo registrar el paciente sin cita.')
    } finally {
      setSubmittingWalkIn(false)
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="view-stack">
      {welcomeName && (
        <section className="kiosk-welcome-card" role="status" aria-live="polite">
          <span className="kiosk-welcome-icon">✓</span>
          <div>
            <span className="eyebrow">Llegada registrada</span>
            <h2>¡Bienvenido/a, {welcomeName}!</h2>
            <p>Tu llegada quedó registrada. Permanece atento/a; te llamaremos por tu turno.</p>
          </div>
        </section>
      )}

      {currentPatient && (
        <section className={`panel waiting-current-card ${hasConsultationDelay ? 'alert-panel' : ''}`}>
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Consulta actual</span>
              <h2>{currentPatient.name}</h2>
            </div>
            <span className={hasConsultationDelay ? 'soft-pill soft-pill-alert' : 'soft-pill'}>
              {hasConsultationDelay ? `Sin cierre hace ${currentConsultationMinutes} min` : 'En consulta'}
            </span>
          </div>

          {hasConsultationDelay && (
            <div className="waiting-alert-banner">
              Sin cierre hace {currentConsultationMinutes} min. Revisa si ya terminó la valoración.
            </div>
          )}

          <div className="appointment-list">
            <article className="appointment-card appointment-card-static appointment-card-match-yes">
              <div>
                <strong>{currentPatient.name}</strong>
                <span>{currentPatient.phone || currentPatient.waId || 'Sin teléfono'}</span>
                <small>
                  Llegó {currentPatient.arrivalAt ? formatTime(currentPatient.arrivalAt) : 'sin hora'} ·{' '}
                  {currentPatient.appointmentDate ? `cita ${formatTime(currentPatient.appointmentDate)}` : 'sin cita calendar'}
                </small>
                <small>El cierre normal ocurre cuando n8n cierra el informe del doctor.</small>
              </div>
              <div className="patient-browser-actions">
                <button className="secondary-button" onClick={() => onOpenLead(currentPatient.id)}>Ficha</button>
                <button
                  className="secondary-button"
                  onClick={() => void handleManualFinalizeCurrent()}
                  disabled={busyLeadId === currentPatient.id}
                >
                  {busyLeadId === currentPatient.id ? 'Cerrando...' : 'Finalizar atención (respaldo manual)'}
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      <section className="panel kiosk-entry-panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Kiosko</span>
            <h2>Llegada del paciente</h2>
          </div>
        </div>

        <div className="kiosk-mode-switch">
          <button className={mode === 'con_cita' ? 'mode-pill active' : 'mode-pill'} onClick={() => setMode('con_cita')}>Tengo cita</button>
          <button className={mode === 'sin_cita' ? 'mode-pill active' : 'mode-pill'} onClick={() => setMode('sin_cita')}>No tengo cita</button>
        </div>

        {mode === 'con_cita' ? (
          <form className="kiosk-search-block" onSubmit={handleAppointmentSearch}>
            <div className="patient-browser-bar patient-browser-bar-compact">
              <input
                className="patient-search-input"
                value={phoneSearch}
                onChange={(event) => setPhoneSearch(event.target.value)}
                placeholder="Teléfono (10 dígitos)"
                inputMode="numeric"
                maxLength={10}
              />
              <button className="primary-button" type="submit">Buscar cita</button>
            </div>

            <div className="patient-browser-list">
              {searchedPhone ? (
                searchedAppointments.length > 0 ? (
                  searchedAppointments.map((appointment) => {
                    const matchedLead = findLeadById(leads, appointment.matchedLeadId)
                      ?? leads.find((lead) => phonesMatchMx(lead.phone, appointment.patientPhone) || phonesMatchMx(lead.waId, appointment.patientPhone))

                    return (
                      <article className="patient-browser-row patient-browser-card" key={appointment.id}>
                        <div className="patient-browser-main">
                          <strong>{appointment.patientName || appointment.title}</strong>
                          <span>{appointment.patientPhone || 'Teléfono de Calendar'}</span>
                        </div>

                        <div className="patient-browser-date">
                          <strong>{formatDateTime(appointment.start)}</strong>
                          <span>{appointment.title}</span>
                        </div>

                        <div className="patient-browser-actions">
                          {matchedLead ? (
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => void handleArrival(matchedLead, 'con_cita')}
                              disabled={busyLeadId === matchedLead.id}
                            >
                              {busyLeadId === matchedLead.id ? 'Guardando...' : 'Aceptar llegada'}
                            </button>
                          ) : (
                            <span className="soft-pill">Cita encontrada</span>
                          )}
                        </div>
                      </article>
                    )
                  })
                ) : visiblePatients.length > 0 ? (
                  visiblePatients.map((lead) => (
                    <article className="patient-browser-row patient-browser-card" key={lead.id}>
                      <div className="patient-browser-main">
                        <strong>{lead.name}</strong>
                        <span>{lead.phone || lead.waId || 'Sin telefono'}</span>
                      </div>
                      <div className="patient-browser-date">
                        <strong>{lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Sin cita'}</strong>
                        <span>{lead.kioskStatus.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="patient-browser-actions">
                        <button className="primary-button" type="button" onClick={() => void handleArrival(lead, 'con_cita')} disabled={busyLeadId === lead.id}>
                          {busyLeadId === lead.id ? 'Guardando...' : 'Aceptar llegada'}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="inline-helper">No encontramos una cita para ese teléfono hoy.</p>
                )
              ) : <p className="inline-helper">Escribe tu teléfono y pulsa “Buscar cita”.</p>}
            </div>
          </form>
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
            <label className="field-row field-row-editable">
              <span>Tipo de cita</span>
              <select className="field-input" value={walkInAppointmentType} onChange={(event) => setWalkInAppointmentType(event.target.value as 'valoracion' | 'limpieza')}>
                <option value="valoracion">Valoración</option>
                <option value="limpieza">Limpieza</option>
              </select>
            </label>
            <label className="field-row field-row-editable">
              <span>Fecha</span>
              <input
                className="field-input"
                type="date"
                value={walkInAppointmentDate}
                onChange={(event) => {
                  const value = event.target.value
                  if (value && !isClinicDay(value)) {
                    setWalkInAppointmentDate('')
                    setWalkInAppointmentTime('')
                    setActionMessage('Ese día no tiene servicio. Elige lunes a viernes o un sábado habilitado.')
                    return
                  }
                  setActionMessage('')
                  setWalkInAppointmentDate(value)
                  setWalkInAppointmentTime('')
                }}
              />
            </label>
            <label className="field-row field-row-editable">
              <span>Horario disponible</span>
              <select
                className="field-input"
                value={walkInAppointmentTime}
                onChange={(event) => setWalkInAppointmentTime(event.target.value)}
                disabled={!walkInAppointmentDate || availableAppointmentSlots.length === 0}
              >
                <option value="">{walkInAppointmentDate ? 'Selecciona un horario' : 'Primero elige una fecha'}</option>
                {availableAppointmentSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={submittingWalkIn}>
              {submittingWalkIn ? 'Registrando...' : walkInAppointmentDate && walkInAppointmentTime ? 'Registrar y agendar' : 'Registrar en espera'}
            </button>
          </form>
        )}

        {actionMessage && <p className="inline-helper">{actionMessage}</p>}
      </section>

      <section className="crm-dashboard-grid waiting-room-grid">
        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Agenda del dia</span>
              <h2>Pacientes de hoy</h2>
            </div>
            <span className="soft-pill">{todayAppointments.length} citas</span>
          </div>

          <div className="appointment-list">
            {todayAppointments.length > 0 ? (
              todayAppointments.map((appointment) => (
                <article
                  className={`appointment-card appointment-card-static appointment-card-match-${appointment.matchedUsuarioId ? 'yes' : 'no'}`}
                  key={appointment.id}
                >
                  <div>
                    <strong>{appointment.patientName || appointment.title}</strong>
                    <span>{appointment.title}</span>
                    <small>
                      {appointment.matchedLeadId
                        ? labelForAppointmentState(findLeadById(leads, appointment.matchedLeadId)?.kioskStatus ?? 'pendiente')
                        : appointment.matchedUsuarioId
                          ? 'Sin oportunidad comercial'
                          : 'Paciente sin identificar'}
                    </small>
                  </div>
                  <div className="appointment-card-meta">
                    <strong>{formatDateTime(appointment.start)}</strong>
                  </div>
                  <div className="patient-browser-actions">
                    {renderAppointmentActions({
                      appointment,
                      leads,
                      busyLeadId,
                      onOpenLead,
                      onArrival: (lead) => void handleArrival(lead, 'con_cita'),
                    })}
                  </div>
                </article>
              ))
            ) : (
              <EmptyCopy title="Sin citas del dia" text="No hay pacientes agendados para hoy." compact />
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Sin cita</span>
              <h2>Entraron sin cita</h2>
            </div>
            <span className="soft-pill">{walkInPatients.length} pacientes</span>
          </div>

          <div className="appointment-list">
            {walkInPatients.length > 0 ? (
              walkInPatients.map((lead) => (
                <article className="appointment-card appointment-card-static appointment-card-match-no" key={lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{lead.phone || lead.waId || 'Sin telefono'}</span>
                    <small>{lead.arrivalAt ? `Llegó ${formatTime(lead.arrivalAt)}` : 'Pendiente de recepción'}</small>
                  </div>
                <div className="patient-browser-actions">
                  <button className="secondary-button" onClick={() => onOpenLead(lead.id)}>Ficha</button>
                </div>
                </article>
              ))
            ) : (
              <EmptyCopy title="Sin pacientes walk-in" text="Todavia no hay pacientes registrados sin cita hoy." compact />
            )}
          </div>
        </article>
      </section>

      {waitingPatients.length > 0 && (
        <section className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Sala de espera</span>
              <h2>Quien sigue</h2>
            </div>
            <span className="soft-pill">{waitingPatients.length} esperando</span>
          </div>

          <div className="appointment-list">
            {waitingPatients.map((lead, index) => (
              <article className="appointment-card appointment-card-static" key={lead.id}>
                <div>
                  <strong>{lead.name}</strong>
                  <span>{lead.appointmentDate ? formatTime(lead.appointmentDate) : 'Sin cita'} · llegó {lead.arrivalAt ? formatTime(lead.arrivalAt) : 'ahora'}</span>
                  <small>{lead.kioskFlow === 'sin_cita' ? 'Sin cita' : 'Con cita del día'} · esperando {minutesSince(lead.arrivalAt, now)} min</small>
                </div>
                <div className="patient-browser-actions">
                  <button className="secondary-button" onClick={() => onOpenLead(lead.id)}>Ficha</button>
                  {index === 0 ? (
                    <button
                      className="primary-button"
                      onClick={() => void handleAdvanceQueue()}
                      disabled={busyLeadId === lead.id || Boolean(currentPatient)}
                    >
                      {busyLeadId === lead.id ? 'Llamando...' : currentPatient ? 'Consulta activa' : 'Pasar'}
                    </button>
                  ) : (
                    <button className="secondary-button" disabled>En fila</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
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
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function toIsoDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function compareByArrival(left: CrmLead, right: CrmLead): number {
  const leftTime = left.arrivalAt ? new Date(left.arrivalAt).getTime() : Number.POSITIVE_INFINITY
  const rightTime = right.arrivalAt ? new Date(right.arrivalAt).getTime() : Number.POSITIVE_INFINITY
  return leftTime - rightTime
}

function compareByAppointment(left: CrmLead, right: CrmLead): number {
  const leftTime = left.appointmentDate ? new Date(left.appointmentDate).getTime() : Number.POSITIVE_INFINITY
  const rightTime = right.appointmentDate ? new Date(right.appointmentDate).getTime() : Number.POSITIVE_INFINITY
  return leftTime - rightTime
}

function compareRecentActivity(left: CrmLead, right: CrmLead): number {
  const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
  const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
  return leftTime - rightTime
}

function compareWaitingOrder(left: CrmLead, right: CrmLead): number {
  const arrivalDiff = compareByArrival(left, right)
  if (arrivalDiff !== 0) return arrivalDiff
  return compareByAppointment(left, right)
}

function comparePreferred(left: CrmLead, right: CrmLead): number {
  const leftScore = left.appointmentConfirmed ? 0 : 1
  const rightScore = right.appointmentConfirmed ? 0 : 1
  if (leftScore !== rightScore) return leftScore - rightScore
  return compareWaitingOrder(left, right)
}

function renderAppointmentActions({
  appointment,
  leads,
  busyLeadId,
  onOpenLead,
  onArrival,
}: {
  appointment: CalendarAppointment
  leads: CrmLead[]
  busyLeadId: string
  onOpenLead: (leadId: string) => void
  onArrival: (lead: CrmLead) => void
}) {
  const matchedLead = findLeadById(leads, appointment.matchedLeadId)
  if (!matchedLead) {
    if (appointment.matchedUsuarioId) {
      return (
        <>
          <button className="secondary-button" onClick={() => onOpenLead(appointment.matchedUsuarioId)}>Ficha</button>
          <button className="secondary-button" disabled>Sin oportunidad CRM</button>
        </>
      )
    }

    return <button className="secondary-button" disabled>No identificado</button>
  }

  if (matchedLead.kioskStatus === 'pendiente') {
    return (
      <>
        <button className="secondary-button" onClick={() => onOpenLead(appointment.matchedLeadId)}>Ficha</button>
        <button
          className="primary-button"
          onClick={() => onArrival(matchedLead)}
          disabled={busyLeadId === appointment.matchedLeadId}
        >
          {busyLeadId === appointment.matchedLeadId ? 'Guardando...' : 'Ya llegó'}
        </button>
      </>
    )
  }

  return (
    <>
      <button className="secondary-button" onClick={() => onOpenLead(appointment.matchedLeadId)}>Ficha</button>
      <button className="secondary-button" disabled>
        {labelForAppointmentState(matchedLead.kioskStatus)}
      </button>
    </>
  )

}

function isActiveCalendarAppointment(status: string): boolean {
  const normalized = status.toLowerCase()
  return !normalized.includes('cancel')
}

function isTodayLead(lead: CrmLead): boolean {
  return [lead.arrivalAt, lead.appointmentDate, lead.createdAt, lead.updatedAt].some((value) => value && isSameDay(value, new Date()))
}

function isRelevantForToday(lead: CrmLead, todayAppointmentLeadIds: Set<string>): boolean {
  return todayAppointmentLeadIds.has(lead.id) || isTodayLead(lead)
}

function labelForAppointmentState(status: KioskLeadStatus): string {
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

function findLeadById(leads: CrmLead[], leadId: string): CrmLead | null {
  return leads.find((lead) => lead.id === leadId) ?? null
}

function minutesSince(value: string, now: number): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((now - date.getTime()) / 60_000))
}

function isWithinClinicSchedule(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false

  const windows: Record<number, Array<[number, number]>> = {
    1: [[9 * 60, 13 * 60 + 30], [15 * 60, 16 * 60 + 30]],
    2: [[9 * 60, 13 * 60 + 30]],
    3: [[9 * 60, 13 * 60 + 30], [15 * 60, 16 * 60 + 30]],
    4: [[9 * 60, 14 * 60 + 30]],
    5: [[9 * 60, 13 * 60 + 30]],
    6: [[9 * 60, 12 * 60 + 30]],
  }

  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  return (windows[date.getDay()] ?? []).some(([start, end]) => minuteOfDay >= start && minuteOfDay < end)
}

function isClinicDay(value: string): boolean {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const windows: Record<number, Array<[number, number]>> = {
    1: [[540, 810], [900, 990]],
    2: [[540, 810]],
    3: [[540, 810], [900, 990]],
    4: [[540, 870]],
    5: [[540, 810]],
    6: [[540, 750]],
  }
  return (windows[date.getDay()] ?? []).length > 0
}

function getAvailableAppointmentSlots(dateValue: string, appointments: CalendarAppointment[]): string[] {
  if (!dateValue || !isClinicDay(dateValue)) return []
  const date = new Date(`${dateValue}T12:00:00`)
  const windows: Record<number, Array<[number, number]>> = {
    1: [[540, 810], [900, 990]],
    2: [[540, 810]],
    3: [[540, 810], [900, 990]],
    4: [[540, 870]],
    5: [[540, 810]],
    6: [[540, 750]],
  }
  const slots: string[] = []
  for (const [start, end] of windows[date.getDay()] ?? []) {
    for (let minute = start; minute + 30 <= end; minute += 30) {
      const hour = Math.floor(minute / 60).toString().padStart(2, '0')
      const mins = (minute % 60).toString().padStart(2, '0')
      const slotStart = new Date(`${dateValue}T${hour}:${mins}:00`)
      const slotEnd = new Date(slotStart.getTime() + 30 * 60_000)
      if (slotStart.getTime() <= Date.now()) continue

      const occupied = appointments.some((appointment) => {
        if (!isActiveCalendarAppointment(appointment.status) || !isSameDay(appointment.start, date)) return false
        const appointmentStart = new Date(appointment.start).getTime()
        const appointmentEnd = new Date(appointment.end || appointment.start).getTime() || appointmentStart + 30 * 60_000
        return appointmentStart < slotEnd.getTime() && appointmentEnd > slotStart.getTime()
      })
      if (!occupied) slots.push(`${hour}:${mins}`)
    }
  }
  return slots
}
