-- ETAPA 1.1a — MOTOR DE CONFIGURAÇÃO DEFINITIVO, EXPANSÃO (25/11/2026; docs/etapa-1.1-plano.md §1, PDV v2 §A).
--
-- Troca o armazenamento da configuração provisória (20261123000500: envelope {empresa, lojas} em
-- configuracoes_sistema, chave '<modulo>.<chave>') pela tabela empresa_config, uma linha por empresa ou loja.
--
-- Compatível com o app no ar (expansão; a contração é a entrega 1.1h):
--   - config_valor_emp / config_valor / config_salvar mantêm NOME, ASSINATURA, RESPOSTA e CÓDIGOS DE ERRO.
--     As 15 funções do banco e os leitores do app que passam por elas não mudam;
--   - PONTE nos dois sentidos enquanto houver quem leia ou grave o envelope direto (telas de hoje, testes,
--     scripts de operação): config_salvar grava a tabela nova E o envelope; quem grava o envelope direto
--     (insert/update/delete em configuracoes_sistema numa chave '<modulo>.<chave>') tem a tabela nova
--     reconstruída pelo gatilho configuracoes_sistema_ponte. As chaves antigas sem ponto (horario_comercial,
--     roleta_leads:3, ...) não são tocadas;
--   - cada config_salvar grava auditoria (entidade 'config', antes e depois).
-- A permissão de escrita continua is_empresa_admin; a 1.1b troca por tem_permissao('config.editar').
--
-- Volta: supabase/scripts/volta/volta-empresa-config.sql (devolve os corpos provisórios; o envelope está
-- íntegro pela ponte).

