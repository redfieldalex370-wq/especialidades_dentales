import { requireSupabase } from '../lib/supabase'
import type {
  ClinicalRecord,
  CommercialCase,
  CrmLead,
  CrmLeadComment,
  CrmLeadDetail,
  CrmStage,
  DentalLeadDetailUpdate,
  KioskFlow,
  KioskLeadStatus,
  LeadOrigin,
  TraceabilityEvent,
} from '../types'

export const AVAILABLE_COMPANIES = [
  { key: 'especialidades-dentales', label: 'Especialidades Dentales' },
  { key: 'dr-woolrich', label: 'Dr Woolrich' },
] as const
export type CrmCompanyKey = (typeof AVAILABLE_COMPANIES)[number]['key']
export const DEFAULT_CRM_COMPANY_KEY: CrmCompanyKey = 'especialidades-dentales'

export const CRM_TABLES = {
  leads: 'crm_leads',
  pipelineStages: 'crm_pipeline_stages',
  companyMembers: 'crm_company_members',
  clinicalRecords: 'ficha_clinica',
  commercialCases: 'caso_comercial',
  traceability: 'caso_trazabilidad',
} as const

export type MovementMode = 'automatic' | 'manual'

/**
 * Fallback confirmado contra la base viva de Especialidades Dentales.
 * La consulta a crm_pipeline_stages sigue siendo la fuente primaria.
 */
export const DENTAL_PIPELINE_FALLBACK: CrmStage[] = [
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'contactos_nuevos',
    name: 'Contactos nuevos',
    color: '#64748b',
    movement_mode: 'automatic',
    position: 1,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'preguntaron_fechas',
    name: 'Preguntaron por fechas',
    color: '#3b82f6',
    movement_mode: 'automatic',
    position: 2,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'valoracion_agendada',
    name: 'Valoración agendada',
    color: '#10b981',
    movement_mode: 'automatic',
    position: 3,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'asistio_valoracion',
    name: 'Asistió a valoración',
    color: '#f59e0b',
    movement_mode: 'manual',
    position: 4,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'canalizado_especialista',
    name: 'Canalizado con especialista',
    color: '#8b5cf6',
    movement_mode: 'manual',
    position: 5,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'tratamiento_agendado',
    name: 'Tratamiento agendado',
    color: '#06b6d4',
    movement_mode: 'manual',
    position: 6,
  },
  {
    company_key: DEFAULT_CRM_COMPANY_KEY,
    stage_key: 'cita_cancelada',
    name: 'Cita cancelada / seguimiento',
    color: '#ef4444',
    movement_mode: 'automatic',
    position: 7,
  },
]

export type RawLead = Record<string, unknown>
export type RawCompanyMember = Record<string, unknown>
type RawClinicalRecord = Record<string, unknown>
type RawCommercialCase = Record<string, unknown>
type RawTraceabilityEvent = Record<string, unknown>

function resolveCompanyKey(value: string | undefined): CrmCompanyKey {
  return AVAILABLE_COMPANIES.some((company) => company.key === value)
    ? (value as CrmCompanyKey)
    : DEFAULT_CRM_COMPANY_KEY
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }

  return ''
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const normalized = value.replace(/[^\d.-]/g, '')
      const parsed = Number(normalized)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

function normalizeOrigin(value: string): LeadOrigin {
  switch (value) {
    case 'campana_meta':
    case 'campana_google':
    case 'organico_whatsapp':
    case 'recomendado_agendado_doctor':
    case 'walkin_sin_cita':
      return value
    default:
      return 'desconocido'
  }
}

function normalizeKioskStatus(value: unknown): KioskLeadStatus {
  const normalized = stringValue(value).toLowerCase()

  switch (normalized) {
    case 'en_espera':
    case 'en consulta':
    case 'en_consulta':
      return normalized.replace(' ', '_') as KioskLeadStatus
    case 'consulta_terminada':
    case 'finalizada':
      return 'finalizada'
    default:
      return 'pendiente'
  }
}

function normalizeKioskFlow(value: unknown): KioskFlow {
  return stringValue(value) === 'sin_cita' ? 'sin_cita' : 'con_cita'
}

