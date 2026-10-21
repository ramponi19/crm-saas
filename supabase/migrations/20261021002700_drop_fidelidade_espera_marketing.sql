-- Item 3.5 da limpeza: as tabelas das telas que saíram em 7f648fd (Fidelidade, Lista de
-- Espera, Marketing). Conferido em 20/10/2026 com o deploy novo no ar: 0 linhas nas três,
-- nenhuma FK, view, função ou cron que as cite, nenhuma leitura no código. Volta: restaurar
-- a tabela do dump de 20/10 10:42 (dumps/2026-10-21-limpeza/public.dump).
drop table if exists public.campanhas_fidelidade, public.lista_espera, public.solicitacoes_marketing;
