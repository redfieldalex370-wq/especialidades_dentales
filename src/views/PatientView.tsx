import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { CasoComercialEstado, ClinicalRecord, CommercialCase, CrmLead, CrmLeadDetail, DentalLeadDetailUpdate, KioskFlow, KioskLeadStatus, TraceabilityEvent } from '../types'

interface Props {
  lead: CrmLead | null
  leads: CrmLead[]
  detail: CrmLeadDetail | null
  detailLoading: boolean
  detailError: string
  onOpenLead: (leadId: string) => void
  onSaveDetail: (leadId: string, input: DentalLeadDetailUpdate) => Promise<void>
  onUpdateKioskStatus: (leadId: string, kioskStatus: KioskLeadStatus, kioskFlow?: KioskFlow) => Promise<void>
}

export function PatientView({
  lead,
  leads,
  detail,
  detailLoading,
  detailError,
  onOpenLead,
  onSaveDetail,
  onUpdateKioskStatus,
}: Props) {
  const [nameSearch, setNameSearch] = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [kioskBusy, setKioskBusy] = useState(false)
  const deferredNameSearch = useDeferredValue(nameSearch)
  const deferredPhoneSearch = useDeferredValue(phoneSearch)
  const hasSearch = deferredNameSearch.trim().length > 0 || deferredPhoneSearch.trim().length > 0
  const visiblePatients = useMemo(() => {
    if (!hasSearch) return []

    const normalizedName = deferredNameSearch.trim().toLowerCase()
    const normalizedPhone = deferredPhoneSearch.trim().toLowerCase()
    const filtered = leads.filter((item) => {
      const matchesName = normalizedName ? item.name.toLowerCase().includes(normalizedName) : true
      const phoneHaystack = `${item.phone} ${item.waId}`.toLowerCase()
      const matchesPhone = normalizedPhone ? phoneHaystack.includes(normalizedPhone) : true
      return matchesName && matchesPhone
    })

    return filtered.slice(0, 10)
  }, [deferredNameSearch, deferredPhoneSearch, hasSearch, leads])

  const [draft, setDraft] = useState<DentalLeadDetailUpdate>(() => buildDraft(null, null))

  useEffect(() => {
    setDraft(buildDraft(lead, detail))
    setSaveMessage('')
    setEditing(false)
  }, [lead?.id, detail?.fichaClinica?.updatedAt, detail?.casoComercial?.updatedAt])

  if (!lead) {
    return (
      <div className="view-stack">
        <PatientPicker
          nameSearch={nameSearch}
          phoneSearch={phoneSearch}
          visiblePatients={visiblePatients}
          onNameSearchChange={setNameSearch}
          onPhoneSearchChange={setPhoneSearch}
          onOpenLead={onOpenLead}
        />
      </div>
    )
  }

  const activeLead = lead
  const clinical = detail?.fichaClinica ?? null
  const commercial = detail?.casoComercial ?? null
  const events = buildEvents(detail?.trazabilidad ?? [])

  async function handleSave() {
    setSaving(true)
    setSaveMessage('')

    try {
      await onSaveDetail(activeLead.id, {
        fichaClinica: {
          ...draft.fichaClinica,
        },
        casoComercial: {
          ...draft.casoComercial,
          proximaCitaSugerida: draft.casoComercial.proximaCitaSugerida ? toIsoDateTime(draft.casoComercial.proximaCitaSugerida) : '',
        },
      })
      setEditing(false)
      setSaveMessage('Cambios guardados en la ficha.')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  async function handleKioskAction(status: KioskLeadStatus, flow?: KioskFlow) {
    setKioskBusy(true)
    setSaveMessage('')

    try {
      await onUpdateKioskStatus(activeLead.id, status, flow)
      setSaveMessage('Estado operativo actualizado.')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'No se pudo actualizar el estado operativo.')
    } finally {
      setKioskBusy(false)
    }
  }

  return (
    <div className="view-stack">
      <div className="section-head standalone">
        <div>
          <span className="eyebrow">Ficha comercial</span>
          <h1>{activeLead.name}</h1>
        </div>
        <div className="patient-actions">
          {editing ? (
            <>
              <button className="secondary-button" onClick={() => { setDraft(buildDraft(activeLead, detail)); setEditing(false); setSaveMessage('') }} disabled={saving}>Cancelar</button>
              <button className="primary-button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </>
          ) : (
            <button className="primary-button" onClick={() => setEditing(true)}>Editar ficha</button>
          )}
          <button className="secondary-button" disabled>Exportar PDF</button>
        </div>
      </div>

      {saveMessage && (
        <section className={`panel ${saveMessage.includes('guardados') ? 'success-panel' : 'warning-panel'}`}>
          <span className="eyebrow">Ficha</span>
          <p>{saveMessage}</p>
        </section>
      )}

      {detailError && (
        <section className="panel warning-panel">
          <span className="eyebrow">Ficha</span>
          <h2>No se pudo leer el detalle nuevo</h2>
          <p>{detailError}</p>
        </section>
      )}

      <section className="panel operational-panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Operacion</span>
            <h2>Control del kiosko</h2>
          </div>
          <span className="soft-pill">{labelForKioskStatus(lead.kioskStatus)}</span>
        </div>

        <div className="field-grid">
          <Field label="Flujo" value={lead.kioskFlow === 'sin_cita' ? 'Sin cita' : 'Con cita'} />
          <Field label="Llegada" value={lead.arrivalAt ? formatDateTime(lead.arrivalAt) : 'Sin llegada registrada'} />
          <Field label="Cita activa" value={lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Sin cita'} />
          <Field label="Estado de sala" value={labelForKioskStatus(lead.kioskStatus)} />
        </div>

        <div className="patient-actions operational-actions">
          <button className="secondary-button" onClick={() => void handleKioskAction('en_espera', lead.appointmentDate ? 'con_cita' : 'sin_cita')} disabled={kioskBusy}>
            {kioskBusy ? 'Guardando...' : 'Marcar llegada'}
          </button>
          <button className="secondary-button" onClick={() => void handleKioskAction('en_consulta')} disabled={kioskBusy}>
            Pasar a consulta
          </button>
          <button className="primary-button" onClick={() => void handleKioskAction('finalizada')} disabled={kioskBusy}>
            Finalizar atencion
          </button>
        </div>
      </section>

      <section className="record-grid">
        <article className="panel record-card">
          <div className="record-title">
            <span className="record-dot" />
            <div>
              <span className="eyebrow">Bloque clinico</span>
              <h2>Valoracion</h2>
            </div>
          </div>
          <EditableField label="Motivo de consulta" editing={editing} type="textarea" value={draft.fichaClinica.motivoConsulta} displayValue={clinicalText(clinical, 'motivoConsulta') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, fichaClinica: { ...current.fichaClinica, motivoConsulta: value } }))} />
          <EditableField label="Diagnostico" editing={editing} type="textarea" value={draft.fichaClinica.diagnostico} displayValue={clinicalText(clinical, 'diagnostico') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, fichaClinica: { ...current.fichaClinica, diagnostico: value } }))} />
          <EditableField label="Tratamiento propuesto" editing={editing} type="textarea" value={draft.fichaClinica.tratamientoPropuesto} displayValue={clinicalText(clinical, 'tratamientoPropuesto') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, fichaClinica: { ...current.fichaClinica, tratamientoPropuesto: value } }))} />
          <EditableField label="Piezas involucradas" editing={editing} value={draft.fichaClinica.piezasInvolucradas} displayValue={clinicalText(clinical, 'piezasInvolucradas') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, fichaClinica: { ...current.fichaClinica, piezasInvolucradas: value } }))} />
          <EditableField label="Notas de evolucion" editing={editing} type="textarea" value={draft.fichaClinica.notasEvolucion} displayValue={clinicalText(clinical, 'notasEvolucion') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, fichaClinica: { ...current.fichaClinica, notasEvolucion: value } }))} />
          <Field label="Adjuntos" value={clinical?.archivosAdjuntos.length ? `${clinical.archivosAdjuntos.length} archivo(s)` : 'Sin adjuntos'} />
        </article>

        <article className="panel record-card commercial-card">
          <div className="record-title">
            <span className="record-dot warm" />
            <div>
              <span className="eyebrow">Bloque comercial</span>
              <h2>Oportunidad</h2>
            </div>
          </div>
          <div className="money-box">
            <span>Costo cotizado</span>
            <strong>{editing ? 'Editable abajo' : commercial?.costoCotizado ? money(commercial.costoCotizado) : lead.quotedAmount ? money(lead.quotedAmount) : 'Pendiente'}</strong>
          </div>
          <EditableField label="Costo cotizado" editing={editing} type="number" value={draft.casoComercial.costoCotizado === null ? '' : String(draft.casoComercial.costoCotizado)} displayValue={commercial?.costoCotizado ? money(commercial.costoCotizado) : lead.quotedAmount ? money(lead.quotedAmount) : 'Pendiente'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, costoCotizado: value ? Number(value) : null } }))} />
          <EditableField label="Promocion aplicada" editing={editing} value={draft.casoComercial.promocionAplicada} displayValue={commercialText(commercial, 'promocionAplicada') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, promocionAplicada: value } }))} />
          <EditableField label="Objeciones" editing={editing} type="textarea" value={draft.casoComercial.objeciones} displayValue={commercialText(commercial, 'objeciones') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, objeciones: value } }))} />
          <EditableField label="Indicacion seguimiento" editing={editing} type="textarea" value={draft.casoComercial.indicacionSeguimiento} displayValue={commercialText(commercial, 'indicacionSeguimiento') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, indicacionSeguimiento: value } }))} />
          <EditableField label="Proxima cita sugerida" editing={editing} type="datetime-local" value={draft.casoComercial.proximaCitaSugerida} displayValue={commercial?.proximaCitaSugerida ? formatDateTime(commercial.proximaCitaSugerida) : lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Pendiente'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, proximaCitaSugerida: value } }))} />
          <EditableSelectField label="Estado comercial" editing={editing} value={draft.casoComercial.estado} displayValue={commercial?.estado || 'valorado'} options={ESTADO_OPTIONS} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, estado: value as CasoComercialEstado } }))} />
          {draft.casoComercial.estado === 'abono_recibido' && (
            <>
              <EditableField label="Monto cerrado" editing={editing} type="number" value={draft.casoComercial.montoCerrado === null ? '' : String(draft.casoComercial.montoCerrado)} displayValue={commercial?.montoCerrado ? money(commercial.montoCerrado) : 'Sin abono'} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, montoCerrado: value ? Number(value) : null } }))} />
              <EditableSelectField label="Cerrado por" editing={editing} value={draft.casoComercial.cerradoPor || ''} displayValue={commercial?.cerradoPor || 'No definido'} options={CERRADO_POR_OPTIONS} onChange={(value) => setDraft((current) => ({ ...current, casoComercial: { ...current.casoComercial, cerradoPor: value as DentalLeadDetailUpdate['casoComercial']['cerradoPor'] } }))} />
            </>
          )}
        </article>
      </section>

      <section className="crm-dashboard-grid">
        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Agenda</span>
              <h2>Datos operativos</h2>
            </div>
            {detailLoading && <span className="soft-pill">Cargando detalle...</span>}
          </div>
          <div className="field-grid">
            <Field label="Fecha de cita" value={lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Sin fecha'} />
            <Field label="Estado de cita" value={lead.appointmentStatus || 'Sin estado'} />
            <Field label="Responsable" value={lead.assignedTo || 'Sin asignar'} />
            <Field label="Canal" value={lead.source || 'WhatsApp'} />
            <Field label="Seguimiento" value={lead.reminderAt ? formatDateTime(lead.reminderAt) : 'Sin recordatorio'} />
            <Field label="Ultimo contacto" value={lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Sin registro'} />
          </div>
        </article>

        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Mensajes</span>
              <h2>Contexto del lead</h2>
            </div>
          </div>
          <div className="message-box">{lead.lastMessage || 'Todavia no hay ultimo mensaje visible en este lead.'}</div>
          <div className="tag-list">
            {lead.tags.length > 0 ? lead.tags.map((tag) => <span className="soft-pill" key={tag}>{tag}</span>) : <span className="soft-pill">Sin etiquetas</span>}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Trazabilidad</span>
            <h2>Eventos del caso</h2>
          </div>
        </div>
        <div className="timeline">
          {events.map((event) => (
            <div className="timeline-row" key={event.id}>
              <span className="timeline-pin" />
              <div>
                <strong>{event.type}</strong>
                <span>{event.timestamp} · {event.responsible}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PatientPicker({
  nameSearch,
  phoneSearch,
  visiblePatients,
  onNameSearchChange,
  onPhoneSearchChange,
  onOpenLead,
}: {
  nameSearch: string
  phoneSearch: string
  visiblePatients: CrmLead[]
  onNameSearchChange: (value: string) => void
  onPhoneSearchChange: (value: string) => void
  onOpenLead: (leadId: string) => void
}) {
  return (
    <section className="panel patient-browser-panel">
      <div className="section-head compact">
        <div>
          <span className="eyebrow">Buscador</span>
        </div>
        {hasResultsBadge(nameSearch, phoneSearch) && <span className="soft-pill">{visiblePatients.length} visibles</span>}
      </div>

      <div className="patient-browser-bar patient-browser-bar-compact">
        <input
          className="patient-search-input"
          value={nameSearch}
          onChange={(event) => onNameSearchChange(event.target.value)}
          placeholder="Nombre"
        />
        <input
          className="patient-search-input"
          value={phoneSearch}
          onChange={(event) => onPhoneSearchChange(event.target.value)}
          placeholder="Telefono"
        />
      </div>

      <div className="patient-browser-list">
        {!nameSearch.trim() && !phoneSearch.trim() ? null : visiblePatients.length > 0 ? (
          visiblePatients.map((item) => (
            <button className="patient-browser-row" key={item.id} onClick={() => onOpenLead(item.id)}>
              <div className="patient-browser-main">
                <strong>{item.name}</strong>
                <span>{item.phone || item.waId || 'Sin telefono'}</span>
              </div>
              <div className="patient-browser-date">
                <strong>{item.appointmentDate ? formatDateTime(item.appointmentDate) : 'Sin cita'}</strong>
              </div>
            </button>
          ))
        ) : (
          <div className="empty-state empty-state-compact">
            <h3>No encontramos pacientes</h3>
          </div>
        )}
      </div>
    </section>
  )
}

function hasResultsBadge(nameSearch: string, phoneSearch: string) {
  return nameSearch.trim().length > 0 || phoneSearch.trim().length > 0
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EditableField({
  label,
  value,
  displayValue,
  editing,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  displayValue: string
  editing: boolean
  onChange: (value: string) => void
  type?: 'text' | 'textarea' | 'number' | 'datetime-local'
}) {
  if (!editing) return <Field label={label} value={displayValue} />

  return (
    <label className="field-row field-row-editable">
      <span>{label}</span>
      {type === 'textarea' ? (
        <textarea className="field-input field-textarea" value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : (
        <input className="field-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function EditableSelectField({
  label,
  value,
  displayValue,
  editing,
  onChange,
  options,
}: {
  label: string
  value: string
  displayValue: string
  editing: boolean
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  if (!editing) return <Field label={label} value={displayValue} />

  return (
    <label className="field-row field-row-editable">
      <span>{label}</span>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function clinicalText(record: ClinicalRecord | null, field: keyof ClinicalRecord): string {
  const value = record?.[field]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function commercialText(record: CommercialCase | null, field: keyof CommercialCase): string {
  const value = record?.[field]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function buildEvents(traceability: TraceabilityEvent[]) {
  return traceability.map((event) => ({
    id: event.eventoId,
    timestamp: formatDateTime(event.timestamp),
    type: event.tipoEvento,
    responsible: event.responsable,
  }))
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

function money(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value)
}

function buildDraft(lead: CrmLead | null, detail: CrmLeadDetail | null): DentalLeadDetailUpdate {
  return {
    fichaClinica: {
      motivoConsulta: detail?.fichaClinica?.motivoConsulta || '',
      diagnostico: detail?.fichaClinica?.diagnostico || '',
      tratamientoPropuesto: detail?.fichaClinica?.tratamientoPropuesto || '',
      piezasInvolucradas: detail?.fichaClinica?.piezasInvolucradas || '',
      notasEvolucion: detail?.fichaClinica?.notasEvolucion || '',
      archivosAdjuntos: detail?.fichaClinica?.archivosAdjuntos || [],
    },
    casoComercial: {
      costoCotizado: detail?.casoComercial?.costoCotizado ?? lead?.quotedAmount ?? null,
      promocionAplicada: detail?.casoComercial?.promocionAplicada || '',
      objeciones: detail?.casoComercial?.objeciones || '',
      indicacionSeguimiento: detail?.casoComercial?.indicacionSeguimiento || '',
      proximaCitaSugerida: toDateTimeLocal(detail?.casoComercial?.proximaCitaSugerida || lead?.appointmentDate || ''),
      estado: detail?.casoComercial?.estado || 'valorado',
      montoCerrado: detail?.casoComercial?.montoCerrado ?? null,
      cerradoPor: detail?.casoComercial?.cerradoPor || '',
    },
  }
}

function stringOrEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function toDateTimeLocal(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function labelForKioskStatus(status: KioskLeadStatus): string {
  switch (status) {
    case 'en_espera':
      return 'En espera'
    case 'en_consulta':
      return 'En consulta'
    case 'finalizada':
      return 'Finalizada'
    default:
      return 'Pendiente'
  }
}

const ESTADO_OPTIONS: Array<{ value: CasoComercialEstado; label: string }> = [
  { value: 'valorado', label: 'Valorado' },
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'escalado_closer', label: 'Escalado closer' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'abono_recibido', label: 'Abono recibido' },
  { value: 'perdido', label: 'Perdido' },
]

const CERRADO_POR_OPTIONS = [
  { value: '', label: 'Selecciona' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'closer_greenchimp', label: 'Closer GreenChimp' },
  { value: 'automatico', label: 'Automático' },
]
