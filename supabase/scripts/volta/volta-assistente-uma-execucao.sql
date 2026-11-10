-- Volta de 20261110000300_assistente_uma_execucao. ANTES, voltar o app (o de antes usa a
-- assistente_status_conversas, que a migração não tocou). Depois:
drop function if exists public.assistente_status_leads(bigint, bigint, boolean, integer, integer, text);
drop function if exists public.assistente_leads_visiveis(bigint, bigint, uuid);
