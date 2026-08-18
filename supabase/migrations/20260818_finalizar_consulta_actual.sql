create or replace function public.finalizar_consulta_actual(
  p_company_key text default 'especialidades-dentales'
)
returns table (
  finalized_id uuid,
  finalized_wa_id text,
  called_next_id uuid,
  called_next_wa_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lead public.crm_leads%rowtype;
  next_lead public.crm_leads%rowtype;
begin
  with actual as (
    select id
    from public.crm_leads
    where company_key = p_company_key
      and estado_consulta = 'en_consulta'
    order by consulta_inicio_at asc nulls first, llegada_kiosko_at asc nulls first
    for update skip locked
    limit 1
  )
  update public.crm_leads as lead
  set
    estado_consulta = 'finalizada',
    consulta_fin_at = coalesce(lead.consulta_fin_at, now())
  from actual
  where lead.id = actual.id
  returning lead.* into current_lead;

  select * into next_lead
  from public.llamar_siguiente_paciente(p_company_key)
  limit 1;

  return query
  select
    current_lead.id,
    current_lead.wa_id,
    next_lead.id,
    next_lead.wa_id;
end;
$$;

grant execute on function public.finalizar_consulta_actual(text) to anon, authenticated;
