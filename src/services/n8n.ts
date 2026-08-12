export const schedulerUrl = import.meta.env.VITE_N8N_SCHEDULER_URL?.trim() ?? ''

export function hasSchedulerUrl() {
  return schedulerUrl.length > 0
}

export async function sendToScheduler(payload: unknown) {
  if (!hasSchedulerUrl()) {
    throw new Error('Falta configurar VITE_N8N_SCHEDULER_URL en el archivo .env')
  }

  const response = await fetch(schedulerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`n8n respondió ${response.status}${text ? `: ${text}` : ''}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json') ? response.json() : response.text()
}
