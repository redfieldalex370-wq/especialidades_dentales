import type { ClinicalRecord, CommercialCase, CrmLead, CrmLeadDetail, CrmStage, TraceabilityEvent } from '../types'

interface Props {
  lead: CrmLead | null
  detail: CrmLeadDetail | null
  detailLoading: boolean
  detailError: string
  stages: CrmStage[]
  movingLeadId: string
  onMoveLead: (leadId: string, stageKey: string) => void
  onBackToCrm: () => void
}

export function PatientView({
  lead,
  detail,
  detailLoading,
  detailError,
  stages,
  movingLeadId,
  onMoveLead,
  onBackToCrm,
}: Props) {
  if (!lead) {
    return (
      <div className="view-stack">
        <section className="panel empty-record-panel">
          <span className="eyebrow">Ficha</span>
          <h1>Selecciona un paciente desde el CRM</h1>
          <p>La ficha se alimenta del mismo lead. No genera un registro aparte ni rompe la trazabilidad por wa_id.</p>
          <button className="primary-button" onClick={onBackToCrm}>Volver al CRM</button>
        </section>
      </div>
    )
  }

  const raw = lead.rawPayload
  const currentStage = stages.find((stage) => stage.stage_key === lead.stageKey)
  const clinical = detail?.clinicalRecord ?? null
  const commercial = detail?.commercialCase ?? null
  const events = buildEvents(lead, detail?.traceability ?? [])

  return (
    <div className="view-stack">
      <div className="section-head standalone">
        <div>
          <span className="eyebrow">Ficha comercial</span>
          <h1>{lead.name}</h1>
          <p>La ficha usa el mismo lead del kanban y conserva la referencia por {lead.waId || lead.phone || 'paciente'}.</p>
        </div>
        <div className="patient-actions">
          <button className="secondary-button" onClick={onBackToCrm}>Volver al CRM</button>
          <button className="secondary-button" disabled>Exportar PDF</button>
        </div>
      </div>

      {detailError && (
        <section className="panel warning-panel">
          <span className="eyebrow">Ficha</span>
          <h2>No se pudo leer el detalle nuevo</h2>
          <p>{detailError}</p>
        </section>
      )}

      <section className="profile-banner">
        <div className="avatar xl">{lead.name.slice(0, 1)}</div>
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
          <Field label="Motivo de consulta" value={clinicalText(clinical, 'motivoConsulta') || readValue(raw.motivo_consulta, raw.motivo, lead.treatment)} />
          <Field label="Diagnostico" value={clinicalText(clinical, 'diagnostico') || readValue(raw.diagnostico)} />
          <Field label="Tratamiento propuesto" value={clinicalText(clinical, 'tratamientoPropuesto') || readValue(raw.tratamiento_propuesto, raw.especialidad, lead.treatment)} />
          <Field label="Especialidad" value={clinicalText(clinical, 'especialidad') || readValue(raw.especialidad)} />
          <Field label="Piezas involucradas" value={clinicalText(clinical, 'piezasInvolucradas') || readValue(raw.piezas_involucradas)} />
          <Field label="Notas de evolucion" value={clinicalText(clinical, 'notasEvolucion') || readValue(raw.notas_evolucion)} />
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
            <strong>{commercial?.costoCotizado ? money(commercial.costoCotizado) : lead.quotedAmount ? money(lead.quotedAmount) : 'Pendiente'}</strong>
          </div>
          <Field label="Promocion aplicada" value={commercialText(commercial, 'promocionAplicada') || readValue(raw.promocion_aplicada)} />
          <Field label="Objeciones" value={commercialText(commercial, 'objeciones') || readValue(raw.objeciones)} />
          <Field label="Indicacion seguimiento" value={commercialText(commercial, 'indicacionSeguimiento') || readValue(raw.indicacion_seguimiento, lead.reminderText)} />
          <Field label="Proxima cita sugerida" value={commercial?.proximaCitaSugerida ? formatDateTime(commercial.proximaCitaSugerida) : lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Pendiente'} />
          <Field label="Cerrado por" value={commercialText(commercial, 'cerradoPor') || 'No definido'} />
          <Field label="Monto cerrado" value={commercial?.montoCerrado ? money(commercial.montoCerrado) : 'Sin abono'} />
          <div className="status-strip">
            <span>Estado</span>
            <strong>{commercialText(commercial, 'estado') || readValue(raw.estado, lead.appointmentStatus, currentStage?.name)}</strong>
          </div>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
