-- ALINHAMENTO DO REPOSITÓRIO COM A PRODUÇÃO + work_mem DE VOLTA NO PAINEL DO ZAPINTEL (23/11/2026).
--
-- Achado na conferência do banco local contra a produção (replay de todas as migrações da main):
--   1. A 4A (20261123000400_zapintel_ganho_por_negocio) recria zapintel_dashboard, zapintel_dashboard_lista,
--      zapintel_leads_lista, zapintel_insights e zapintel_posvenda só com `SET search_path` — e o
--      CREATE OR REPLACE apaga o `work_mem = 16MB` que a 20261110000200_zapintel_desempenho tinha posto.
--      Na produção as três primeiras ficaram SEM o work_mem desde a 4A (as duas últimas ficaram com ele).
--      O painel voltou a gravar arquivo temporário (3 a 4 MB por chamada pela API).
--   2. zapintel_conversa_aquecer: na produção só o postgres executa (quem chama é o pg_cron); no banco
--      montado pelas migrações o service_role também executava (privilégio padrão do Supabase).
--
-- Esta migração é idempotente e não muda corpo de função nenhuma: só a configuração (work_mem) e uma
-- permissão. Na produção: devolve o work_mem às 3 funções do painel (as outras 7 já têm). No banco local:
-- deixa tudo igual à produção.
--
-- Volta: supabase/scripts/volta/volta-zapintel-work-mem-de-volta.sql (tira o work_mem das 3 do painel).

alter function public.zapintel_dashboard(bigint, bigint, text) set work_mem = '16MB';
alter function public.zapintel_dashboard_lista(text, text, bigint, bigint, text) set work_mem = '16MB';
alter function public.zapintel_leads_lista(jsonb, text, integer, integer, bigint, bigint, text) set work_mem = '16MB';
alter function public.zapintel_resumo(bigint) set work_mem = '16MB';
alter function public.zapintel_analises_pendentes(bigint, text) set work_mem = '16MB';
alter function public.zapintel_insights(integer, bigint, bigint) set work_mem = '16MB';
alter function public.zapintel_posvenda(bigint, bigint) set work_mem = '16MB';
alter function public.zapintel_atendimento(integer, bigint, bigint) set work_mem = '16MB';
alter function public.zapintel_conversa_calc(bigint, bigint[], integer) set work_mem = '16MB';
alter function public.zapintel_leads_com_conversa(bigint) set work_mem = '16MB';

revoke execute on function public.zapintel_conversa_aquecer from service_role;
