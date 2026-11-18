-- VOLTA da 20261118000100_plano_unico.sql (só se o app anterior voltar junto: o app novo cadastra no 'base').
-- O plano de cada empresa volta do que ficou guardado em ops.empresas_plano_legado_20261118.
begin;
alter table public.empresas disable trigger empresas_limites_do_plano;
update public.empresas e set plano = l.plano from ops.empresas_plano_legado_20261118 l where l.id = e.id;
-- Empresas criadas depois da migração (sem linha guardada) vão para o antigo padrão.
update public.empresas set plano = 'starter' where plano = 'base';
alter table public.empresas enable trigger empresas_limites_do_plano;
alter table public.empresas alter column plano set default 'starter';
alter table public.empresas drop constraint if exists empresas_plano_check;
alter table public.empresas add constraint empresas_plano_check check (plano in ('free', 'starter', 'pro', 'unlimited'));
alter table public.empresas drop column if exists cortesia;

update public.planos_config set ativo = (id <> 'free'), destaque = (id = 'pro'), updated_at = now() where id <> 'base';
delete from public.planos_config where id = 'base';
drop table if exists public.precos_adicionais;

-- Os aceites do DPA saem antes de o CHECK voltar a recusar o documento.
delete from public.termos_aceites where documento = 'dpa';
alter table public.termos_aceites drop constraint if exists termos_aceites_documento_check;
alter table public.termos_aceites add constraint termos_aceites_documento_check check (documento in ('termos', 'privacidade'));
commit;
