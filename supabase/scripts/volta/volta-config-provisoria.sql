-- VOLTA da M2 (20261123000500_config_provisoria): tira as três funções.
-- Antes: o app que chama config_valor/config_salvar (lib/config.ts) precisa ter voltado, e nenhuma função
-- do banco pode depender delas (M3 em diante). As linhas '<modulo>.<chave>' gravadas em
-- configuracoes_sistema ficam (não são apagadas): sem as funções, ninguém as lê.
drop function if exists public.config_salvar(text, text, jsonb, bigint);
drop function if exists public.config_valor(text, text, bigint);
drop function if exists public.config_valor_emp(bigint, text, text, bigint);
