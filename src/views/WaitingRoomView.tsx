import { FormEvent, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Patient } from '../types'
import { StatusBadge } from '../components/StatusBadge'

interface Props {
  patients: Patient[]
  setPatients: Dispatch<SetStateAction<Patient[]>>
}

export function WaitingRoomView({ patients, setPatients }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const current = patients.find((p) => p.status === 'en_consulta')
  const waiting = useMemo(
    () => patients.filter((p) => p.status === 'en_espera').sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime)),
    [patients],
  )

  function callNext() {
    if (current || waiting.length === 0) return
    const next = waiting[0]
    setPatients((list) => list.map((p) => (p.waId === next.waId ? { ...p, status: 'en_consulta' } : p)))
  }

  function finishCurrent() {
    if (!current) return
    setPatients((list) => list.map((p) => (p.waId === current.waId ? { ...p, status: 'consulta_terminada' } : p)))
  }

  function addWalkIn(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !phone.trim()) return

    const digits = phone.replace(/\D/g, '')
    const now = new Date()
    const arrivalTime = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

    setPatients((list) => [
      ...list,
      {
        waId: digits || crypto.randomUUID(),
        name: name.trim(),
        phone: phone.trim(),
        arrivalTime,
        origin: 'walkin_sin_cita',
        status: 'en_espera',
      },
    ])
    setName('')
    setPhone('')
  }

  return (
    <div className="view-stack">
      <div className="section-head standalone">
        <div>
          <span className="eyebrow">Tramo 1</span>
          <h1>Sala de espera</h1>
          <p>El turno se mueve por hora real de llegada, no por el horario de Calendar.</p>
        </div>
      </div>

      <section className="waiting-layout">
        <div className="panel current-consult">
          <span className="eyebrow">Consulta actual</span>
          {current ? (
            <>
              <div className="consult-patient">
                <div className="avatar xl">{current.name.slice(0, 1)}</div>
                <div>
                  <h2>{current.name}</h2>
                  <p>{current.phone}</p>
                </div>
              </div>
              <div className="consult-meta">
                <div><span>Llegada</span><strong>{current.arrivalTime}</strong></div>
                <div><span>Tratamiento</span><strong>{current.treatment ?? 'Por valorar'}</strong></div>
              </div>
              <button className="primary-button" onClick={finishCurrent}>Finalizar manualmente</button>
              <small className="helper">Después este cierre se disparará automáticamente cuando llegue el audio del doctor.</small>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <h3>Doctor libre</h3>
              <p>No hay nadie marcado en consulta.</p>
              <button className="primary-button" onClick={callNext} disabled={waiting.length === 0}>Llamar siguiente</button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-head compact">
            <div><span className="eyebrow">Cola</span><h2>Siguientes pacientes</h2></div>
            <span className="soft-pill">{waiting.length} esperando</span>
          </div>
          <div className="queue-list">
            {waiting.map((patient, index) => (
              <article className="queue-item" key={patient.waId}>
                <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="patient-main">
                  <strong>{patient.name}</strong>
                  <span>Llegó {patient.arrivalTime}</span>
                </div>
                <StatusBadge status={patient.status} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel walkin-panel">
        <div>
          <span className="eyebrow">Alta sin campaña o sin cita</span>
          <h2>“No tengo cita”</h2>
          <p>Entrada corta para crear al paciente en la misma cola usando teléfono como referencia del lead.</p>
        </div>
        <form className="walkin-form" onSubmit={addWalkIn}>
          <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del paciente" /></label>
          <label>Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52..." /></label>
          <button className="primary-button" type="submit">Registrar llegada</button>
        </form>
      </section>
    </div>
  )
}
