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
begin
  select *
  into current_lead
  from public.crm_leads
  where company_key = p_company_key
    and estado_consulta = 'en_consulta'
  order by consulta_inicio_at asc nulls first, llegada_kiosko_at asc nulls first
  for update skip locked
  limit 1;

  if not found then
    return query
    select
      null::uuid,
      null::text,
      null::uuid,
      null::text;
    return;
  end if;

  return query
  select *
  from public.finalizar_consulta_por_lead(current_lead.id);
end;
$$;

grant execute on function public.finalizar_consulta_actual(text) to anon, authenticated;
