-- Volta da 20261105000400_drop_views_lote2: recria as 7 views como estavam na produção em
-- 05/11/2026 (colunas, security_invoker, grants de anon/authenticated/service_role).
-- As duas funções NÃO voltam ao corpo antigo: lendo a tabela, funcionam com ou sem as views.
-- Só precisa se um código antigo que lê estes nomes voltar ao ar (Instant Rollback).
begin;
create view public.cobrancas with (security_invoker = true) as
  select id, empresa_id, provider, provider_ref, tipo, valor, status, descricao, cliente_id, venda_id, os_id,
         qr_code, qr_code_base64, link_pagamento, linha_digitavel, vencimento, pago_em, metadata, created_at, filial_id
    from public.financeiro_cobrancas;
create view public.lancamentos_financeiros with (security_invoker = true) as
  select id, tipo, descricao, valor, data_venc, data_pgto, status, categoria, forma_pgto, referencia_id,
         referencia_tp, observacoes, created_at, updated_at, empresa_id, filial_id
    from public.financeiro_lancamentos;
create view public.taxas_pagamento with (security_invoker = true) as
  select id, forma_pagamento, bandeira, parcelas, percentual_taxa, created_at, ativo, empresa_id
    from public.financeiro_taxas;
create view public.tenant_payment_config with (security_invoker = true) as
  select empresa_id, provider, ativo, credenciais_cipher, modo, atualizado_em
    from public.financeiro_config_pagamento;
create view public.troca_cotacoes with (security_invoker = true) as
  select id, empresa_id, filial_id, usuario_id, lead_id, cliente_id, cliente_nome, modelo, armazenamento, imei,
         na_troca, avarias, descontos_total, bonus, valor_final, checklist, observacoes, status, created_at,
         numero, usada_em, venda_id
    from public.avaliacao_cotacoes;
create view public.troca_precos with (security_invoker = true) as
  select id, empresa_id, modelo, armazenamento, na_troca, descontos, ativo, atualizado_em
    from public.avaliacao_precos;
create view public.troca_regras with (security_invoker = true) as
  select empresa_id, bonus_seminovo, corte_bateria, observacoes, atualizado_em
    from public.avaliacao_regras;

grant all on public.cobrancas, public.lancamentos_financeiros, public.taxas_pagamento,
  public.tenant_payment_config, public.troca_cotacoes, public.troca_precos, public.troca_regras
  to anon, authenticated, service_role;
commit;
