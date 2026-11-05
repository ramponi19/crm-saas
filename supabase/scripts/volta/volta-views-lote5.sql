-- Volta da 20261105000700_drop_views_lote5: recria a view `vendas` como estava na produção em
-- 05/11/2026 (colunas, security_invoker, grants). As 4 funções do ZapIntel NÃO voltam ao corpo
-- antigo: lendo vendas_vendas, funcionam com ou sem a view.
begin;
create view public.vendas with (security_invoker = true) as
  select id, cliente_id, vendedor_id, valor_venda, valor_custo, lucro, forma_pagamento, parcelas, canal_venda,
         desconto_valor, desconto_motivo, desconto_aprovado_por, observacoes, usuario_id, data_venda, created_at,
         status, comissao, produto_id, empresa_id, numero_serie, comanda, pedido_compra_id, unidade_id, grupo_pdv,
         quantidade, filial_id, previsao_entrega
    from public.vendas_vendas;
grant all on public.vendas to anon, authenticated, service_role;
commit;
