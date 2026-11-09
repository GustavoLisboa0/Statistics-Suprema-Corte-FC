-- =========================================================
-- Migração 011: características dos jogadores (só admin)
-- Execute no SQL Editor do Supabase. É idempotente.
-- Lista de textos, ex.: ["canhoto", "marcador"]. Fica junto dos atributos
-- (tabela interna do admin), nunca em `jogadores`.
-- =========================================================
alter table atributos_jogador
    add column if not exists caracteristicas jsonb not null default '[]'::jsonb;
