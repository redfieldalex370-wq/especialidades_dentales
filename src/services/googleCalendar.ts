import type { CalendarAppointment, CrmLead, WaClienteEstado } from '../types'
import { canonicalMxPhoneKey, phonesMatchMx } from '../lib/phone'
import { requireSupabase } from '../lib/supabase'

const apiKey = import.meta.env.VITE_GOOGLE_API_KEY?.trim()
const calendarId = import.meta.env.VITE_GOOGLE_CALENDAR_ID?.trim()

export const isGoogleCalendarConfigured = Boolean(apiKey && calendarId)

interface GoogleCalendarEventDate {
  date?: string
  dateTime?: string
}

interface GoogleCalendarEvent {
  id?: string
  summary?: string
  description?: string
  status?: string
  location?: string
  start?: GoogleCalendarEventDate
  end?: GoogleCalendarEventDate
}

interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[]
}

interface CalendarAppointmentInput {
  lead: CrmLead
  start: string
  end: string
  appointmentType: 'valoracion' | 'limpieza'
  notes?: string
}

interface CalendarIdentifiers {
  phone: string
  subscriberId: string
  waId: string
  crmLeadId: string
}

type MatchResult = {
  usuario: WaClienteEstado | null
  lead: CrmLead | null
  matchMethod: CalendarAppointment['matchMethod']
  patientPhone: string
}

export async function listCalendarAppointments(
  leads: CrmLead[],
  usuarios: WaClienteEstado[],
  options?: { daysAhead?: number },
): Promise<CalendarAppointment[]> {
  if (!isGoogleCalendarConfigured) return []

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const daysAhead = options?.daysAhead ?? 30
  const end = new Date(now)
  end.setDate(end.getDate() + daysAhead)

  const params = new URLSearchParams({
    key: apiKey!,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: startOfToday.toISOString(),
    timeMax: end.toISOString(),
    maxResults: '100',
  })

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('No pudimos leer Google Calendar.')
  }

  const payload = (await response.json()) as GoogleCalendarResponse
  return (payload.items ?? [])
    .map((item) => mapCalendarEvent(item, leads, usuarios))
    .filter((item): item is CalendarAppointment => Boolean(item))
}

function mapCalendarEvent(item: GoogleCalendarEvent, leads: CrmLead[], usuarios: WaClienteEstado[]): CalendarAppointment | null {
  const start = item.start?.dateTime ?? item.start?.date
  const end = item.end?.dateTime ?? item.end?.date ?? start
  const title = item.summary?.trim() ?? 'Cita'
  if (!start) return null
  if (!isAllowedDentalAppointment(title, item.description?.trim() ?? '')) return null

  const patientName = extractPatientName(title)
  const match = findMatchingLead({
    patientName,
    title,
    description: item.description?.trim() ?? '',
    leads,
    usuarios,
  })

  return {
    id: item.id ?? crypto.randomUUID(),
    title,
    description: item.description?.trim() ?? '',
    start,
    end: end ?? start,
    status: item.status?.trim() ?? 'confirmed',
    location: item.location?.trim() ?? '',
    patientName,
    patientPhone: match.patientPhone,
    matchedUsuarioId: match.usuario?.usuarioId ?? '',
    matchedLeadId: match.lead?.id ?? '',
    matchMethod: match.matchMethod,
    source: 'google_calendar',
  }
}

export async function connectGoogleCalendar(): Promise<void> {
  // Las operaciones de escritura se autorizan con la cuenta de servicio en Supabase.
}

export async function createCalendarAppointment(input: CalendarAppointmentInput): Promise<CalendarAppointment> {
  const title = buildAppointmentTitle(input.appointmentType, input.lead.name)
  const description = buildCalendarDescription(input.lead, input.notes)
  const payload = await invokeCalendarWriter({
    operation: 'create',
    summary: title,
    description,
    start: input.start,
    end: input.end,
  })

  return mapCalendarEvent(payload, [input.lead], []) ?? fallbackCalendarAppointment(payload, input.lead)
}

export async function updateCalendarAppointment(eventId: string, input: CalendarAppointmentInput): Promise<CalendarAppointment> {
  const title = buildAppointmentTitle(input.appointmentType, input.lead.name)
  const description = buildCalendarDescription(input.lead, input.notes)
  const payload = await invokeCalendarWriter({
    operation: 'update',
    eventId,
    summary: title,
    description,
    start: input.start,
    end: input.end,
  })

  return mapCalendarEvent(payload, [input.lead], []) ?? fallbackCalendarAppointment(payload, input.lead)
}

export async function deleteCalendarAppointment(eventId: string): Promise<void> {
  await invokeCalendarWriter({
    operation: 'delete',
    eventId,
  })
}

