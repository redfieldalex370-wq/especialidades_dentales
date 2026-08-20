import { requireSupabase } from '../lib/supabase'
import type { CrmLead, ValoracionPaciente } from '../types'
import { addEvento, upsertCasoComercial, upsertFichaClinica } from './fichas'

const COMPANY_KEY = 'especialidades-dentales'
const TABLE = 'valoraciones_pacientes'

type RawRow = Record<string, unknown>

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }

  return ''
}

function normalizeEstadoVinculacion(value: unknown): ValoracionPaciente['estadoVinculacion'] {
  const estado = stringValue(value)
  switch (estado) {
    case 'vinculada':
    case 'vinculada_revision':
      return estado
    default:
      return 'pendiente_vincular'
  }
}

function extractSnippet(row: RawRow): string {
  return stringValue(
    row.texto_original,
    row.transcripcion,
    row.observaciones,
    row.tratamiento_recomendado,
    row.motivo_consulta,
  )
}

function mapValoracion(row: RawRow): ValoracionPaciente {
  return {
    id: stringValue(row.id),
    companyKey: stringValue(row.company_key) || COMPANY_KEY,
    usuarioId: stringValue(row.usuario_id),
    nombrePaciente: stringValue(row.nombre_paciente),
    telefonoPaciente: stringValue(row.telefono_paciente),
    fechaValoracion: stringValue(row.fecha_valoracion, row.created_at),
    motivoConsulta: stringValue(row.motivo_consulta),
    diagnostico: stringValue(row.diagnostico),
    tratamientoRecomendado: stringValue(row.tratamiento_recomendado),
    observaciones: stringValue(row.observaciones),
    textoOriginal: stringValue(row.texto_original),
    transcripcion: stringValue(row.transcripcion),
    extracto: extractSnippet(row),
    estadoVinculacion: normalizeEstadoVinculacion(row.estado_vinculacion),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at, row.created_at),
  }
}

async function listWithCompanyFilter() {
  const client = requireSupabase()
  return client
    .from(TABLE)
    .select('*')
    .eq('company_key', COMPANY_KEY)
    .in('estado_vinculacion', ['pendiente_vincular', 'vinculada_revision'])
    .order('created_at', { ascending: false })
}

async function listWithoutCompanyFilter() {
  const client = requireSupabase()
  return client
    .from(TABLE)
    .select('*')
    .in('estado_vinculacion', ['pendiente_vincular', 'vinculada_revision'])
    .order('created_at', { ascending: false })
}

export async function listPendingValoraciones(): Promise<ValoracionPaciente[]> {
  const firstAttempt = await listWithCompanyFilter()
  if (firstAttempt.error) {
    const shouldRetryWithoutCompany =
      firstAttempt.error.message.toLowerCase().includes('company_key') ||
      String(firstAttempt.error.code ?? '').includes('42703')

    if (!shouldRetryWithoutCompany) throw firstAttempt.error

    const fallbackAttempt = await listWithoutCompanyFilter()
    if (fallbackAttempt.error) throw fallbackAttempt.error
    return (fallbackAttempt.data ?? []).map((row) => mapValoracion(row as RawRow))
  }

  return (firstAttempt.data ?? []).map((row) => mapValoracion(row as RawRow))
}

export async function linkValoracionToLead(params: {
  valoracionId: string
  lead: CrmLead
}): Promise<void> {
  const client = requireSupabase()
  const { data: valoracion, error: readError } = await client
    .from(TABLE)
    .select('*')
    .eq('id', params.valoracionId)
    .single()

  if (readError) throw readError

  const { error } = await client
    .from(TABLE)
    .update({
      crm_lead_id: params.lead.id,
      estado_vinculacion: 'vinculada',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.valoracionId)

  if (error) throw error

  await upsertFichaClinica({ leadId: params.lead.id }, {
    motivoConsulta: stringValue(valoracion.motivo_consulta),
    diagnostico: stringValue(valoracion.diagnostico),
    tratamientoPropuesto: stringValue(valoracion.tratamiento_recomendado),
    piezasInvolucradas: stringValue(valoracion.piezas_involucradas),
    notasEvolucion: stringValue(valoracion.observaciones),
    archivosAdjuntos: [],
  })

  const caso = await upsertCasoComercial(params.lead.id, {
    costoCotizado: typeof valoracion.costo_cotizado === 'number' ? valoracion.costo_cotizado : null,
    promocionAplicada: stringValue(valoracion.promocion_aplicada),
    objeciones: stringValue(valoracion.objeciones),
    indicacionSeguimiento: '',
    proximaCitaSugerida: '',
    estado: valoracion.escalado_closer ? 'escalado_closer' : 'valorado',
    montoCerrado: null,
    cerradoPor: '',
  })

  await addEvento({
    casoComercialId: caso.casoComercialId,
    tipoEvento: 'valoracion vinculada manualmente',
    responsable: 'doctor',
  })
}
