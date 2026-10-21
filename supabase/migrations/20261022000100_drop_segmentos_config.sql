-- 1.1 (DROP, roda DEPOIS do deploy do app que lê presets_onboarding/empresa_menu/empresa_modulos).
-- A sincronização (20261021003200) roda na mesma janela, logo antes do deploy: o superadmin não
-- edita segmento no meio dela. Volta: restaurar só a tabela do dump da noite do deploy.
drop table if exists public.segmentos_config;
