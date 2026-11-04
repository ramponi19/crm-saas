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

drop view public.cobrancas;
drop view public.lancamentos_financeiros;
drop view public.taxas_pagamento;
drop view public.tenant_payment_config;
drop view public.troca_cotacoes;
drop view public.troca_precos;
drop view public.troca_regras;
