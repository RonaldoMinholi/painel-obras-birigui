-- Execute este arquivo uma única vez no SQL Editor do projeto já existente.
-- Ele não recria tabelas e não altera nem apaga os projetos cadastrados.

drop policy if exists "Usuários autenticados cadastram projetos" on public.projects;
create policy "Usuários autenticados cadastram projetos"
on public.projects for insert
to authenticated
with check (true);

drop policy if exists "Usuários autenticados excluem projetos" on public.projects;
create policy "Usuários autenticados excluem projetos"
on public.projects for delete
to authenticated
using (true);

grant insert, update, delete on public.projects to authenticated;
grant usage, select on all sequences in schema public to authenticated;
