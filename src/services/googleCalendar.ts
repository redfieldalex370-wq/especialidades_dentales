import type { CalendarAppointment, CrmLead } from '../types'

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

export async function listCalendarAppointments(leads: CrmLead[], options?: { daysAhead?: number }): Promise<CalendarAppointment[]> {
  if (!isGoogleCalendarConfigured) return []

  const now = new Date()
  const daysAhead = options?.daysAhead ?? 30
  const end = new Date(now)
  end.setDate(end.getDate() + daysAhead)

  const params = new URLSearchParams({
    key: apiKey!,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: now.toISOString(),
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
    .map((item) => mapCalendarEvent(item, leads))
    .filter((item): item is CalendarAppointment => Boolean(item))
}

function mapCalendarEvent(item: GoogleCalendarEvent, leads: CrmLead[]): CalendarAppointment | null {
  const start = item.start?.dateTime ?? item.start?.date
  const end = item.end?.dateTime ?? item.end?.date ?? start
  const title = item.summary?.trim() ?? 'Cita'
  if (!start) return null
  if (!isAllowedDentalAppointment(title, item.description?.trim() ?? '')) return null

  const patientName = extractPatientName(title)
  const matchedLead = findMatchingLead(patientName, leads)

  return {
    id: item.id ?? crypto.randomUUID(),
    title,
    description: item.description?.trim() ?? '',
    start,
    end: end ?? start,
    status: item.status?.trim() ?? 'confirmed',
    location: item.location?.trim() ?? '',
    patientName,
    matchedLeadId: matchedLead?.id ?? '',
  }
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

function findMatchingLead(patientName: string, leads: CrmLead[]): CrmLead | null {
  const target = normalizeText(patientName)
  if (!target) return null

  return leads.find((lead) => {
    const leadName = normalizeText(lead.name)
    return leadName === target || leadName.includes(target) || target.includes(leadName)
  }) ?? null
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
