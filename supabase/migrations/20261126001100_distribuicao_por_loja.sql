-- 5b. DISTRIBUIÇÃO POR LOJA, num lugar só (26/11/2026; docs/lojas-e-distribuicao-plano.md §2 5b; decisões do Lucas de 26/11).
--
-- Por loja, listas de pessoas (Configurações › Vendas e atendimento › Distribuição, uma aba por loja):
--   roleta            quem recebe leads e acompanhamentos pela roleta da loja;
--   liberacao         quem recebe o lote da liberação diária (começa igual à roleta; editável à parte);
--   reserva_posvenda  lista ORDENADA: depois da roleta da loja e ANTES dos administradores e Donos (que ficam como última
--                     reserva); pula quem está ausente e quem já está no teto do dia (resolve a P1);
-- e por pessoa a LOJA DA COMISSÃO (só muda onde a pessoa aparece em Metas e Comissões; a venda continua com a loja em que
-- foi feita).
--
-- COMPATÍVEL COM O APP NO AR: lista sem cabeçalho em `distribuicao_listas` = a regra de hoje (vínculo + `participa_roleta`).
-- A semente (0110) configura a roleta e a liberação de cada loja com exatamente quem é elegível hoje; a reserva começa vazia
-- (= direto para administradores e Donos, como hoje). Ausente continua sendo pulado na hora (é estado, não lista).
-- Gravação só por função (distribuicao_salvar, comissao_loja_salvar): dono/administrador/superadmin; só entra na lista de
-- uma loja quem enxerga a loja (5a); cada mudança vai para a Auditoria (antes → depois).
-- Volta: supabase/scripts/volta/volta-distribuicao-por-loja.sql

set local lock_timeout = '5s';

create table if not exists public.distribuicao_listas (
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  filial_id      bigint not null references public.filiais(id) on delete cascade,
  lista          text   not null check (lista in ('roleta', 'liberacao', 'reserva_posvenda')),
  configurada_em timestamptz not null default now(),
  configurada_por uuid,
  primary key (empresa_id, filial_id, lista)
);
create table if not exists public.distribuicao_participantes (
  empresa_id bigint not null,
  filial_id  bigint not null,
  lista      text   not null,
  usuario_id uuid   not null references public.usuarios(id) on delete cascade,
  ordem      int    not null default 0,
  primary key (empresa_id, filial_id, lista, usuario_id),
  foreign key (empresa_id, filial_id, lista) references public.distribuicao_listas (empresa_id, filial_id, lista) on delete cascade
);
create index if not exists distribuicao_participantes_usuario_idx on public.distribuicao_participantes (usuario_id);
create table if not exists public.empresa_usuario_comissao (
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  usuario_id uuid   not null references public.usuarios(id) on delete cascade,
  filial_id  bigint not null references public.filiais(id) on delete cascade,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  primary key (empresa_id, usuario_id)
);
create index if not exists empresa_usuario_comissao_filial_idx on public.empresa_usuario_comissao (filial_id);
comment on table public.distribuicao_listas is '5b: listas de distribuição configuradas por loja. Sem linha = a regra antiga. Grava só por distribuicao_salvar.';
comment on table public.empresa_usuario_comissao is '5b: loja em que a pessoa aparece em Metas e Comissões. Sem linha = a loja principal. Grava só por comissao_loja_salvar.';

do $rls$
declare t text;
begin
  foreach t in array array['distribuicao_listas', 'distribuicao_participantes', 'empresa_usuario_comissao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id = public.get_empresa_id() or public.is_super_admin())', t || '_leitura', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $rls$;

-- A lista configurada (ordem, depois usuário) ou NULL quando a loja não tem essa lista configurada.
create or replace function public.distribuicao_lista(p_empresa bigint, p_filial bigint, p_lista text)
 returns uuid[]
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when exists (select 1 from public.distribuicao_listas where empresa_id = p_empresa and filial_id = p_filial and lista = p_lista)
    then coalesce((select array_agg(usuario_id order by ordem, usuario_id) from public.distribuicao_participantes
                    where empresa_id = p_empresa and filial_id = p_filial and lista = p_lista), '{}'::uuid[])
  end
$function$;
revoke all on function public.distribuicao_lista(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.distribuicao_lista(bigint, bigint, text) to service_role;

-- Loja-alvo de uma distribuição: a pedida, senão a matriz; numa empresa de uma loja só, essa loja.
create or replace function public.distribuicao_loja_alvo(p_empresa bigint, p_filial bigint)
 returns bigint
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select id from public.filiais where id = p_filial and empresa_id = p_empresa and ativo),
    (select id from public.filiais where empresa_id = p_empresa and matriz and ativo order by id limit 1),
    (select id from public.filiais where empresa_id = p_empresa and ativo order by id limit 1))
