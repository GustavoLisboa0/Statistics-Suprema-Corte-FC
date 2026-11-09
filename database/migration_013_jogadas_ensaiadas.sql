-- =========================================================
-- Migração 013: jogadas ensaiadas
-- Execute no SQL Editor do Supabase. É idempotente.
--
-- Jogada combinada para um momento específico (escanteio, falta, saída de bola...).
-- Tem passos, com a posição de cada jogador e a bola em cada passo, e o que cada
-- posição faz. As táticas (tabela taticas) guardam quais jogadas fazem parte delas.
-- INTERNO do admin (papel 'editor'): só a API (service role) mexe aqui.
-- =========================================================
create table if not exists jogadas_ensaiadas (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null,
    descricao   text,
    situacao    text not null default 'outra',
    plano       jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);
alter table jogadas_ensaiadas enable row level security;
