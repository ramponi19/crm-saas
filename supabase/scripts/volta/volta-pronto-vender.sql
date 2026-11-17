-- VOLTA de 20261117000100_pronto_vender.sql. Ordem: primeiro o app anterior (sem o "CRM geral" como
-- padrão e sem a tela de aceite), depois este script.

-- 1. Storage imoveis: as políticas antigas (sem pasta por empresa).
drop policy if exists imoveis_upload_do_tenant on storage.objects;
drop policy if exists imoveis_update_do_tenant on storage.objects;
drop policy if exists imoveis_delete_do_tenant on storage.objects;
create policy imoveis_auth_insert on storage.objects for insert to authenticated with check (bucket_id = 'imoveis');
create policy imoveis_auth_update on storage.objects for update to authenticated using (bucket_id = 'imoveis');
create policy imoveis_auth_delete on storage.objects for delete to authenticated using (bucket_id = 'imoveis');

-- 2. Planos (falha de propósito se já houver empresa no Unlimited: trocar antes).
drop trigger if exists empresas_limites_do_plano on public.empresas;
drop function if exists public.empresa_limites_do_plano();
alter table public.empresas drop constraint if exists empresas_plano_check;
alter table public.empresas add constraint empresas_plano_check check (plano = any (array['free'::text, 'starter'::text, 'pro'::text]));
alter table public.empresas drop constraint if exists empresas_stripe_status_check;
alter table public.empresas add constraint empresas_stripe_status_check
  check (stripe_status = any (array['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text]));

-- 3. Modo só leitura.
do $$
declare t text;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname like 'somente_leitura_%' loop
    execute format('drop policy if exists somente_leitura_insert on public.%I', t);
    execute format('drop policy if exists somente_leitura_update on public.%I', t);
    execute format('drop policy if exists somente_leitura_delete on public.%I', t);
  end loop;
end $$;
drop function if exists public.sessao_pode_escrever();

-- 4. Presets como estavam.
delete from public.presets_onboarding where chave = 'geral';
update public.presets_onboarding p set nome = a.nome, descricao = a.descricao, modulos = a.modulos, etapas = a.etapas,
  campos = a.campos, motivos_perda = a.motivos_perda, rotulos = a.rotulos, ativo = a.ativo, updated_at = now()
  from ops.presets_antes_20261117 a where a.chave = p.chave;

-- 5. Linhas antigas de empresa_modulos.
insert into public.empresa_modulos select * from ops.empresa_modulos_legado_20261117 on conflict do nothing;

-- 6. Aceites (a tabela só some se estiver vazia; com aceite gravado, decidir antes).
do $$ begin
  if not exists (select 1 from public.termos_aceites) then drop table public.termos_aceites; end if;
end $$;
