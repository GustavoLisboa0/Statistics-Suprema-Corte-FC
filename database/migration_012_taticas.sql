-- =========================================================
-- Migração 012: táticas montadas pelo administrador
-- Execute no SQL Editor do Supabase. É idempotente.
--
-- Quadro tático: nome, formação, ajustes do time e, por lugar do campo, papel,
-- posição com e sem a bola e uma orientação em texto. É só orientação (PDF de
-- táticas); não interfere na escalação.
-- INTERNO do admin (papel 'editor'): só a API (service role) mexe aqui.
-- =========================================================
create table if not exists taticas (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null,
    descricao   text,
    plano       jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);
alter table taticas enable row level security;
