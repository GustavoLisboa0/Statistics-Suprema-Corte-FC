-- =========================================================
-- Migração 007: lesões de jogador (autoatendimento, visível a todos)
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
--
-- Diferente de `punicoes`: aqui é o próprio jogador (ou um editor em nome
-- dele) que registra, e a visibilidade é o objetivo — o elenco inteiro vê a
-- tag de "machucado". "Ativa" também nunca é gravado: é sempre calculado na
-- hora por lesao_ativa() (backend/models.py).
-- =========================================================
create table if not exists lesoes (
    id            uuid primary key default gen_random_uuid(),
    jogador_id    uuid not null references jogadores(id) on delete cascade,

    motivo        text not null,
    tipo          text not null check (tipo in ('proximo_jogo', 'data')),

    -- Exatamente um dos dois é preenchido, de acordo com `tipo` — a API
    -- valida isso na criação.
    termina_em    date,
    -- Travada no momento do registro (a próxima partida "agendada" na hora);
    -- o próprio jogador não escolhe qual partida.
    partida_id    uuid references partidas(id) on delete set null,

    criado_em     timestamptz not null default now()
);

create index if not exists idx_lesoes_jogador on lesoes (jogador_id);
