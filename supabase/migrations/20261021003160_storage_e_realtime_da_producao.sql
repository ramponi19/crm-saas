-- O QUE FICA FORA DO public E NENHUMA MIGRAÇÃO CRIAVA (21/10/2026).
--
-- Os 5 buckets do Storage, as 13 políticas de storage.objects, a política de
-- realtime.messages do ZapIntel ao vivo e 3 tabelas da publicação supabase_realtime
-- existiam na produção por SQL aplicado direto (e pelo externos.sql do corte), não por
-- migração. Sem isto, o banco montado só pelas migrações (`supabase start`) subia sem
-- bucket nenhum e com o tempo real de acessos, chat interno e pedidos desligado.
--
-- Definições copiadas da produção em 21/10/2026 (pg_policies e storage.buckets).
-- Idempotente: na produção nada muda.

-- ── Buckets ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('chat-midia', 'chat-midia', false),
  ('contratos',  'contratos',  true),
  ('documentos', 'documentos', false),
  ('imoveis',    'imoveis',    true),
  ('produtos',   'produtos',   true)
on conflict (id) do nothing;

-- ── Políticas de storage.objects ────────────────────────────────────────────────────
-- A pasta raiz do objeto é o id da empresa: cada loja só mexe no que é dela.
drop policy if exists contratos_delete_do_tenant on storage.objects;
create policy contratos_delete_do_tenant on storage.objects for delete to authenticated
  using ((bucket_id = 'contratos') and ((storage.foldername(name))[1] = ((select public.get_empresa_id()))::text));
drop policy if exists contratos_leitura_do_tenant on storage.objects;
create policy contratos_leitura_do_tenant on storage.objects for select to authenticated
  using ((bucket_id = 'contratos') and ((storage.foldername(name))[1] = ((select public.get_empresa_id()))::text));
drop policy if exists contratos_upload_do_tenant on storage.objects;
create policy contratos_upload_do_tenant on storage.objects for insert to authenticated
  with check ((bucket_id = 'contratos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));

drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects for delete to public
  using ((bucket_id = 'documentos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));
drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects for insert to public
  with check ((bucket_id = 'documentos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));
drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects for select to public
  using ((bucket_id = 'documentos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));

drop policy if exists imoveis_auth_delete on storage.objects;
create policy imoveis_auth_delete on storage.objects for delete to authenticated using (bucket_id = 'imoveis');
drop policy if exists imoveis_auth_insert on storage.objects;
create policy imoveis_auth_insert on storage.objects for insert to authenticated with check (bucket_id = 'imoveis');
drop policy if exists imoveis_auth_update on storage.objects;
create policy imoveis_auth_update on storage.objects for update to authenticated using (bucket_id = 'imoveis');
drop policy if exists imoveis_public_read on storage.objects;
create policy imoveis_public_read on storage.objects for select to public using (bucket_id = 'imoveis');

drop policy if exists produtos_delete_do_tenant on storage.objects;
create policy produtos_delete_do_tenant on storage.objects for delete to authenticated
  using ((bucket_id = 'produtos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));
drop policy if exists produtos_leitura on storage.objects;
create policy produtos_leitura on storage.objects for select to public using (bucket_id = 'produtos');
drop policy if exists produtos_upload_do_tenant on storage.objects;
create policy produtos_upload_do_tenant on storage.objects for insert to authenticated
  with check ((bucket_id = 'produtos') and ((storage.foldername(name))[1] = (public.get_empresa_id())::text));

-- ── Realtime ────────────────────────────────────────────────────────────────────────
-- Canal de broadcast do ZapIntel ao vivo: cada um ouve só a própria empresa; o
-- superadmin ouve qualquer zapintel:*. realtime.messages só existe com o serviço de
-- realtime no ar, por isso a checagem.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists "zapintel ao vivo: ouvir a propria empresa" on realtime.messages;
    create policy "zapintel ao vivo: ouvir a propria empresa" on realtime.messages for select to authenticated
      using ((extension = 'broadcast') and (
        (realtime.topic() = ('zapintel:' || ((select public.get_empresa_id()))::text))
        or ((realtime.topic() like 'zapintel:%') and exists (
          select 1 from public.usuarios u where u.id = (select auth.uid()) and u.is_super_admin))));
  end if;
end $$;

-- Publicação: acessos (presença), mensagens_internas (chat interno) e pedidos (KDS).
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['acessos', 'mensagens_internas', 'pedidos'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
