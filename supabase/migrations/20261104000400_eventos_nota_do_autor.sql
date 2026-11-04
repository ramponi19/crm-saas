-- Nota interna da conversa editável e apagável PELO AUTOR (decisão do Lucas, 04/11/2026).
--
-- A Inbox (/comunicacao) grava a nota em `eventos` (tipo 'conversa.nota', entidade
-- 'conversa'). Até aqui `eventos` não aceitava UPDATE nem DELETE de ninguém
-- (using false): é o histórico do sistema (negocio.pegar, fusões, superadmin).
-- Isso continua valendo para todo outro tipo de evento. Só a nota muda, e só para
-- quem a escreveu, dentro da própria empresa.
--
-- E como "autor" passa a dar permissão, a nota precisa nascer com o autor
-- verdadeiro: o INSERT de 'conversa.nota' exige por_usuario = quem está logado.
-- Os outros eventos seguem como antes (a fusão e o superadmin gravam pela chave
-- de serviço, que não passa por RLS).
--
-- Volta: dumps/2026-11-04-manha/volta-eventos-notas.sql (políticas lidas da produção).

drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (
    empresa_id = (select get_empresa_id())
    and (tipo <> 'conversa.nota' or por_usuario = (select auth.uid()))
  );

drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (
    tipo = 'conversa.nota'
    and por_usuario = (select auth.uid())
    and empresa_id = (select get_empresa_id())
  )
  with check (
    tipo = 'conversa.nota'
    and por_usuario = (select auth.uid())
    and empresa_id = (select get_empresa_id())
  );

drop policy if exists eventos_delete on public.eventos;
create policy eventos_delete on public.eventos for delete to authenticated
  using (
    tipo = 'conversa.nota'
    and por_usuario = (select auth.uid())
    and empresa_id = (select get_empresa_id())
  );
