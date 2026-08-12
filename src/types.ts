export type PatientStatus = 'en_espera' | 'en_consulta' | 'consulta_terminada'
export type LeadOrigin =
  | 'campana_meta'
  | 'campana_google'
  | 'organico_whatsapp'
  | 'recomendado_agendado_doctor'
  | 'walkin_sin_cita'
  | 'desconocido'

export interface Patient {
  waId: string
  name: string
  phone: string
  arrivalTime: string
  appointmentTime?: string
  origin: Exclude<LeadOrigin, 'desconocido'>
  status: PatientStatus
  treatment?: string
  quotedAmount?: number
}

export interface CrmStage {
  company_key: string
  stage_key: string
  name: string
  color: string
  movement_mode: 'automatic' | 'manual'
  position: number
}

export interface CrmLeadComment {
  id: string
  author: string
  at: string
  text: string
}

export interface CrmLead {
  id: string
  companyKey: string
  waId: string
  subscriberId: string
  name: string
  phone: string
  stageKey: string
  stageLocked: boolean
  stageOrigin: string
  appointmentDate: string
  appointmentStatus: string
  origin: LeadOrigin
  source: string
  assignedTo: string
  treatment: string
  quotedAmount: number | null
  reminderAt: string
  reminderText: string
  reminderCompleted: boolean
  lastMessage: string
  lastContactAt: string
  comments: CrmLeadComment[]
  tags: string[]
  rawPayload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface TraceEvent {
  id: string
  timestamp: string
  type: string
  responsible: 'bot' | 'doctor' | 'closer' | 'sistema'
}
