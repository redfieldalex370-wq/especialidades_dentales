
-- Permite que el frontend público guarde fichas clínicas de esta clínica.
-- El acceso queda limitado por company_key y no crea oportunidades comerciales.

alter table public.ficha_clinica enable row level security;

drop policy if exists ficha_clinica_especialidades_select on public.ficha_clinica;
create policy ficha_clinica_especialidades_select
  on public.ficha_clinica for select
  to anon, authenticated
  using (company_key = 'especialidades-dentales');

drop policy if exists ficha_clinica_especialidades_insert on public.ficha_clinica;
create policy ficha_clinica_especialidades_insert
  on public.ficha_clinica for insert
  to anon, authenticated
  with check (company_key = 'especialidades-dentales');

drop policy if exists ficha_clinica_especialidades_update on public.ficha_clinica;
create policy ficha_clinica_especialidades_update
  on public.ficha_clinica for update
  to anon, authenticated
  using (company_key = 'especialidades-dentales')
  with check (company_key = 'especialidades-dentales');

grant select, insert, update on public.ficha_clinica to anon, authenticated;
