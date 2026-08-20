import { useEffect, useState } from 'react'
import type { CrmLead } from '../types'

interface Props { leads: CrmLead[]; onRefresh: () => void }

export function QueueDisplayView({ leads, onRefresh }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => { setTick((value) => value + 1); onRefresh() }, 15_000)
    return () => window.clearInterval(timer)
  }, [onRefresh])
  const current = leads.find((lead) => lead.kioskStatus === 'en_consulta')
  const waiting = leads.filter((lead) => lead.kioskStatus === 'en_espera').sort((a, b) => new Date(a.arrivalAt || a.createdAt).getTime() - new Date(b.arrivalAt || b.createdAt).getTime())
  return <div className="public-display">
    <header className="public-display-header"><div><span className="eyebrow">Especialidades Dentales</span><h1>Turnos de consulta</h1></div><span className="soft-pill">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</span></header>
    <main className="display-grid"><section className="display-current panel"><span className="eyebrow">Consulta actual</span><h2>{current?.name || 'Sin paciente en consulta'}</h2><p>{current ? 'Favor de pasar al consultorio.' : 'El siguiente paciente será llamado pronto.'}</p></section>
      <section className="display-queue panel"><div className="section-head compact"><div><span className="eyebrow">Sala de espera</span><h2>Siguientes pacientes</h2></div><span className="soft-pill">{waiting.length} en espera</span></div>{waiting.length === 0 ? <div className="empty-state">No hay pacientes esperando.</div> : waiting.map((lead, index) => <div className="display-queue-row" key={lead.id}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{lead.name}</span><small>En espera</small></div>)}</section></main>
  </div>
}
