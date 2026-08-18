alter table public.caso_trazabilidad
  add column if not exists lead_id uuid,
  add column if not exists company_key text,
  add column if not exists wa_id text;
