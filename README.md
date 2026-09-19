# Painel executivo — Prefeitura de Birigui

Piloto de acompanhamento de projetos municipais conectado ao Supabase e preparado para hospedagem na Vercel.

## Versão com usuários por secretaria

- 17 secretarias cadastradas.
- Administrador principal: `rominholi@yahoo.com`.
- Administrador visualiza todas as secretarias e cadastra usuários.
- Usuários comuns alteram somente projetos da própria secretaria.
- A seleção de atualização é feita primeiro pela secretaria e depois pelo projeto.
- O painel público da TV não exige login.

### Instalação desta atualização

1. No SQL Editor do Supabase, execute apenas `supabase-users-departments.sql`.
2. Na Vercel, abra **Settings > Environment Variables** e crie:
   - `SUPABASE_URL`: URL do projeto Supabase.
   - `SUPABASE_ANON_KEY`: chave pública/anon do Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave `service_role` do Supabase. Nunca coloque essa chave no `app.js`.
3. Envie todos os arquivos e a pasta `api` para o GitHub e faça o commit.
4. Aguarde o novo deployment da Vercel ficar `Ready`.

## Visualização local

Abra um servidor local nesta pasta e acesse:

- Painel: `/`
- Formulário: `/?modo=admin`
- Modo TV sem lista lateral: `/?tv=1`

Os dados fictícios ficam no Supabase. O painel tem leitura pública e recebe alterações em tempo real. O formulário exige um usuário cadastrado no Supabase Authentication.

A área administrativa permite cadastrar, editar e excluir projetos. Em instalações antigas, execute uma única vez o arquivo `supabase-crud-upgrade.sql` para autorizar essas operações sem recriar as tabelas.

## Modos de exibição

- **Automático:** destaca um projeto por vez e alterna no intervalo selecionado.
- **Visão geral:** mostra até seis projetos simultaneamente com situação, progresso, metas, prazo e valor executado. Se houver mais de seis, alterna entre grupos.
- O intervalo pode ser definido em 10, 20 ou 30 segundos.
- O navegador memoriza o modo e o intervalo escolhidos, inclusive na televisão.

## Configuração

1. Executar o arquivo `supabase-schema.sql` em um projeto vazio.
2. Informar a URL e a chave pública do projeto no início de `app.js`.
3. Criar pelo menos um usuário em Authentication > Users.
4. Publicar os arquivos na Vercel.
