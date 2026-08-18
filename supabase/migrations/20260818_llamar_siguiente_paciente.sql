create or replace function public.llamar_siguiente_paciente(
  p_company_key text default 'especialidades-dentales'
)
returns setof public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  next_lead public.crm_leads%rowtype;
begin
  if exists (
    select 1
    from public.crm_leads
    where company_key = p_company_key
      and estado_consulta = 'en_consulta'
  ) then
    return;
  end if;

  with siguiente as (
    select id
    from public.crm_leads
    where company_key = p_company_key
      and estado_consulta = 'en_espera'
    order by llegada_kiosko_at asc nulls last
    for update skip locked
    limit 1
  )
  update public.crm_leads as lead
  set
    estado_consulta = 'en_consulta',
    consulta_inicio_at = now(),
    consulta_fin_at = null
  from siguiente
  where lead.id = siguiente.id
  returning lead.* into next_lead;

  if next_lead.id is null then
    return;
  end if;

  return next_lead;
end;
$$;

grant execute on function public.llamar_siguiente_paciente(text) to anon, authenticated;
