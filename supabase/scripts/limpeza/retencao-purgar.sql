-- Primeira purga da retenção (20/10), pelo operador da limpeza: sql-retencao-purgar.
-- Lotes de 500 no historico_bruto (cada linha carrega ~15 KB de TOAST; 500 linhas
-- ≈ 7 MB por lote, em vez de ~66 MB de uma vez), pausa de 1 s entre lotes.
\pset footer off
select 'antes' fase, t, linhas, pg_size_pretty(tam) tam from (
  select 'historico_bruto' t, (select count(*) from public.historico_bruto) linhas, pg_total_relation_size('public.historico_bruto') tam
  union all select 'integracao_eventos', (select count(*) from public.integracao_eventos), pg_total_relation_size('public.integracao_eventos')
  union all select 'banco', null, pg_database_size(current_database())) x;
\timing on
call ops.purgar_retencao(500, 1);
\timing off
select 'depois' fase, t, linhas, pg_size_pretty(tam) tam from (
  select 'historico_bruto' t, (select count(*) from public.historico_bruto) linhas, pg_total_relation_size('public.historico_bruto') tam
  union all select 'integracao_eventos', (select count(*) from public.integracao_eventos), pg_total_relation_size('public.integracao_eventos')
  union all select 'banco', null, pg_database_size(current_database())) x;
select to_char(executado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') quando, tabela, apagadas, lotes from ops.retencao_execucoes order by id desc limit 3;
select jobname, schedule, command, active from cron.job where jobname = 'retencao-diaria';
