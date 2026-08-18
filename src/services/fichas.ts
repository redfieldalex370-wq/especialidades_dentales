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
    fichaClinicaId: stringValue(row.ficha_clinica_id),
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
    casoComercialId: stringValue(row.caso_comercial_id),
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
    eventoId: stringValue(row.evento_id),
    casoComercialId: stringValue(row.caso_comercial_id),
    timestamp: stringValue(row.timestamp),
    tipoEvento: stringValue(row.tipo_evento),
    responsable: normalizeResponsable(row.responsable),
  }
}

async function assertLeadForCompany(waId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.leads)
    .select('id, wa_id, company_key')
    .eq('company_key', COMPANY_KEY)
    .eq('wa_id', waId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('No encontramos el lead de esta clínica para ese wa_id.')
  return data
}

export async function getFichaClinica(waId: string): Promise<FichaClinica | null> {
  await assertLeadForCompany(waId)
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.fichaClinica)
    .select('*')
    .eq('wa_id', waId)
    .maybeSingle()

  if (error) throw error
  return mapFichaClinica(data as RawRow | null)
}

export async function upsertFichaClinica(waId: string, input: DentalLeadDetailUpdate['fichaClinica']): Promise<FichaClinica> {
  await assertLeadForCompany(waId)
  const client = requireSupabase()
  const payload = {
    wa_id: waId,
    motivo_consulta: input.motivoConsulta || null,
    diagnostico: input.diagnostico || null,
    tratamiento_propuesto: input.tratamientoPropuesto || null,
    piezas_involucradas: input.piezasInvolucradas || null,
    notas_evolucion: input.notasEvolucion || null,
    archivos_adjuntos: input.archivosAdjuntos ?? [],
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from(TABLES.fichaClinica)
    .upsert(payload, { onConflict: 'wa_id' })
    .select('*')
    .single()

  if (error) throw error
  return mapFichaClinica(data as RawRow)!
}

export async function getCasoComercial(waId: string): Promise<CasoComercial | null> {
  await assertLeadForCompany(waId)
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.casoComercial)
    .select('*')
    .eq('wa_id', waId)
    .maybeSingle()

  if (error) throw error
  return mapCasoComercial(data as RawRow | null)
}

export async function upsertCasoComercial(waId: string, input: DentalLeadDetailUpdate['casoComercial']): Promise<CasoComercial> {
  await assertLeadForCompany(waId)
  const client = requireSupabase()
  const payload = {
    wa_id: waId,
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
    .upsert(payload, { onConflict: 'wa_id' })
    .select('*')
    .single()

  if (error) throw error
  return mapCasoComercial(data as RawRow)!
}

export async function listEventos(casoComercialId: string): Promise<TrazabilidadEvento[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLES.trazabilidad)
    .select('evento_id, caso_comercial_id, timestamp, tipo_evento, responsable')
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
  const { data, error } = await client
    .from(TABLES.trazabilidad)
    .insert({
      caso_comercial_id: params.casoComercialId,
      tipo_evento: params.tipoEvento,
      responsable: params.responsable,
    })
    .select('evento_id, caso_comercial_id, timestamp, tipo_evento, responsable')
    .single()

  if (error) throw error
  return mapTrazabilidad(data as RawRow)
}

export async function getDentalLeadDetail(leadId: string, companyKey = COMPANY_KEY): Promise<CrmLeadDetail> {
  const client = requireSupabase()
  const { data: leadRow, error: leadError } = await client
    .from(TABLES.leads)
    .select('wa_id, company_key')
    .eq('id', leadId)
    .eq('company_key', companyKey)
    .maybeSingle()

  if (leadError) throw leadError
  if (!leadRow?.wa_id) {
    return {
      fichaClinica: null,
      casoComercial: null,
      trazabilidad: [],
    }
  }

  const [fichaClinica, casoComercial] = await Promise.all([
    getFichaClinica(String(leadRow.wa_id)),
    getCasoComercial(String(leadRow.wa_id)),
  ])

  const trazabilidad = casoComercial?.casoComercialId
    ? await listEventos(casoComercial.casoComercialId)
    : []

  return {
    fichaClinica,
    casoComercial,
    trazabilidad,
  }
}

export async function updateDentalLeadDetail(lead: CrmLead, input: DentalLeadDetailUpdate): Promise<CrmLeadDetail> {
  if (!lead.waId) {
    throw new Error('Este lead no tiene wa_id y la ficha real depende de ese dato.')
  }

  const previousCase = await getCasoComercial(lead.waId)
  const [fichaClinica, casoComercial] = await Promise.all([
    upsertFichaClinica(lead.waId, input.fichaClinica),
    upsertCasoComercial(lead.waId, input.casoComercial),
  ])

  const client = requireSupabase()
  const { error: leadError } = await client
    .from(TABLES.leads)
    .update({
      fecha_cita: input.casoComercial.proximaCitaSugerida || null,
      status_cita: input.casoComercial.estado || null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_key', COMPANY_KEY)
    .eq('wa_id', lead.waId)

  if (leadError) throw leadError

  if (!previousCase) {
    await addEvento({
      casoComercialId: casoComercial.casoComercialId,
      tipoEvento: 'caso_comercial_creado',
      responsable: 'sistema',
    })
  }

  await logTraceabilityEvent({
    lead,
    tipoEvento: 'ficha actualizada',
    responsable: 'doctor',
  })

  const trazabilidad = await listEventos(casoComercial.casoComercialId)

  return {
    fichaClinica,
    casoComercial,
    trazabilidad,
  }
}
