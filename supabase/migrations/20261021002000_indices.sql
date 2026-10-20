-- Índices (limpeza de 20/10, item 2.2). CONCURRENTLY: não roda dentro de transação —
-- aplicar com psql em autocommit (operador da limpeza), um comando por vez.
--
-- 1. FK sem índice em negocios, mensagens, conversas e tarefas: só sobravam duas, em tarefas.
create index concurrently if not exists tarefas_responsavel_id_idx on public.tarefas (responsavel_id);
create index concurrently if not exists tarefas_filial_id_idx on public.tarefas (filial_id);

-- 2. Os 8 índices nunca usados (idx_scan = 0 desde 22/05) que não cobrem FK nem sustentam
--    constraint. Tabelas pequenas: sem eles, a busca cai em varredura de poucas linhas.
drop index concurrently if exists public.idx_rastr_visitas_tid;
drop index concurrently if exists public.idx_rastr_eventos_capi;
drop index concurrently if exists public.idx_cobrancas_provider_ref;
drop index concurrently if exists public.payment_webhook_eventos_lookup;
drop index concurrently if exists public.idx_empresas_stripe_customer;
drop index concurrently if exists public.idx_empresas_stripe_sub;
drop index concurrently if exists public.idx_lancamentos_status;
drop index concurrently if exists public.idx_lancamentos_tipo;
