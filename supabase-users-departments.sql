-- Execute uma única vez no SQL Editor do Supabase antes de publicar esta versão.
-- Não apaga projetos existentes.

create table if not exists public.departments (
  name text primary key
);

insert into public.departments (name) values
  ('Secretaria da Casa Civil'),
  ('Secretaria de Administração'),
  ('Secretaria de Assistência Social'),
  ('Secretaria de Cultura e Turismo'),
  ('Secretaria de Desenvolvimento Econômico'),
  ('Secretaria de Educação'),
  ('Secretaria de Esportes'),
  ('Secretaria de Governo'),
  ('Secretaria de Meio Ambiente'),
  ('Secretaria de Mobilidade Urbana'),
  ('Secretaria de Negócios Jurídicos'),
  ('Secretaria de Obras'),
  ('Secretaria de Planejamento e Finanças'),
  ('Secretaria de Saúde'),
  ('Secretaria de Segurança Pública'),
  ('Secretaria de Serviços Públicos'),
  ('Secretaria de Tributação e Fiscalização')
on conflict (name) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  department text references public.departments(name),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, department, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'department', ''),
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end
  )
  on conflict (id) do update set
    department = excluded.department,
    role = excluded.role;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, department, role)
select id, 'Secretaria de Obras', 'admin'
from auth.users
where lower(email) = 'rominholi@yahoo.com'
on conflict (id) do update set role = 'admin', department = 'Secretaria de Obras';

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.current_user_department()
returns text language sql stable security definer set search_path = public
as $$ select department from public.profiles where id = auth.uid() $$;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Leitura das secretarias" on public.departments;
create policy "Leitura das secretarias" on public.departments for select to authenticated using (true);

drop policy if exists "Usuário consulta o próprio perfil" on public.profiles;
create policy "Usuário consulta o próprio perfil" on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Usuários autenticados atualizam projetos" on public.projects;
drop policy if exists "Usuários autenticados cadastram projetos" on public.projects;
drop policy if exists "Usuários autenticados excluem projetos" on public.projects;

create policy "Secretaria atualiza seus projetos" on public.projects for update to authenticated
using (public.current_user_role() = 'admin' or department = public.current_user_department())
with check (public.current_user_role() = 'admin' or department = public.current_user_department());

create policy "Secretaria cadastra seus projetos" on public.projects for insert to authenticated
with check (public.current_user_role() = 'admin' or department = public.current_user_department());

create policy "Secretaria exclui seus projetos" on public.projects for delete to authenticated
using (public.current_user_role() = 'admin' or department = public.current_user_department());

drop policy if exists "Usuários autenticados registram histórico" on public.project_updates;
create policy "Secretaria registra histórico" on public.project_updates for insert to authenticated
with check (exists (
  select 1 from public.projects p
  where p.id = project_id
    and (public.current_user_role() = 'admin' or p.department = public.current_user_department())
));

grant select on public.departments, public.profiles to authenticated;
grant insert, update, delete on public.projects to authenticated;
grant insert on public.project_updates to authenticated;