$function$;

-- Roleta de leads (e base da liberação e do pós-venda): a lista da loja, se configurada; senão a regra de hoje.
create or replace function public.core_roleta_elegiveis(p_empresa bigint, p_filial bigint)
 returns uuid[]
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_lista uuid[];
begin
  v_lista := public.distribuicao_lista(p_empresa, public.distribuicao_loja_alvo(p_empresa, p_filial), 'roleta');
  if v_lista is not null then
    return (select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
              from public.empresa_usuarios eu
             where eu.empresa_id = p_empresa and eu.usuario_id = any (v_lista)
               and eu.ativo and not coalesce(eu.ausente, false) and not eu.conta_servico);
  end if;
  return (
    with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo),
         alvo as (select coalesce(p_filial, (select id from lojas where matriz order by id limit 1)) id)
    select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
      from public.empresa_usuarios eu
     where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
       and not eu.conta_servico and eu.participa_roleta and eu.usuario_id is not null
       and ((select count(*) from lojas) < 2
            or eu.filial_id = (select id from alvo)
            or (eu.filial_id is null and (select id from alvo) = (select id from lojas where matriz order by id limit 1))));
end $function$;
revoke all on function public.core_roleta_elegiveis(bigint, bigint) from public, anon, authenticated;
grant execute on function public.core_roleta_elegiveis(bigint, bigint) to service_role;

create or replace function public.core_roleta_leads_proximo(p_empresa bigint, p_filial bigint, p_excluir uuid[] DEFAULT '{}'::uuid[])
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lojas int; v_matriz bigint; v_alvo bigint; v_chave text; v_ids uuid[]; v_ultimo uuid; v_idx int; v_prox uuid;
begin
  select count(*), (array_agg(id order by id) filter (where matriz))[1] into v_lojas, v_matriz
    from public.filiais where empresa_id = p_empresa and ativo;
  if v_lojas >= 2 then
    v_alvo := coalesce(p_filial, v_matriz);
    if v_alvo is null then return null; end if;
  end if;
  v_chave := case when v_lojas < 2 then 'roleta_leads' else 'roleta_leads:' || v_alvo end;
  perform pg_advisory_xact_lock(hashtext(p_empresa || ':' || v_chave));
  -- 5b: a mesma regra da roleta (lista da loja, ou a regra antiga), menos os excluídos
  select coalesce(array_agg(x order by x), '{}') into v_ids
    from unnest(public.core_roleta_elegiveis(p_empresa, coalesce(v_alvo, p_filial))) x
   where not (x = any(coalesce(p_excluir, '{}')));
  if cardinality(v_ids) = 0 then return null; end if;
  select nullif(valor ->> 'ultimo_usuario_id', '')::uuid into v_ultimo
    from public.configuracoes_sistema where empresa_id = p_empresa and chave = v_chave;
  v_idx := coalesce(array_position(v_ids, v_ultimo), 0);
  v_prox := v_ids[(v_idx % cardinality(v_ids)) + 1];
  insert into public.configuracoes_sistema (empresa_id, chave, valor)
  values (p_empresa, v_chave, jsonb_build_object('ultimo_usuario_id', v_prox))
  on conflict (empresa_id, chave) do update set valor = excluded.valor;
  return v_prox;
end $function$;

-- Liberação diária: a lista própria da loja, se configurada; senão a roleta.
create or replace function public.core_liberacao_elegiveis(p_empresa bigint, p_filial bigint)
 returns uuid[]
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_lista uuid[];
begin
  v_lista := public.distribuicao_lista(p_empresa, public.distribuicao_loja_alvo(p_empresa, p_filial), 'liberacao');
  if v_lista is null then return public.core_roleta_elegiveis(p_empresa, p_filial); end if;
  return (select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
            from public.empresa_usuarios eu
           where eu.empresa_id = p_empresa and eu.usuario_id = any (v_lista)
             and eu.ativo and not coalesce(eu.ausente, false) and not eu.conta_servico);
end $function$;
revoke all on function public.core_liberacao_elegiveis(bigint, bigint) from public, anon, authenticated;
grant execute on function public.core_liberacao_elegiveis(bigint, bigint) to service_role;

