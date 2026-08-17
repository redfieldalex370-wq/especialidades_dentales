import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { type CrmCompanyKey, DEFAULT_CRM_COMPANY_KEY, CRM_TABLES } from './crm'

export interface SupabaseConnectionState {
  configured: boolean
  companyKey: string
  tables: typeof CRM_TABLES
}

export function getSupabaseConnectionState(): SupabaseConnectionState {
  return {
    configured: isSupabaseConfigured,
    companyKey: DEFAULT_CRM_COMPANY_KEY,
    tables: CRM_TABLES,
  }
}

export interface TableCheck {
  table: string
  ok: boolean
  message: string
}

export interface SupabaseConnectionReport {
  companyKey: string
  checks: TableCheck[]
}

/**
 * Verifica acceso a las tres tablas reales sin descargar registros.
 * Una tabla protegida por RLS puede fallar aunque la conexión general sea válida;
 * el reporte lo muestra por separado para no ocultar el motivo.
 */
export async function testSupabaseConnection(companyKey: CrmCompanyKey = DEFAULT_CRM_COMPANY_KEY): Promise<SupabaseConnectionReport> {
  if (!isSupabaseConfigured) {
    throw new Error('Faltan la URL o la publishable key de Supabase en .env.')
  }

  const client = requireSupabase()
  const tables = Object.values(CRM_TABLES)

  const checks = await Promise.all(
    tables.map(async (table): Promise<TableCheck> => {
      const { error } = await client
        .from(table)
        .select('*', { head: true, count: 'exact' })
        .eq('company_key', companyKey)

      return error
        ? { table, ok: false, message: error.message }
        : { table, ok: true, message: 'Acceso confirmado' }
    }),
  )

  return {
    companyKey,
    checks,
  }
}
