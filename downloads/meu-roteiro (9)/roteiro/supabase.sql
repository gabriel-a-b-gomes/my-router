-- Rode este script no Supabase: painel do projeto → SQL Editor → New query → Run.
-- Cria uma única tabela onde o app guarda todas as suas viagens (um documento JSON).

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Bloqueia qualquer acesso público. Só o servidor do app (com a chave secreta) consegue ler/gravar.
alter table public.app_state enable row level security;
