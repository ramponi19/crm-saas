-- MODELOS DA META: a RLS passa a seguir get_empresa_id(), como o resto do CRM (11/11/2026).
--
-- As duas políticas de `modelos_mensagem` exigiam vínculo em `empresa_usuarios`. O superadmin em
-- impersonação não tem vínculo: a tela da Transmissão mostrava "nenhum modelo aprovado" e o
-- `criar` recusava ("Escolha um modelo.") — achado no smoke de 11/11. Fica igual a `automacoes`:
-- lê quem está na empresa (get_empresa_id, que já cobre a impersonação com prazo); escreve quem é
-- dono/admin DELA (is_empresa_admin, que só aceita o superadmin na empresa que ele impersona agora).
--
-- Efeito para os usuários de sempre: nenhum. Quem tem vínculo ativo continua vendo os modelos da
-- empresa do vínculo; dono/admin continua escrevendo. Volta: supabase/scripts/volta/volta-modelos-rls.sql

drop policy if exists modelos_leitura on public.modelos_mensagem;
drop policy if exists modelos_escrita on public.modelos_mensagem;

create policy modelos_leitura on public.modelos_mensagem
  for select
  using (empresa_id = (select public.get_empresa_id()));

create policy modelos_escrita on public.modelos_mensagem
  for all
  using (empresa_id = (select public.get_empresa_id()) and public.is_empresa_admin(empresa_id))
  with check (empresa_id = (select public.get_empresa_id()) and public.is_empresa_admin(empresa_id));
