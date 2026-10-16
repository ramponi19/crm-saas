-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS.
--
-- Assunto único: quem pode ESCREVER nos modelos de contrato.
-- Ver docs/ACHADO-CONTRATOS-ESCRITA-20261016.md.
--
-- Hoje (conferido no catálogo em 16/10/2026): as políticas de INSERT/UPDATE/DELETE
-- de `contrato_documentos` e de INSERT/UPDATE de `contrato_modelos` exigem só
-- `empresa_id = get_empresa_id()`. Não olham o papel. A trava "só dono e admin"
-- existe apenas nas rotas (app/api/contrato-modelo e app/api/contrato-documentos),
-- e `authenticated` tem grant de escrita nas duas tabelas — então um vendedor
-- escreve o HTML do modelo direto pela API do Supabase, por fora da rota.
--
-- Depois: escrever exige a empresa atual E `is_empresa_admin(empresa_id)` — a
-- mesma função de configuracoes_sistema, filiais e empresa_usuarios: dono ou admin
-- ativo da empresa, ou superadmin SÓ na empresa que está impersonando agora (o
-- mesmo que a rota já aceita). SELECT não muda: o vendedor continua lendo o modelo
-- para emitir o contrato no PDV.
--
-- Nenhum fluxo do app escreve nestas tabelas com sessão de vendedor (16/10): toda
-- escrita está nas duas rotas, atrás de requireEmpresaRoleApi(['owner','admin']);
-- editor, importador de PDF e troca de fundo sobem arquivo para o Storage, não
-- para estas tabelas; a emissão só lê; nenhuma função do banco escreve nelas.
--
-- DELETE em `contrato_modelos` continua SEM política (ninguém apaga uma versão
-- direto), como hoje. As versões ficam de propósito — o HTML arquivado em
-- contratos_venda aponta para os fundos delas — e somem só em cascata, quando o
-- documento é apagado (a cascata da FK não passa por RLS).
--
-- Fora deste arquivo (fase CRM): contratos_venda continua aceitando INSERT de
-- vendedor, porque é ele quem emite o contrato no PDV.
--
-- Teste: supabase/testes/contratos_escrita.sql.
-- VOLTA ATRÁS: bloco comentado no fim deste arquivo.
set local lock_timeout = '5s';  -- não fica preso atrás de escrita em andamento: falha e nada muda

-- Pré-condição: o estado de 16/10 (políticas antigas presentes, novas ausentes).
do $$ begin
  if (select count(*) from pg_policy where polrelid = 'public.contrato_documentos'::regclass
        and polname in ('doc_tenant_insert', 'doc_tenant_update', 'doc_tenant_delete')) <> 3
     or (select count(*) from pg_policy where polrelid = 'public.contrato_modelos'::regclass
        and polname in ('modelo_tenant_insert', 'modelo_tenant_update')) <> 2
     or exists (select 1 from pg_policy where polrelid in ('public.contrato_documentos'::regclass, 'public.contrato_modelos'::regclass)
        and polname like '%\_dono\_admin' escape '\')
  then raise exception '06: políticas de contrato não estão no estado esperado — nada foi alterado'; end if;
end $$;

-- contrato_documentos
drop policy doc_tenant_insert on public.contrato_documentos;
drop policy doc_tenant_update on public.contrato_documentos;
drop policy doc_tenant_delete on public.contrato_documentos;

create policy doc_insert_dono_admin on public.contrato_documentos for insert to authenticated
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
create policy doc_update_dono_admin on public.contrato_documentos for update to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
create policy doc_delete_dono_admin on public.contrato_documentos for delete to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));

-- contrato_modelos
drop policy modelo_tenant_insert on public.contrato_modelos;
drop policy modelo_tenant_update on public.contrato_modelos;

create policy modelo_insert_dono_admin on public.contrato_modelos for insert to authenticated
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
create policy modelo_update_dono_admin on public.contrato_modelos for update to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- VOLTA ATRÁS (devolve exatamente as políticas de 16/10). Descomentar e rodar:
--
-- set local lock_timeout = '5s';
-- drop policy if exists doc_insert_dono_admin on public.contrato_documentos;
-- drop policy if exists doc_update_dono_admin on public.contrato_documentos;
-- drop policy if exists doc_delete_dono_admin on public.contrato_documentos;
-- drop policy if exists modelo_insert_dono_admin on public.contrato_modelos;
-- drop policy if exists modelo_update_dono_admin on public.contrato_modelos;
-- create policy doc_tenant_insert on public.contrato_documentos for insert
--   with check (empresa_id = get_empresa_id());
-- create policy doc_tenant_update on public.contrato_documentos for update
--   using (empresa_id = get_empresa_id()) with check (empresa_id = get_empresa_id());
-- create policy doc_tenant_delete on public.contrato_documentos for delete
--   using (empresa_id = get_empresa_id());
-- create policy modelo_tenant_insert on public.contrato_modelos for insert
--   with check (empresa_id = get_empresa_id());
-- create policy modelo_tenant_update on public.contrato_modelos for update
--   using (empresa_id = get_empresa_id()) with check (empresa_id = get_empresa_id());
