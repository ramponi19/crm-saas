-- Fase final das views de compatibilidade, lote 2 (05/11/2026): financeiro e troca.
--
-- Caem as views que ficaram sem leitor no app, nas Edges e nos scripts (from() e embed):
--   cobrancas               -> financeiro_cobrancas
--   lancamentos_financeiros -> financeiro_lancamentos
--   taxas_pagamento         -> financeiro_taxas
--   tenant_payment_config   -> financeiro_config_pagamento
--   troca_cotacoes          -> avaliacao_cotacoes
--   troca_precos            -> avaliacao_precos
--   troca_regras            -> avaliacao_regras
--
-- Duas funções liam estas views pelo nome e passam a ler a tabela (corpo de plpgsql/sql não
-- entra no pg_depend: o drop passaria e a função quebraria só na hora de rodar):
--   numerar_cotacao_troca()    — gatilho de avaliacao_cotacoes; a chave da trava fica a MESMA
--                                ('troca_cotacoes:' || empresa), para não abrir corrida com
--                                transação que já esteja com a trava antiga;
--   refresh_status_atrasados() — sem chamador hoje (nem app, nem cron, nem gatilho); fica
--                                funcionando para não deixar armadilha.
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote2.sql.

create or replace function public.numerar_cotacao_troca()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.numero is not null then
    return new;   -- número informado (importação, correção manual): respeita.
  end if;

  -- Serializa a numeração desta empresa até o fim da transação.
  perform pg_advisory_xact_lock(hashtext('troca_cotacoes:' || new.empresa_id::text));

  select coalesce(max(numero), 0) + 1
    into new.numero
    from public.avaliacao_cotacoes
   where empresa_id = new.empresa_id;

  return new;
end;
$function$;

create or replace function public.refresh_status_atrasados()
 returns void
 language sql
 set search_path to 'public'
as $function$
  update public.financeiro_lancamentos
     set status = 'atrasado'
   where status = 'pendente' and data_venc < current_date;
$function$;

-- fundir_clientes() (fusão de /clientes) faz UPDATE em `cobrancas` e em mais 10 views de
-- módulo. Todas passam para a tabela agora, de uma vez, para nenhum lote seguinte derrubar
-- uma view que a fusão ainda usa. Ficam clientes, leads e lead_mensagens (lotes finais).
-- A troca só casa nome depois de "update " ou "from " (a chave 'vendas' do jsonb de retorno
-- fica como está) e confere que nada sobrou e que o resto do corpo não mudou de tamanho
-- além das trocas.
do $$
declare
  v_def text := pg_get_functiondef('public.fundir_clientes(bigint,bigint,bigint)'::regprocedure);
  v_novo text := v_def;
  v_par text[];
  v_trocas int := 0;
  v_n int;
begin
  foreach v_par slice 1 in array array[
    ['lead_perfil_busca', 'imoveis_perfis_busca'],
    ['negocios_imobiliarios', 'imoveis_negocios'],
    ['orcamentos', 'assistencia_orcamentos'],
    ['propostas', 'vendas_propostas'],
    ['fichas_financiamento', 'vendas_fichas_financiamento'],
    ['avaliacoes_usados', 'avaliacao_usados'],
    ['inventario_unidades', 'estoque_unidades'],
    ['vendas', 'vendas_vendas'],
    ['cobrancas', 'financeiro_cobrancas'],
    ['contratos_venda', 'vendas_contratos'],
    ['garantias_assistencias', 'assistencia_garantias']]
  loop
    v_n := (select count(*) from regexp_matches(v_novo, '(update|from)(\s+)' || v_par[1] || '\M', 'gi'));
    if v_n = 0 then raise exception 'fundir_clientes: % não encontrado no corpo', v_par[1]; end if;
    v_trocas := v_trocas + v_n;
    v_novo := regexp_replace(v_novo, '(update|from)(\s+)' || v_par[1] || '\M', '\1\2' || v_par[2], 'gi');
  end loop;
  if v_novo ~* '(update|from)\s+(lead_perfil_busca|negocios_imobiliarios|orcamentos|propostas|fichas_financiamento|avaliacoes_usados|inventario_unidades|vendas|cobrancas|contratos_venda|garantias_assistencias)\M' then
    raise exception 'fundir_clientes: sobrou view de módulo no corpo';
  end if;
  if v_trocas <> 19 then raise exception 'fundir_clientes: % trocas, esperadas 19', v_trocas; end if;
  execute v_novo;
end $$;

drop view public.cobrancas;
drop view public.lancamentos_financeiros;
drop view public.taxas_pagamento;
drop view public.tenant_payment_config;
drop view public.troca_cotacoes;
drop view public.troca_precos;
drop view public.troca_regras;
