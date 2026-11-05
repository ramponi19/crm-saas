-- Fase final das views de compatibilidade, lote 5 (05/11/2026): vendas.
--
-- Cai a view que ficou sem leitor (from, embed, tipo, literal) no app, Edges e scripts:
--   vendas -> vendas_vendas
--
-- Quatro funções do ZapIntel citavam `vendas` no corpo (o pg_depend não vê) e passam a ler a
-- tabela. A troca casa só "from vendas"/"join vendas" e confere o número de ocorrências; as
-- demais citações da palavra são texto (chave de JSON, evento 'vendas' do broadcast, o grupo
-- do menu em migracao.modulo_do_href) e não mudam:
--   zapintel_conversa_calc  1   (join vendas v)
--   zapintel_dashboard      1   (from vendas v)
--   zapintel_insights       3   (from vendas v)
--   zapintel_posvenda       1   (join vendas v; o produto já lê estoque_produtos desde o lote 4)
-- Os gatilhos vendas_preencher_filial e zapintel_vendas_ao_vivo já são da vendas_vendas.
-- Função que já lê vendas_vendas é pulada (a volta não devolve o corpo antigo).
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote5.sql.

do $$
declare
  v_alvo record;
  v_def text;
  v_n int;
begin
  for v_alvo in
    select p.oid::regprocedure as fn, t.esperadas
      from (values ('zapintel_conversa_calc', 1), ('zapintel_dashboard', 1), ('zapintel_insights', 3), ('zapintel_posvenda', 1))
           as t(nome, esperadas)
      join pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = t.nome
  loop
    v_def := pg_get_functiondef(v_alvo.fn);
    v_n := (select count(*) from regexp_matches(v_def, '(from|join)(\s+)(public\.)?vendas\M', 'gi'));
    -- Já lendo vendas_vendas (rodada repetida no local, depois da volta): nada a trocar.
    continue when v_n = 0 and v_def ~* '(from|join)\s+public\.vendas_vendas\M';
    if v_n <> v_alvo.esperadas then
      raise exception '%: % ocorrências de vendas, esperadas %', v_alvo.fn, v_n, v_alvo.esperadas;
    end if;
    execute regexp_replace(v_def, '(from|join)(\s+)(public\.)?vendas\M', '\1\2public.vendas_vendas', 'gi');
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('zapintel_conversa_calc', 'zapintel_dashboard', 'zapintel_insights', 'zapintel_posvenda')) <> 4 then
    raise exception 'esperadas 4 funções do ZapIntel (uma de cada nome)';
  end if;
end $$;

drop view public.vendas;
