import type { PatientStatus } from '../types'

const labels: Record<PatientStatus, string> = {
  en_espera: 'En espera',
  en_consulta: 'En consulta',
  consulta_terminada: 'Terminada',
}

export function StatusBadge({ status }: { status: PatientStatus }) {
  return <span className={`status-badge ${status}`}>{labels[status]}</span>
}
