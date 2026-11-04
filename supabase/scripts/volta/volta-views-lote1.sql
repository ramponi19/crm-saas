-- Volta da 20261105000300_drop_views_lote1: recria as 8 views como estavam na produção em
-- 05/11/2026 (pg_get_viewdef, security_invoker, grants de anon/authenticated/service_role).
-- Só precisa se um código antigo que lê estes nomes voltar ao ar (Instant Rollback para antes
-- do lote 1 de views).
begin;
create view public.pre_vendas with (security_invoker = true) as
  select id, inventario_unidade_id, produto_id, valor_venda, vendedor_id, canal_venda, desconto_valor,
         observacoes, status, usuario_id, created_at, grupo_id, venda_id, empresa_id, filial_id
    from public.vendas_pre_vendas;
create view public.movimentacao_estoque with (security_invoker = true) as
  select id, produto_id, usuario_id, tipo_movimento, quantidade, observacoes, created_at, empresa_id, filial_id
    from public.estoque_movimentacoes;
create view public.veiculo_dados with (security_invoker = true) as
  select unidade_id, empresa_id, placa, chassi, renavam, km, ano, created_at
    from public.estoque_veiculo_dados;
create view public.subcategorias_produtos with (security_invoker = true) as
  select id, nome, categoria_id, ativo, created_at, ordem, empresa_id
    from public.estoque_subcategorias;
create view public.imei_consultas with (security_invoker = true) as
  select id, empresa_id, imei, resultado, motivo, fonte, observacoes, consultado_por, consultado_em
    from public.estoque_imei_consultas;
create view public.payment_webhook_eventos with (security_invoker = true) as
  select id, provider, provider_ref, event_type, processado_em
    from public.financeiro_webhook_eventos;
create view public.fipe_consultas with (security_invoker = true) as
  select id, tipo, codigo_marca, codigo_modelo, ano, referencia_codigo, marca_nome, modelo_nome,
         ano_label, valor, codigo_fipe, mes_referencia, criado_em
    from public.avaliacao_fipe_consultas;
create view public.fipe_referencia with (security_invoker = true) as
  select id, codigo, mes, atualizado_em
    from public.avaliacao_fipe_referencia;

grant all on public.pre_vendas, public.movimentacao_estoque, public.veiculo_dados,
  public.subcategorias_produtos, public.imei_consultas, public.payment_webhook_eventos,
  public.fipe_consultas, public.fipe_referencia
  to anon, authenticated, service_role;
commit;
