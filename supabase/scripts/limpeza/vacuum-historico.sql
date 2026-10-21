-- Bloco 5 da noite de 20/10 (sql-vacuum-historico pelo operador). VACUUM não roda em transação:
-- psql em autocommit. Tamanho antes e depois.
\pset footer off
select 'antes' quando, pg_size_pretty(pg_total_relation_size('public.historico_bruto')) total,
       pg_size_pretty(pg_relation_size('public.historico_bruto')) tabela,
       (select n_live_tup from pg_stat_user_tables where relid = 'public.historico_bruto'::regclass) vivas,
       (select n_dead_tup from pg_stat_user_tables where relid = 'public.historico_bruto'::regclass) mortas;
\timing on
vacuum (verbose) public.historico_bruto;
\timing off
select 'depois' quando, pg_size_pretty(pg_total_relation_size('public.historico_bruto')) total,
       pg_size_pretty(pg_relation_size('public.historico_bruto')) tabela,
       (select n_live_tup from pg_stat_user_tables where relid = 'public.historico_bruto'::regclass) vivas,
       (select n_dead_tup from pg_stat_user_tables where relid = 'public.historico_bruto'::regclass) mortas;
