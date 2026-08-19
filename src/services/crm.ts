import { requireSupabase } from '../lib/supabase'
import { canonicalMxPhoneKey, normalizeMexPhoneToE164 } from '../lib/phone'
import type {
  CrmLead,
  CrmLeadComment,
  CrmStage,
  KioskFlow,
  KioskLeadStatus,
  LeadOrigin,
  TrazabilidadResponsable,
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

function normalizeKioskStatus(...values: unknown[]): KioskLeadStatus {
  const normalized = stringValue(...values).toLowerCase()

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

function normalizeKioskStatusFromEstadoConsulta(value: unknown): KioskLeadStatus {
  const normalized = stringValue(value).toLowerCase()

  switch (normalized) {
    case 'en_espera':
      return 'en_espera'
    case 'en_consulta':
      return 'en_consulta'
    case 'finalizada':
    case 'consulta_terminada':
      return 'finalizada'
    case 'sin_llegada':
    default:
      return 'pendiente'
  }
}

function normalizeKioskFlow(value: unknown): KioskFlow {
  return stringValue(value) === 'sin_cita' ? 'sin_cita' : 'con_cita'
}

function isConfirmedAppointmentValue(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes('confirm') ||
    normalized.includes('agendada') ||
    normalized.includes('valoracion_confirmada') ||
    normalized.includes('en_proceso') ||
    normalized.includes('programada') ||
    normalized.includes('pendiente')
  )
}

function isCancelledAppointmentValue(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized.includes('cancel') || normalized.includes('no_show')
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

export function mapDentalLead(row: RawLead): CrmLead {
  const raw = safeObject(row.raw_payload)
  const phone = stringValue(
    row.whatsapp_phone,
    row.telefono,
    raw.whatsapp_phone,
    raw.telefono_paciente,
    raw.telefono,
    raw.username,
  )
  const waId = stringValue(row.wa_id, row.subscriber_id, phone, raw.wa_id, raw.telefono, raw.subscriber_id)
  const appointmentDate = stringValue(
    row.fecha_cita,
    raw.fecha_cita,
    raw.proxima_cita_sugerida,
    raw['Fecha de la cita'],
    raw.cita_start_iso,
    raw.fecha,
  )
  const appointmentStatus = stringValue(
    row.status_cita,
    raw.status_cita,
    raw['Status cita'],
    raw.status,
    raw.Status,
  )
  const treatment = stringValue(
    row.service,
    raw.tratamiento_propuesto,
    raw.especialidad,
    raw.motivo_consulta,
    raw.tratamiento,
    raw.tipo_cita,
  )
  const appointmentConfirmed = Boolean(appointmentDate) && !isCancelledAppointmentValue(appointmentStatus) && isConfirmedAppointmentValue(appointmentStatus || 'pendiente')
  const arrivalAt = stringValue(row.llegada_kiosko_at, raw.arrival_at, raw.checked_in_at)
  const consultaInicioAt = stringValue(row.consulta_inicio_at)
  const consultaFinAt = stringValue(row.consulta_fin_at)
  const relationalKioskStatus = stringValue(row.estado_consulta).toLowerCase()

  const kioskStatus =
    relationalKioskStatus && relationalKioskStatus !== 'sin_llegada'
      ? normalizeKioskStatus(relationalKioskStatus)
      : normalizeKioskStatus(
          row.kiosk_status,
          raw.kiosk_status,
          arrivalAt ? 'en_espera' : 'pendiente',
        )
  const kioskFlow = normalizeKioskFlow(raw.kiosk_flow ?? (appointmentConfirmed || appointmentDate ? 'con_cita' : 'sin_cita'))

  return {
    id: stringValue(row.id) || waId || crypto.randomUUID(),
    companyKey: resolveCompanyKey(stringValue(row.company_key)),
    waId,
    subscriberId: stringValue(row.subscriber_id, row.wa_id, phone),
    name: stringValue(row.nombre_paciente, raw.nombre_paciente, raw['Nombre del paciente'], raw.nombre_completo, raw.nombre_contacto) || placeholderName(row, raw),
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
    lastMessage: stringValue(row.ultimo_mensaje_cliente, row.ultimo_mensaje_cli, raw.ultimo_mensaje, raw.ultimo_mensaje_cli),
    lastContactAt: stringValue(row.last_activity_at, row.source_updated_at, row.updated_at, row.created_at, raw.fecha_ultimo_mensaje),
    kioskStatus,
    kioskFlow,
    arrivalAt,
    consultaInicioAt,
    consultaFinAt,
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
  const savedLead = mapDentalLead(data as RawLead)
  await logTraceabilityEvent({
    lead: savedLead,
    tipoEvento: `etapa kanban cambiada a ${params.stageKey}`,
    responsable: 'sistema',
  })
  return savedLead
}

export async function syncDentalLeadAppointment(params: {
  lead: CrmLead
  appointmentDate: string
  appointmentStatus: string
  appointmentType: string
  calendarEventId?: string
  notes?: string
}): Promise<CrmLead> {
  const client = requireSupabase()
  const companyKey = resolveCompanyKey(params.lead.companyKey)
  const rawPayload = {
    ...params.lead.rawPayload,
    fecha_cita: params.appointmentDate || null,
    proxima_cita_sugerida: params.appointmentDate || null,
    status_cita: params.appointmentStatus || null,
    tipo_cita: params.appointmentType || null,
    google_calendar_event_id: params.calendarEventId || null,
    calendar_source: params.appointmentDate ? 'google_calendar' : null,
    calendar_notes: params.notes || null,
  }

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .update({
      fecha_cita: params.appointmentDate || null,
      status_cita: params.appointmentStatus || null,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.lead.id)
    .eq('company_key', companyKey)
    .select('*')
    .single()

  if (error) throw error
  return mapDentalLead(data as RawLead)
}

export async function updateDentalLeadKioskState(params: {
  lead: CrmLead
  companyKey?: CrmCompanyKey
  kioskStatus: KioskLeadStatus
  kioskFlow?: KioskFlow
  arrivalAt?: string
}): Promise<CrmLead> {
  const client = requireSupabase()
  const companyKey =
    params.companyKey ?? resolveCompanyKey(params.lead.companyKey)

  const now = new Date().toISOString()
  const arrivalAt =
    params.arrivalAt || params.lead.arrivalAt || now

  const databaseStatus =
    params.kioskStatus === 'pendiente'
      ? 'sin_llegada'
      : params.kioskStatus

  const rawPayload = {
    ...params.lead.rawPayload,
    kiosk_status: params.kioskStatus,
    kiosk_flow: params.kioskFlow ?? params.lead.kioskFlow,
    arrival_at:
      params.kioskStatus === 'pendiente'
        ? null
        : arrivalAt,
    last_kiosk_update_at: now,
  }

  const updatePayload: Record<string, unknown> = {
    estado_consulta: databaseStatus,
    llegada_kiosko_at:
      params.kioskStatus === 'pendiente'
        ? null
        : arrivalAt,
    raw_payload: rawPayload,
    status_cita: params.lead.appointmentStatus || null,
    updated_at: now,
  }

  switch (params.kioskStatus) {
    case 'pendiente':
      updatePayload.consulta_inicio_at = null
      updatePayload.consulta_fin_at = null
      break

    case 'en_espera':
      updatePayload.consulta_inicio_at = null
      updatePayload.consulta_fin_at = null
      break

    case 'en_consulta':
      if (params.lead.kioskStatus !== 'en_consulta') {
        updatePayload.consulta_inicio_at = now
      }

      updatePayload.consulta_fin_at = null
      break

    case 'finalizada':
      if (params.lead.kioskStatus !== 'finalizada') {
        updatePayload.consulta_fin_at = now
      }
      break
  }

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .update(updatePayload)
    .eq('id', params.lead.id)
    .eq('company_key', companyKey)
    .select('*')
    .single()

  if (error) throw error

  return mapDentalLead(data as RawLead)
}

export async function callNextWaitingPatient(params: {
  companyKey?: CrmCompanyKey
  mode: 'automatico' | 'manual'
}): Promise<CrmLead | null> {
  const client = requireSupabase()
  const companyKey = params.companyKey ?? DEFAULT_CRM_COMPANY_KEY
  const { data, error } = await client.rpc('llamar_siguiente_paciente', {
    p_company_key: companyKey,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  if (!row) return null

  const lead = mapDentalLead(row as RawLead)
  await logTraceabilityEvent({
    lead,
    tipoEvento: params.mode === 'automatico' ? 'llamado automatico' : 'llamado manual',
    responsable: 'sistema',
  })

  return lead
}

export async function finalizeCurrentConsultation(params: {
  companyKey?: CrmCompanyKey
  mode: 'automatico' | 'manual' | 'telegram'
}): Promise<{
  finalizedLead: CrmLead | null
  calledNextLead: CrmLead | null
}> {
  const client = requireSupabase()
  const companyKey = params.companyKey ?? DEFAULT_CRM_COMPANY_KEY
  const { data, error } = await client.rpc('finalizar_consulta_actual', {
    p_company_key: companyKey,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  const finalizedId = stringValue(row?.finalized_id)
  const finalizedWaId = stringValue(row?.finalized_wa_id)
  const calledNextId = stringValue(row?.called_next_id)
  const calledNextWaId = stringValue(row?.called_next_wa_id)

  const finalizedLead = finalizedId ? await getLeadById(finalizedId, companyKey) : null
  const calledNextLead = calledNextId ? await getLeadById(calledNextId, companyKey) : null

  if (finalizedLead ?? finalizedWaId) {
    await logTraceabilityEvent({
      lead: finalizedLead ?? { id: finalizedId, waId: finalizedWaId, companyKey },
      tipoEvento: 'consulta finalizada',
      responsable: 'sistema',
    })
  }

  if (calledNextLead ?? calledNextWaId) {
    await logTraceabilityEvent({
      lead: calledNextLead ?? { id: calledNextId, waId: calledNextWaId, companyKey },
      tipoEvento: params.mode === 'manual' ? 'llamado manual' : 'llamado automatico',
      responsable: 'sistema',
    })
  }

  return {
    finalizedLead,
    calledNextLead,
  }
}

export async function finalizeConsultationByLead(params: {
  leadId: string
  companyKey?: CrmCompanyKey
  mode: 'manual' | 'telegram'
}): Promise<{
  finalizedLead: CrmLead | null
  calledNextLead: CrmLead | null
}> {
  const client = requireSupabase()
  const companyKey = params.companyKey ?? DEFAULT_CRM_COMPANY_KEY
  const { data, error } = await client.rpc('finalizar_consulta_por_lead', {
    p_lead_id: params.leadId,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  const finalizedId = stringValue(row?.finalized_id)
  const finalizedWaId = stringValue(row?.finalized_wa_id)
  const calledNextId = stringValue(row?.called_next_id)
  const calledNextWaId = stringValue(row?.called_next_wa_id)

  const finalizedLead = finalizedId ? await getLeadById(finalizedId, companyKey) : null
  const calledNextLead = calledNextId ? await getLeadById(calledNextId, companyKey) : null

  if (finalizedLead ?? finalizedWaId) {
    await logTraceabilityEvent({
      lead: finalizedLead ?? { id: finalizedId, waId: finalizedWaId, companyKey },
      tipoEvento: 'consulta finalizada',
      responsable: 'sistema',
    })
  }

  if (calledNextLead ?? calledNextWaId) {
    await logTraceabilityEvent({
      lead: calledNextLead ?? { id: calledNextId, waId: calledNextWaId, companyKey },
      tipoEvento: params.mode === 'manual' ? 'llamado manual' : 'llamado automatico',
      responsable: 'sistema',
    })
  }

  return {
    finalizedLead,
    calledNextLead,
  }
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
  if (!digits) {
    throw new Error('El teléfono debe contener números.')
  }
  const phoneE164 = normalizeMexPhoneToE164(params.phone)
  const canonicalPhone = canonicalMxPhoneKey(params.phone)
  const rawPayload = {
    telefono: phoneE164 || canonicalPhone,
    nombre_paciente: params.name,
    origen_lead: 'walkin_sin_cita',
    kiosk_flow: 'sin_cita',
    arrival_at: now,
    last_kiosk_update_at: now,
  }

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .insert({
      company_key: companyKey,
      subscriber_id: digits,
      nombre_paciente: params.name,
      whatsapp_phone: phoneE164 || canonicalPhone || null,
      wa_id: phoneE164 || canonicalPhone || null,
      estado_consulta: 'en_espera',
      llegada_kiosko_at: now,
      origen_lead: 'walkin_sin_cita',
      source: 'Kiosko',
      kanban_stage: 'contactos_nuevos',
      status_cita: 'sin_cita',
      raw_payload: rawPayload,
    })
    .select('*')
    .single()

  if (error) throw error
  const createdLead = mapDentalLead(data as RawLead)
  await logTraceabilityEvent({
    lead: createdLead,
    tipoEvento: 'lead creado via kiosko',
    responsable: 'sistema',
  })
  return createdLead
}

async function getLeadById(leadId: string, companyKey: CrmCompanyKey): Promise<CrmLead | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .select('*')
    .eq('id', leadId)
    .eq('company_key', companyKey)
    .maybeSingle()

  if (error) throw error
  return data ? mapDentalLead(data as RawLead) : null
}

export async function ensureCasoComercialForLead(lead: Pick<CrmLead, 'id' | 'waId' | 'companyKey'>): Promise<string> {
  if (!lead.waId) {
    throw new Error('No pudimos registrar trazabilidad porque el lead no tiene wa_id.')
  }

  const client = requireSupabase()
  const companyKey = resolveCompanyKey(lead.companyKey)

  const { data: leadRow, error: leadError } = await client
    .from(CRM_TABLES.leads)
    .select('id')
    .eq('company_key', companyKey)
    .eq('wa_id', lead.waId)
    .maybeSingle()

  if (leadError) throw leadError
  if (!leadRow) {
    throw new Error('No encontramos el lead de esta clínica para registrar trazabilidad.')
  }

  const { data: existingCase, error: existingError } = await client
    .from(CRM_TABLES.commercialCases)
    .select('caso_comercial_id')
    .eq('wa_id', lead.waId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existingCase?.caso_comercial_id) return String(existingCase.caso_comercial_id)

  const { data: createdCase, error: createError } = await client
    .from(CRM_TABLES.commercialCases)
    .insert({
      wa_id: lead.waId,
      estado: 'valorado',
    })
    .select('caso_comercial_id')
    .single()

  if (createError) throw createError
  return String(createdCase.caso_comercial_id)
}

export async function logTraceabilityEvent(params: {
  lead: Pick<CrmLead, 'id' | 'waId' | 'companyKey'>
  tipoEvento: string
  responsable: TrazabilidadResponsable
}): Promise<void> {
  if (!params.lead.waId) return

  const client = requireSupabase()
  const casoComercialId = await ensureCasoComercialForLead(params.lead)
  const companyKey = resolveCompanyKey(params.lead.companyKey)

  const { error } = await client
    .from(CRM_TABLES.traceability)
    .insert({
      caso_comercial_id: casoComercialId,
      lead_id: params.lead.id,
      company_key: companyKey,
      wa_id: params.lead.waId,
      timestamp: new Date().toISOString(),
      tipo_evento: params.tipoEvento,
      responsable: params.responsable,
    })

  if (error) throw error
}
