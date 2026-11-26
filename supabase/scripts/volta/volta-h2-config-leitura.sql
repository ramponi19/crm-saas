-- VOLTA da 20261126001300 (H2): políticas de empresa_config e auditoria_eventos e config_valor como antes.
-- A tabela config_chave_leitura e a função config_pode_ler ficam (sem uso).
begin;
set local lock_timeout = '5s';
alter policy empresa_config_select on public.empresa_config using (empresa_id = (select public.get_empresa_id()));
alter policy auditoria_eventos_select on public.auditoria_eventos
  using (empresa_id = (select public.get_empresa_id()) and (select public.tem_permissao('auditoria.ver')));
create or replace function public.config_valor(p_modulo text, p_chave text, p_filial bigint DEFAULT NULL::bigint)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$ select public.config_valor_emp(public.get_empresa_id(), p_modulo, p_chave, p_filial) $function$;
commit;