create or replace function public.core_liberar_lote_esteira(p_empresa bigint, p_filial bigint DEFAULT NULL::bigint, p_por uuid DEFAULT NULL::uuid, p_agora timestamp with time zone DEFAULT now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  MOTIVO constant text := 'liberação diária da esteira';
  v_fuso text := coalesce(public.empresa_fuso(p_empresa), 'America/Sao_Paulo');
  v_hoje date := (p_agora at time zone v_fuso)::date;
  v_hora time := (p_agora at time zone v_fuso)::time;
  l record; cfg jsonb; v_por int; v_dias int; v_vend uuid[]; v_cota int[]; v_res jsonb := '{}'; r record;
  i int; v_h bigint; v_feitos int; v_abre time;
begin
  for l in select id from public.filiais where empresa_id = p_empresa and ativo and (p_filial is null or id = p_filial) order by id loop
    cfg := public.config_valor_emp(p_empresa, 'distribuicao', 'liberacao_diaria', l.id);
    if cfg is null or coalesce((cfg ->> 'ativo')::boolean, false) is not true then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'desligado')); continue;
    end if;
    if not public.core_abre_no_dia(p_empresa, l.id, v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'loja fechada hoje')); continue;
    end if;
    select min((i2 ->> 'abre')::time) into v_abre from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, l.id, v_hoje)) i2;
    if v_hora < v_abre then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'antes da abertura')); continue;
    end if;
    if coalesce((cfg ->> 'pular_primeiro_dia')::boolean, false) and public.core_primeiro_dia_aberto_da_semana(p_empresa, l.id, v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'primeiro dia de abertura da semana')); continue;
    end if;
    perform pg_advisory_xact_lock(hashtext('liberacao:' || p_empresa || ':' || l.id));
    if exists (select 1 from public.negocio_historico h join public.negocios n on n.id = h.negocio_id
                where h.empresa_id = p_empresa and n.filial_id = l.id and h.acao = 'atribuir' and h.detalhe ->> 'motivo' = MOTIVO
                  and (h.em at time zone v_fuso)::date = v_hoje) then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'já liberado hoje')); continue;
    end if;
    v_por := greatest(coalesce(nullif(cfg ->> 'por_vendedor', '')::int, 10), 0);
    v_dias := greatest(coalesce(nullif(cfg ->> 'dias_cliente', '')::int, 14), 1);
    v_vend := public.core_liberacao_elegiveis(p_empresa, l.id);   -- 5b: a lista da liberação (ou a roleta)
    if cardinality(v_vend) = 0 or v_por = 0 then
      v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('pulado', 'ninguém na roleta')); continue;
    end if;
    v_cota := array_fill(0, array[cardinality(v_vend)]);
    i := 0; v_feitos := 0;
    for r in
      select n.id, max(c.ultima_recebida_at) ur
        from public.negocios n
        join public.conversas c on c.empresa_id = n.empresa_id and c.contato_id = n.contato_id
        left join public.funis f on f.id = n.funil_id
       where n.empresa_id = p_empresa and n.filial_id = l.id and n.status = 'aberto' and n.ativo and n.responsavel_id is null
         and not coalesce(f.interno, false)
       group by n.id
      having max(c.ultima_recebida_at) >= p_agora - make_interval(days => v_dias)
       order by max(c.ultima_recebida_at) desc, n.id
       limit v_por * cardinality(v_vend)
    loop
      i := (v_feitos % cardinality(v_vend)) + 1;
      perform public.negocio_atribuir(r.id, v_vend[i], 'atribuir', p_por);
      select max(id) into v_h from public.negocio_historico where negocio_id = r.id and acao = 'atribuir' and para_responsavel = v_vend[i];
      update public.negocio_historico set detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object('motivo', MOTIVO) where id = v_h;
      v_cota[i] := v_cota[i] + 1; v_feitos := v_feitos + 1;
    end loop;
    v_res := v_res || jsonb_build_object(l.id::text, jsonb_build_object('liberados', v_feitos,
               'por_pessoa', (select jsonb_object_agg(v_vend[k]::text, v_cota[k]) from generate_subscripts(v_vend, 1) k)));
  end loop;
  return v_res;
end $function$;

