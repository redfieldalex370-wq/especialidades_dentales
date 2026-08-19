create or replace function public.link_wa_cliente_calendar_lead(p_usuario_id uuid)
returns table (
  usuario_id uuid,
  whatsapp_phone text,
  subscriber_id text,
  nombre_paciente text,
  crm_lead_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone_key text;
  v_lead_id uuid;
begin
  select right(regexp_replace(coalesce(w.whatsapp_phone, ''), '\D', '', 'g'), 10)
    into v_phone_key
  from public.wa_clientes_estado w
  where w.usuario_id = p_usuario_id;

  if v_phone_key is null or length(v_phone_key) <> 10 then
    return query
    select w.usuario_id, w.whatsapp_phone, w.subscriber_id, w.nombre_paciente, w.crm_lead_id
    from public.wa_clientes_estado w
    where w.usuario_id = p_usuario_id;
    return;
  end if;

  select l.id
    into v_lead_id
  from public.crm_leads l
  where l.company_key = 'especialidades-dentales'
    and (
      right(regexp_replace(coalesce(l.wa_id, ''), '\D', '', 'g'), 10) = v_phone_key
      or right(regexp_replace(coalesce(l.whatsapp_phone, ''), '\D', '', 'g'), 10) = v_phone_key
    )
  order by l.updated_at desc nulls last
  limit 1;

  update public.wa_clientes_estado w
  set crm_lead_id = coalesce(v_lead_id, w.crm_lead_id),
      actualizado_en = now()
  where w.usuario_id = p_usuario_id;

  return query
  select w.usuario_id, w.whatsapp_phone, w.subscriber_id, w.nombre_paciente, w.crm_lead_id
  from public.wa_clientes_estado w
  where w.usuario_id = p_usuario_id;
end;
$$;

revoke all on function public.link_wa_cliente_calendar_lead(uuid) from public;
grant execute on function public.link_wa_cliente_calendar_lead(uuid) to anon, authenticated;
