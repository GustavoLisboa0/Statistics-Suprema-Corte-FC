-- =========================================================
-- Migração 004: presença, pagamento e vínculo conta <-> jogador
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Partidas: vagas de linha e composição do custo
--
-- O rateio é por jogo: quadra + arbitragem + goleiro formam o total, que é
-- dividido entre as vagas de linha (o goleiro não paga — o valor dele é
-- justamente um dos custos). Todas nullable: partidas antigas seguem sem
-- valor e sem limite.
-- ---------------------------------------------------------
alter table partidas add column if not exists vagas_linha integer;
alter table partidas add column if not exists valor_quadra numeric(10, 2);
alter table partidas add column if not exists valor_arbitragem numeric(10, 2);
alter table partidas add column if not exists valor_goleiro numeric(10, 2);

-- ---------------------------------------------------------
-- 2. Jogadores: como amarrar um login a um jogador
--
-- `email` é o dado que casa com a conta do Supabase Auth; `perfil_id` é o
-- vínculo já resolvido, gravado na primeira vez que a conta bate com o
-- jogador (por email ou telefone). Depois disso o email pode até mudar que
-- o vínculo continua valendo.
--
-- Ambos são nullable de propósito: o elenco atual foi cadastrado antes
-- disso existir. Jogador sem vínculo simplesmente não confirma presença
-- sozinho — não quebra nada no resto do sistema.
-- ---------------------------------------------------------
alter table jogadores add column if not exists email text;
alter table jogadores add column if not exists perfil_id uuid;

-- Um perfil só pode estar amarrado a um jogador, e vice-versa.
create unique index if not exists idx_jogadores_perfil
    on jogadores (perfil_id)
    where perfil_id is not null;

-- Email é comparado sem diferenciar maiúsculas.
create unique index if not exists idx_jogadores_email
    on jogadores (lower(email))
    where email is not null;

-- ---------------------------------------------------------
-- 3. Tabela: presenca
--
-- Uma linha por jogador por partida. 'espera' existe porque o limite de
-- vagas_linha põe quem chegou depois na fila, e o editor promove.
-- ---------------------------------------------------------
create table if not exists presenca (
    id                uuid primary key default gen_random_uuid(),
    partida_id        uuid not null references partidas(id) on delete cascade,
    jogador_id        uuid not null references jogadores(id) on delete cascade,

    status            text not null check (status in ('confirmado', 'espera', 'ausente')),
    posicao           text,
    termos_aceitos    boolean not null default false,
    status_pagamento  text not null default 'pendente'
                        check (status_pagamento in ('pendente', 'pago')),

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    -- Permite o UPSERT: reconfirmar sobrescreve em vez de duplicar.
    unique (partida_id, jogador_id),

    -- Quem vai jogar (ou está na fila) precisa ter aceitado os termos.
    constraint presenca_termos_quando_vai
        check (status = 'ausente' or termos_aceitos)
);

create index if not exists idx_presenca_partida on presenca (partida_id);
create index if not exists idx_presenca_jogador on presenca (jogador_id);

-- Mantém updated_at em dia a cada alteração (útil pra ordenar a fila
-- de espera pela ordem de chegada).
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_presenca_updated_at on presenca;
create trigger trg_presenca_updated_at
    before update on presenca
    for each row execute function set_updated_at();
