import { useEffect, useMemo, useState } from 'react'
import type { CrmLead, ValoracionPaciente } from '../types'
import { hasSchedulerUrl, sendToScheduler } from '../services/n8n'
import { getSupabaseConnectionState, testSupabaseConnection } from '../services/supabase'
import { linkValoracionToLead, listPendingValoraciones } from '../services/valoraciones'

interface Props {
  leads: CrmLead[]
  onOpenLead: (leadId: string) => void
}

export function AutomationView({ leads, onOpenLead }: Props) {
  const [n8nMessage, setN8nMessage] = useState('')
  const [supabaseMessage, setSupabaseMessage] = useState('')
  const [loadingN8n, setLoadingN8n] = useState(false)
  const [loadingSupabase, setLoadingSupabase] = useState(false)
  const [pendingValoraciones, setPendingValoraciones] = useState<ValoracionPaciente[]>([])
  const [valoracionesLoading, setValoracionesLoading] = useState(true)
  const [valoracionesError, setValoracionesError] = useState('')
  const [searchByValoracion, setSearchByValoracion] = useState<Record<string, string>>({})
  const [linkingValoracionId, setLinkingValoracionId] = useState('')
  const [linkMessage, setLinkMessage] = useState('')

  const supabaseState = getSupabaseConnectionState()

  async function loadPendingValoraciones() {
    setValoracionesLoading(true)
    setValoracionesError('')

    try {
      const rows = await listPendingValoraciones()
      setPendingValoraciones(rows)
    } catch (error) {
      setPendingValoraciones([])
      setValoracionesError(error instanceof Error ? error.message : 'No se pudieron cargar las valoraciones pendientes.')
    } finally {
      setValoracionesLoading(false)
    }
  }

  useEffect(() => {
    void loadPendingValoraciones()
  }, [])

  async function testScheduler() {
    setLoadingN8n(true)
    setN8nMessage('')
    try {
      await sendToScheduler({ source: 'dental-ops-ui', action: 'health_test', timestamp: new Date().toISOString() })
      setN8nMessage('El webhook respondió correctamente.')
    } catch (error) {
      setN8nMessage(error instanceof Error ? error.message : 'No se pudo probar el webhook.')
    } finally {
      setLoadingN8n(false)
    }
  }

  async function testDatabase() {
    setLoadingSupabase(true)
    setSupabaseMessage('')
    try {
      const report = await testSupabaseConnection()
      const summary = report.checks
        .map((check) => `${check.ok ? '✓' : '✕'} ${check.table}: ${check.message}`)
        .join('\n')

      setSupabaseMessage(`Empresa: ${report.companyKey}\n${summary}`)
    } catch (error) {
      setSupabaseMessage(error instanceof Error ? error.message : 'No se pudo probar Supabase.')
    } finally {
      setLoadingSupabase(false)
    }
  }

  async function handleManualLink(valoracion: ValoracionPaciente, lead: CrmLead) {
    setLinkingValoracionId(valoracion.id)
    setLinkMessage('')

    try {
      await linkValoracionToLead({
        valoracionId: valoracion.id,
        lead,
      })
      setPendingValoraciones((current) => current.filter((item) => item.id !== valoracion.id))
      setLinkMessage(`Valoración vinculada con ${lead.name}.`)
    } catch (error) {
      setLinkMessage(error instanceof Error ? error.message : 'No se pudo vincular la valoración.')
    } finally {
      setLinkingValoracionId('')
    }
  }

  return (
    <div className="view-stack">
      <div className="section-head standalone">
        <div>
          <span className="eyebrow">Integraciones</span>
          <h1>Automatización</h1>
        </div>
      </div>

      <section className="integration-grid">
        <article className="panel integration-card connected">
          <div className="integration-icon">n8n</div>
          <div>
            <span className="eyebrow">Agendador</span>
            <h2>n8n</h2>
            <p>Webhook configurable desde <code>VITE_N8N_SCHEDULER_URL</code>.</p>
          </div>
          <span className={hasSchedulerUrl() ? 'connection good' : 'connection pending'}>{hasSchedulerUrl() ? 'Configurado' : 'Falta URL'}</span>
          <button className="primary-button" onClick={testScheduler} disabled={loadingN8n || !hasSchedulerUrl()}>{loadingN8n ? 'Probando...' : 'Probar webhook'}</button>
          {n8nMessage && <div className="integration-message">{n8nMessage}</div>}
        </article>

        <article className="panel integration-card connected">
          <div className="integration-icon">DB</div>
          <div>
            <span className="eyebrow">Base</span>
            <h2>Supabase</h2>
            <p>
              Empresa: <code>{supabaseState.companyKey}</code><br />
              Leads: <code>{supabaseState.tables.leads}</code><br />
              Kanban: <code>{supabaseState.tables.pipelineStages}</code><br />
              Miembros: <code>{supabaseState.tables.companyMembers}</code>
            </p>
          </div>
          <span className={supabaseState.configured ? 'connection good' : 'connection pending'}>
            {supabaseState.configured ? 'Configurado' : 'Faltan credenciales'}
          </span>
          <button className="primary-button" onClick={testDatabase} disabled={loadingSupabase || !supabaseState.configured}>
            {loadingSupabase ? 'Probando...' : 'Probar Supabase'}
          </button>
          {supabaseMessage && <div className="integration-message preline">{supabaseMessage}</div>}
        </article>
      </section>

      <section className="panel">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Respaldo humano</span>
            <h2>Valoraciones pendientes de vincular</h2>
          </div>
          <div className="hero-actions">
            <span className="soft-pill">{pendingValoraciones.length} pendientes</span>
            <button className="secondary-button" onClick={() => void loadPendingValoraciones()} disabled={valoracionesLoading}>
              {valoracionesLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {linkMessage && (
          <div className="integration-message">{linkMessage}</div>
        )}

        {valoracionesError && (
          <div className="integration-message">{valoracionesError}</div>
        )}

        <div className="appointment-list">
          {pendingValoraciones.length > 0 ? (
            pendingValoraciones.map((valoracion) => (
              <PendingValoracionCard
                key={valoracion.id}
                valoracion={valoracion}
                leads={leads}
                query={searchByValoracion[valoracion.id] ?? ''}
                busy={linkingValoracionId === valoracion.id}
                onChangeQuery={(value) =>
                  setSearchByValoracion((current) => ({
                    ...current,
                    [valoracion.id]: value,
                  }))
                }
                onLink={handleManualLink}
                onOpenLead={onOpenLead}
              />
            ))
          ) : (
            <div className="empty-state empty-state-compact">
              <h3>{valoracionesLoading ? 'Cargando valoraciones...' : 'Sin valoraciones pendientes'}</h3>
              <p>{valoracionesLoading ? 'Estamos consultando Supabase.' : 'No hay casos manuales por resolver en este momento.'}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PendingValoracionCard({
  valoracion,
  leads,
  query,
  busy,
  onChangeQuery,
  onLink,
  onOpenLead,
}: {
  valoracion: ValoracionPaciente
  leads: CrmLead[]
  query: string
  busy: boolean
  onChangeQuery: (value: string) => void
  onLink: (valoracion: ValoracionPaciente, lead: CrmLead) => Promise<void>
  onOpenLead: (leadId: string) => void
}) {
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const phoneFromValoracion = valoracion.telefonoPaciente.replace(/\D/g, '')
    const nameFromValoracion = valoracion.nombrePaciente.trim().toLowerCase()

    return leads
      .filter((lead) => {
        const haystack = `${lead.name} ${lead.phone} ${lead.waId}`.toLowerCase()
        const normalizedPhone = `${lead.phone} ${lead.waId}`.replace(/\D/g, '')

        if (normalizedQuery) {
          return haystack.includes(normalizedQuery) || normalizedPhone.includes(normalizedQuery.replace(/\D/g, ''))
        }

        if (phoneFromValoracion && normalizedPhone.includes(phoneFromValoracion)) return true
        if (nameFromValoracion && lead.name.toLowerCase().includes(nameFromValoracion)) return true
        return false
      })
      .slice(0, 5)
  }, [leads, query, valoracion.nombrePaciente, valoracion.telefonoPaciente])

  return (
    <article className="panel pending-valoracion-card">
      <div className="section-head compact">
        <div>
          <span className="eyebrow">{labelForEstado(valoracion.estadoVinculacion)}</span>
          <h2>{valoracion.nombrePaciente || 'Sin nombre detectado'}</h2>
        </div>
        <span className="soft-pill">{formatDateTime(valoracion.fechaValoracion || valoracion.createdAt)}</span>
      </div>

      <div className="field-grid">
        <div className="field-row">
          <span>Teléfono</span>
          <strong>{valoracion.telefonoPaciente || 'No detectado'}</strong>
        </div>
        <div className="field-row">
          <span>Motivo</span>
          <strong>{valoracion.motivoConsulta || 'No detectado'}</strong>
        </div>
        <div className="field-row">
          <span>Diagnóstico</span>
          <strong>{valoracion.diagnostico || 'No detectado'}</strong>
        </div>
        <div className="field-row">
          <span>Tratamiento</span>
          <strong>{valoracion.tratamientoRecomendado || 'No detectado'}</strong>
        </div>
      </div>

      <div className="message-box">{valoracion.extracto || 'Sin texto para mostrar.'}</div>

      <div className="pending-valoracion-search">
        <input
          className="patient-search-input"
          value={query}
          onChange={(event) => onChangeQuery(event.target.value)}
          placeholder="Buscar lead por nombre o teléfono"
        />
      </div>

      <div className="appointment-list">
        {candidates.length > 0 ? (
          candidates.map((lead) => (
            <article className="appointment-card appointment-card-static appointment-card-match-yes" key={lead.id}>
              <div>
                <strong>{lead.name}</strong>
                <span>{lead.phone || lead.waId || 'Sin teléfono'}</span>
                <small>{lead.appointmentDate ? `Última cita ${formatDateTime(lead.appointmentDate)}` : lead.stageKey.replaceAll('_', ' ')}</small>
              </div>
              <div className="patient-browser-actions">
                <button className="secondary-button" onClick={() => onOpenLead(lead.id)}>Ver ficha</button>
                <button className="primary-button" onClick={() => void onLink(valoracion, lead)} disabled={busy}>
                  {busy ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state empty-state-compact">
            <h3>Sin coincidencias</h3>
            <p>Prueba con otro nombre o teléfono para vincular esta valoración.</p>
          </div>
        )}
      </div>
    </article>
  )
}

function labelForEstado(value: ValoracionPaciente['estadoVinculacion']): string {
  switch (value) {
    case 'vinculada_revision':
      return 'Vinculada con revisión'
    case 'vinculada':
      return 'Vinculada'
    default:
      return 'Pendiente de vincular'
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || 'Sin fecha'
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
