import { requireSupabase } from '../lib/supabase'
import { logTraceabilityEvent } from './crm'
import type {
  CasoComercial,
  CasoComercialCerradoPor,
  CasoComercialEstado,
  CrmLead,
  CrmLeadDetail,
  DentalLeadDetailUpdate,
  FichaClinica,
  TrazabilidadEvento,
  TrazabilidadResponsable,
} from '../types'

const COMPANY_KEY = 'especialidades-dentales'

const TABLES = {
  leads: 'crm_leads',
  waClientesEstado: 'wa_clientes_estado',
  fichaClinica: 'ficha_clinica',
  casoComercial: 'caso_comercial',
  trazabilidad: 'caso_trazabilidad',
} as const

type RawRow = Record<string, unknown>

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function normalizeEstado(value: unknown): CasoComercialEstado {
  const estado = stringValue(value)
  switch (estado) {
    case 'en_seguimiento':
    case 'escalado_closer':
    case 'agendado':
    case 'abono_recibido':
    case 'perdido':
      return estado
    default:
      return 'valorado'
  }
}

function normalizeCerradoPor(value: unknown): CasoComercialCerradoPor | '' {
  const cerradoPor = stringValue(value)
  switch (cerradoPor) {
    case 'doctor':
    case 'closer_greenchimp':
    case 'automatico':
      return cerradoPor
    default:
      return ''
  }
}

function normalizeResponsable(value: unknown): TrazabilidadResponsable {
  const responsable = stringValue(value)
  switch (responsable) {
    case 'bot':
    case 'doctor':
    case 'closer':
      return responsable
    default:
      return 'sistema'
  }
}

function mapFichaClinica(row: RawRow | null): FichaClinica | null {
  if (!row) return null

  return {
    fichaClinicaId: stringValue(row.id),
    id: stringValue(row.id),
    leadId: stringValue(row.lead_id),
    usuarioId: stringValue(row.usuario_id),
    companyKey: stringValue(row.company_key),
    waId: stringValue(row.wa_id),
    motivoConsulta: stringValue(row.motivo_consulta),
    diagnostico: stringValue(row.diagnostico),
    tratamientoPropuesto: stringValue(row.tratamiento_propuesto),
    piezasInvolucradas: stringValue(row.piezas_involucradas),
    notasEvolucion: stringValue(row.notas_evolucion),
    archivosAdjuntos: safeArray(row.archivos_adjuntos),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at, row.created_at),
  }
}

function mapCasoComercial(row: RawRow | null): CasoComercial | null {
  if (!row) return null

  return {
    casoComercialId: stringValue(row.id),
    waId: stringValue(row.wa_id),
    costoCotizado: numberValue(row.costo_cotizado),
    promocionAplicada: stringValue(row.promocion_aplicada),
    objeciones: stringValue(row.objeciones),
    indicacionSeguimiento: stringValue(row.indicacion_seguimiento),
    proximaCitaSugerida: stringValue(row.proxima_cita_sugerida),
    estado: normalizeEstado(row.estado),
    montoCerrado: numberValue(row.monto_cerrado),
    cerradoPor: normalizeCerradoPor(row.cerrado_por),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at, row.created_at),
  }
}

function mapTrazabilidad(row: RawRow): TrazabilidadEvento {
  return {
    eventoId: stringValue(row.id),
    casoComercialId: stringValue(row.caso_comercial_id),
    timestamp: stringValue(row.timestamp),
    tipoEvento: stringValue(row.tipo_evento),
    responsable: normalizeResponsable(row.responsable),
  }
}

async function assertLeadForCompany(
  leadId: string,
  companyKey = COMPANY_KEY,
) {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.leads)
    .select('id, wa_id, company_key')
    .eq('id', leadId)
    .eq('company_key', companyKey)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('No encontramos el lead de esta clínica para ese lead_id.')
  return data
}

async function assertUsuarioForCompany(
  usuarioId: string,
  companyKey = COMPANY_KEY,
) {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.waClientesEstado)
    .select('usuario_id, whatsapp_phone, crm_lead_id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('No encontramos el usuario de WhatsApp para esta ficha.')
  return data
}

