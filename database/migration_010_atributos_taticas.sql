-- =========================================================
-- Migração 010: V2 do escalador (atributos, nota interna, adversários)
-- Execute no SQL Editor do Supabase. É idempotente.
--
-- ATENÇÃO: tudo aqui é INTERNO do admin (papel 'editor'). As rotas da API
-- exigem editor, e estas tabelas ficam separadas de `jogadores` e
-- `escalacoes` de propósito, para que nada disso vaze para quem só visualiza
-- (nem para o PDF). Não crie políticas de leitura para usuários comuns.
-- =========================================================

-- Atributos de 1 a 100 de cada jogador + observação interna.
create table if not exists atributos_jogador (
    jogador_id   uuid primary key references jogadores(id) on delete cascade,
    pace         integer check (pace between 1 and 100),
    fisico       integer check (fisico between 1 and 100),
    defesa       integer check (defesa between 1 and 100),
    finalizacao  integer check (finalizacao between 1 and 100),
    passe        integer check (passe between 1 and 100),
    visao        integer check (visao between 1 and 100),
    nota         text,
    updated_at   timestamptz not null default now()
);

-- Nota interna do time para a escalação de uma partida.
create table if not exists escalacao_notas (
    partida_id   uuid primary key references partidas(id) on delete cascade,
    texto        text not null default '',
    updated_at   timestamptz not null default now()
);

-- Perfil de cada adversário (para a contra-estratégia).
create table if not exists adversarios (
    id           uuid primary key default gen_random_uuid(),
    nome         text not null,
    ataque       integer check (ataque between 1 and 10),
    meio         integer check (meio between 1 and 10),
    defesa       integer check (defesa between 1 and 10),
    estilo       text check (estilo in ('equilibrado','retranca','ataque','posse','contra_ataque')),
    observacoes  text,
    created_at   timestamptz not null default now()
);
create unique index if not exists idx_adversarios_nome on adversarios (lower(nome));

-- Segurança: só a API (service role) mexe nestas tabelas.
alter table atributos_jogador enable row level security;
alter table escalacao_notas   enable row level security;
alter table adversarios       enable row level security;
