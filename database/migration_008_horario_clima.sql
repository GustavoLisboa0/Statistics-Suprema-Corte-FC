-- =========================================================
-- Migração 008: horário do jogo e previsão do tempo (Curitiba)
-- Execute no SQL Editor do Supabase. É idempotente: rodar duas vezes
-- não quebra nem duplica nada.
--
-- `horario` é obrigatório só pra partidas novas (a API já garante isso);
-- aqui a coluna precisa ser nullable porque partidas antigas não têm.
--
-- `clima` guarda o retorno da Open-Meteo como veio (temperatura, condição,
-- chance de chuva, vento, quando foi buscado) — não tem por que normalizar
-- em colunas separadas já que é sempre lido/escrito como um bloco só.
-- Fica congelado (não é mais atualizado) assim que a partida vira
-- "realizada" — ver backend/routers/partidas.py.
-- =========================================================
alter table partidas add column if not exists horario time;
alter table partidas add column if not exists clima jsonb;
