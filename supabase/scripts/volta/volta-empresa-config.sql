-- VOLTA da 20261125000400_empresa_config (etapa 1.1a).
-- Ordem: voltar o APP primeiro (promover o deploy anterior). Depois este script:
--   1. devolve os corpos provisórios de config_valor_emp e config_salvar (lendo e gravando o envelope);
--   2. tira a ponte e as funções auxiliares;
--   3. guarda empresa_config em ops.empresa_config_volta_<data> e a remove.
-- O envelope em configuracoes_sistema está íntegro: a ponte o manteve igual à tabela nova o tempo todo.
-- Conferir antes: select count(*) from public.configuracoes_sistema where chave ~ '^[a-z][a-z0-9_]{0,62}\.';
begin;

create or replace function public.config_valor_emp(p_empresa bigint, p_modulo text, p_chave text, p_filial bigint default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
           case when p_filial is not null then nullif(c.valor -> 'lojas' -> p_filial::text, 'null'::jsonb) end,
           nullif(c.valor -> 'empresa', 'null'::jsonb))
    from public.configuracoes_sistema c
   where c.empresa_id = p_empresa
     -- só o formato novo: módulo e chave validados, nunca uma chave antiga da tabela
     and p_modulo ~ '^[a-z][a-z0-9_]{0,62}$'
     and p_chave ~ '^[a-z][a-z0-9_]{0,62}$'
     and c.chave = p_modulo || '.' || p_chave
$$;
revoke all on function public.config_valor_emp(bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function public.config_valor_emp(bigint, text, text, bigint) to service_role;

create or replace function public.config_salvar(p_modulo text, p_chave text, p_valor jsonb, p_filial bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp   bigint := public.get_empresa_id();
  v_chave text;
  v_env   jsonb;
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

  select c.valor into v_env from public.configuracoes_sistema c where c.empresa_id = v_emp and c.chave = v_chave;
  v_env := jsonb_build_object('empresa', coalesce(v_env -> 'empresa', 'null'::jsonb),
                              'lojas',   coalesce(v_env -> 'lojas', '{}'::jsonb));
  if p_filial is null then
    v_env := jsonb_set(v_env, '{empresa}', coalesce(p_valor, 'null'::jsonb));
  elsif p_valor is null or p_valor = 'null'::jsonb then
    v_env := jsonb_set(v_env, '{lojas}', (v_env -> 'lojas') - p_filial::text);
  else
    v_env := jsonb_set(v_env, array['lojas', p_filial::text], p_valor);
  end if;
  v_env := v_env || jsonb_build_object('atualizado_por', auth.uid(), 'atualizado_em', now());

  insert into public.configuracoes_sistema (empresa_id, chave, valor, updated_at)
  values (v_emp, v_chave, v_env, now())
  on conflict (empresa_id, chave) do update set valor = excluded.valor, updated_at = excluded.updated_at;
  return v_env;
end $$;
revoke all on function public.config_salvar(text, text, jsonb, bigint) from public, anon;
grant execute on function public.config_salvar(text, text, jsonb, bigint) to authenticated, service_role;

drop trigger if exists configuracoes_sistema_ponte on public.configuracoes_sistema;
drop function if exists public.configuracoes_sistema_ponte();
drop function if exists public.empresa_config_envelope(bigint, text, text);
drop function if exists public.empresa_config_do_envelope(bigint, text);

create schema if not exists ops;
create table if not exists ops.empresa_config_volta as select * from public.empresa_config;
drop table if exists public.empresa_config;

commit;
