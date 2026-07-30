-- =========================================================
-- Schema: Statistics Suprema Corte FC
-- Execute este script no SQL Editor do seu projeto Supabase
-- =========================================================

-- Extensão necessária para gerar UUIDs
create extension if not exists "pgcrypto";

-- =========================================================
-- Tabela: jogadores
-- =========================================================
create table if not exists jogadores (
    id              uuid primary key default gen_random_uuid(),
    nome            text not null,
    apelido         text,
    posicao         text not null check (posicao in ('goleiro', 'zagueiro', 'lateral', 'meio', 'atacante')),
    numero_camisa   integer,
    data_nascimento date,
    ativo           boolean not null default true,
    created_at      timestamptz not null default now()
);

-- =========================================================
-- Tabela: partidas
-- =========================================================
create table if not exists partidas (
    id                      uuid primary key default gen_random_uuid(),
    data                    date not null,
    adversario              text not null,
    local                   text not null check (local in ('casa', 'fora')),
    status                  text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
    placar_suprema          integer not null default 0,
    placar_adversario       integer not null default 0,
    campeonato_ou_amistoso  text,
    observacoes             text,
    created_at              timestamptz not null default now()
);

-- =========================================================
-- Tabela: estatisticas_partida
-- Uma linha por jogador por partida
-- =========================================================
create table if not exists estatisticas_partida (
    id                  uuid primary key default gen_random_uuid(),
    jogador_id          uuid not null references jogadores(id) on delete cascade,
    partida_id          uuid not null references partidas(id) on delete cascade,

    gols                integer not null default 0,
    assistencias        integer not null default 0,
    cartoes_amarelos    integer not null default 0,
    cartoes_vermelhos   integer not null default 0,
    minutos_jogados     integer not null default 0,
    titular             boolean not null default false,

    -- Campos específicos de goleiro (ficam nulos para os demais jogadores)
    defesas             integer,
    gols_sofridos       integer,

    created_at          timestamptz not null default now(),

    -- Um jogador só pode ter uma linha de estatística por partida
    unique (jogador_id, partida_id)
);

-- Índices para acelerar consultas de dashboard
create index if not exists idx_estatisticas_jogador on estatisticas_partida (jogador_id);
create index if not exists idx_estatisticas_partida on estatisticas_partida (partida_id);

-- =========================================================
-- Views auxiliares para o dashboard
-- =========================================================

-- Ranking de artilheiros
create or replace view vw_artilheiros as
select
    j.id as jogador_id,
    j.nome,
    j.apelido,
    coalesce(sum(e.gols), 0) as total_gols,
    coalesce(sum(e.assistencias), 0) as total_assistencias
from jogadores j
left join estatisticas_partida e on e.jogador_id = j.id
group by j.id, j.nome, j.apelido
order by total_gols desc;

-- Ranking de cartões
create or replace view vw_cartoes as
select
    j.id as jogador_id,
    j.nome,
    j.apelido,
    coalesce(sum(e.cartoes_amarelos), 0) as total_amarelos,
    coalesce(sum(e.cartoes_vermelhos), 0) as total_vermelhos
from jogadores j
left join estatisticas_partida e on e.jogador_id = j.id
group by j.id, j.nome, j.apelido
order by total_amarelos desc, total_vermelhos desc;

-- Desempenho geral do time (para o card do dashboard)
create or replace view vw_desempenho_time as
select
    count(*) as total_partidas,
    count(*) filter (where placar_suprema > placar_adversario) as vitorias,
    count(*) filter (where placar_suprema = placar_adversario) as empates,
    count(*) filter (where placar_suprema < placar_adversario) as derrotas,
    coalesce(sum(placar_suprema), 0) as gols_marcados,
    coalesce(sum(placar_adversario), 0) as gols_sofridos
from partidas
where status = 'realizada';