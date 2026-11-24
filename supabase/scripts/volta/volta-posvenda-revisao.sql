-- Volta da 20261124002300_posvenda_revisao: rodar de novo, nesta ordem, as definições das migrações anteriores:
-- 1. 20261124002200_posvenda_universal.sql: posvenda_data_do_passo, posvenda_iniciar_jornadas, posvenda_reancorar_jornada,
--    posvenda_repetir_passo (só os create or replace dessas funções).
-- 2. 20261124000400_posvenda_jornada.sql: posvenda_promover_juntado.
-- 3. 20261124002100_posvenda_ativar_existentes.sql: posvenda_ativar_existentes.
-- 4. posvenda_nps_registrar: trocar de volta "tipo = 'nps' order by ativo desc, id" por "tipo = 'nps' and ativo order by id".
-- 5. Depois:
drop trigger if exists posvenda_cadencia_passos_coerente on public.posvenda_cadencia_passos;
drop function if exists public.posvenda_passo_coerente();
drop function if exists public.posvenda_nascer_passo(bigint, bigint, bigint);