function isConfirmedAppointmentValue(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized.includes('confirm') || normalized.includes('agendada') || normalized.includes('valoracion_confirmada')
}

function placeholderName(row: RawLead, raw: Record<string, unknown>): string {
  const suffix = stringValue(row.wa_id, row.whatsapp_phone, row.subscriber_id, raw.telefono).replace(/\D/g, '').slice(-4)
  return suffix ? `Paciente ${suffix}` : 'Paciente sin nombre'
}

function mapComment(value: unknown, index: number): CrmLeadComment {
  const row = safeObject(value)
  return {
    id: stringValue(row.id) || `comment-${index}`,
    author: stringValue(row.author, row.autor) || 'Equipo',
    at: stringValue(row.at, row.timestamp, row.fecha) || new Date().toISOString(),
    text: stringValue(row.text, row.comment, row.comentario) || 'Sin comentario',
  }
}

function mapClinicalRecord(row: RawClinicalRecord | null): ClinicalRecord | null {
  if (!row) return null

  return {
    id: stringValue(row.id),
    leadId: stringValue(row.lead_id),
    companyKey: stringValue(row.company_key),
    waId: stringValue(row.wa_id),
    motivoConsulta: stringValue(row.motivo_consulta),
    diagnostico: stringValue(row.diagnostico),
    tratamientoPropuesto: stringValue(row.tratamiento_propuesto),
    especialidad: stringValue(row.especialidad),
    piezasInvolucradas: stringValue(row.piezas_involucradas),
    notasEvolucion: stringValue(row.notas_evolucion),
    archivosAdjuntos: safeArray<string>(row.archivos_adjuntos).map((item) => String(item)),
    updatedAt: stringValue(row.updated_at, row.created_at),
  }
}

function mapCommercialCase(row: RawCommercialCase | null): CommercialCase | null {
  if (!row) return null

  return {
    id: stringValue(row.id),
    leadId: stringValue(row.lead_id),
    companyKey: stringValue(row.company_key),
    waId: stringValue(row.wa_id),
    costoCotizado: numberValue(row.costo_cotizado),
    promocionAplicada: stringValue(row.promocion_aplicada),
    objeciones: stringValue(row.objeciones),
    indicacionSeguimiento: stringValue(row.indicacion_seguimiento),
    proximaCitaSugerida: stringValue(row.proxima_cita_sugerida),
    estado: stringValue(row.estado),
    montoCerrado: numberValue(row.monto_cerrado),
    cerradoPor: stringValue(row.cerrado_por),
    escaladoCloser: Boolean(row.escalado_closer),
    escaladoMotivo: stringValue(row.escalado_motivo),
    updatedAt: stringValue(row.updated_at, row.created_at),
  }
}

function mapTraceabilityEvent(row: RawTraceabilityEvent): TraceabilityEvent {
  return {
    id: stringValue(row.id),
    caseId: stringValue(row.caso_comercial_id),
    leadId: stringValue(row.lead_id),
    companyKey: stringValue(row.company_key),
    waId: stringValue(row.wa_id),
    timestamp: stringValue(row.timestamp, row.created_at),
    tipoEvento: stringValue(row.tipo_evento),
    responsable: (stringValue(row.responsable) || 'sistema') as TraceabilityEvent['responsable'],
    metadata: safeObject(row.metadata),
  }
}

