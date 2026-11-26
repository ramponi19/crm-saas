-- VOLTA da 20261126001200 (H1, contração da configuração): devolve as linhas antigas do backup, religa a ponte e
-- os corpos de antes de config_salvar (volta a gravar o envelope) e core_horario (volta a ler horario_comercial).
begin;
set local lock_timeout = '5s';
insert into public.configuracoes_sistema (empresa_id, chave, valor, updated_at)
  select empresa_id, chave, valor, updated_at from public._backup_config_antiga_1_1h
  on conflict (empresa_id, chave) do update set valor = excluded.valor, updated_at = excluded.updated_at;
alter table public.configuracoes_sistema enable trigger configuracoes_sistema_ponte;
CREATE OR REPLACE FUNCTION public.config_salvar(p_modulo text, p_chave text, p_valor jsonb, p_filial bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if not public.tem_permissao('config.editar') then
    raise exception 'SEM_PERMISSAO: sem permissão para alterar a configuração' using errcode = 'P0001';
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
end $function$

;
CREATE OR REPLACE FUNCTION public.core_horario(p_empresa bigint, p_filial bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb;
begin
  if p_filial is not null then
    select e.valor into v from public.empresa_config e
     where e.empresa_id = p_empresa and e.filial_id = p_filial and e.modulo = 'core' and e.chave = 'horario';
    if public.core_horario_valido(v) then return v; end if;
  end if;
  select e.valor into v from public.empresa_config e
   where e.empresa_id = p_empresa and e.filial_id is null and e.modulo = 'core' and e.chave = 'horario';
  if public.core_horario_valido(v) then return v; end if;
  v := public.core_horario_do_antigo((select valor from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'horario_comercial'));
  if v is not null then return v; end if;
  return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
end $function$

;
commit;
