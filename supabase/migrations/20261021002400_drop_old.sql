-- Limpeza de 20/10, item 2.7: as tabelas antigas que o corte (20/10 08:24) renomeou para
-- old_* saem. Nenhuma FK, view, função ou código aponta para elas; os gatilhos e os 6 índices
-- nunca usados delas saem junto. Volta: dumps/2026-10-21-limpeza/public.dump (20/10 10:42).
drop table if exists public.old_lead_mensagens, public.old_clientes, public.old_leads, public.old_canais_conectados;