export function mapDentalLead(row: RawLead): CrmLead {
  const raw = safeObject(row.raw_payload)
  const phone = stringValue(row.whatsapp_phone, row.telefono, raw.telefono)
  const waId = stringValue(row.wa_id, row.subscriber_id, phone, raw.wa_id, raw.telefono)
  const appointmentDate = stringValue(row.fecha_cita, raw.fecha_cita, raw.proxima_cita_sugerida)
  const appointmentStatus = stringValue(row.status_cita, raw.status_cita)
  const treatment = stringValue(
    row.service,
    raw.tratamiento_propuesto,
    raw.especialidad,
    raw.motivo_consulta,
    raw.tratamiento,
  )
  const appointmentConfirmed = isConfirmedAppointmentValue(appointmentStatus)
  const arrivalAt = stringValue(raw.arrival_at, raw.checked_in_at)
  const kioskStatus = normalizeKioskStatus(raw.kiosk_status)
  const kioskFlow = normalizeKioskFlow(raw.kiosk_flow ?? (appointmentConfirmed || appointmentDate ? 'con_cita' : 'sin_cita'))

  return {
    id: stringValue(row.id) || waId || crypto.randomUUID(),
    companyKey: resolveCompanyKey(stringValue(row.company_key)),
    waId,
    subscriberId: stringValue(row.subscriber_id, row.wa_id, phone),
    name: stringValue(row.nombre_paciente, raw.nombre_completo, raw.nombre_contacto) || placeholderName(row, raw),
    phone,
    stageKey: stringValue(row.kanban_stage, raw.etapa) || 'contactos_nuevos',
    stageLocked: Boolean(row.stage_locked),
    stageOrigin: stringValue(row.stage_origin) || 'automation',
    appointmentDate,
    appointmentStatus,
    origin: normalizeOrigin(stringValue(row.origen_lead, raw.origen_lead)),
    source: stringValue(row.source, raw.fuente) || 'WhatsApp',
    assignedTo: stringValue(row.assigned_to),
    treatment,
    quotedAmount: numberValue(row.costo_cotizado, raw.costo_cotizado, raw.monto_cerrado),
    reminderAt: stringValue(row.reminder_at),
    reminderText: stringValue(row.reminder_text),
    reminderCompleted: Boolean(row.reminder_completed),
    lastMessage: stringValue(row.ultimo_mensaje_cliente, raw.ultimo_mensaje),
    lastContactAt: stringValue(row.last_activity_at, row.source_updated_at, row.updated_at, row.created_at),
    kioskStatus,
    kioskFlow,
    arrivalAt,
    appointmentConfirmed,
    comments: safeArray(row.comments).map(mapComment),
    tags: safeArray<string>(row.tags).map((tag) => String(tag)),
    rawPayload: raw,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  }
}

/**
 * Busca un paciente en el CRM vigente. company_key forma parte del filtro
 * para que un mismo wa_id de otra empresa nunca se mezcle con esta clínica.
 */
