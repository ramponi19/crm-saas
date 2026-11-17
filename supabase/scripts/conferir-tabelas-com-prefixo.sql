-- Conferência de 20261117000300_tabelas_com_prefixo_do_modulo (só leitura). Rodar ANTES (guarda as contagens)
-- e DEPOIS da migração: as contagens por tabela batem e nada cita nome antigo.
with par(velha, nova) as (values
  ('assistencia_orcamentos', 'orcamentos_orcamentos'), ('avaliacao_cotacoes', 'celulares_troca_cotacoes'),
  ('avaliacao_precos', 'celulares_troca_precos'), ('avaliacao_regras', 'celulares_troca_regras'),
  ('estoque_imei_consultas', 'celulares_imei_consultas'), ('avaliacao_usados', 'avaliacoes_usados'),
  ('estoque_veiculo_dados', 'avaliacoes_veiculo_dados'), ('avaliacao_fipe_consultas', 'consulta_fipe_consultas'),
  ('avaliacao_fipe_referencia', 'consulta_fipe_referencia'), ('vendas_propostas', 'propostas_propostas'),
  ('vendas_pedidos_compra', 'compras_pedidos'), ('vendas_fichas_financiamento', 'simular_financiamento_fichas'),
  ('visitas', 'agenda_visitas'), ('pedidos', 'cardapio_pedidos'), ('mensagens_internas', 'chat_mensagens')),
rx as (select velha, '(?<![a-z0-9_])' || velha || '(?![a-z0-9_])' r from par)
select 'tabela' tipo, coalesce(to_regclass('public.' || nova)::text, to_regclass('public.' || velha)::text) nome,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I',
         case when to_regclass('public.' || nova) is not null then nova else velha end), false, true, '')))[1]::text detalhe
  from par
union all select 'funcao cita nome antigo', n.nspname || '.' || p.proname, string_agg(x.velha, ',')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace, rx x
 where n.nspname not in ('pg_catalog', 'information_schema') and p.prosrc ~ x.r group by 1, 2
union all select 'cron cita nome antigo', j.jobname, string_agg(x.velha, ',') from cron.job j, rx x where j.command ~ x.r group by 1, 2
union all select 'politica cita nome antigo', schemaname || '.' || tablename, string_agg(x.velha, ',')
  from pg_policies, rx x where coalesce(qual, '') || coalesce(with_check, '') ~ x.r group by 1, 2
union all select 'realtime', pubname, string_agg(tablename, ',') from pg_publication_tables
 where tablename in (select velha from par union select nova from par) group by 1, 2
union all select 'modulo celular', modulo, count(*)::text from public.empresa_modulos where modulo in ('check_imei', 'celulares') group by 1, 2
order by 1, 2;
