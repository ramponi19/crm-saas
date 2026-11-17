-- TABELAS COM O PREFIXO DO MÓDULO DONO (17/11/2026, pedido do Lucas; regra 3 de "Como nasce um módulo", 05).
-- Herança do corte: tabelas que moravam com o prefixo de OUTRO módulo (a troca de celular em `avaliacao_*`,
-- o orçamento em `assistencia_*`, a proposta e a compra em `vendas_*`) ou sem prefixo (`visitas`, `pedidos`,
-- `mensagens_internas`). Renomear não mexe em dado: RLS, gatilhos, índices, chaves e a publicação do realtime
-- seguem a tabela (pelo OID). O que cita a tabela pelo NOME é refeito aqui: as funções do banco (pela
-- definição que estiver no banco, trocando o nome com limite de palavra) e as sequências de id.
--
-- APLICAR COM A LOJA FECHADA e o app novo (que já usa os nomes novos) indo ao ar logo em seguida: entre um e
-- outro, a tela que lê a tabela antiga falha. Volta: supabase/scripts/volta/volta-tabelas-com-prefixo.sql.
--
--   antes                          depois                          dono (core/modulos.ts)
--   assistencia_orcamentos         orcamentos_orcamentos           orcamentos
--   avaliacao_cotacoes             celulares_troca_cotacoes        celulares (era check_imei)
--   avaliacao_precos               celulares_troca_precos          celulares
--   avaliacao_regras               celulares_troca_regras          celulares
--   estoque_imei_consultas         celulares_imei_consultas        celulares
--   avaliacao_usados               avaliacoes_usados               avaliacoes
--   estoque_veiculo_dados          avaliacoes_veiculo_dados        avaliacoes
--   avaliacao_fipe_consultas       consulta_fipe_consultas         consulta_fipe
--   avaliacao_fipe_referencia      consulta_fipe_referencia        consulta_fipe
--   vendas_propostas               propostas_propostas             propostas
--   vendas_pedidos_compra          compras_pedidos                 compras (o PDV grava a encomenda aqui)
--   vendas_fichas_financiamento    simular_financiamento_fichas    simular_financiamento
--   visitas                        agenda_visitas                  agenda
--   pedidos                        cardapio_pedidos                cardapio
--   mensagens_internas             chat_mensagens                  chat
--
-- Ficam: `vendas_*` do PDV (vendas, pagamentos, termos, contratos…: prefixo de nenhum outro módulo; dono
-- declarado em `tabelas`), `publicos` e `transmissoes` (a tabela principal com o nome do módulo).

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
  -- 1. as tabelas (e a sequência de id de cada uma, com o nome novo)
  for r in select * from _renomear order by velha loop
    if to_regclass('public.' || r.velha) is null then
      raise exception 'tabela % não existe (já renomeada?)', r.velha;
    end if;
    execute format('alter table public.%I rename to %I', r.velha, r.nova);
    for c in select a.attname from pg_attribute a
              where a.attrelid = ('public.' || r.nova)::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence('public.' || r.nova, c.attname);
      if seq is not null and seq like '%' || r.velha || '%' then
        execute format('alter sequence %s rename to %I', seq,
          replace(split_part(replace(seq, '"', ''), '.', 2), r.velha, r.nova));
      end if;
    end loop;
  end loop;

  -- 2. as funções do schema public que citam algum nome antigo: refeitas pela definição atual
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prokind in ('f', 'p')
               and exists (select 1 from _renomear x where p.prosrc ~ ('(?<![a-z0-9_])' || x.velha || '(?![a-z0-9_])')) loop
    d := pg_get_functiondef(fn.oid);
    d0 := d;
    for r in select * from _renomear loop
      d := regexp_replace(d, '(?<![a-z0-9_])' || r.velha || '(?![a-z0-9_])', r.nova, 'g');
    end loop;
    if d <> d0 then execute d; end if;
  end loop;
end $$;

-- 3. a chave do módulo de celular (era a da ferramenta Check IMEI; o endereço /check-imei segue)
update public.empresa_modulos set modulo = 'celulares' where modulo = 'check_imei';
drop table _renomear;
