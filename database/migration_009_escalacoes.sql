-- =========================================================
-- Migração 009: escalações (escalador automático 4-4-2)
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
--
-- Guarda a escalação salva de cada partida. `config` tem o que o admin
-- pediu (goleiro, duração, substituições, regras por jogador) e `resultado`
-- tem o que o escalador montou (titulares, banco, trocas, minutos).
-- Os dois são jsonb de propósito: assim dá para evoluir o escalador (outras
-- formações, táticas) sem nova migração.
-- Uma escalação por partida (índice único abaixo); salvar de novo atualiza.
-- =========================================================
create table if not exists escalacoes (
    id            uuid primary key default gen_random_uuid(),
    partida_id    uuid not null references partidas(id) on delete cascade,

    formacao      text not null default '4-4-2',
    config        jsonb not null default '{}'::jsonb,
    resultado     jsonb not null default '{}'::jsonb,

    criado_por    uuid,
    created_at    timestamptz not null default now()
);

create unique index if not exists idx_escalacoes_partida on escalacoes (partida_id);
