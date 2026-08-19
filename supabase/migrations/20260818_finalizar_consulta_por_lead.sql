create or replace function public.finalizar_consulta_por_lead(
  p_lead_id uuid
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
  target_lead public.crm_leads%rowtype;
  finalized_lead public.crm_leads%rowtype;
  next_lead public.crm_leads%rowtype;
begin
  select *
  into target_lead
  from public.crm_leads
  where id = p_lead_id
    and company_key = 'especialidades-dentales'
  for update;

  if not found then
    return;
  end if;

  if coalesce(target_lead.estado_consulta, '') <> 'en_consulta' then
    return query
    select
      null::uuid,
      null::text,
      null::uuid,
      null::text;
    return;
  end if;

  update public.crm_leads
  set
    estado_consulta = 'finalizada',
    consulta_fin_at = coalesce(consulta_fin_at, now())
  where id = target_lead.id
    and company_key = 'especialidades-dentales'
    and estado_consulta = 'en_consulta'
  returning * into finalized_lead;

  if not found then
    return query
    select
      null::uuid,
      null::text,
      null::uuid,
      null::text;
    return;
  end if;

  select * into next_lead
  from public.llamar_siguiente_paciente('especialidades-dentales')
  limit 1;

  return query
  select
    finalized_lead.id,
    finalized_lead.wa_id,
    next_lead.id,
    next_lead.wa_id;
end;
$$;

grant execute on function public.finalizar_consulta_por_lead(uuid) to anon, authenticated;
