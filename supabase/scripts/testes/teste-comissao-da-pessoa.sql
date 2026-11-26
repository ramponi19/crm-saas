-- Teste da 20261126001400/1410 (COMISSÃO É DA PESSOA, correção da 5b). Semente: empresa 1 (JM de teste, lojas 3 e 6);
-- admin …0201 (vê vendas de outros); vendedor M1 …0101 (loja 3). Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; prod bigint; ini timestamptz := date_trunc('month', now()); fim timestamptz := date_trunc('month', now()) + interval '1 month';
  ADM constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1  constant uuid := '0e5e0000-0000-4000-8000-000000000101';
begin
  insert into estoque_produtos (empresa_id, nome) values (1, 'Teste comissão da pessoa') returning id into prod;
  -- o vendedor de Mogi vende nas DUAS lojas no mês
  insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, status, vendedor_id, data_venda, concluida_em)
  values (1, 3, prod, 1000, 'concluida', M1, now(), now()), (1, 6, prod, 500, 'concluida', M1, now(), now()),
         (1, 6, prod, 999, 'pendente', M1, now(), null);
  -- meta e comissão paga gravadas com a loja 3 (como a tela gravava com o topo na loja 3)
  insert into metas_comissoes (empresa_id, filial_id, usuario_id, mes_ano, meta_vendas_valor, percentual_comissao_padrao)
  values (1, 3, M1, to_char(now(), 'YYYY-MM'), 10000, 5);
  insert into vendas_comissoes (empresa_id, filial_id, usuario_id, valor_comissao, percentual, status, mes_referencia)
  values (1, 3, M1, 10, 5, 'pago', to_char(now(), 'YYYY-MM'));

  -- 1. o administrador com a loja 6 no topo: a função traz as vendas do M1 nas duas lojas; meta e pagamento aparecem
  update usuarios set filial_atual_id = 6 where id = ADM;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ADM::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('1_adm_topo_6', jsonb_build_object(
    'total_m1', (select sum(valor_venda) from vendas_da_equipe(ini, fim) where vendedor_id = M1),
    'por_loja', (select jsonb_object_agg(filial_id, s) from (select filial_id, sum(valor_venda) s from vendas_da_equipe(ini, fim) where vendedor_id = M1 group by 1) x),
    'meta_visivel', (select count(*) from metas_comissoes where usuario_id = M1),
    'paga_visivel', (select count(*) from vendas_comissoes where usuario_id = M1),
    'vendas_da_loja_pela_rls', (select sum(valor_venda) from vendas_vendas where vendedor_id = M1 and status = 'concluida')));
  execute 'reset role';
  update usuarios set filial_atual_id = null where id = ADM;

  -- 2. o próprio vendedor: vê só as dele pela função (as duas lojas)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('2_vendedor', jsonb_build_object(
    'proprias', (select sum(valor_venda) from vendas_da_equipe(ini, fim) where vendedor_id = M1),
    'de_outros', (select count(*) from vendas_da_equipe(ini, fim) where vendedor_id is distinct from M1)));
  execute 'reset role';

  -- 3. a loja da comissão saiu
  r := r || jsonb_build_object('3_tabela_saiu', to_regclass('public.empresa_usuario_comissao') is null,
    '3_funcao_saiu', not exists (select 1 from pg_proc where proname = 'comissao_loja_salvar'));
  raise exception 'RESULTADO_TESTE_COMISSAO_DA_PESSOA %', r::text;
end $teste$;