export async function getFichaClinica(params: {
  leadId?: string
  usuarioId?: string
}): Promise<FichaClinica | null> {
  const client = requireSupabase()
  let query = client
    .from(TABLES.fichaClinica)
    .select('*')

  if (params.usuarioId) {
    await assertUsuarioForCompany(params.usuarioId)
    query = query.eq('usuario_id', params.usuarioId)
  } else if (params.leadId) {
    const leadRow = await assertLeadForCompany(params.leadId)
    query = query.eq('lead_id', String(leadRow.id))
  } else {
    return null
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return mapFichaClinica(data as RawRow | null)
}

export async function upsertFichaClinica(params: {
  leadId?: string
  usuarioId?: string
}, input: DentalLeadDetailUpdate['fichaClinica']): Promise<FichaClinica> {
  const client = requireSupabase()
  let leadRow: Awaited<ReturnType<typeof assertLeadForCompany>> | null = null
  let usuarioRow: Awaited<ReturnType<typeof assertUsuarioForCompany>> | null = null

  if (params.leadId) leadRow = await assertLeadForCompany(params.leadId)
  if (params.usuarioId) usuarioRow = await assertUsuarioForCompany(params.usuarioId)

  if (params.usuarioId && !leadRow && !usuarioRow?.crm_lead_id) {
    const { data, error } = await client.rpc('save_ficha_clinica_calendar', {
      p_usuario_id: params.usuarioId,
      p_motivo_consulta: input.motivoConsulta || null,
      p_diagnostico: input.diagnostico || null,
      p_tratamiento_propuesto: input.tratamientoPropuesto || null,
      p_piezas_involucradas: input.piezasInvolucradas || null,
      p_notas_evolucion: input.notasEvolucion || null,
      p_archivos_adjuntos: input.archivosAdjuntos ?? [],
    })
    if (error) throw error
    return mapFichaClinica(data as RawRow)!
  }

  const identityFilter = params.usuarioId
    ? { usuario_id: params.usuarioId }
    : { lead_id: leadRow?.id ?? null }
  const existingQuery = client
    .from(TABLES.fichaClinica)
    .select('*')
    .match(identityFilter)
    .maybeSingle()
  const { data: existingRow, error: existingError } = await existingQuery
  if (existingError) throw existingError

  const payload = {
    usuario_id: params.usuarioId || null,
    lead_id: leadRow?.id ?? (stringValue(usuarioRow?.crm_lead_id) || null),
    company_key: String(leadRow?.company_key ?? COMPANY_KEY),
    wa_id: leadRow?.wa_id ?? usuarioRow?.whatsapp_phone ?? null,
    motivo_consulta: input.motivoConsulta || (existingRow as RawRow | null)?.motivo_consulta || null,
    diagnostico: input.diagnostico || (existingRow as RawRow | null)?.diagnostico || null,
    tratamiento_propuesto: input.tratamientoPropuesto || (existingRow as RawRow | null)?.tratamiento_propuesto || null,
    piezas_involucradas: input.piezasInvolucradas || (existingRow as RawRow | null)?.piezas_involucradas || null,
    notas_evolucion: input.notasEvolucion || (existingRow as RawRow | null)?.notas_evolucion || null,
    archivos_adjuntos: input.archivosAdjuntos ?? [],
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from(TABLES.fichaClinica)
    .upsert(payload, { onConflict: params.usuarioId ? 'usuario_id' : 'lead_id' })
    .select('*')
    .single()

  if (error) throw error
  return mapFichaClinica(data as RawRow)!
}

export async function getCasoComercial(leadId: string): Promise<CasoComercial | null> {
  const leadRow = await assertLeadForCompany(leadId)
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.casoComercial)
    .select('*')
    .eq('lead_id', String(leadRow.id))
    .maybeSingle()

  if (error) throw error
  return mapCasoComercial(data as RawRow | null)
}

export async function upsertCasoComercial(leadId: string, input: DentalLeadDetailUpdate['casoComercial']): Promise<CasoComercial> {
  const leadRow = await assertLeadForCompany(leadId)
  const client = requireSupabase()
  const payload = {
    lead_id: leadRow.id,
    company_key: String(leadRow.company_key),
    wa_id: leadRow.wa_id ?? null,
    costo_cotizado: input.costoCotizado,
    promocion_aplicada: input.promocionAplicada || null,
    objeciones: input.objeciones || null,
    indicacion_seguimiento: input.indicacionSeguimiento || null,
    proxima_cita_sugerida: input.proximaCitaSugerida || null,
    estado: input.estado,
    monto_cerrado: input.estado === 'abono_recibido' ? input.montoCerrado : null,
    cerrado_por: input.estado === 'abono_recibido' ? input.cerradoPor || null : null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from(TABLES.casoComercial)
    .upsert(payload, { onConflict: 'lead_id' })
    .select('*')
    .single()

  if (error) throw error
  return mapCasoComercial(data as RawRow)!
}

export async function listEventos(casoComercialId: string): Promise<TrazabilidadEvento[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.trazabilidad)
    .select('id, caso_comercial_id, timestamp, tipo_evento, responsable')
    .eq('caso_comercial_id', casoComercialId)
    .order('timestamp', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapTrazabilidad(row as RawRow))
}

export async function addEvento(params: {
  casoComercialId: string
  tipoEvento: string
  responsable: TrazabilidadResponsable
}): Promise<TrazabilidadEvento> {
  const client = requireSupabase()
  const { data: commercialCase, error: commercialCaseError } = await client
    .from(TABLES.casoComercial)
    .select('id, lead_id, company_key, wa_id')
    .eq('id', params.casoComercialId)
    .single()

  if (commercialCaseError) throw commercialCaseError

  const { data, error } = await client
    .from(TABLES.trazabilidad)
    .insert({
      caso_comercial_id: params.casoComercialId,
      lead_id: commercialCase.lead_id,
      company_key: commercialCase.company_key,
      wa_id: commercialCase.wa_id,
      tipo_evento: params.tipoEvento,
      responsable: params.responsable,
    })
    .select('id, caso_comercial_id, timestamp, tipo_evento, responsable')
    .single()

  if (error) throw error
  return mapTrazabilidad(data as RawRow)
}

export async function getDentalLeadDetail(
  params: { leadId?: string; usuarioId?: string },
  companyKey = COMPANY_KEY,
): Promise<CrmLeadDetail> {
  let leadId = params.leadId || ''
  let usuarioId = params.usuarioId || ''
  let waId = ''
  let crmLeadId = ''

  if (leadId) {
    const leadRow = await assertLeadForCompany(leadId, companyKey)
    crmLeadId = String(leadRow.id)
    waId = stringValue(leadRow.wa_id)
  }

  if (usuarioId) {
    const usuario = await assertUsuarioForCompany(usuarioId, companyKey)
    usuarioId = stringValue(usuario.usuario_id)
    waId = waId || stringValue(usuario.whatsapp_phone)
    crmLeadId = crmLeadId || stringValue(usuario.crm_lead_id)
    leadId = leadId || crmLeadId
  }

  const fichaClinica = await getFichaClinica({
    leadId,
    usuarioId,
  })

  if (!leadId) {
    return {
      usuarioId,
      crmLeadId: '',
      waId,
      fichaClinica,
      casoComercial: null,
      trazabilidad: [],
    }
  }

  const casoComercial = await getCasoComercial(leadId)
  const trazabilidad = casoComercial?.casoComercialId
    ? await listEventos(casoComercial.casoComercialId)
    : []

  return {
    usuarioId,
    crmLeadId: leadId,
    waId,
    fichaClinica,
    casoComercial,
    trazabilidad,
  }
}

export async function updateDentalLeadDetail(
  params: { lead: CrmLead | null; usuarioId?: string },
  input: DentalLeadDetailUpdate,
): Promise<CrmLeadDetail> {
  const leadId = params.lead?.id || ''
  const usuarioId = params.usuarioId || ''
  const previousCase = leadId ? await getCasoComercial(leadId) : null
  const fichaClinica = await upsertFichaClinica({ leadId, usuarioId }, input.fichaClinica)
  const casoComercial = leadId
    ? await upsertCasoComercial(leadId, input.casoComercial)
    : null

  if (leadId) {
    const client = requireSupabase()
    const { error: leadError } = await client
      .from(TABLES.leads)
      .update({
        fecha_cita: input.casoComercial.proximaCitaSugerida || null,
        status_cita: input.casoComercial.estado || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('company_key', COMPANY_KEY)

    if (leadError) throw leadError
  }

  if (casoComercial && !previousCase) {
    await addEvento({
      casoComercialId: casoComercial.casoComercialId,
      tipoEvento: 'caso_comercial_creado',
      responsable: 'sistema',
    })
  }

  if (params.lead) {
    await logTraceabilityEvent({
      lead: params.lead,
      tipoEvento: 'ficha actualizada',
      responsable: 'doctor',
    })
  }

  const trazabilidad = casoComercial
    ? await listEventos(casoComercial.casoComercialId)
    : []

  return {
    usuarioId,
    crmLeadId: leadId,
    waId: stringValue(params.lead?.waId),
    fichaClinica,
    casoComercial,
    trazabilidad,
  }
}
