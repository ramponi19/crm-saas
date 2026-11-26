-- VOLTA da 20261126000700_config_padroes_semente: tira os gatilhos e as funções. O que já foi gravado em empresas novas
-- FICA (é configuração válida, igual ao padrão que o chamador aplicaria).
begin;
set local lock_timeout = '5s';
drop trigger if exists empresas_semear_config on public.empresas;
drop trigger if exists empresa_modulos_semear_config on public.empresa_modulos;
drop function if exists public.config_semear_empresa_nova();
drop function if exists public.config_semear_modulo_instalado();
drop function if exists public.config_semear(bigint, text);
drop function if exists public.config_padroes();
commit;
