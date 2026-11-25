-- VOLTA da 20261125000700_cargos_permissoes (etapa 1.1b).
-- Ordem: voltar o APP primeiro (promover o deploy anterior). Depois este script devolve os corpos de antes de
-- get_empresa_id, filiais_visiveis, prevent_privilege_escalation, set_impersonation, encerrar_impersonacao,
-- sessao_pode_escrever e config_salvar, e tira os gatilhos novos. Tabelas, colunas (cargo_id, empresa_ativa_id)
-- e as funções novas ficam: nada de antes depende delas; o papel (role) continua o mesmo de sempre.
begin;

CREATE OR REPLACE FUNCTION public.get_empresa_id()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_super    boolean;
  v_imp      bigint;
  v_expires  timestamptz;
  v_empresa  bigint;
BEGIN
  SELECT is_super_admin, impersonando_empresa_id, impersonando_expires_at
    INTO v_super, v_imp, v_expires
  FROM usuarios WHERE id = auth.uid();

  -- Super admin impersonating: only valid while TTL has not expired.
  IF v_super AND v_imp IS NOT NULL AND v_expires IS NOT NULL AND v_expires > now() THEN
    RETURN v_imp;
  END IF;

  -- Normal flow: active company link.
  SELECT empresa_id INTO v_empresa
  FROM empresa_usuarios
  WHERE usuario_id = auth.uid() AND ativo = TRUE
  LIMIT 1;

  RETURN v_empresa;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.filiais_visiveis()
 RETURNS bigint[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp   bigint;
  v_qtd   int;
  v_sel   bigint;
  v_papel text;
  v_casa  bigint;
  v_super boolean;
  v_todas bigint[];
begin
  v_emp := get_empresa_id();
  if v_emp is null then return array[]::bigint[]; end if;

  select count(*) into v_qtd from filiais where empresa_id = v_emp and ativo;
  select coalesce(array_agg(id), array[]::bigint[]) into v_todas
    from filiais where empresa_id = v_emp;

  -- Uma loja (ou nenhuma): nada a separar.
  if v_qtd < 2 then return v_todas || 0::bigint; end if;

  select is_super_admin into v_super from usuarios where id = auth.uid();
  select role, filial_id into v_papel, v_casa
    from empresa_usuarios
    where usuario_id = auth.uid() and empresa_id = v_emp and ativo
    limit 1;

  -- Dono, admin e suporte escolhem: uma loja, ou a rede inteira.
  if coalesce(v_super, false) or v_papel in ('owner', 'admin') then
    v_sel := filial_atual();
    if v_sel is not null then return array[v_sel]; end if;
    return v_todas || 0::bigint;
  end if;

  /**
   * Quem nao e dono nem admin ve a PROPRIA loja, e o seletor nao muda isso.
   *
   * Falha fechado por escolha, na mesma linha de lib/escopo.ts: papel que nao
   * pude determinar restringe. Sem loja atribuida, a pessoa fica na matriz — e a
   * tela de filiais mostra quantas pessoas estao nessa situacao, para o dono
   * atribuir. Se nao houver nem matriz, nao ve nada.
   */
  v_casa := coalesce(
    v_casa,
    (select id from filiais where empresa_id = v_emp and matriz and ativo limit 1)
  );
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $function$
;

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT is_super_admin INTO v_is_super
  FROM public.usuarios
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_super, false) THEN
    IF OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin THEN
      RAISE EXCEPTION 'Permission denied: cannot modify is_super_admin';
    END IF;
    IF OLD.impersonando_empresa_id IS DISTINCT FROM NEW.impersonando_empresa_id THEN
      RAISE EXCEPTION 'Permission denied: cannot modify impersonando_empresa_id';
    END IF;
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Permission denied: cannot modify role';
    END IF;
    IF OLD.modulos_acesso IS DISTINCT FROM NEW.modulos_acesso THEN
      RAISE EXCEPTION 'Permission denied: cannot modify modulos_acesso';
    END IF;
    IF OLD.permissoes IS DISTINCT FROM NEW.permissoes THEN
      RAISE EXCEPTION 'Permission denied: cannot modify permissoes';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_impersonation(p_empresa_id bigint, p_ttl_seconds integer DEFAULT 14400)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_super boolean;
begin
  select is_super_admin into v_is_super from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  if p_empresa_id is null then
    update public.usuarios
      set impersonando_empresa_id = null, impersonando_expires_at = null
      where id = auth.uid();
  else
    if not exists (select 1 from public.empresas where id = p_empresa_id) then
      raise exception 'Empresa % nao encontrada', p_empresa_id;
    end if;
    update public.usuarios
      set impersonando_empresa_id = p_empresa_id,
          impersonando_expires_at = now() + make_interval(secs => p_ttl_seconds)
      where id = auth.uid();
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.encerrar_impersonacao()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_super boolean;
begin
  -- Mesma checagem de `set_impersonation`: só superadmin mexe nisso. Sem ela, a
  -- função (que é SECURITY DEFINER, e portanto passa por cima do gatilho
  -- prevent_privilege_escalation) seria um caminho aberto para qualquer um.
  select is_super_admin into v_is_super from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  update public.usuarios
     set impersonando_empresa_id = null,
         impersonando_expires_at = null
   where id = auth.uid();
