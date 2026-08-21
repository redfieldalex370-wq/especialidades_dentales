import { useEffect, useState } from 'react'
import type { CrmLead } from '../types'

interface Props { leads: CrmLead[]; onRefresh: () => void }

export function QueueDisplayView({ leads, onRefresh }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date()); onRefresh() }, 15_000)
    return () => window.clearInterval(timer)
  }, [onRefresh])
  const current = leads.find((lead) => lead.kioskStatus === 'en_consulta')
  const waiting = leads.filter((lead) => lead.kioskStatus === 'en_espera').sort((a, b) => new Date(a.arrivalAt || a.createdAt).getTime() - new Date(b.arrivalAt || b.createdAt).getTime())
  return <div className="public-display">
    <header className="public-display-header">
      <div>
        <span className="eyebrow">Especialidades Dentales</span>
        <h1>Turnos de consulta</h1>
        <p className="display-subtitle">Por favor, permanece atento a tu nombre.</p>
      </div>
      <div className="display-clock">
        <strong>{now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</strong>
        <span>{now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
    </header>
    <main className="display-grid">
      <section className="display-current panel">
        <span className="eyebrow">Turno actual</span>
        <span className="display-turn-code">{current ? 'EN CONSULTA' : '—'}</span>
        <h2>{current?.name || 'Sin paciente en consulta'}</h2>
        <p>{current ? 'Favor de pasar al consultorio.' : 'El siguiente paciente será llamado pronto.'}</p>
      </section>
      <section className="display-queue panel">
        <div className="section-head compact">
          <div><span className="eyebrow">Sala de espera</span><h2>Próximos turnos</h2></div>
          <span className="soft-pill">{waiting.length} en espera</span>
        </div>
        {waiting.length === 0 ? <div className="empty-state"><h3>Todo listo</h3><p>No hay pacientes esperando.</p></div> : waiting.map((lead, index) => (
          <div className="display-queue-row" key={lead.id}>
            <strong>{`P${String(index + 1).padStart(2, '0')}`}</strong>
            <span>{lead.name}</span>
            <small>En espera</small>
          </div>
        ))}
      </section>
    </main>
    <footer className="display-footer">Si necesitas ayuda, acércate a recepción.</footer>
  </div>
}