create table if not exists public.empresa_config (
  id             bigint generated always as identity primary key,
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  filial_id      bigint references public.filiais(id) on delete cascade,   -- nulo = a empresa toda
  modulo         text not null check (modulo ~ '^[a-z][a-z0-9_]{0,62}$'),
  chave          text not null check (chave ~ '^[a-z][a-z0-9_]{0,62}$'),
  valor          jsonb not null check (valor <> 'null'::jsonb),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists empresa_config_unica
  on public.empresa_config (empresa_id, coalesce(filial_id, 0), modulo, chave);
create index if not exists empresa_config_chave_idx on public.empresa_config (empresa_id, modulo, chave);

comment on table public.empresa_config is
  'Configuração por empresa (filial_id nulo) e por loja. Leitura: config_valor / config_valor_emp (loja → empresa → null; o padrão vem do manifesto). Escrita: só config_salvar.';

alter table public.empresa_config enable row level security;
revoke all on table public.empresa_config from public, anon, authenticated;
grant select on table public.empresa_config to authenticated;
grant select, insert, update, delete on table public.empresa_config to service_role;

drop policy if exists empresa_config_select on public.empresa_config;
create policy empresa_config_select on public.empresa_config
  for select to authenticated
  using (empresa_id = (select public.get_empresa_id()));

-- ── Envelope → linhas (usado pela cópia e pela ponte) ──────────────────────────────────────────────────
-- Reconstrói as linhas de UMA chave a partir do envelope gravado em configuracoes_sistema (ou apaga, se o
-- envelope sumiu). Não audita: é cópia de um valor que já foi gravado por outro caminho.
create or replace function public.empresa_config_do_envelope(p_empresa bigint, p_chave_completa text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_modulo text := split_part(p_chave_completa, '.', 1);
  v_chave  text := substr(p_chave_completa, length(split_part(p_chave_completa, '.', 1)) + 2);
  v_env    jsonb;
  v_por    uuid;
  v_em     timestamptz;
  k        text;
  v        jsonb;
begin
  if p_chave_completa !~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$' then
    return;
  end if;
  select c.valor into v_env from public.configuracoes_sistema c where c.empresa_id = p_empresa and c.chave = p_chave_completa;

  delete from public.empresa_config e where e.empresa_id = p_empresa and e.modulo = v_modulo and e.chave = v_chave;
  if v_env is null then
    return;
  end if;

  v_por := case when coalesce(v_env ->> 'atualizado_por', '') ~ '^[0-9a-f-]{36}$' then (v_env ->> 'atualizado_por')::uuid end;
  v_em  := coalesce((v_env ->> 'atualizado_em')::timestamptz, now());

  if v_env ? 'empresa' and v_env -> 'empresa' <> 'null'::jsonb then
    insert into public.empresa_config (empresa_id, filial_id, modulo, chave, valor, atualizado_por, atualizado_em)
    values (p_empresa, null, v_modulo, v_chave, v_env -> 'empresa', v_por, v_em);
  end if;
  if jsonb_typeof(v_env -> 'lojas') = 'object' then
    for k, v in select * from jsonb_each(v_env -> 'lojas') loop
      if k ~ '^[0-9]+$' and v <> 'null'::jsonb
         and exists (select 1 from public.filiais f where f.id = k::bigint and f.empresa_id = p_empresa) then
        insert into public.empresa_config (empresa_id, filial_id, modulo, chave, valor, atualizado_por, atualizado_em)
        values (p_empresa, k::bigint, v_modulo, v_chave, v, v_por, v_em);
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.empresa_config_do_envelope(bigint, text) from public, anon, authenticated, service_role;

-- Linhas → envelope (formato provisório, para a ponte e para a resposta de config_salvar).
create or replace function public.empresa_config_envelope(p_empresa bigint, p_modulo text, p_chave text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
           'empresa', coalesce((select e.valor from public.empresa_config e
                                 where e.empresa_id = p_empresa and e.filial_id is null
                                   and e.modulo = p_modulo and e.chave = p_chave), 'null'::jsonb),
           'lojas',   coalesce((select jsonb_object_agg(e.filial_id::text, e.valor order by e.filial_id)
                                  from public.empresa_config e
                                 where e.empresa_id = p_empresa and e.filial_id is not null
                                   and e.modulo = p_modulo and e.chave = p_chave), '{}'::jsonb))
$$;
revoke all on function public.empresa_config_envelope(bigint, text, text) from public, anon, authenticated, service_role;

-- ── Cópia do que já existe, com prova ──────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_dif int;
begin
  for r in select c.empresa_id, c.chave from public.configuracoes_sistema c
            where c.chave ~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$' loop
    perform public.empresa_config_do_envelope(r.empresa_id, r.chave);
  end loop;

  -- Prova: para toda chave do envelope, empresa e cada loja, o valor da tabela nova = o do envelope.
  select count(*) into v_dif
    from public.configuracoes_sistema c
    cross join lateral (
      select 'empresa' as onde, null::bigint as filial, nullif(c.valor -> 'empresa', 'null'::jsonb) as v
      union all
      select 'loja', l.key::bigint, nullif(l.value, 'null'::jsonb)
        from jsonb_each(case when jsonb_typeof(c.valor -> 'lojas') = 'object' then c.valor -> 'lojas' else '{}'::jsonb end) l
       where l.key ~ '^[0-9]+$' and exists (select 1 from public.filiais f where f.id = l.key::bigint and f.empresa_id = c.empresa_id)
    ) x
   where c.chave ~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$'
     and x.v is distinct from (select e.valor from public.empresa_config e
                                where e.empresa_id = c.empresa_id
                                  and e.modulo = split_part(c.chave, '.', 1)
                                  and e.chave = substr(c.chave, length(split_part(c.chave, '.', 1)) + 2)
                                  and e.filial_id is not distinct from x.filial);
  if v_dif > 0 then
    raise exception 'EMPRESA_CONFIG_COPIA: % valores diferentes entre o envelope e a tabela nova', v_dif;
  end if;
end $$;

-- ── Ponte: envelope gravado direto → tabela nova ───────────────────────────────────────────────────────
create or replace function public.configuracoes_sistema_ponte()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- config_salvar grava as duas formas: não reconstruir a partir do envelope que ele mesmo escreveu
  if current_setting('nexus.config_salvando', true) = '1' then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.chave ~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$' then
    perform public.empresa_config_do_envelope(old.empresa_id, old.chave);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.chave ~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$' then
    perform public.empresa_config_do_envelope(new.empresa_id, new.chave);
  end if;
  return null;
end $$;
revoke all on function public.configuracoes_sistema_ponte() from public, anon, authenticated;

drop trigger if exists configuracoes_sistema_ponte on public.configuracoes_sistema;
create trigger configuracoes_sistema_ponte
  after insert or update or delete on public.configuracoes_sistema
  for each row execute function public.configuracoes_sistema_ponte();

-- ── Leitura: mesmo nome, assinatura e resposta; agora em empresa_config ────────────────────────────────
create or replace function public.config_valor_emp(p_empresa bigint, p_modulo text, p_chave text, p_filial bigint default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
           case when p_filial is not null then
             (select e.valor from public.empresa_config e
               where e.empresa_id = p_empresa and e.filial_id = p_filial and e.modulo = p_modulo and e.chave = p_chave)
           end,
           (select e.valor from public.empresa_config e
             where e.empresa_id = p_empresa and e.filial_id is null and e.modulo = p_modulo and e.chave = p_chave))
   where p_modulo ~ '^[a-z][a-z0-9_]{0,62}$'
     and p_chave ~ '^[a-z][a-z0-9_]{0,62}$'
$$;
revoke all on function public.config_valor_emp(bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function public.config_valor_emp(bigint, text, text, bigint) to service_role;

-- config_valor (sessão) não muda: chama config_valor_emp(get_empresa_id(), ...).

-- ── Escrita: mesmos códigos de erro; grava a tabela nova, o envelope (ponte) e a auditoria ─────────────
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
revoke all on function public.config_salvar(text, text, jsonb, bigint) from public, anon;
grant execute on function public.config_salvar(text, text, jsonb, bigint) to authenticated, service_role;

comment on function public.config_valor_emp(bigint, text, text, bigint) is
  'Configuração por empresa e loja (empresa_config): loja → empresa → null; o padrão fica no chamador (manifesto). Só service_role e funções do banco.';
comment on function public.config_salvar(text, text, jsonb, bigint) is
  'Grava em empresa_config (e no envelope provisório, ponte até a 1.1h); só dono/admin; loja da própria empresa; auditado.';
