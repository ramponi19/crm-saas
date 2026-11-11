-- Volta da 20261111000200_modelos_mensagem_rls_empresa: as políticas como estavam até 11/11/2026
-- (só quem tem vínculo ativo em empresa_usuarios; superadmin em impersonação não vê).
drop policy if exists modelos_leitura on public.modelos_mensagem;
drop policy if exists modelos_escrita on public.modelos_mensagem;

create policy modelos_leitura on public.modelos_mensagem
  for select
  using (exists (select 1 from public.empresa_usuarios eu
                 where eu.empresa_id = modelos_mensagem.empresa_id
                   and eu.usuario_id = (select auth.uid()) and eu.ativo = true));

create policy modelos_escrita on public.modelos_mensagem
  for all
  using (exists (select 1 from public.empresa_usuarios eu
                 where eu.empresa_id = modelos_mensagem.empresa_id
                   and eu.usuario_id = (select auth.uid())
                   and eu.role = any (array['owner','admin']) and eu.ativo = true))
  with check (exists (select 1 from public.empresa_usuarios eu
                 where eu.empresa_id = modelos_mensagem.empresa_id
                   and eu.usuario_id = (select auth.uid())
                   and eu.role = any (array['owner','admin']) and eu.ativo = true));
