-- 1.2 (DROP, roda DEPOIS do deploy): complementos_empresa sai. O app, a trava do banco
-- (zapintel_escopo) e o job zapintel-conversa-aquecer leem empresa_modulos('inteligencia') desde a
-- 20261021003400. Volta: restaurar só a tabela do dump da noite do deploy.
drop table if exists public.complementos_empresa;