end;
$function$
;

create or replace function public.sessao_pode_escrever()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select e.status = 'ativo' from public.empresas e where e.id = public.get_empresa_id()), true)
$$;

create or replace function public.config_salvar(p_modulo text, p_chave text, p_valor jsonb, p_filial bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp    bigint := public.get_empresa_id();
  v_chave  text;
  v_antes  jsonb;
  v_depois jsonb;
  v_env    jsonb;
begin
  if v_emp is null then
    raise exception 'SEM_EMPRESA: sessão sem empresa' using errcode = 'P0001';
  end if;
  if not public.sessao_pode_escrever() then
    raise exception 'SOMENTE_LEITURA: a empresa está em modo somente leitura' using errcode = 'P0001';
  end if;
  if not public.is_empresa_admin(v_emp) then
    raise exception 'SEM_PERMISSAO: só dono ou administrador altera a configuração' using errcode = 'P0001';
  end if;
  if coalesce(p_modulo, '') !~ '^[a-z][a-z0-9_]{0,62}$' or coalesce(p_chave, '') !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'CHAVE_INVALIDA: módulo e chave em minúsculas, letras, números e _' using errcode = 'P0001';
  end if;
  -- segredo não mora aqui: fica no cofre / variável de ambiente
  if p_chave ~ '(token|secret|segredo|senha|password|passwd|api_?key|apikey|credencial|private_?key)' then
    raise exception 'CHAVE_PROIBIDA: segredo (token, chave de API, senha) não é guardado na configuração' using errcode = 'P0001';
  end if;
  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial and f.empresa_id = v_emp) then
    raise exception 'FILIAL_INVALIDA: a loja não é desta empresa' using errcode = 'P0001';
  end if;

  v_chave := p_modulo || '.' || p_chave;
  -- duas gravações da mesma chave ao mesmo tempo: a segunda espera e soma sobre a primeira
  perform pg_advisory_xact_lock(hashtext('config:' || v_emp || ':' || v_chave));

  select e.valor into v_antes from public.empresa_config e
   where e.empresa_id = v_emp and e.filial_id is not distinct from p_filial and e.modulo = p_modulo and e.chave = p_chave;

  if p_valor is null or p_valor = 'null'::jsonb then
    -- valor da loja nulo: volta a valer o da empresa; valor da empresa nulo: volta ao padrão
    delete from public.empresa_config e
     where e.empresa_id = v_emp and e.filial_id is not distinct from p_filial and e.modulo = p_modulo and e.chave = p_chave;
    v_depois := null;
  else
    update public.empresa_config e
       set valor = p_valor, atualizado_por = auth.uid(), atualizado_em = now()
     where e.empresa_id = v_emp and e.filial_id is not distinct from p_filial and e.modulo = p_modulo and e.chave = p_chave;
    if not found then
      insert into public.empresa_config (empresa_id, filial_id, modulo, chave, valor, atualizado_por, atualizado_em)
      values (v_emp, p_filial, p_modulo, p_chave, p_valor, auth.uid(), now());
    end if;
    v_depois := p_valor;
  end if;

  -- PONTE (sai na 1.1h): o envelope antigo continua igual ao que era, para quem ainda o lê direto.
  v_env := public.empresa_config_envelope(v_emp, p_modulo, p_chave)
           || jsonb_build_object('atualizado_por', auth.uid(), 'atualizado_em', now());
  perform set_config('nexus.config_salvando', '1', true);
  insert into public.configuracoes_sistema (empresa_id, chave, valor, updated_at)
  values (v_emp, v_chave, v_env, now())
  on conflict (empresa_id, chave) do update set valor = excluded.valor, updated_at = excluded.updated_at;
  perform set_config('nexus.config_salvando', '', true);

  if v_antes is distinct from v_depois then
    perform public.auditar_emp(v_emp, 'config', v_chave || coalesce('@' || p_filial, ''), 'alterar',
                               jsonb_build_object('valor', v_antes), jsonb_build_object('valor', v_depois),
                               null, 'config_salvar', p_filial);
  end if;
  return v_env;
end $$;

drop trigger if exists empresa_usuarios_cargo_papel on public.empresa_usuarios;
drop trigger if exists empresa_usuarios_dono_guarda on public.empresa_usuarios;
drop trigger if exists empresas_semear_cargos on public.empresas;
drop trigger if exists empresas_permissoes_ponte on public.empresas;
do $$
declare t text;
begin
  for t in select event_object_table from information_schema.triggers
            where trigger_schema = 'public' and trigger_name = 'zz_plataforma_auditar' group by 1 loop
    execute format('drop trigger if exists zz_plataforma_auditar on public.%I', t);
  end loop;
end $$;

drop policy if exists auditoria_eventos_select on public.auditoria_eventos;
create policy auditoria_eventos_select on public.auditoria_eventos
  for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) and (select public.is_empresa_admin(empresa_id)));

commit;
