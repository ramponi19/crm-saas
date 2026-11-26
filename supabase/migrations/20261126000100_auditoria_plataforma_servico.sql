-- ETAPA 1.1c — AUDITORIA DA PLATAFORMA TAMBÉM NAS ROTAS COM CHAVE DE SERVIÇO (26/11/2026; achado do smoke de 25/11,
-- decisão do Lucas; docs/etapa-1.1-plano.md §3.4).
--
-- Antes: zz_plataforma_auditar só registrava a escrita quando auth.uid() era um superadmin impersonando. As rotas do
-- app que gravam com a chave de serviço (createServiceClient) chegam ao banco sem usuário: nenhuma linha na Auditoria.
--
-- Agora: o app manda, nas escritas feitas dentro de uma requisição de usuário logado, o id dele (conferido no servidor
-- de autenticação) no cabeçalho `x-nexus-usuario`. O PostgREST expõe os cabeçalhos em request.headers. O gatilho:
--   - usa auth.uid() como antes (sessão do próprio usuário);
--   - SÓ quando a requisição é de service_role (a chave secreta, que nenhum navegador tem) e não há auth.uid(),
--     lê o id do cabeçalho; vindo de anon/authenticated o cabeçalho é ignorado;
--   - continua conferindo no banco que o id é de um superadmin com impersonação ativa; qualquer outro id não gera
--     linha (escrita normal da equipe pelas rotas continua como sempre);
--   - grava como antes: tabela, id e NOMES dos campos alterados, sem valores (D-A1), com origem 'gatilho servico'.
-- E o gatilho passa a existir também em `empresas` (Minha empresa), `diagnostico_canais` e `assistente_config`, que
-- rotas do CRM gravam e estavam fora da lista da 0710. `usuarios` ganha o gatilho na 20261126000200, separada (DDL em
-- usuarios sozinha: lição do deadlock de 25/11); a função já ignora a própria linha do superadmin em usuarios.
-- Inventário completo das rotas: docs/etapa-1.1-auditoria-plataforma-rotas.md.
--
-- Compatível com o app no ar: só troca o corpo da função (mesma assinatura) e cria 3 gatilhos, cada um numa tabela,
-- com lock_timeout; sem drop (lição de 25/11). Volta: supabase/scripts/volta/volta-auditoria-plataforma-servico.sql.

set local lock_timeout = '5s';

create or replace function public.plataforma_auditar_escrita()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_via text := 'gatilho';
  v_emp bigint;
  v_campos jsonb;
  v_linha jsonb;
begin
  if v_uid is null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    begin
      v_uid := nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-nexus-usuario', '')::uuid;
    exception when others then
      v_uid := null;   -- cabeçalho malformado: não audita e não derruba a escrita
    end;
    v_via := 'gatilho servico';
  end if;
  if v_uid is null then return null; end if;
  select impersonando_empresa_id into v_emp from public.usuarios
   where id = v_uid and is_super_admin and impersonando_expires_at > now();
  if v_emp is null then return null; end if;

  v_linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- a própria linha do superadmin em usuarios (entrar/sair da empresa, trocar de loja) não é dado da empresa
  if tg_table_name = 'usuarios' and v_linha ->> 'id' = v_uid::text then return null; end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_campos
      from jsonb_object_keys(to_jsonb(new)) k
     where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  end if;
  insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, depois, origem)
  values (coalesce((v_linha ->> 'empresa_id')::bigint, v_emp), v_uid, v_uid, 'plataforma',
          tg_table_name || ':' || coalesce(v_linha ->> 'id', '?'), 'plataforma_' || lower(tg_op),
          case when v_campos is not null then jsonb_build_object('campos', v_campos) end, v_via);
  return null;
end $$;
revoke all on function public.plataforma_auditar_escrita() from public, anon, authenticated;

-- empresas: a linha não tem empresa_id; o gatilho usa a empresa impersonada (coalesce acima).
do $$
declare t text;
begin
  foreach t in array array['empresas', 'diagnostico_canais', 'assistente_config'] loop
    if to_regclass(format('public.%I', t)) is not null
       and not exists (select 1 from pg_trigger where tgname = 'zz_plataforma_auditar' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger zz_plataforma_auditar after insert or update or delete on public.%I for each row execute function public.plataforma_auditar_escrita()', t);
    end if;
  end loop;
end $$;
