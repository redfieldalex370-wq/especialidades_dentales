import { canonicalMxPhoneKey } from '../lib/phone'
import { requireSupabase } from '../lib/supabase'
import type { WaClienteEstado } from '../types'

const TABLE = 'wa_clientes_estado'

type RawRow = Record<string, unknown>

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }

  return ''
}

function mapWaClienteEstado(row: RawRow): WaClienteEstado {
  return {
    usuarioId: stringValue(row.usuario_id),
    whatsappPhone: stringValue(row.whatsapp_phone),
    subscriberId: stringValue(row.subscriber_id),
    nombrePaciente: stringValue(row.nombre_paciente),
    crmLeadId: stringValue(row.crm_lead_id),
  }
}

export async function listWaClientesEstado(): Promise<WaClienteEstado[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLE)
    .select('usuario_id, whatsapp_phone, subscriber_id, nombre_paciente, crm_lead_id')
    .order('nombre_paciente', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapWaClienteEstado(row as RawRow))
}

export async function getWaClienteEstadoByUsuarioId(usuarioId: string): Promise<WaClienteEstado | null> {
  if (!usuarioId) return null

  const client = requireSupabase()
  const { data, error } = await client
    .from(TABLE)
    .select('usuario_id, whatsapp_phone, subscriber_id, nombre_paciente, crm_lead_id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  if (error) throw error
  return data ? mapWaClienteEstado(data as RawRow) : null
}

export async function ensureWaClienteEstado(params: {
  patientName: string
  phone: string
}): Promise<WaClienteEstado | null> {
  const phoneKey = canonicalMxPhoneKey(params.phone)
  if (!phoneKey) return null

  const client = requireSupabase()
  const { data, error } = await client
    .rpc('ensure_wa_cliente_calendar', {
      p_nombre: params.patientName || 'Paciente Calendar',
      p_telefono: params.phone,
    })

  if (error) throw error
  const firstRow = Array.isArray(data) ? data[0] : null
  return firstRow ? mapWaClienteEstado(firstRow as RawRow) : null
}

/** Vincula un usuario de WhatsApp con un lead existente por teléfono canónico. */
export async function linkWaClienteEstadoToCrmLead(usuarioId: string): Promise<WaClienteEstado | null> {
  if (!usuarioId) return null

  const client = requireSupabase()
  const { data, error } = await client.rpc('link_wa_cliente_calendar_lead', {
    p_usuario_id: usuarioId,
  })

  if (error) throw error
  const firstRow = Array.isArray(data) ? data[0] : data
  return firstRow ? mapWaClienteEstado(firstRow as RawRow) : null
}
