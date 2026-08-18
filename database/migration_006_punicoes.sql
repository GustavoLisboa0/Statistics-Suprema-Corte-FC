-- =========================================================
-- Migração 006: punições de jogador (admin-only)
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
--
-- Tabela nova, sem tocar em jogadores/partidas. Vale a pena registrar
-- histórico (punições passadas), não só o estado atual — por isso é uma
-- tabela própria em vez de um campo solto em `jogadores`.
--
-- "Ativa" nunca é gravado: é sempre calculado na hora (ver punicao_ativa()
-- em backend/models.py), a partir de `termina_em` (tipo 'dias') ou de
-- `jogos_cumpridos` vs `jogos_totais` (tipo 'jogos'). Isso também é o que
-- deixa o admin "reverter" um desconto automático de jogo: basta editar
-- `jogos_cumpridos` pra trás.
-- =========================================================
create table if not exists punicoes (
    id                uuid primary key default gen_random_uuid(),
    jogador_id        uuid not null references jogadores(id) on delete cascade,

    motivo            text not null,
    tipo              text not null check (tipo in ('dias', 'jogos')),

    -- Exatamente um dos dois é preenchido, de acordo com `tipo` — a API
    -- valida isso na criação; o banco não força com um check (evita reject
    -- estranho em edição parcial via PATCH).
    termina_em        date,
    jogos_totais      integer,
    jogos_cumpridos   integer not null default 0,

    criado_por        uuid,
    criado_em         timestamptz not null default now()
);

create index if not exists idx_punicoes_jogador on punicoes (jogador_id);
