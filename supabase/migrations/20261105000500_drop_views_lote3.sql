-- Fase final das views de compatibilidade, lote 3 (04/11/2026): pós-venda e vendas.
--
-- Caem as views que ficaram sem leitor no app, nas Edges e nos scripts (from, embed e tipo):
--   garantias_assistencias -> assistencia_garantias
--   orcamentos             -> assistencia_orcamentos
--   servicos_reparo        -> assistencia_servicos
--   comissoes              -> vendas_comissoes
--   contrato_documentos    -> vendas_contrato_documentos
--   contrato_modelos       -> vendas_contrato_modelos
--   pedidos_compra         -> vendas_pedidos_compra
--   propostas              -> vendas_propostas
--   fichas_financiamento   -> vendas_fichas_financiamento
--   contratos_venda        -> vendas_contratos
--
-- Nenhuma função de public/ops cita estas dez no corpo (a fundir_clientes passou para as
-- tabelas no lote 2) e nenhuma view depende delas (conferido na produção em 04/11).
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote3.sql.

drop view public.garantias_assistencias;
drop view public.orcamentos;
drop view public.servicos_reparo;
drop view public.comissoes;
drop view public.contrato_documentos;
drop view public.contrato_modelos;
drop view public.pedidos_compra;
drop view public.propostas;
drop view public.fichas_financiamento;
drop view public.contratos_venda;
