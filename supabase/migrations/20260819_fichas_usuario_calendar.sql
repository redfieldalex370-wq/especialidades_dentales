-- Permite fichas clínicas de pacientes provenientes de Calendar sin crear crm_leads.
alter table public.ficha_clinica
  add column if not exists usuario_id uuid references public.wa_clientes_estado(usuario_id);

alter table public.ficha_clinica
  alter column lead_id drop not null;

create unique index if not exists ficha_clinica_usuario_id_uidx
  on public.ficha_clinica (usuario_id)
  where usuario_id is not null;

create unique index if not exists ficha_clinica_lead_id_uidx
  on public.ficha_clinica (lead_id)
  where lead_id is not null;
