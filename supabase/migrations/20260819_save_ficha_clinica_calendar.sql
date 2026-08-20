create or replace function public.save_ficha_clinica_calendar(
  p_usuario_id uuid,
  p_motivo_consulta text default null,
  p_diagnostico text default null,
  p_tratamiento_propuesto text default null,
  p_piezas_involucradas text default null,
  p_notas_evolucion text default null,
  p_archivos_adjuntos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ficha_clinica;
begin
  if p_usuario_id is null
     or not exists (
       select 1 from public.wa_clientes_estado
       where usuario_id = p_usuario_id
     ) then
    raise exception 'No encontramos el usuario de Calendar.';
  end if;

  insert into public.ficha_clinica (
    usuario_id, lead_id, company_key, wa_id,
    motivo_consulta, diagnostico, tratamiento_propuesto,
    piezas_involucradas, notas_evolucion, archivos_adjuntos,
    updated_at
  )
  select
    p_usuario_id,
    w.crm_lead_id,
    'especialidades-dentales',
    w.whatsapp_phone,
    nullif(trim(p_motivo_consulta), ''),
    nullif(trim(p_diagnostico), ''),
    nullif(trim(p_tratamiento_propuesto), ''),
    nullif(trim(p_piezas_involucradas), ''),
    nullif(trim(p_notas_evolucion), ''),
    coalesce(p_archivos_adjuntos, '[]'::jsonb),
    now()
  from public.wa_clientes_estado w
  where w.usuario_id = p_usuario_id
  on conflict (usuario_id) do update set
    lead_id = coalesce(public.ficha_clinica.lead_id, excluded.lead_id),
    wa_id = coalesce(public.ficha_clinica.wa_id, excluded.wa_id),
    motivo_consulta = coalesce(excluded.motivo_consulta, public.ficha_clinica.motivo_consulta),
    diagnostico = coalesce(excluded.diagnostico, public.ficha_clinica.diagnostico),
    tratamiento_propuesto = coalesce(excluded.tratamiento_propuesto, public.ficha_clinica.tratamiento_propuesto),
    piezas_involucradas = coalesce(excluded.piezas_involucradas, public.ficha_clinica.piezas_involucradas),
    notas_evolucion = coalesce(excluded.notas_evolucion, public.ficha_clinica.notas_evolucion),
    archivos_adjuntos = excluded.archivos_adjuntos,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_ficha_clinica_calendar(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.save_ficha_clinica_calendar(uuid, text, text, text, text, text, jsonb) to anon, authenticated;
