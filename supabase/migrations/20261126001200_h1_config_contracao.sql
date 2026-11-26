-- 1.1h PARTE 2, H1 (contração da configuração; docs/etapa-1.1-plano.md §5.4). SÓ DEPOIS do passo 1 (app) no ar:
-- nenhum leitor do app usa mais o envelope `modulo.chave` em configuracoes_sistema nem o formato antigo do horário.
--   - config_salvar para de escrever o envelope (devolve o envelope montado da tabela nova, como antes);
--   - backup e remoção das linhas `modulo.chave` e de `horario_comercial`/`horario` (na produção: 5 linhas, só da JM);
--   - o gatilho configuracoes_sistema_ponte é desligado (a função fica até a 1.1g-config);
--   - core_horario lê só a tabela nova: loja → empresa → padrão fixo (seg–sex 9h–18h).
-- Valor efetivo de ninguém muda: desde a 1.1i toda empresa tem core.horario explícito (prova: efetivos.sql antes/depois).
-- Volta: supabase/scripts/volta/volta-h1-config-contracao.sql (restaura as linhas do backup, religa a ponte e os corpos).

set local lock_timeout = '5s';

create table if not exists public._backup_config_antiga_1_1h as
  select empresa_id, chave, valor, updated_at, now() as copiado_em
    from public.configuracoes_sistema
   where chave ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' or chave in ('horario_comercial', 'horario');
revoke all on public._backup_config_antiga_1_1h from anon, authenticated;
alter table public._backup_config_antiga_1_1h enable row level security;

create or replace function public.config_salvar(p_modulo text, p_chave text, p_valor jsonb, p_filial bigint DEFAULT NULL::bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp    bigint := public.get_empresa_id();
  v_chave  text;
  v_antes  jsonb;
  v_depois jsonb;
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
  if p_chave ~ '(token|secret|segredo|senha|password|passwd|api_?key|apikey|credencial|private_?key)' then
    raise exception 'CHAVE_PROIBIDA: segredo (token, chave de API, senha) não é guardado na configuração' using errcode = 'P0001';
  end if;
  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial and f.empresa_id = v_emp) then
    raise exception 'FILIAL_INVALIDA: a loja não é desta empresa' using errcode = 'P0001';
  end if;

  v_chave := p_modulo || '.' || p_chave;
  perform pg_advisory_xact_lock(hashtext('config:' || v_emp || ':' || v_chave));

  select e.valor into v_antes from public.empresa_config e
   where e.empresa_id = v_emp and e.filial_id is not distinct from p_filial and e.modulo = p_modulo and e.chave = p_chave;

  if p_valor is null or p_valor = 'null'::jsonb then
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

  if v_antes is distinct from v_depois then
    perform public.auditar_emp(v_emp, 'config', v_chave || coalesce('@' || p_filial, ''), 'alterar',
                               jsonb_build_object('valor', v_antes), jsonb_build_object('valor', v_depois),
                               null, 'config_salvar', p_filial);
  end if;
  -- 1.1h: o envelope antigo não é mais gravado; devolve o mesmo formato, montado da tabela nova.
  return public.empresa_config_envelope(v_emp, p_modulo, p_chave)
         || jsonb_build_object('atualizado_por', auth.uid(), 'atualizado_em', now());
end $function$;

alter table public.configuracoes_sistema disable trigger configuracoes_sistema_ponte;

delete from public.configuracoes_sistema
 where chave ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' or chave in ('horario_comercial', 'horario');

create or replace function public.core_horario(p_empresa bigint, p_filial bigint DEFAULT NULL::bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  -- 1.1h: sem o formato antigo; rede de segurança = o padrão de sempre
  return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
end $function$;