-- Roleta do pós-venda da loja: a roleta da loja (lista, se configurada), só cargo vendedor, como hoje.
create or replace function public.posvenda_vendedores_da_loja(p_empresa bigint, p_filial bigint)
 returns uuid[]
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_lista uuid[];
begin
  v_lista := public.distribuicao_lista(p_empresa, public.distribuicao_loja_alvo(p_empresa, p_filial), 'roleta');
  if v_lista is not null then
    return (select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
              from public.empresa_usuarios eu
             where eu.empresa_id = p_empresa and eu.usuario_id = any (v_lista)
               and eu.ativo and not coalesce(eu.ausente, false) and eu.role = 'vendedor' and not eu.conta_servico);
  end if;
  return (
    with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo)
    select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
      from public.empresa_usuarios eu
     where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
       and eu.role = 'vendedor' and eu.usuario_id is not null
       and not eu.conta_servico and eu.participa_roleta
       and ((select count(*) from lojas) < 2
            or eu.filial_id = p_filial
            or (eu.filial_id is null and p_filial = (select id from lojas where matriz order by id limit 1))));
end $function$;
revoke all on function public.posvenda_vendedores_da_loja(bigint, bigint) from public, anon, authenticated;
grant execute on function public.posvenda_vendedores_da_loja(bigint, bigint) to service_role;

-- origem nova do responsável do acompanhamento: a reserva da loja
alter table public.posvenda_acompanhamentos drop constraint if exists posvenda_acompanhamentos_origem_responsavel_check;
alter table public.posvenda_acompanhamentos add constraint posvenda_acompanhamentos_origem_responsavel_check
  check (origem_responsavel = any (array['vendedor', 'padrao_loja', 'roleta', 'reserva_loja', 'administradores', 'dono', 'manual'])) not valid;

create or replace function public.posvenda_resolver_responsavel(p_empresa bigint, p_filial bigint, p_tipo text, p_negocio bigint, p_dia date, p_excluir uuid[] DEFAULT '{}'::uuid[])
 returns table(responsavel_id uuid, origem text, dia date)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_excl uuid[] := coalesce(p_excluir, '{}');
  v_teto int := public.posvenda_teto_diario(p_empresa, p_filial);
  v_hoje date := public.posvenda_dia_local(p_empresa, now());
  v_dia date := p_dia;
  v_vend uuid; v_padrao uuid; v_esc uuid;
  v_adm record;
  v_reserva uuid[]; v_r uuid;
  t int := 0;
begin
  if p_tipo not in ('acompanhamento', 'administradores') then
    raise exception 'TIPO_INVALIDO: %', p_tipo using errcode = '22023';
  end if;
  v_dia := public.core_dia_aberto(p_empresa, p_filial, p_dia);

  if p_tipo = 'acompanhamento' and p_filial is not null then
    select n.responsavel_id into v_vend
      from public.negocios n
      join public.empresa_usuarios eu on eu.usuario_id = n.responsavel_id and eu.empresa_id = n.empresa_id
     where n.id = p_negocio and n.empresa_id = p_empresa and eu.ativo and eu.role = 'vendedor'
       and not eu.conta_servico
       and not (n.responsavel_id = any(v_excl))
       and not (coalesce(eu.ausente, false) and v_dia <= v_hoje);
    if v_vend is not null then
      while public.posvenda_carga_do_dia(p_empresa, v_vend, v_dia) >= public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia) and t < 60 loop
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      return query select v_vend, 'vendedor'::text, v_dia;
      return;
    end if;

    begin
      v_padrao := nullif(public.config_valor_emp(p_empresa, 'posvenda', 'responsavel_padrao', p_filial) #>> '{}', '')::uuid;
    exception when others then v_padrao := null;
    end;
    if v_padrao is not null and not (v_padrao = any(v_excl))
       and exists (select 1 from public.empresa_usuarios where empresa_id = p_empresa and usuario_id = v_padrao
                    and ativo and not coalesce(ausente, false) and not conta_servico)
       and public.posvenda_carga_do_dia(p_empresa, v_padrao, v_dia) < public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia) then
      return query select v_padrao, 'padrao_loja'::text, v_dia;
      return;
    end if;

    if cardinality(array(select x from unnest(public.posvenda_vendedores_da_loja(p_empresa, p_filial)) x where not (x = any(v_excl)))) > 0 then
      t := 0;
      loop
        v_esc := public.posvenda_roleta_proximo(p_empresa, 'loja:' || p_filial, public.posvenda_vendedores_da_loja(p_empresa, p_filial), v_dia,
                                                public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia), v_excl);
        exit when v_esc is not null or t >= 60;
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      if v_esc is not null then
        return query select v_esc, 'roleta'::text, v_dia;
        return;
      end if;
    end if;

    -- 5b: a reserva da loja, na ordem; pula ausente (hoje), excluído e quem está no teto do dia
    v_reserva := public.distribuicao_lista(p_empresa, p_filial, 'reserva_posvenda');
    if v_reserva is not null then
      foreach v_r in array v_reserva loop
        if not (v_r = any(v_excl))
           and exists (select 1 from public.empresa_usuarios where empresa_id = p_empresa and usuario_id = v_r
                        and ativo and not conta_servico and not (coalesce(ausente, false) and v_dia <= v_hoje))
           and public.posvenda_carga_do_dia(p_empresa, v_r, v_dia) < public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia) then
          return query select v_r, 'reserva_loja'::text, v_dia;
          return;
        end if;
      end loop;
    end if;
  end if;

  select * into v_adm from public.posvenda_administradores(p_empresa);
  t := 0;
  loop
    v_esc := public.posvenda_roleta_proximo(p_empresa, 'administradores', v_adm.ids, v_dia,
                                            public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia), v_excl);
    exit when v_esc is not null or t >= 60;
    v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
  end loop;
  if v_esc is null then
    raise exception 'SEM_RESPONSAVEL: empresa % sem vendedor, administrador ou dono ativo', p_empresa using errcode = 'P0001';
  end if;
  return query select v_esc, case when v_adm.eh_dono then 'dono' else 'administradores' end, v_dia;
