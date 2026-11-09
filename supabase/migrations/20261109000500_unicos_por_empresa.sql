-- Chaves únicas que uma empresa podia ocupar no lugar de outra (varredura de 09/11/2026,
-- depois do canais_empresa_fixa). As duas tabelas são pequenas; nada muda nos dados.
--
-- 1. financeiro_taxas: o único era (forma_pagamento, bandeira, parcelas), GLOBAL, numa
--    tabela por empresa. A primeira empresa que cadastrasse "crédito Visa 3x" impedia
--    todas as outras de cadastrar a mesma linha (configurações → taxas devolvia erro de
--    duplicidade, e o erro ainda contava que outra empresa tinha aquela taxa). Passa a
--    ser único POR EMPRESA. Mesma regra de nulos de antes (bandeira nula não colide).
--
-- 2. financeiro_cobrancas: o webhook de pagamento (app/api/payments/webhook/[provider])
--    acha a cobrança por (provider, provider_ref) com .single(). Nada impedia duas linhas
--    com o mesmo par, e o usuário logado grava provider_ref (RLS da própria empresa):
--    outra empresa que inserisse uma cobrança com o ref de um pagamento alheio fazia o
--    .single() falhar e a confirmação daquele pagamento virar "não encontrada". O ref é
--    o id do pagamento no provedor, único lá; aqui passa a ser único também.
--
-- Conferido antes (local, 09/11): 0 duplicados nas duas chaves novas.
-- Volta: supabase/scripts/volta/volta-unicos-por-empresa.sql
alter table public.financeiro_taxas
  drop constraint if exists taxas_pagamento_forma_pagamento_bandeira_parcelas_key;
alter table public.financeiro_taxas
  add constraint financeiro_taxas_empresa_forma_bandeira_parcelas_key
  unique (empresa_id, forma_pagamento, bandeira, parcelas);

create unique index if not exists financeiro_cobrancas_provider_ref_key
  on public.financeiro_cobrancas (provider, provider_ref)
  where provider_ref is not null;
