create extension if not exists pgcrypto;

alter table public.crm_leads
  add column if not exists origen_lead text
  check (
    origen_lead in (
      'campana_meta',
      'campana_google',
      'organico_whatsapp',
      'recomendado_agendado_doctor',
      'walkin_sin_cita'
    )
  );

create table if not exists public.ficha_clinica (
  ficha_clinica_id uuid primary key default gen_random_uuid(),
  wa_id text not null references public.crm_leads(wa_id),
  motivo_consulta text,
  diagnostico text,
  tratamiento_propuesto text,
  piezas_involucradas text,
  notas_evolucion text,
  archivos_adjuntos jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ficha_clinica_wa_id_uidx
  on public.ficha_clinica (wa_id);

create table if not exists public.caso_comercial (
  caso_comercial_id uuid primary key default gen_random_uuid(),
  wa_id text not null references public.crm_leads(wa_id),
  costo_cotizado numeric,
  promocion_aplicada text,
  objeciones text,
  indicacion_seguimiento text,
  proxima_cita_sugerida timestamptz,
  estado text check (estado in ('valorado','en_seguimiento','escalado_closer','agendado','abono_recibido','perdido')) default 'valorado',
  monto_cerrado numeric,
  cerrado_por text check (cerrado_por in ('doctor','closer_greenchimp','automatico')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists caso_comercial_wa_id_uidx
  on public.caso_comercial (wa_id);

create table if not exists public.trazabilidad (
  evento_id uuid primary key default gen_random_uuid(),
  caso_comercial_id uuid not null references public.caso_comercial(caso_comercial_id),
  "timestamp" timestamptz default now(),
  tipo_evento text not null,
  responsable text check (responsable in ('bot','doctor','closer','sistema'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ficha_clinica_set_updated_at on public.ficha_clinica;
create trigger ficha_clinica_set_updated_at
before update on public.ficha_clinica
for each row execute function public.set_updated_at();

drop trigger if exists caso_comercial_set_updated_at on public.caso_comercial;
create trigger caso_comercial_set_updated_at
before update on public.caso_comercial
for each row execute function public.set_updated_at();
