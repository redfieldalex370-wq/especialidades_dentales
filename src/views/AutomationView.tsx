import { useState } from 'react'
import { hasSchedulerUrl, sendToScheduler } from '../services/n8n'
import { getSupabaseConnectionState, testSupabaseConnection } from '../services/supabase'

export function AutomationView() {
  const [n8nMessage, setN8nMessage] = useState('')
  const [supabaseMessage, setSupabaseMessage] = useState('')
  const [loadingN8n, setLoadingN8n] = useState(false)
  const [loadingSupabase, setLoadingSupabase] = useState(false)

  const supabaseState = getSupabaseConnectionState()

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
    </div>
  )
}
