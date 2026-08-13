import { useMemo } from 'react'
import type { CrmLead, CrmStage } from '../types'

interface Props {
  leads: CrmLead[]
  stages: CrmStage[]
  loading: boolean
  error: string
  pipelineSource: 'supabase' | 'fallback'
  pipelineWarning: string
  movingLeadId: string
  onMoveLead: (leadId: string, stageKey: string) => void
  onOpenLead: (leadId: string) => void
  onRefresh: () => void
}

export function DashboardView({
  leads,
  stages,
  loading,
  error,
  pipelineSource,
  pipelineWarning,
  movingLeadId,
  onMoveLead,
  onOpenLead,
  onRefresh,
}: Props) {
  const todayAppointments = leads.filter((lead) => isSameDay(lead.appointmentDate, new Date())).length
  const quotedHighValue = leads.filter((lead) => (lead.quotedAmount ?? 0) >= 45000).length
  const overdueFollowups = leads.filter((lead) => isOverdue(lead.reminderAt, lead.reminderCompleted)).length
  const upcomingAppointments = [...leads]
    .filter((lead) => lead.appointmentDate && isSameDay(lead.appointmentDate, new Date()) && isConfirmedAppointment(lead.appointmentStatus))
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime())
    .slice(0, 6)

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricCard label="Pacientes en CRM" value={leads.length} hint="leads de crm_leads" />
        <MetricCard label="Citas de hoy" value={todayAppointments} hint="fecha_cita del dia" />
        <MetricCard label="Seguimientos vencidos" value={overdueFollowups} hint="recordatorio pendiente" />
        <MetricCard label="Casos > $45,000" value={quotedHighValue} hint="umbral de escalamiento" />
      </section>

      {(error || pipelineWarning) && (
        <section className="panel warning-panel">
          <span className="eyebrow">Revision</span>
          <h2>Hay algo que revisar en la conexion</h2>
          <p>{error || pipelineWarning}</p>
        </section>
      )}

      <section className="crm-dashboard-grid">
        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Agenda</span>
              <h2>Proximas citas</h2>
            </div>
            <div className="hero-actions">
              <span className="soft-pill">{upcomingAppointments.length} visibles</span>
              <button className="secondary-button" onClick={onRefresh} disabled={loading}>
                {loading ? 'Actualizando...' : 'Actualizar CRM'}
              </button>
            </div>
          </div>

          <div className="appointment-list">
            {upcomingAppointments.length > 0 ? (
              upcomingAppointments.map((lead) => (
                <button className="appointment-card" key={lead.id} onClick={() => onOpenLead(lead.id)}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{lead.treatment || 'Cita confirmada'}</span>
                  </div>
                  <div className="appointment-card-meta">
                    <strong>{formatTime(lead.appointmentDate)}</strong>
                  </div>
                </button>
              ))
            ) : (
              <EmptyCopy
                title="No hay citas visibles"
                text="No hay citas confirmadas para hoy."
              />
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h2>Estado del kanban</h2>
            </div>
            <span className="soft-pill">{stages.length} columnas</span>
          </div>

          <div className="pipeline-preview">
            {stages.map((stage) => (
              <div className="pipeline-stage" key={stage.stage_key}>
                <span className="stage-dot" style={{ backgroundColor: stage.color }} />
                <div>
                  <strong>{stage.position}. {stage.name}</strong>
                  <small>{stage.movement_mode === 'automatic' ? 'Automatica' : 'Manual'}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel crm-board-panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">CRM</span>
            <h2>Tablero de valoraciones</h2>
          </div>
        </div>

        <div className="crm-board">
          {stages.map((stage) => {
            const cards = leads
              .filter((lead) => lead.stageKey === stage.stage_key)
              .sort((a, b) => compareDates(a.appointmentDate, b.appointmentDate))

            return (
              <section className="crm-column" key={stage.stage_key}>
                <header className="crm-column-head" style={{ borderColor: stage.color }}>
                  <div>
                    <strong>{stage.name}</strong>
                    <span>{cards.length} pacientes</span>
                  </div>
                  <span className="column-mode">{stage.movement_mode}</span>
                </header>

                <div className="crm-column-body">
                  {cards.length > 0 ? (
                    cards.map((lead) => (
                      <article className="crm-lead-card" key={lead.id}>
                        <button className="crm-lead-main" onClick={() => onOpenLead(lead.id)}>
                          <div className="crm-lead-topline">
                            <strong>{lead.name}</strong>
                            <span>{lead.origin.replaceAll('_', ' ')}</span>
                          </div>
                          <span>{lead.phone || 'Sin telefono'}</span>
                          <small>{lead.treatment || 'Sin tratamiento capturado'}</small>
                        </button>

                        <div className="crm-lead-meta">
                          <span>{lead.appointmentDate ? formatDateTime(lead.appointmentDate) : 'Sin fecha de cita'}</span>
                          <span>{lead.quotedAmount ? money(lead.quotedAmount) : 'Sin monto'}</span>
                        </div>

                        <label className="stage-select">
                          <span>Mover a</span>
                          <select
                            value={lead.stageKey}
                            onChange={(event) => onMoveLead(lead.id, event.target.value)}
                            disabled={movingLeadId === lead.id}
                          >
                            {stages.map((option) => (
                              <option value={option.stage_key} key={option.stage_key}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </article>
                    ))
                  ) : (
                    <EmptyCopy title="Sin tarjetas" text="Esta columna se llenara conforme entren o cambien de etapa." compact />
                  )}
                </div>
              </section>
            )
          })}
        </div>
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

function labelForStage(stages: CrmStage[], stageKey: string): string {
  return stages.find((stage) => stage.stage_key === stageKey)?.name ?? stageKey
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha invalida'
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSameDay(value: string, target: Date): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toDateString() === target.toDateString()
}

function compareDates(left: string, right: string): number {
  const leftDate = new Date(left).getTime()
  const rightDate = new Date(right).getTime()
  if (!Number.isFinite(leftDate) && !Number.isFinite(rightDate)) return 0
  if (!Number.isFinite(leftDate)) return 1
  if (!Number.isFinite(rightDate)) return -1
  return leftDate - rightDate
}

function isOverdue(value: string, completed: boolean): boolean {
  if (!value || completed) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now()
}

function money(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value)
}

function isConfirmedAppointment(status: string): boolean {
  return status.toLowerCase().includes('confirm')
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Hora invalida'
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
