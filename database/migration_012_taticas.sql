-- =========================================================
-- Migração 012: táticas montadas pelo administrador
-- Execute no SQL Editor do Supabase. É idempotente.
--
-- Cada tática tem um nome e instruções por posição e situação, por exemplo:
-- {"LAT": {"ataque": "sobe", "defesa": "recua"}, "VOL": {"defesa": "recua"}}
-- INTERNO do admin (papel 'editor'): só a API (service role) mexe aqui.
-- =========================================================
create table if not exists taticas (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null,
    descricao   text,
    instrucoes  jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);
alter table taticas enable row level security;
