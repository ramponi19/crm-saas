-- Fase final das views de compatibilidade, lote 1 (05/11/2026).
--
-- Caem as views que ficaram sem leitor no app, nas Edges e nos scripts (from() e embed):
--   pre_vendas              -> vendas_pre_vendas            (0 leitores já antes do lote)
--   movimentacao_estoque    -> estoque_movimentacoes
--   veiculo_dados           -> estoque_veiculo_dados
--   subcategorias_produtos  -> estoque_subcategorias
--   imei_consultas          -> estoque_imei_consultas
--   payment_webhook_eventos -> financeiro_webhook_eventos
--   fipe_consultas          -> avaliacao_fipe_consultas
--   fipe_referencia         -> avaliacao_fipe_referencia
--
-- Nenhuma função, gatilho ou view do banco lê estas oito (conferido no catálogo da produção:
-- pg_depend e o corpo das funções de public/ops). Sem CASCADE: se algo depender, a migração
-- falha inteira e nada cai.
-- Volta: supabase/scripts/volta/volta-views-lote1.sql (definições e grants lidos da produção).

drop view public.pre_vendas;
drop view public.movimentacao_estoque;
drop view public.veiculo_dados;
drop view public.subcategorias_produtos;
drop view public.imei_consultas;
drop view public.payment_webhook_eventos;
drop view public.fipe_consultas;
drop view public.fipe_referencia;
