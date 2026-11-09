-- Volta de 20261109000500_unicos_por_empresa: devolve o único global de financeiro_taxas
-- e tira o único de (provider, provider_ref) das cobranças.
-- ATENÇÃO: se duas empresas já tiverem a mesma taxa, o único global não volta (erro de
-- duplicidade) — é o sinal de que a volta apagaria dado de alguém; não force.
drop index if exists public.financeiro_cobrancas_provider_ref_key;
alter table public.financeiro_taxas
  drop constraint if exists financeiro_taxas_empresa_forma_bandeira_parcelas_key;
alter table public.financeiro_taxas
  add constraint taxas_pagamento_forma_pagamento_bandeira_parcelas_key
  unique (forma_pagamento, bandeira, parcelas);
