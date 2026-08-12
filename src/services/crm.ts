import { requireSupabase } from '../lib/supabase'
import type { CrmLead, CrmLeadComment, CrmStage, LeadOrigin } from '../types'

export const CRM_COMPANY_KEY = 'especialidades-dentales' as const

export const CRM_TABLES = {
  leads: 'crm_leads',
  pipelineStages: 'crm_pipeline_stages',
  companyMembers: 'crm_company_members',
} as const

export type MovementMode = 'automatic' | 'manual'

/**
 * Fallback confirmado contra la base viva de Especialidades Dentales.
 * La consulta a crm_pipeline_stages sigue siendo la fuente primaria.
 */
export const DENTAL_PIPELINE_FALLBACK: CrmStage[] = [
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'contactos_nuevos',
    name: 'Contactos nuevos',
    color: '#64748b',
    movement_mode: 'automatic',
    position: 1,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'preguntaron_fechas',
    name: 'Preguntaron por fechas',
    color: '#3b82f6',
    movement_mode: 'automatic',
    position: 2,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'valoracion_agendada',
    name: 'Valoración agendada',
    color: '#10b981',
    movement_mode: 'automatic',
    position: 3,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'asistio_valoracion',
    name: 'Asistió a valoración',
    color: '#f59e0b',
    movement_mode: 'manual',
    position: 4,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'canalizado_especialista',
    name: 'Canalizado con especialista',
    color: '#8b5cf6',
    movement_mode: 'manual',
    position: 5,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'tratamiento_agendado',
    name: 'Tratamiento agendado',
    color: '#06b6d4',
    movement_mode: 'manual',
    position: 6,
  },
  {
    company_key: CRM_COMPANY_KEY,
    stage_key: 'cita_cancelada',
    name: 'Cita cancelada / seguimiento',
    color: '#ef4444',
    movement_mode: 'automatic',
    position: 7,
  },
]

export type RawLead = Record<string, unknown>
export type RawCompanyMember = Record<string, unknown>

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
  const phone = stringValue(row.whatsapp_phone, row.telefono, raw.telefono)
  const waId = stringValue(row.wa_id, row.subscriber_id, phone, raw.wa_id, raw.telefono)
  const appointmentDate = stringValue(row.fecha_cita, raw.fecha_cita, raw.proxima_cita_sugerida)
  const treatment = stringValue(
    row.service,
    raw.tratamiento_propuesto,
    raw.especialidad,
    raw.motivo_consulta,
    raw.tratamiento,
  )

  return {
    id: stringValue(row.id) || waId || crypto.randomUUID(),
    companyKey: stringValue(row.company_key) || CRM_COMPANY_KEY,
    waId,
    subscriberId: stringValue(row.subscriber_id, row.wa_id, phone),
    name: stringValue(row.nombre_paciente, raw.nombre_completo, raw.nombre_contacto) || placeholderName(row, raw),
    phone,
    stageKey: stringValue(row.kanban_stage, raw.etapa) || 'contactos_nuevos',
    stageLocked: Boolean(row.stage_locked),
    stageOrigin: stringValue(row.stage_origin) || 'automation',
    appointmentDate,
    appointmentStatus: stringValue(row.status_cita, raw.status_cita),
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
export async function findLeadByWaId(waId: string): Promise<RawLead | null> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .select('*')
    .eq('company_key', CRM_COMPANY_KEY)
    .eq('wa_id', waId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Recupera leads de Especialidades Dentales sin asumir todavía el resto de
 * columnas de crm_leads. El mapeo tipado se hará cuando tengamos su esquema vivo.
 */
export async function listDentalLeads(limit = 100): Promise<RawLead[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.leads)
    .select('*')
    .eq('company_key', CRM_COMPANY_KEY)
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listDentalCrmLeads(limit = 100): Promise<CrmLead[]> {
  const rows = await listDentalLeads(limit)
  return rows.map(mapDentalLead)
}

/**
 * Recupera miembros/permisos de la empresa sin asumir todavía el esquema
 * interno de crm_company_members.
 */
export async function listDentalCompanyMembers(limit = 100): Promise<RawCompanyMember[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.companyMembers)
    .select('*')
    .eq('company_key', CRM_COMPANY_KEY)
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/**
 * Lee las columnas reales del kanban desde Supabase. Si la consulta falla,
 * conserva la lista confirmada como fallback para que la UI no pierda estructura.
 */
export async function getDentalPipelineStages(): Promise<{
  stages: CrmStage[]
  source: 'supabase' | 'fallback'
  warning?: string
}> {
  const client = requireSupabase()

  const { data, error } = await client
    .from(CRM_TABLES.pipelineStages)
    .select('company_key, stage_key, name, color, movement_mode, position')
    .eq('company_key', CRM_COMPANY_KEY)
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
    .eq('company_key', CRM_COMPANY_KEY)
    .select('*')
    .single()

  if (error) throw error
  return mapDentalLead(data as RawLead)
}
