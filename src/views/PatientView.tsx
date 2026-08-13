import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { ClinicalRecord, CommercialCase, CrmLead, CrmLeadDetail, CrmStage, DentalLeadDetailUpdate, TraceabilityEvent } from '../types'

interface Props {
  lead: CrmLead | null
  leads: CrmLead[]
  detail: CrmLeadDetail | null
  detailLoading: boolean
  detailError: string
  stages: CrmStage[]
  movingLeadId: string
  onMoveLead: (leadId: string, stageKey: string) => void
  onOpenLead: (leadId: string) => void
  onBackToCrm: () => void
  onSaveDetail: (leadId: string, input: DentalLeadDetailUpdate) => Promise<void>
}

export function PatientView({
  lead,
  leads,
  detail,
  detailLoading,
  detailError,
  stages,
  movingLeadId,
  onMoveLead,
  onOpenLead,
  onBackToCrm,
  onSaveDetail,
}: Props) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const deferredSearch = useDeferredValue(search)
  const visiblePatients = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase()
    const filtered = normalized
      ? leads.filter((item) => {
          const haystack = `${item.name} ${item.phone} ${item.waId} ${item.treatment} ${item.stageKey}`.toLowerCase()
          return haystack.includes(normalized)
        })
      : leads

    return filtered.slice(0, 10)
  }, [deferredSearch, leads])

  const [draft, setDraft] = useState<DentalLeadDetailUpdate>(() => buildDraft(null, null))

  useEffect(() => {
    setDraft(buildDraft(lead, detail))
    setSaveMessage('')
    setEditing(false)
  }, [lead?.id, detail?.clinicalRecord?.updatedAt, detail?.commercialCase?.updatedAt])

  if (!lead) {
    return (
      <div className="view-stack">
        <PatientPicker
          search={search}
          visiblePatients={visiblePatients}
          onSearchChange={setSearch}
          onOpenLead={onOpenLead}
        />

        <section className="panel empty-record-panel">
          <span className="eyebrow">Ficha</span>
          <h1>Busca y abre un paciente</h1>
          <p>Desde aqui puedes localizar pacientes por nombre, telefono, wa_id o tratamiento sin volver al tablero.</p>
          <button className="primary-button" onClick={onBackToCrm}>Volver al CRM</button>
        </section>
      </div>
    )
  }

  const activeLead = lead
  const raw = lead.rawPayload
  const currentStage = stages.find((stage) => stage.stage_key === lead.stageKey)
  const clinical = detail?.clinicalRecord ?? null
  const commercial = detail?.commercialCase ?? null
  const events = buildEvents(lead, detail?.traceability ?? [])

  async function handleSave() {
    setSaving(true)
    setSaveMessage('')

    try {
      await onSaveDetail(activeLead.id, {
        clinicalRecord: {
          ...draft.clinicalRecord,
        },
        commercialCase: {
          ...draft.commercialCase,
          proximaCitaSugerida: draft.commercialCase.proximaCitaSugerida ? toIsoDateTime(draft.commercialCase.proximaCitaSugerida) : '',
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

  return (
    <div className="view-stack">
      <PatientPicker
        search={search}
        visiblePatients={visiblePatients}
        onSearchChange={setSearch}
        onOpenLead={onOpenLead}
      />

      <div className="section-head standalone">
        <div>
          <span className="eyebrow">Ficha comercial</span>
          <h1>{activeLead.name}</h1>
          <p>La ficha usa el mismo lead del kanban y conserva la referencia por {activeLead.waId || activeLead.phone || 'paciente'}.</p>
        </div>
        <div className="patient-actions">
          <button className="secondary-button" onClick={onBackToCrm}>Volver al CRM</button>
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

      <section className="profile-banner">
        <div className="avatar xl">{activeLead.name.slice(0, 1)}</div>
        <div>
          <h2>{lead.name}</h2>
          <p>{lead.phone || 'Sin telefono'} · wa_id {lead.waId || 'pendiente'}</p>
        </div>
        <div className="profile-origin">
          <span>Origen</span>
          <strong>{lead.origin.replaceAll('_', ' ')}</strong>
        </div>
      </section>

      <section className="panel patient-stage-panel">
        <div>
          <span className="eyebrow">Etapa actual</span>
          <h2>{currentStage?.name ?? lead.stageKey}</h2>
        </div>
        <label className="stage-select patient-stage-select">
          <span>Mover en el CRM</span>
          <select
            value={lead.stageKey}
            onChange={(event) => onMoveLead(lead.id, event.target.value)}
            disabled={movingLeadId === lead.id}
          >
            {stages.map((stage) => (
              <option value={stage.stage_key} key={stage.stage_key}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
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
          <EditableField label="Motivo de consulta" editing={editing} type="textarea" value={draft.clinicalRecord.motivoConsulta} displayValue={clinicalText(clinical, 'motivoConsulta') || readValue(raw.motivo_consulta, raw.motivo, lead.treatment)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, motivoConsulta: value } }))} />
          <EditableField label="Diagnostico" editing={editing} type="textarea" value={draft.clinicalRecord.diagnostico} displayValue={clinicalText(clinical, 'diagnostico') || readValue(raw.diagnostico)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, diagnostico: value } }))} />
          <EditableField label="Tratamiento propuesto" editing={editing} type="textarea" value={draft.clinicalRecord.tratamientoPropuesto} displayValue={clinicalText(clinical, 'tratamientoPropuesto') || readValue(raw.tratamiento_propuesto, raw.especialidad, lead.treatment)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, tratamientoPropuesto: value } }))} />
          <EditableField label="Especialidad" editing={editing} value={draft.clinicalRecord.especialidad} displayValue={clinicalText(clinical, 'especialidad') || readValue(raw.especialidad)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, especialidad: value } }))} />
          <EditableField label="Piezas involucradas" editing={editing} value={draft.clinicalRecord.piezasInvolucradas} displayValue={clinicalText(clinical, 'piezasInvolucradas') || readValue(raw.piezas_involucradas)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, piezasInvolucradas: value } }))} />
          <EditableField label="Notas de evolucion" editing={editing} type="textarea" value={draft.clinicalRecord.notasEvolucion} displayValue={clinicalText(clinical, 'notasEvolucion') || readValue(raw.notas_evolucion)} onChange={(value) => setDraft((current) => ({ ...current, clinicalRecord: { ...current.clinicalRecord, notasEvolucion: value } }))} />
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
          <EditableField label="Costo cotizado" editing={editing} type="number" value={draft.commercialCase.costoCotizado === null ? '' : String(draft.commercialCase.costoCotizado)} displayValue={commercial?.costoCotizado ? money(commercial.costoCotizado) : lead.quotedAmount ? money(lead.quotedAmount) : 'Pendiente'} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, costoCotizado: value ? Number(value) : null } }))} />
          <EditableField label="Promocion aplicada" editing={editing} value={draft.commercialCase.promocionAplicada} displayValue={commercialText(commercial, 'promocionAplicada') || readValue(raw.promocion_aplicada)} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, promocionAplicada: value } }))} />
          <EditableField label="Objeciones" editing={editing} type="textarea" value={draft.commercialCase.objeciones} displayValue={commercialText(commercial, 'objeciones') || readValue(raw.objeciones)} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, objeciones: value } }))} />
          <EditableField label="Indicacion seguimiento" editing={editing} type="textarea" value={draft.commercialCase.indicacionSeguimiento} displayValue={commercialText(commercial, 'indicacionSeguimiento') || readValue(raw.indicacion_seguimiento, lead.reminderText)} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, indicacionSeguimiento: value } }))} />
          <EditableField label="Proxima cita sugerida" editing={editing} type="datetime-local" value={draft.commercialCase.proximaCitaSugerida} displayValue={commercial?.proximaCitaSugerida ? formatDateTime(commercial.proximaCitaSugerida) : lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Pendiente'} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, proximaCitaSugerida: value } }))} />
          <EditableField label="Cerrado por" editing={editing} value={draft.commercialCase.cerradoPor} displayValue={commercialText(commercial, 'cerradoPor') || 'No definido'} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, cerradoPor: value } }))} />
          <EditableField label="Monto cerrado" editing={editing} type="number" value={draft.commercialCase.montoCerrado === null ? '' : String(draft.commercialCase.montoCerrado)} displayValue={commercial?.montoCerrado ? money(commercial.montoCerrado) : 'Sin abono'} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, montoCerrado: value ? Number(value) : null } }))} />
          <EditableField label="Estado comercial" editing={editing} value={draft.commercialCase.estado} displayValue={commercialText(commercial, 'estado') || readValue(raw.estado, lead.appointmentStatus, currentStage?.name)} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, estado: value } }))} />
          <EditableField label="Motivo escalamiento" editing={editing} type="textarea" value={draft.commercialCase.escaladoMotivo} displayValue={commercialText(commercial, 'escaladoMotivo') || 'No mencionado'} onChange={(value) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, escaladoMotivo: value } }))} />
          {editing ? (
            <label className="field-row field-row-checkbox">
              <span>Escalado a closer</span>
              <input
                type="checkbox"
                checked={draft.commercialCase.escaladoCloser}
                onChange={(event) => setDraft((current) => ({ ...current, commercialCase: { ...current.commercialCase, escaladoCloser: event.target.checked } }))}
              />
            </label>
          ) : (
            <div className="status-strip">
              <span>Escalado a closer</span>
              <strong>{commercial?.escaladoCloser ? 'Si' : 'No'}</strong>
            </div>
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
            <Field label="Escalado a closer" value={commercial?.escaladoCloser ? 'Si' : 'No'} />
            <Field label="Motivo escalamiento" value={commercialText(commercial, 'escaladoMotivo') || 'No mencionado'} />
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
  search,
  visiblePatients,
  onSearchChange,
  onOpenLead,
}: {
  search: string
  visiblePatients: CrmLead[]
  onSearchChange: (value: string) => void
  onOpenLead: (leadId: string) => void
}) {
  return (
    <section className="panel patient-browser-panel">
      <div className="section-head compact">
        <div>
          <span className="eyebrow">Buscador</span>
          <h2>Encuentra un paciente desde aqui</h2>
        </div>
        <span className="soft-pill">{visiblePatients.length} visibles</span>
      </div>

      <div className="patient-browser-bar">
        <input
          className="patient-search-input"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nombre, telefono, wa_id o tratamiento"
        />
      </div>

      <div className="patient-browser-list">
        {visiblePatients.length > 0 ? (
          visiblePatients.map((item) => (
            <button className="patient-browser-row" key={item.id} onClick={() => onOpenLead(item.id)}>
              <div className="patient-browser-main">
                <strong>{item.name}</strong>
                <span>{item.phone || item.waId || 'Sin telefono'}</span>
              </div>
              <div className="patient-browser-meta">
                <span>{item.treatment || 'Sin tratamiento'}</span>
                <small>{item.stageKey.replaceAll('_', ' ')}</small>
              </div>
              <div className="patient-browser-date">
                <strong>{item.appointmentDate ? formatDateTime(item.appointmentDate) : 'Sin cita'}</strong>
              </div>
            </button>
          ))
        ) : (
          <div className="empty-state empty-state-compact">
            <h3>No encontramos pacientes</h3>
            <p>Prueba con otro nombre, telefono, wa_id o deja vacio el buscador para ver la lista.</p>
          </div>
        )}
      </div>
    </section>
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

function readValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return 'No mencionado'
}

function clinicalText(record: ClinicalRecord | null, field: keyof ClinicalRecord): string {
  const value = record?.[field]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function commercialText(record: CommercialCase | null, field: keyof CommercialCase): string {
  const value = record?.[field]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function buildEvents(lead: CrmLead, traceability: TraceabilityEvent[]) {
  if (traceability.length > 0) {
    return traceability.map((event) => ({
      id: event.id,
      timestamp: formatDateTime(event.timestamp),
      type: event.tipoEvento,
      responsible: event.responsable,
    }))
  }

  return [
    lead.createdAt
      ? { id: 'created', timestamp: formatDateTime(lead.createdAt), type: 'Lead creado en CRM', responsible: 'sistema' }
      : null,
    lead.appointmentDate
      ? { id: 'appointment', timestamp: formatDateTime(lead.appointmentDate), type: 'Valoracion registrada', responsible: 'bot' }
      : null,
    lead.reminderAt
      ? { id: 'reminder', timestamp: formatDateTime(lead.reminderAt), type: 'Seguimiento programado', responsible: 'closer' }
      : null,
    lead.updatedAt
      ? { id: 'updated', timestamp: formatDateTime(lead.updatedAt), type: 'Ultima actualizacion del lead', responsible: 'sistema' }
      : null,
  ].filter(Boolean) as Array<{ id: string; timestamp: string; type: string; responsible: string }>
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
    clinicalRecord: {
      motivoConsulta: detail?.clinicalRecord?.motivoConsulta || stringOrEmpty(lead?.rawPayload?.motivo_consulta, lead?.treatment),
      diagnostico: detail?.clinicalRecord?.diagnostico || stringOrEmpty(lead?.rawPayload?.diagnostico),
      tratamientoPropuesto: detail?.clinicalRecord?.tratamientoPropuesto || stringOrEmpty(lead?.rawPayload?.tratamiento_propuesto, lead?.treatment),
      especialidad: detail?.clinicalRecord?.especialidad || stringOrEmpty(lead?.rawPayload?.especialidad),
      piezasInvolucradas: detail?.clinicalRecord?.piezasInvolucradas || stringOrEmpty(lead?.rawPayload?.piezas_involucradas),
      notasEvolucion: detail?.clinicalRecord?.notasEvolucion || stringOrEmpty(lead?.rawPayload?.notas_evolucion),
    },
    commercialCase: {
      costoCotizado: detail?.commercialCase?.costoCotizado ?? lead?.quotedAmount ?? null,
      promocionAplicada: detail?.commercialCase?.promocionAplicada || stringOrEmpty(lead?.rawPayload?.promocion_aplicada),
      objeciones: detail?.commercialCase?.objeciones || stringOrEmpty(lead?.rawPayload?.objeciones),
      indicacionSeguimiento: detail?.commercialCase?.indicacionSeguimiento || stringOrEmpty(lead?.rawPayload?.indicacion_seguimiento, lead?.reminderText),
      proximaCitaSugerida: toDateTimeLocal(detail?.commercialCase?.proximaCitaSugerida || lead?.appointmentDate || ''),
      estado: detail?.commercialCase?.estado || stringOrEmpty(lead?.appointmentStatus),
      montoCerrado: detail?.commercialCase?.montoCerrado ?? null,
      cerradoPor: detail?.commercialCase?.cerradoPor || '',
      escaladoCloser: detail?.commercialCase?.escaladoCloser ?? false,
      escaladoMotivo: detail?.commercialCase?.escaladoMotivo || '',
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
