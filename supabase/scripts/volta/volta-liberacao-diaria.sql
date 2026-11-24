-- Volta da 20261124001600_liberacao_diaria: o agendamento e as funções saem (os leads já liberados ficam com quem estão).
select cron.unschedule('liberacao-diaria-esteira');
drop function if exists public.core_liberar_lotes_do_dia();
drop function if exists public.core_liberar_lote_esteira(bigint, bigint, uuid, timestamptz);
drop function if exists public.core_primeiro_dia_aberto_da_semana(bigint, bigint, date);
drop function if exists public.core_roleta_elegiveis(bigint, bigint);
