-- =========================================================
-- Migração 005: número da camisa único entre jogadores ativos
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
--
-- A checagem de verdade acontece na API (numero_camisa_disponivel() em
-- backend/models.py), que já barra a duplicidade antes de gravar e devolve
-- uma mensagem amigável. Este índice é só a rede de segurança contra corrida
-- de concorrência (dois PATCH simultâneos passando pela checagem da API ao
-- mesmo tempo) — sem ele, esse caso raro conseguiria gravar dois jogadores
-- ativos com o mesmo número.
--
-- Só considera jogadores ativos: inativo perde o número automaticamente ao
-- ser desativado (a própria API já zera `numero_camisa` nesse caso), então
-- não há necessidade de reservar o número dele.
-- =========================================================
create unique index if not exists idx_jogadores_numero_camisa_ativo
    on jogadores (numero_camisa)
    where ativo = true and numero_camisa is not null;
