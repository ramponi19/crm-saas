-- VOLTA de 20261117000300_tabelas_com_prefixo_do_modulo.sql: os nomes antigos, as sequências e as funções
-- (refeitas pela definição atual, trocando de volta). App anterior antes (o que usa os nomes antigos).

create temporary table _renomear (velha text primary key, nova text not null);
insert into _renomear values
  ('assistencia_orcamentos', 'orcamentos_orcamentos'),
  ('avaliacao_cotacoes', 'celulares_troca_cotacoes'),
  ('avaliacao_precos', 'celulares_troca_precos'),
  ('avaliacao_regras', 'celulares_troca_regras'),
  ('estoque_imei_consultas', 'celulares_imei_consultas'),
  ('avaliacao_usados', 'avaliacoes_usados'),
  ('estoque_veiculo_dados', 'avaliacoes_veiculo_dados'),
  ('avaliacao_fipe_consultas', 'consulta_fipe_consultas'),
  ('avaliacao_fipe_referencia', 'consulta_fipe_referencia'),
  ('vendas_propostas', 'propostas_propostas'),
  ('vendas_pedidos_compra', 'compras_pedidos'),
  ('vendas_fichas_financiamento', 'simular_financiamento_fichas'),
  ('visitas', 'agenda_visitas'),
  ('pedidos', 'cardapio_pedidos'),
  ('mensagens_internas', 'chat_mensagens');

do $$
declare r record; c record; seq text; fn record; d text; d0 text;
begin
  for r in select * from _renomear order by velha loop
    execute format('alter table public.%I rename to %I', r.nova, r.velha);
    for c in select a.attname from pg_attribute a
              where a.attrelid = ('public.' || r.velha)::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence('public.' || r.velha, c.attname);
      if seq is not null and seq like '%' || r.nova || '%' then
        execute format('alter sequence %s rename to %I', seq,
          replace(split_part(replace(seq, '"', ''), '.', 2), r.nova, r.velha));
      end if;
    end loop;
  end loop;
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prokind in ('f', 'p')
               and exists (select 1 from _renomear x where p.prosrc ~ ('(?<![a-z0-9_])' || x.nova || '(?![a-z0-9_])')) loop
    d := pg_get_functiondef(fn.oid);
    d0 := d;
    for r in select * from _renomear loop
      d := regexp_replace(d, '(?<![a-z0-9_])' || r.nova || '(?![a-z0-9_])', r.velha, 'g');
    end loop;
    if d <> d0 then execute d; end if;
  end loop;
end $$;

update public.empresa_modulos set modulo = 'check_imei' where modulo = 'celulares';
drop table _renomear;
