export type PatientStatus = 'en_espera' | 'en_consulta' | 'consulta_terminada'
export type KioskLeadStatus = 'pendiente' | 'en_espera' | 'en_consulta' | 'finalizada'
export type KioskFlow = 'con_cita' | 'sin_cita'
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
  kioskStatus: KioskLeadStatus
  kioskFlow: KioskFlow
  arrivalAt: string
  consultaInicioAt: string
  consultaFinAt: string
  appointmentConfirmed: boolean
  comments: CrmLeadComment[]
  tags: string[]
  rawPayload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CasoComercialEstado =
  | 'valorado'
  | 'en_seguimiento'
  | 'escalado_closer'
  | 'agendado'
  | 'abono_recibido'
  | 'perdido'

export type CasoComercialCerradoPor = 'doctor' | 'closer_greenchimp' | 'automatico'
export type TrazabilidadResponsable = 'bot' | 'doctor' | 'closer' | 'sistema'

export interface FichaClinica {
  id?: string
  fichaClinicaId: string
  leadId?: string
  companyKey?: string
  waId: string
  motivoConsulta: string
  diagnostico: string
  tratamientoPropuesto: string
  especialidad?: string
  piezasInvolucradas: string
  notasEvolucion: string
  archivosAdjuntos: string[]
  createdAt: string
  updatedAt: string
}

export interface CasoComercial {
  id?: string
  casoComercialId: string
  leadId?: string
  companyKey?: string
  waId: string
  costoCotizado: number | null
  promocionAplicada: string
  objeciones: string
  indicacionSeguimiento: string
  proximaCitaSugerida: string
  estado: CasoComercialEstado
  montoCerrado: number | null
  cerradoPor: CasoComercialCerradoPor | ''
  escaladoCloser?: boolean
  escaladoMotivo?: string
  createdAt: string
  updatedAt: string
}

export interface TrazabilidadEvento {
  id?: string
  eventoId: string
  caseId?: string
  leadId?: string
  companyKey?: string
  waId?: string
  casoComercialId: string
  timestamp: string
  tipoEvento: string
  responsable: TrazabilidadResponsable
  metadata?: Record<string, unknown>
}

export interface CrmLeadDetail {
  fichaClinica: FichaClinica | null
  casoComercial: CasoComercial | null
  trazabilidad: TrazabilidadEvento[]
}

export interface DentalLeadDetailUpdate {
  fichaClinica: {
    motivoConsulta: string
    diagnostico: string
    tratamientoPropuesto: string
    piezasInvolucradas: string
    notasEvolucion: string
    archivosAdjuntos: string[]
  }
  casoComercial: {
    costoCotizado: number | null
    promocionAplicada: string
    objeciones: string
    indicacionSeguimiento: string
    proximaCitaSugerida: string
    estado: CasoComercialEstado
    montoCerrado: number | null
    cerradoPor: CasoComercialCerradoPor | ''
  }
}

export interface TraceEvent {
  id: string
  timestamp: string
  type: string
  responsible: TrazabilidadResponsable
}

export interface CalendarAppointment {
  id: string
  title: string
  description: string
  start: string
  end: string
  status: string
  location: string
  patientName: string
  matchedLeadId: string
  matchMethod: 'crm_lead_id' | 'subscriber_id' | 'wa_id' | 'phone' | 'name' | 'none'
  source: 'google_calendar'
}

export type EstadoVinculacionValoracion =
  | 'pendiente_vincular'
  | 'vinculada_revision'
  | 'vinculada'

export interface ValoracionPaciente {
  id: string
  companyKey: string
  usuarioId: string
  nombrePaciente: string
  telefonoPaciente: string
  fechaValoracion: string
  motivoConsulta: string
  diagnostico: string
  tratamientoRecomendado: string
  observaciones: string
  textoOriginal: string
  transcripcion: string
  extracto: string
  estadoVinculacion: EstadoVinculacionValoracion
  createdAt: string
  updatedAt: string
}

export type ClinicalRecord = FichaClinica
export type CommercialCase = CasoComercial
export type TraceabilityEvent = TrazabilidadEvento
