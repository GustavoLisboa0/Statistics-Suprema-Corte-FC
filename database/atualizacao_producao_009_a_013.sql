-- =============================================================
-- ATUALIZAÇÃO DO BANCO PARA A NOVA VERSÃO (escalador, táticas e jogadas ensaiadas)
-- Cole TUDO no SQL Editor do Supabase e clique em Run. Rode ANTES de subir o código novo.
-- É seguro rodar mais de uma vez (nada é apagado nem duplicado).
-- Reúne as migrações 009 a 013, na ordem.
-- =============================================================

-- >>>>>>>>>> migration_009_escalacoes.sql
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

-- >>>>>>>>>> migration_010_atributos_taticas.sql
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

-- >>>>>>>>>> migration_011_caracteristicas.sql
-- =========================================================
-- Migração 011: características dos jogadores (só admin)
-- Execute no SQL Editor do Supabase. É idempotente.
-- Lista de textos, ex.: ["canhoto", "marcador"]. Fica junto dos atributos
-- (tabela interna do admin), nunca em `jogadores`.
-- =========================================================
alter table atributos_jogador
    add column if not exists caracteristicas jsonb not null default '[]'::jsonb;

-- >>>>>>>>>> migration_012_taticas.sql
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

-- >>>>>>>>>> migration_013_jogadas_ensaiadas.sql
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

