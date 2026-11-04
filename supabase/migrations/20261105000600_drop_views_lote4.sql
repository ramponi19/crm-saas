-- Fase final das views de compatibilidade, lote 4 (04/11/2026): estoque.
--
-- Caem as views que ficaram sem leitor (from, embed, tipo, literal) no app, Edges e scripts:
--   produtos            -> estoque_produtos
--   categorias_produtos -> estoque_categorias
--   marcas_produtos     -> estoque_marcas
--   fornecedores        -> estoque_fornecedores
--   inventario_unidades -> estoque_unidades
--   tabela_precos       -> estoque_tabela_precos
--   avaliacoes_usados   -> avaliacao_usados
--
-- Duas funções citavam `produtos` no corpo (o pg_depend não vê) e passam a ler a tabela:
--   estoque_item_sync()  — gatilho de estoque_produtos e estoque_unidades (nome do item);
--   zapintel_posvenda()  — o pós-venda do ZapIntel (left join no produto da venda; a `vendas`
--                          que ela também lê sai no lote de vendas).
-- A troca casa só "from produtos"/"join produtos" e confere o número de ocorrências.
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote4.sql.

do $$
declare
  v_alvo record;
  v_def text;
  v_n int;
begin
  for v_alvo in
    select * from (values
      ('public.estoque_item_sync()'::regprocedure, 1),
      ((select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'zapintel_posvenda'), 1)
    ) as t(fn, esperadas)
  loop
    v_def := pg_get_functiondef(v_alvo.fn);
    v_n := (select count(*) from regexp_matches(v_def, '(from|join)(\s+)(public\.)?produtos\M', 'gi'));
    if v_n <> v_alvo.esperadas then
      raise exception '%: % ocorrências de produtos, esperadas %', v_alvo.fn, v_n, v_alvo.esperadas;
    end if;
    execute regexp_replace(v_def, '(from|join)(\s+)(public\.)?produtos\M', '\1\2public.estoque_produtos', 'gi');
  end loop;
end $$;

drop view public.produtos;
drop view public.categorias_produtos;
drop view public.marcas_produtos;
drop view public.fornecedores;
drop view public.inventario_unidades;
drop view public.tabela_precos;
drop view public.avaliacoes_usados;