function extractPatientName(title: string): string {
  const cleaned = title
    .replace(/valoraci[oó]n dental\s*-\s*/i, '')
    .replace(/cita dental\s*-\s*/i, '')
    .replace(/valoraci[oó]n\s*-\s*/i, '')
    .trim()

  return cleaned || title
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatchingLead({
  patientName,
  title,
  description,
  leads,
  usuarios,
}: {
  patientName: string
  title: string
  description: string
  leads: CrmLead[]
  usuarios: WaClienteEstado[]
}): MatchResult {
  const identifiers = extractCalendarIdentifiers(description, title)

  if (identifiers.phone) {
    const matchedUsuarioByPhone = usuarios.find((usuario) =>
      phonesMatchMx(usuario.whatsappPhone, identifiers.phone) ||
      phonesMatchMx(usuario.subscriberId, identifiers.phone),
    ) ?? null
    if (matchedUsuarioByPhone) {
      return {
        usuario: matchedUsuarioByPhone,
        lead: resolveLeadForUsuario(matchedUsuarioByPhone, leads),
        matchMethod: 'phone',
        patientPhone: identifiers.phone,
      }
    }
  }

  if (identifiers.waId) {
    const matchedUsuarioByWaId = usuarios.find((usuario) =>
      phonesMatchMx(usuario.whatsappPhone, identifiers.waId) ||
      normalizeIdentifier(usuario.subscriberId) === identifiers.waId,
    ) ?? null
    if (matchedUsuarioByWaId) {
      return {
        usuario: matchedUsuarioByWaId,
        lead: resolveLeadForUsuario(matchedUsuarioByWaId, leads),
        matchMethod: 'wa_id',
        patientPhone: identifiers.phone || canonicalMxPhoneKey(identifiers.waId),
      }
    }
  }

  if (identifiers.subscriberId) {
    const matchedUsuarioBySubscriber = usuarios.find((usuario) =>
      normalizeIdentifier(usuario.subscriberId) === identifiers.subscriberId ||
      canonicalMxPhoneKey(usuario.whatsappPhone) === canonicalMxPhoneKey(identifiers.subscriberId),
    ) ?? null
    if (matchedUsuarioBySubscriber) {
      return {
        usuario: matchedUsuarioBySubscriber,
        lead: resolveLeadForUsuario(matchedUsuarioBySubscriber, leads),
        matchMethod: 'subscriber_id',
        patientPhone: identifiers.phone || canonicalMxPhoneKey(matchedUsuarioBySubscriber.whatsappPhone),
      }
    }
  }

  if (identifiers.crmLeadId) {
    const matchedByLeadId = leads.find((lead) => normalizeIdentifier(lead.id) === identifiers.crmLeadId) ?? null
    if (matchedByLeadId) {
      const usuario = usuarios.find((item) => item.crmLeadId === matchedByLeadId.id) ?? null
      return {
        usuario,
        lead: matchedByLeadId,
        matchMethod: 'crm_lead_id',
        patientPhone: identifiers.phone || canonicalMxPhoneKey(matchedByLeadId.phone || matchedByLeadId.waId),
      }
    }
  }

  const target = normalizeText(patientName)
  if (!target) return { usuario: null, lead: null, matchMethod: 'none', patientPhone: identifiers.phone }

  const exactUserMatches = usuarios.filter((usuario) => normalizeText(usuario.nombrePaciente) === target)
  if (exactUserMatches.length === 1) {
    return {
      usuario: exactUserMatches[0],
      lead: resolveLeadForUsuario(exactUserMatches[0], leads),
      matchMethod: 'name',
      patientPhone: identifiers.phone || canonicalMxPhoneKey(exactUserMatches[0].whatsappPhone),
    }
  }

  const exactMatches = leads.filter((lead) => normalizeText(lead.name) === target)
  if (exactMatches.length === 1) {
    const usuario = usuarios.find((item) => item.crmLeadId === exactMatches[0].id) ?? null
    return {
      usuario,
      lead: exactMatches[0],
      matchMethod: 'name',
      patientPhone: identifiers.phone || canonicalMxPhoneKey(exactMatches[0].phone || exactMatches[0].waId),
    }
  }

  return { usuario: null, lead: null, matchMethod: 'none', patientPhone: identifiers.phone }
}

function extractCalendarIdentifiers(primaryText: string, fallbackText: string): CalendarIdentifiers {
  const source = `${primaryText}\n${fallbackText}`.trim()
  const phone = extractByPatterns(source, [
    /(?:el\s+telefono\s+del\s+paciente|telefono|tel[eé]fono|whatsapp)\s*:\s*([+\d][\d\s\-()]+)/i,
  ])
  const subscriberId = extractByPatterns(source, [
    /(?:manychat\s*id|subscriber\s*id|subscriber_id)\s*:\s*([a-z0-9_-]+)/i,
  ])
  const waId = extractByPatterns(source, [
    /(?:wa\s*id|wa_id)\s*:\s*([a-z0-9+_-]+)/i,
  ])
  const crmLeadId = extractByPatterns(source, [
    /(?:crm\s*lead\s*id|lead\s*id)\s*:\s*([0-9a-f-]{36})/i,
  ])

  return {
    phone: canonicalMxPhoneKey(phone),
    subscriberId: normalizeIdentifier(subscriberId),
    waId: normalizeIdentifier(waId),
    crmLeadId: normalizeIdentifier(crmLeadId),
  }
}

function extractByPatterns(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

function isAllowedDentalAppointment(title: string, description: string): boolean {
  const haystack = normalizeText(`${title} ${description}`)

  const allowedKeywords = ['valoracion', 'limpieza']
  const blockedKeywords = [
    'bloqueado',
    'bloqueo',
    'calendario bloqueado',
    'no disponible',
    'ocupado',
    'vacaciones',
    'descanso',
    'comida',
    'junta',
    'reunion',
  ]

  const hasAllowedKeyword = allowedKeywords.some((keyword) => haystack.includes(keyword))
  const hasBlockedKeyword = blockedKeywords.some((keyword) => haystack.includes(keyword))

  return hasAllowedKeyword && !hasBlockedKeyword
}

function fallbackCalendarAppointment(item: GoogleCalendarEvent, lead: CrmLead): CalendarAppointment {
  const start = item.start?.dateTime ?? item.start?.date ?? new Date().toISOString()
  const end = item.end?.dateTime ?? item.end?.date ?? start

  return {
    id: item.id ?? crypto.randomUUID(),
    title: item.summary?.trim() ?? buildAppointmentTitle('valoracion', lead.name),
    description: item.description?.trim() ?? '',
    start,
    end,
    status: item.status?.trim() ?? 'confirmed',
    location: item.location?.trim() ?? '',
    patientName: lead.name,
    patientPhone: canonicalMxPhoneKey(lead.phone || lead.waId),
    matchedUsuarioId: '',
    matchedLeadId: lead.id,
    matchMethod: 'crm_lead_id',
    source: 'google_calendar',
  }
}

function resolveLeadForUsuario(usuario: WaClienteEstado, leads: CrmLead[]): CrmLead | null {
  if (usuario.crmLeadId) {
    const byLeadId = leads.find((lead) => lead.id === usuario.crmLeadId) ?? null
    if (byLeadId) return byLeadId
  }

  return leads.find((lead) =>
    phonesMatchMx(lead.phone, usuario.whatsappPhone) ||
    phonesMatchMx(lead.waId, usuario.whatsappPhone) ||
    normalizeIdentifier(lead.subscriberId) === normalizeIdentifier(usuario.subscriberId),
  ) ?? null
}

function buildAppointmentTitle(type: 'valoracion' | 'limpieza', patientName: string) {
  return `${type === 'limpieza' ? 'Limpieza dental' : 'Valoración dental'} - ${patientName}`
}

export function buildCalendarDescription(lead: CrmLead, notes?: string) {
  const stableLines = [
    `CRM Lead ID: ${lead.id}`,
    `El teléfono del paciente: ${lead.phone || ''}`,
    `WA ID: ${lead.waId || ''}`,
    `ManyChat ID: ${lead.subscriberId || ''}`,
  ].filter((line) => !line.endsWith(': '))

  const cleanedNotes = (notes ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeText(line)
      return !(
        normalized.startsWith('crm lead id') ||
        normalized.startsWith('el telefono del paciente') ||
        normalized.startsWith('telefono') ||
        normalized.startsWith('whatsapp') ||
        normalized.startsWith('wa id') ||
        normalized.startsWith('manychat id') ||
        normalized.startsWith('subscriber id') ||
        normalized.startsWith('subscriber id')
      )
    })

  return [...stableLines, ...cleanedNotes].join('\n')
}

async function invokeCalendarWriter(input: {
  operation: 'create' | 'update' | 'delete'
  eventId?: string
  summary?: string
  description?: string
  start?: string
  end?: string
}): Promise<GoogleCalendarEvent> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('google-calendar', {
    body: input,
  })

  if (error) {
    throw new Error(`No pudimos guardar la cita en Google Calendar: ${error.message}`)
  }

  return data as GoogleCalendarEvent
}
