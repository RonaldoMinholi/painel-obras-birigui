# Painel executivo — Secretaria de Obras

Piloto de acompanhamento de projetos municipais conectado ao Supabase e preparado para hospedagem na Vercel.

## Visualização local

Abra um servidor local nesta pasta e acesse:

- Painel: `/`
- Formulário: `/?modo=admin`
- Modo TV sem lista lateral: `/?tv=1`

Os dados fictícios ficam no Supabase. O painel tem leitura pública e recebe alterações em tempo real. O formulário exige um usuário cadastrado no Supabase Authentication.

## Modos de exibição

- **Automático:** destaca um projeto por vez e alterna no intervalo selecionado.
- **Visão geral:** mostra até seis projetos simultaneamente. Se houver mais de seis, alterna entre grupos.
- O intervalo pode ser definido em 10, 20 ou 30 segundos.
- O navegador memoriza o modo e o intervalo escolhidos, inclusive na televisão.

## Configuração

1. Executar o arquivo `supabase-schema.sql` em um projeto vazio.
2. Informar a URL e a chave pública do projeto no início de `app.js`.
3. Criar pelo menos um usuário em Authentication > Users.
4. Publicar os arquivos na Vercel.
