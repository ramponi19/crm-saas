-- Fase final das views de compatibilidade, lote 7 (05/11/2026): canais.
--
-- Cai a view que ficou sem leitor (from, embed, tipo, literal, URL REST) no app, Edge e scripts:
--   canais_conectados -> canais
--
-- Nenhuma função, job, política ou view cita canais_conectados (conferido na produção).
-- A tabela tem os mesmos grants da view (authenticated nas 25 colunas) e a mesma RLS: a view era
-- security_invoker, então quem lê pela tabela enxerga exatamente o que enxergava pela view.
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote7.sql (com a Edge anterior).

drop view public.canais_conectados;
