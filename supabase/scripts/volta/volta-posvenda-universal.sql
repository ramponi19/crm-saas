-- Volta da 20261124002200_posvenda_universal. Devolve iniciar/reancorar à versão da 1200 (horario_por_dia), tira o
-- gatilho de repetição, o registro de uso e as funções de apoio. Colunas e tabelas novas FICAM (dados da empresa;
-- nunca apagar): sem as funções elas são ignoradas. Os passos com âncora diferente de "venda" devem ser desativados
-- antes (update posvenda_cadencia_passos set ativo = false where ancora_tipo <> 'venda'), senão a função antiga os
-- calcula pelo dia_offset da venda.
-- 1. Rodar o trecho das duas funções em supabase/migrations/20261124001200_horario_por_dia.sql
--    (posvenda_iniciar_jornadas e posvenda_reancorar_jornada) — a impressão digital volta a 7150b032… / 87f33503….
-- 2. Depois:
drop trigger if exists posvenda_acompanhamentos_repetir on public.posvenda_acompanhamentos;
drop function if exists public.posvenda_repetir_passo();
drop function if exists public.posvenda_uso_registrar(bigint, text, numeric, date);
drop function if exists public.posvenda_data_do_passo(bigint, bigint, integer);
drop function if exists public.posvenda_passo_filtra(bigint, jsonb);
drop function if exists public.posvenda_somar_repeticao(date, integer, text, integer);
-- posvenda_campo / posvenda_numero / posvenda_data ficam (inofensivas; usadas pela iniciar nova se reaplicar).
-- A trava do dia_offset volta só se não houver passo negativo:
-- alter table public.posvenda_cadencia_passos drop constraint posvenda_passo_dia_offset, add constraint posvenda_cadencia_passos_dia_offset_check check (dia_offset >= 0);