end $function$;

-- Quem pode mexer: superadmin, dono, administrador (o administrador não mexe na comissão do dono).
create or replace function public.distribuicao_exigir_gestor()
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_papel text;
begin
  if auth.uid() is null or public.get_empresa_id() is null then
    raise exception 'SEM_EMPRESA: sem empresa na sessão' using errcode = '42501';
  end if;
  if public.is_super_admin() then v_papel := 'superadmin';
  else
    select role into v_papel from public.empresa_usuarios where usuario_id = auth.uid() and empresa_id = public.get_empresa_id() and ativo;
    if v_papel is null or v_papel not in ('owner', 'admin') then
      raise exception 'SEM_PERMISSAO: só o dono ou um administrador muda a distribuição' using errcode = '42501';
    end if;
  end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA: esta sessão não grava' using errcode = '42501'; end if;
  return v_papel;
end $function$;
revoke all on function public.distribuicao_exigir_gestor() from public, anon, authenticated;

-- Grava UMA lista de UMA loja (na ordem dada), auditando.
create or replace function public.distribuicao_salvar(p_filial bigint, p_lista text, p_usuarios uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp bigint := public.get_empresa_id();
  v_ids uuid[]; v_u uuid; v_antes uuid[]; v_depois uuid[];
begin
  perform public.distribuicao_exigir_gestor();
  if p_lista not in ('roleta', 'liberacao', 'reserva_posvenda') then
    raise exception 'LISTA_INVALIDA: %', p_lista using errcode = '22023';
  end if;
  if not exists (select 1 from public.filiais where id = p_filial and empresa_id = v_emp and ativo) then
    raise exception 'LOJA_INVALIDA: loja não é desta empresa ou está inativa' using errcode = '22023';
  end if;
  -- sem repetição, mantendo a ordem dada
  select coalesce(array_agg(u order by pos), '{}') into v_ids
    from (select u, min(pos) pos from unnest(coalesce(p_usuarios, '{}'::uuid[])) with ordinality x(u, pos) group by u) y;
  foreach v_u in array v_ids loop
    if not exists (select 1 from public.empresa_usuarios where empresa_id = v_emp and usuario_id = v_u and ativo) then
      raise exception 'USUARIO_NAO_ENCONTRADO: pessoa fora da equipe ativa' using errcode = 'P0002';
    end if;
    if not (p_filial = any (public.filiais_atuacao_de(v_u, v_emp))) then
      raise exception 'LOJA_NAO_VISIVEL: só entra na lista quem enxerga a loja' using errcode = '42501';
    end if;
  end loop;

  v_antes := public.distribuicao_lista(v_emp, p_filial, p_lista);
  insert into public.distribuicao_listas (empresa_id, filial_id, lista, configurada_por)
    values (v_emp, p_filial, p_lista, auth.uid())
    on conflict (empresa_id, filial_id, lista) do update set configurada_em = now(), configurada_por = excluded.configurada_por;
  delete from public.distribuicao_participantes where empresa_id = v_emp and filial_id = p_filial and lista = p_lista;
  insert into public.distribuicao_participantes (empresa_id, filial_id, lista, usuario_id, ordem)
    select v_emp, p_filial, p_lista, u, pos::int from unnest(v_ids) with ordinality x(u, pos);
  v_depois := public.distribuicao_lista(v_emp, p_filial, p_lista);
  if v_antes is distinct from v_depois then
    perform public.auditar_emp(v_emp, 'distribuicao', p_filial || ':' || p_lista, 'alterar',
      jsonb_build_object('loja', p_filial, 'lista', p_lista, 'pessoas', to_jsonb(v_antes)),
      jsonb_build_object('loja', p_filial, 'lista', p_lista, 'pessoas', to_jsonb(v_depois)), null, 'distribuicao', p_filial);
  end if;
  return jsonb_build_object('loja', p_filial, 'lista', p_lista, 'pessoas', to_jsonb(v_depois));
end $function$;
revoke all on function public.distribuicao_salvar(bigint, text, uuid[]) from public, anon;
grant execute on function public.distribuicao_salvar(bigint, text, uuid[]) to authenticated, service_role;

-- Loja da comissão de uma pessoa (tem de ser uma loja que ela enxerga), auditando.
create or replace function public.comissao_loja_salvar(p_usuario uuid, p_filial bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp bigint := public.get_empresa_id();
  v_papel text; v_alvo text; v_antes bigint;
begin
  v_papel := public.distribuicao_exigir_gestor();
  select role into v_alvo from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = v_emp and ativo;
  if v_alvo is null then raise exception 'USUARIO_NAO_ENCONTRADO: pessoa fora da equipe ativa' using errcode = 'P0002'; end if;
  if v_papel = 'admin' and v_alvo = 'owner' then
    raise exception 'SEM_PERMISSAO: só o dono muda a loja da comissão do dono' using errcode = '42501';
  end if;
  if not exists (select 1 from public.filiais where id = p_filial and empresa_id = v_emp and ativo) then
    raise exception 'LOJA_INVALIDA: loja não é desta empresa ou está inativa' using errcode = '22023';
  end if;
  if not (p_filial = any (public.filiais_atuacao_de(p_usuario, v_emp))) then
    raise exception 'LOJA_NAO_VISIVEL: a loja da comissão precisa ser uma loja que a pessoa enxerga' using errcode = '42501';
  end if;
  select filial_id into v_antes from public.empresa_usuario_comissao where empresa_id = v_emp and usuario_id = p_usuario;
  insert into public.empresa_usuario_comissao (empresa_id, usuario_id, filial_id, atualizado_por)
    values (v_emp, p_usuario, p_filial, auth.uid())
    on conflict (empresa_id, usuario_id) do update set filial_id = excluded.filial_id, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  if v_antes is distinct from p_filial then
    perform public.auditar_emp(v_emp, 'comissao_loja', p_usuario::text, 'alterar',
      jsonb_build_object('loja', v_antes), jsonb_build_object('loja', p_filial), null, 'distribuicao', p_filial);
  end if;
  return jsonb_build_object('usuario', p_usuario, 'loja', p_filial);
end $function$;
revoke all on function public.comissao_loja_salvar(uuid, bigint) from public, anon;
grant execute on function public.comissao_loja_salvar(uuid, bigint) to authenticated, service_role;

-- Pessoa nova (ou readmitida): entra na roleta e na liberação da loja principal, se essas listas estiverem configuradas e
-- a pessoa participar da roleta (o mesmo que acontecia antes das listas). Chamada pela rota de criar usuário (serviço).
create or replace function public.distribuicao_incluir_pessoa(p_empresa bigint, p_usuario uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_loja bigint; v_l text;
begin
  select public.distribuicao_loja_alvo(p_empresa, eu.filial_id) into v_loja
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.usuario_id = p_usuario and eu.ativo and eu.participa_roleta and not eu.conta_servico;
  if v_loja is null then return; end if;
  foreach v_l in array array['roleta', 'liberacao'] loop
    if exists (select 1 from public.distribuicao_listas where empresa_id = p_empresa and filial_id = v_loja and lista = v_l) then
      insert into public.distribuicao_participantes (empresa_id, filial_id, lista, usuario_id, ordem)
        values (p_empresa, v_loja, v_l, p_usuario,
                coalesce((select max(ordem) from public.distribuicao_participantes where empresa_id = p_empresa and filial_id = v_loja and lista = v_l), 0) + 1)
        on conflict do nothing;
    end if;
  end loop;
end $function$;
revoke all on function public.distribuicao_incluir_pessoa(bigint, uuid) from public, anon, authenticated;
grant execute on function public.distribuicao_incluir_pessoa(bigint, uuid) to service_role;
