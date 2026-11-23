-- Volta da 20261123000800_zapintel_work_mem_de_volta: deixa as 3 funções do painel como a 4A deixou
-- (sem work_mem). As outras 7 já tinham work_mem antes da 0800 e continuam com ele. A permissão do
-- zapintel_conversa_aquecer não volta: na produção o service_role nunca a teve.
alter function public.zapintel_dashboard(bigint, bigint, text) reset work_mem;
alter function public.zapintel_dashboard_lista(text, text, bigint, bigint, text) reset work_mem;
alter function public.zapintel_leads_lista(jsonb, text, integer, integer, bigint, bigint, text) reset work_mem;
