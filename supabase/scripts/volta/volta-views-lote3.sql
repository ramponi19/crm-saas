-- Volta da 20261105000500_drop_views_lote3: recria as 10 views como estavam na produção em
-- 04/11/2026 (colunas, security_invoker, grants de anon/authenticated/service_role).
-- Só precisa se um código antigo que lê estes nomes voltar ao ar (Instant Rollback).
begin;
create view public.garantias_assistencias with (security_invoker = true) as
  select id, tipo, protocolo, cliente_id, produto_id, usuario_id, responsavel_tecnico_id, imei_serial,
         defeito_relatado, estado_entrada, parecer_tecnico, orcamento_valor, celular_reserva_fornecido,
         modelo_reserva, dentro_garantia, dias_garantia_restantes, status, observacoes, data_entrada, created_at,
         empresa_id, token, aprovado_em, recusado_em, filial_id
    from public.assistencia_garantias;
create view public.orcamentos with (security_invoker = true) as
  select id, empresa_id, lead_id, cliente_nome, cliente_telefone, tipo, status, token, aparelho, imei, defeito,
         prazo_dias, garantia_dias, itens, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, total,
         observacoes, os_id, aprovado_em, recusado_em, created_at, unidade_id, valor_devolver, acerto, usuario_id,
         cliente_id, filial_id, troca_cotacao_id
    from public.assistencia_orcamentos;
create view public.servicos_reparo with (security_invoker = true) as
  select id, empresa_id, nome, categoria, preco, tempo_estimado_min, ativo, created_at, filial_id
    from public.assistencia_servicos;
create view public.comissoes with (security_invoker = true) as
  select id, venda_id, usuario_id, valor_comissao, percentual, status, data_pagamento, zerado_em, zerado_por,
         created_at, empresa_id, mes_referencia, filial_id
    from public.vendas_comissoes;
create view public.contrato_documentos with (security_invoker = true) as
  select id, empresa_id, nome, arquivado, criado_por, created_at, updated_at
    from public.vendas_contrato_documentos;
create view public.contrato_modelos with (security_invoker = true) as
  select id, empresa_id, versao, paginas, ativo, criado_por, created_at, documento_id
    from public.vendas_contrato_modelos;
create view public.pedidos_compra with (security_invoker = true) as
  select id, fornecedor_id, descricao, valor_total, status, observacoes, usuario_id, data_pedido, created_at,
         empresa_id, filial_id, solicitado_em, solicitado_por
    from public.vendas_pedidos_compra;
create view public.propostas with (security_invoker = true) as
  select id, empresa_id, lead_id, cliente_nome, itens, observacoes, total, status, token, created_at, filial_id
    from public.vendas_propostas;
create view public.fichas_financiamento with (security_invoker = true) as
  select id, empresa_id, lead_id, banco, valor, entrada, parcelas, taxa, status, observacoes, usuario_id,
         created_at, filial_id
    from public.vendas_fichas_financiamento;
create view public.contratos_venda with (security_invoker = true) as
  select id, empresa_id, cliente_id, venda_ids, dados, html, garantia_dias, criado_por, created_at, documento_id,
         nome_documento, filial_id
    from public.vendas_contratos;

grant all on public.garantias_assistencias, public.orcamentos, public.servicos_reparo, public.comissoes,
  public.contrato_documentos, public.contrato_modelos, public.pedidos_compra, public.propostas,
  public.fichas_financiamento, public.contratos_venda
  to anon, authenticated, service_role;
commit;
