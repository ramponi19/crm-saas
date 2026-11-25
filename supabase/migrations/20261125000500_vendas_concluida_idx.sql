-- ETAPA 1.1a — ÍNDICE DA CONCLUSÃO (25/11/2026; docs/etapa-1.1-plano.md §1.2, migração A3).
--
-- Painel, Relatórios, assistente e comissão contam a venda pelo mês da conclusão (coalesce(concluida_em,
-- data_venda), desde 25/11). Este índice atende o filtro por empresa e período de conclusão.
--
-- Só adiciona. A tabela é pequena (~131 linhas na produção em 25/11): o create index comum trava a escrita
-- por milissegundos; o "concurrently" não roda dentro da transação da apply_migration.
-- Volta: supabase/scripts/volta/volta-vendas-concluida-idx.sql.

create index if not exists vendas_vendas_empresa_concluida_idx
  on public.vendas_vendas (empresa_id, concluida_em)
  where concluida_em is not null;
