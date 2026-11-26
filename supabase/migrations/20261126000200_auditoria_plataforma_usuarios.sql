-- ETAPA 1.1c — GATILHO DA AUDITORIA DA PLATAFORMA EM `usuarios` (26/11/2026; docs/etapa-1.1-plano.md §3.4).
--
-- Rotas do CRM gravam em `usuarios` com a chave de serviço (Equipe: editar e criar pessoa). Com o superadmin dentro da
-- empresa, a escrita passa a ir para a Auditoria como as demais (só nomes de campos: nome e e-mail são dado pessoal,
-- D-A1). A função (20261126000100) ignora a própria linha do superadmin (impersonação, loja atual).
--
-- SEPARADA da 0100 de propósito: DDL em `usuarios` sozinha, com lock_timeout curto e sem drop (lição do deadlock de
-- 25/11, memória migracao-ddl-deadlock). Volta: drop trigger zz_plataforma_auditar on public.usuarios.
set local lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_plataforma_auditar' and tgrelid = 'public.usuarios'::regclass) then
    create trigger zz_plataforma_auditar after insert or update or delete on public.usuarios
      for each row execute function public.plataforma_auditar_escrita();
  end if;
end $$;