export async function findLeadByWaId(waId: string, companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<RawLead | null> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .select('*')
    .eq('company_key', companyKey)
    .eq('wa_id', waId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Recupera leads de Especialidades Dentales sin asumir todavía el resto de
 * columnas de crm_leads. El mapeo tipado se hará cuando tengamos su esquema vivo.
 */
export async function listDentalLeads(limit = 100, companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<RawLead[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .select('*')
    .eq('company_key', companyKey)
    .order('fecha_cita', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listDentalCrmLeads(limit = 100, companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<CrmLead[]> {
  const rows = await listDentalLeads(limit, companyKey)
  return rows.map(mapDentalLead)
}

/**
 * Recupera miembros/permisos de la empresa sin asumir todavía el esquema
 * interno de crm_company_members.
 */
export async function listDentalCompanyMembers(limit = 100, companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<RawCompanyMember[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.companyMembers)
    .select('*')
    .eq('company_key', companyKey)
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/**
 * Lee las columnas reales del kanban desde Supabase. Si la consulta falla,
 * conserva la lista confirmada como fallback para que la UI no pierda estructura.
 */
export async function getDentalPipelineStages(companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<{
  stages: CrmStage[]
  source: 'supabase' | 'fallback'
  warning?: string
}> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.pipelineStages)
    .select('company_key, stage_key, name, color, movement_mode, position')
    .eq('company_key', companyKey)
    .order('position', { ascending: true })

  if (error) {
    return {
      stages: DENTAL_PIPELINE_FALLBACK,
      source: 'fallback',
      warning: error.message,
    }
  }

  if (!data || data.length === 0) {
    return {
      stages: DENTAL_PIPELINE_FALLBACK,
      source: 'fallback',
      warning: 'Supabase no devolvió etapas para esta empresa.',
    }
  }

  return {
    stages: data as CrmStage[],
    source: 'supabase',
  }
}

export async function updateDentalLeadStage(params: {
  leadId: string
  stageKey: string
  movementMode: MovementMode
  companyKey?: CrmCompanyKey
}): Promise<CrmLead> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .update({
      kanban_stage: params.stageKey,
      stage_locked: params.movementMode === 'manual',
      stage_origin: 'admin',
    })
    .eq('id', params.leadId)
    .eq('company_key', params.companyKey ?? DEFAULT_CRM_COMPANY_KEY)
    .select('*')
    .single()

  if (error) throw error
  return mapDentalLead(data as RawLead)
}

export async function getDentalLeadDetail(leadId: string, companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<CrmLeadDetail> {
  const client = requireSupabase()

  const [clinicalResult, commercialResult, traceabilityResult] = await Promise.all([
    client
      .from(CRM_TABLES.clinicalRecords)
      .select('*')
      .eq('lead_id', leadId)
      .eq('company_key', companyKey)
      .maybeSingle(),
    client
      .from(CRM_TABLES.commercialCases)
      .select('*')
      .eq('lead_id', leadId)
      .eq('company_key', companyKey)
      .maybeSingle(),
    client
      .from(CRM_TABLES.traceability)
      .select('*')
      .eq('lead_id', leadId)
      .eq('company_key', companyKey)
      .order('timestamp', { ascending: false }),
  ])

  if (clinicalResult.error) throw clinicalResult.error
  if (commercialResult.error) throw commercialResult.error
  if (traceabilityResult.error) throw traceabilityResult.error

  return {
    clinicalRecord: mapClinicalRecord(clinicalResult.data as RawClinicalRecord | null),
    commercialCase: mapCommercialCase(commercialResult.data as RawCommercialCase | null),
    traceability: (traceabilityResult.data ?? []).map((row) => mapTraceabilityEvent(row as RawTraceabilityEvent)),
  }
}

export async function updateDentalLeadDetail(lead: CrmLead, input: DentalLeadDetailUpdate): Promise<CrmLeadDetail> {
  const client = requireSupabase()
  const nextAppointmentDate = input.commercialCase.proximaCitaSugerida || lead.appointmentDate || null
  const nextAppointmentStatus = nextAppointmentDate ? lead.appointmentStatus || 'cita_confirmada' : lead.appointmentStatus || null
  const mergedRawPayload = {
    ...lead.rawPayload,
    motivo_consulta: input.clinicalRecord.motivoConsulta || null,
    diagnostico: input.clinicalRecord.diagnostico || null,
    tratamiento_propuesto: input.clinicalRecord.tratamientoPropuesto || null,
    especialidad: input.clinicalRecord.especialidad || null,
    piezas_involucradas: input.clinicalRecord.piezasInvolucradas || null,
    notas_evolucion: input.clinicalRecord.notasEvolucion || null,
    costo_cotizado: input.commercialCase.costoCotizado,
    promocion_aplicada: input.commercialCase.promocionAplicada || null,
    objeciones: input.commercialCase.objeciones || null,
    indicacion_seguimiento: input.commercialCase.indicacionSeguimiento || null,
    proxima_cita_sugerida: nextAppointmentDate,
    fecha_cita: nextAppointmentDate,
    status_cita: nextAppointmentStatus,
    estado: input.commercialCase.estado || null,
    monto_cerrado: input.commercialCase.montoCerrado,
    cerrado_por: input.commercialCase.cerradoPor || null,
    escalado_closer: input.commercialCase.escaladoCloser,
    escalado_motivo: input.commercialCase.escaladoMotivo || null,
  }

  const clinicalPayload = {
    lead_id: lead.id,
    company_key: resolveCompanyKey(lead.companyKey),
    wa_id: lead.waId || lead.phone || null,
    motivo_consulta: input.clinicalRecord.motivoConsulta || null,
    diagnostico: input.clinicalRecord.diagnostico || null,
    tratamiento_propuesto: input.clinicalRecord.tratamientoPropuesto || null,
    especialidad: input.clinicalRecord.especialidad || null,
    piezas_involucradas: input.clinicalRecord.piezasInvolucradas || null,
    notas_evolucion: input.clinicalRecord.notasEvolucion || null,
    updated_at: new Date().toISOString(),
  }

  const commercialPayload = {
    lead_id: lead.id,
    company_key: resolveCompanyKey(lead.companyKey),
    wa_id: lead.waId || lead.phone || null,
    costo_cotizado: input.commercialCase.costoCotizado,
    promocion_aplicada: input.commercialCase.promocionAplicada || null,
    objeciones: input.commercialCase.objeciones || null,
    indicacion_seguimiento: input.commercialCase.indicacionSeguimiento || null,
    proxima_cita_sugerida: input.commercialCase.proximaCitaSugerida || null,
    estado: input.commercialCase.estado || null,
    monto_cerrado: input.commercialCase.montoCerrado,
    cerrado_por: input.commercialCase.cerradoPor || null,
    escalado_closer: input.commercialCase.escaladoCloser,
    escalado_motivo: input.commercialCase.escaladoMotivo || null,
    updated_at: new Date().toISOString(),
  }

  const [clinicalResult, commercialResult] = await Promise.all([
    client.from(CRM_TABLES.clinicalRecords).upsert(clinicalPayload, { onConflict: 'lead_id' }),
    client.from(CRM_TABLES.commercialCases).upsert(commercialPayload, { onConflict: 'lead_id' }),
  ])

  if (clinicalResult.error) throw clinicalResult.error
  if (commercialResult.error) throw commercialResult.error

  const { error: leadError } = await client
    .from(CRM_TABLES.leads)
    .update({
      fecha_cita: nextAppointmentDate,
      status_cita: nextAppointmentStatus,
      nombre_paciente: lead.name || null,
      whatsapp_phone: lead.phone || null,
      raw_payload: mergedRawPayload,
    })
    .eq('id', lead.id)
    .eq('company_key', resolveCompanyKey(lead.companyKey))

  if (leadError) throw leadError

  return getDentalLeadDetail(lead.id, resolveCompanyKey(lead.companyKey))
}

export async function updateDentalLeadKioskState(params: {
  lead: CrmLead
  companyKey?: CrmCompanyKey
  kioskStatus: KioskLeadStatus
  kioskFlow?: KioskFlow
  arrivalAt?: string
}): Promise<CrmLead> {
  const client = requireSupabase()
  const companyKey = params.companyKey ?? resolveCompanyKey(params.lead.companyKey)
  const arrivalAt = params.arrivalAt ?? params.lead.arrivalAt ?? new Date().toISOString()
  const rawPayload = {
    ...params.lead.rawPayload,
    kiosk_status: params.kioskStatus,
    kiosk_flow: params.kioskFlow ?? params.lead.kioskFlow,
    arrival_at: params.kioskStatus === 'pendiente' ? null : arrivalAt,
    last_kiosk_update_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .update({
      raw_payload: rawPayload,
      status_cita: params.lead.appointmentStatus || null,
    })
    .eq('id', params.lead.id)
    .eq('company_key', companyKey)
    .select('*')
    .single()

  if (error) throw error
  return mapDentalLead(data as RawLead)
}

export async function createDentalWalkInLead(params: {
  companyKey?: CrmCompanyKey
  name: string
  phone: string
}): Promise<CrmLead> {
  const client = requireSupabase()
  const now = new Date().toISOString()
  const companyKey = params.companyKey ?? DEFAULT_CRM_COMPANY_KEY
  const digits = params.phone.replace(/\D/g, '')
  const rawPayload = {
    telefono: digits,
    nombre_paciente: params.name,
    origen_lead: 'walkin_sin_cita',
    kiosk_status: 'en_espera',
    kiosk_flow: 'sin_cita',
    arrival_at: now,
    last_kiosk_update_at: now,
  }

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .insert({
      company_key: companyKey,
      nombre_paciente: params.name,
      whatsapp_phone: digits || null,
      wa_id: digits || null,
      origen_lead: 'walkin_sin_cita',
      source: 'Kiosko',
      kanban_stage: 'contactos_nuevos',
      status_cita: 'sin_cita',
      raw_payload: rawPayload,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapDentalLead(data as RawLead)
}
