import type { Patient, TraceEvent } from '../types'

export const initialPatients: Patient[] = [
  {
    waId: '5214271001001',
    name: 'Mariana López',
    phone: '+52 1 427 100 1001',
    appointmentTime: '10:30',
    arrivalTime: '10:21',
    origin: 'campana_meta',
    status: 'en_consulta',
    treatment: 'Carillas',
    quotedAmount: 38000,
  },
  {
    waId: '5214271001002',
    name: 'Daniel Ortega',
    phone: '+52 1 427 100 1002',
    appointmentTime: '11:00',
    arrivalTime: '10:48',
    origin: 'organico_whatsapp',
    status: 'en_espera',
    treatment: 'Prótesis',
    quotedAmount: 52000,
  },
  {
    waId: '5214271001003',
    name: 'Paola Jiménez',
    phone: '+52 1 427 100 1003',
    appointmentTime: '11:30',
    arrivalTime: '11:04',
    origin: 'campana_google',
    status: 'en_espera',
    treatment: 'Airflow',
    quotedAmount: 2900,
  },
]

export const traceEvents: TraceEvent[] = [
  { id: '1', timestamp: 'Hoy · 10:21', type: 'Llegada registrada en kiosko', responsible: 'sistema' },
  { id: '2', timestamp: 'Hoy · 10:23', type: 'Paciente llamado a consulta', responsible: 'sistema' },
  { id: '3', timestamp: 'Hoy · 10:25', type: 'Recordatorio de ficha preparado', responsible: 'bot' },
]
