type CalendarOperation = 'create' | 'update' | 'delete'

interface CalendarRequest {
  operation: CalendarOperation
  eventId?: string
  summary?: string
  description?: string
  start?: string
  end?: string
}

interface GoogleServiceAccount {
  client_email: string
  private_key: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lightgreen-reindeer-927529.hostingersite.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return response({ error: 'Método no permitido.' }, 405)
  }

  try {
    const input = await request.json() as CalendarRequest
    validateInput(input)

    const serviceAccount = readServiceAccount()
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')?.trim()
    if (!calendarId) throw new Error('Falta el secreto GOOGLE_CALENDAR_ID.')

    const token = await getGoogleAccessToken(serviceAccount)
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const url = input.operation === 'create'
      ? baseUrl
      : `${baseUrl}/${encodeURIComponent(input.eventId!)}`

    const method = input.operation === 'create' ? 'POST' : input.operation === 'update' ? 'PUT' : 'DELETE'
    const googleResponse = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(input.operation === 'delete' ? {} : { 'Content-Type': 'application/json' }),
      },
      body: input.operation === 'delete'
        ? undefined
        : JSON.stringify({
          summary: input.summary,
          description: input.description ?? '',
          start: { dateTime: input.start },
          end: { dateTime: input.end },
        }),
    })

    if (!googleResponse.ok) {
      const details = await googleResponse.text()
      console.error('Google Calendar error', googleResponse.status, details)
      return response({ error: 'Google Calendar rechazó la operación.' }, 502)
    }

    if (input.operation === 'delete') return response({ deleted: true })
    return response(await googleResponse.json())
  } catch (error) {
    console.error(error)
    return response({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 400)
  }
})

function validateInput(input: CalendarRequest) {
  if (!['create', 'update', 'delete'].includes(input.operation)) {
    throw new Error('Operación de Calendar inválida.')
  }

  if (input.operation !== 'create' && !input.eventId?.trim()) {
    throw new Error('Falta el identificador del evento de Calendar.')
  }

  if (input.operation !== 'delete') {
    if (!input.summary?.trim() || !input.start || !input.end) {
      throw new Error('Faltan los datos de la cita.')
    }
  }
}

function readServiceAccount(): GoogleServiceAccount {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('Falta el secreto GOOGLE_SERVICE_ACCOUNT_JSON.')

  const account = JSON.parse(raw) as Partial<GoogleServiceAccount>
  if (!account.client_email || !account.private_key) {
    throw new Error('La cuenta de servicio de Google no es válida.')
  }

  return account as GoogleServiceAccount
}

async function getGoogleAccessToken(account: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const assertion = await signJwt(account, {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenResponse.ok) {
    console.error('Google OAuth error', await tokenResponse.text())
    throw new Error('No se pudo autorizar la cuenta de servicio de Google.')
  }

  const token = await tokenResponse.json() as { access_token?: string }
  if (!token.access_token) throw new Error('Google no devolvió token de Calendar.')
  return token.access_token
}

async function signJwt(account: GoogleServiceAccount, payload: Record<string, unknown>): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${header}.${body}`
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return bytes.buffer
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders })
}
