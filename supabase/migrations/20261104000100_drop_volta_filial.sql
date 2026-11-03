-- Sai a volta do principal por loja (decisão do Lucas, 03/11/2026: entra no DROP da
-- próxima noite com migração).
--
-- ops.volta_filial_20261020 guardava a loja antiga das 131 linhas de conversas e
-- mensagens que a 20261021002800_principal_por_loja corrigiu. O prazo de 14 dias
-- venceu em 03/11; nada no app lê a tabela (só o script de volta, que sai junto:
-- supabase/scripts/limpeza/volta-principal-por-loja.sql).
--
-- Antes de aplicar: copiar as 131 linhas para dumps/ (fora do git) — o drop não volta.

drop table if exists ops.volta_filial_20261020;
