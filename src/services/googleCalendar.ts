import type { CalendarAppointment, CrmLead } from '../types'

const apiKey = import.meta.env.VITE_GOOGLE_API_KEY?.trim()
const calendarId = import.meta.env.VITE_GOOGLE_CALENDAR_ID?.trim()
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

export const isGoogleCalendarConfigured = Boolean(apiKey && calendarId)
export const isGoogleCalendarAuthConfigured = Boolean(calendarId && googleClientId)

type GoogleTokenCallback = (token: string) => void

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
            error_callback?: () => void
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

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

export async function listCalendarAppointments(leads: CrmLead[], options?: { daysAhead?: number }): Promise<CalendarAppointment[]> {
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
    source: 'google_calendar',
  }
}

export async function connectGoogleCalendar(): Promise<void> {
  await withCalendarToken()
}

export async function createCalendarAppointment(input: CalendarAppointmentInput): Promise<CalendarAppointment> {
  const token = await withCalendarToken()
  const title = buildAppointmentTitle(input.appointmentType, input.lead.name)
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      summary: title,
      description: input.notes?.trim() || '',
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    }),
  })

  if (!response.ok) {
    throw new Error('No pudimos crear la cita en Google Calendar.')
  }

  const payload = (await response.json()) as GoogleCalendarEvent
  return mapCalendarEvent(payload, [input.lead]) ?? fallbackCalendarAppointment(payload, input.lead)
}

export async function updateCalendarAppointment(eventId: string, input: CalendarAppointmentInput): Promise<CalendarAppointment> {
  const token = await withCalendarToken()
  const title = buildAppointmentTitle(input.appointmentType, input.lead.name)
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      summary: title,
      description: input.notes?.trim() || '',
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    }),
  })

  if (!response.ok) {
    throw new Error('No pudimos actualizar la cita en Google Calendar.')
  }

  const payload = (await response.json()) as GoogleCalendarEvent
  return mapCalendarEvent(payload, [input.lead]) ?? fallbackCalendarAppointment(payload, input.lead)
}

export async function deleteCalendarAppointment(eventId: string): Promise<void> {
  const token = await withCalendarToken()
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error('No pudimos eliminar la cita en Google Calendar.')
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
    matchedLeadId: lead.id,
    source: 'google_calendar',
  }
}

function buildAppointmentTitle(type: 'valoracion' | 'limpieza', patientName: string) {
  return `${type === 'limpieza' ? 'Limpieza dental' : 'Valoración dental'} - ${patientName}`
}

async function withCalendarToken(): Promise<string> {
  if (!isGoogleCalendarAuthConfigured) {
    throw new Error('Falta configurar Google Calendar en esta página.')
  }

  const existingToken = sessionStorage.getItem('gc_access_token')
  if (existingToken) return existingToken

  await ensureGoogleIdentityScript()
  return new Promise<string>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2
    if (!oauth2) {
      reject(new Error('No pudimos abrir la conexión con Google.'))
      return
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: googleClientId!,
      scope: 'https://www.googleapis.com/auth/calendar',
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('Google no devolvió acceso al calendario.'))
          return
        }

        sessionStorage.setItem('gc_access_token', response.access_token)
        resolve(response.access_token)
      },
      error_callback: () => {
        reject(new Error('No se pudo completar el acceso con Google.'))
      },
    })

    tokenClient.requestAccessToken({ prompt: existingToken ? '' : 'consent' })
  })
}

async function ensureGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return

  const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi="true"]')
  if (existing) {
    await waitForGoogleIdentity()
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGsi = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No pudimos cargar Google Identity.'))
    document.head.appendChild(script)
  })

  await waitForGoogleIdentity()
}

async function waitForGoogleIdentity(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.google?.accounts?.oauth2) return
    await new Promise((resolve) => window.setTimeout(resolve, 150))
  }

  throw new Error('Google Identity tardó demasiado en responder.')
}
