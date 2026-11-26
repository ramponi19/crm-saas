-- 5a. LOJAS QUE ENXERGA (26/11/2026; docs/lojas-e-distribuicao-plano.md §2 5a; decisões do Lucas de 26/11).
--
-- Uma pessoa pode enxergar VÁRIAS lojas sem precisar "ver a rede". Tabela nova (sem DDL em empresa_usuarios):
-- uma linha por loja que a pessoa enxerga. `empresa_usuarios.filial_id` continua sendo a LOJA PRINCIPAL (onde grava
-- quando o topo está em "Todas as minhas lojas", e o rótulo da pessoa). A principal está sempre entre as que enxerga.
--
-- SEM MUDANÇA DE COMPORTAMENTO: lista vazia = a regra de hoje (`coalesce(filial_id, matriz)`). A semente (0010) cria,
-- para cada vínculo sem a rede, a lista igual ao que vê hoje. Quem vê a rede (dono, admin, cargo de sistema ou
-- `lojas.ver_rede`) continua vendo todas sem lista.
--
-- Mudam, só para quem tem 2+ lojas na lista:
--   - filiais_visiveis(): com o topo numa loja da lista, essa loja; senão ("Todas as minhas lojas"), a lista;
--   - filiais_atuacao_de(): a lista (a conferência de gravação da 0900 e o seletor passam a usar a lista).
-- Gravar continua sempre numa loja específica: filial_gravacao() = topo (se for loja de atuação) → principal → matriz.
--
-- Gravação só por `usuario_lojas_salvar` (dono, superadmin; admin para quem não é dono), que recusa loja que quem salva
-- não enxerga (LOJA_NAO_VISIVEL) e audita antes → depois (entidade 'usuario_lojas').
-- Volta: supabase/scripts/volta/volta-lojas-que-enxerga.sql

set local lock_timeout = '5s';

create table if not exists public.empresa_usuario_lojas (
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  usuario_id uuid   not null references public.usuarios(id) on delete cascade,
  filial_id  bigint not null references public.filiais(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  criado_por uuid,
  primary key (empresa_id, usuario_id, filial_id)
);
create index if not exists empresa_usuario_lojas_filial_idx on public.empresa_usuario_lojas (filial_id);
comment on table public.empresa_usuario_lojas is
  '5a: lojas que a pessoa enxerga (sem "ver a rede"). Vazia = a regra antiga (loja do vínculo ou a matriz). Grava só por usuario_lojas_salvar.';

alter table public.empresa_usuario_lojas enable row level security;
drop policy if exists empresa_usuario_lojas_leitura on public.empresa_usuario_lojas;
create policy empresa_usuario_lojas_leitura on public.empresa_usuario_lojas for select to authenticated
  using (empresa_id = public.get_empresa_id() or public.is_super_admin());
revoke all on public.empresa_usuario_lojas from anon, authenticated;
grant select on public.empresa_usuario_lojas to authenticated;
grant all on public.empresa_usuario_lojas to service_role;

-- A lista de uma pessoa: só lojas ativas da empresa.
create or replace function public.lojas_da_lista(p_usuario uuid, p_empresa bigint)
 returns bigint[]
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(l.filial_id order by l.filial_id), array[]::bigint[])
    from public.empresa_usuario_lojas l
    join public.filiais f on f.id = l.filial_id and f.empresa_id = p_empresa and f.ativo
   where l.empresa_id = p_empresa and l.usuario_id = p_usuario
$function$;
revoke all on function public.lojas_da_lista(uuid, bigint) from public, anon, authenticated;
grant execute on function public.lojas_da_lista(uuid, bigint) to service_role;

-- Lojas em que a pessoa pode ATUAR (gravar e escolher no topo). Igual à 0900, com a lista no lugar da loja do vínculo
-- (a principal sempre entra).
create or replace function public.filiais_atuacao_de(p_usuario uuid, p_empresa bigint)
 returns bigint[]
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_todas bigint[];
  v_papel text; v_casa bigint; v_sistema boolean; v_cargo bigint; v_existe boolean;
  v_lista bigint[];
begin
  if p_usuario is null or p_empresa is null then return array[]::bigint[]; end if;
  select coalesce(array_agg(id order by id), array[]::bigint[]) into v_todas
    from public.filiais where empresa_id = p_empresa and ativo;
  if cardinality(v_todas) < 2 then return v_todas; end if;
  if exists (select 1 from public.usuarios where id = p_usuario and is_super_admin) then return v_todas; end if;

  select true, eu.role, eu.filial_id, coalesce(c.sistema, false), eu.cargo_id
    into v_existe, v_papel, v_casa, v_sistema, v_cargo
    from public.empresa_usuarios eu left join public.empresa_cargos c on c.id = eu.cargo_id
   where eu.usuario_id = p_usuario and eu.empresa_id = p_empresa and eu.ativo
   limit 1;
  if not coalesce(v_existe, false) then return array[]::bigint[]; end if;

  if v_papel in ('owner', 'admin') or v_sistema
     or exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = v_cargo and cp.permissao = 'lojas.ver_rede') then
    return v_todas;
  end if;

  v_casa := coalesce(v_casa, (select id from public.filiais where empresa_id = p_empresa and matriz and ativo limit 1));
  v_lista := public.lojas_da_lista(p_usuario, p_empresa);
  if cardinality(v_lista) = 0 then
    return case when v_casa is null then array[]::bigint[] else array[v_casa] end;
  end if;
  if v_casa is not null and v_casa = any (v_todas) and not (v_casa = any (v_lista)) then
    v_lista := v_lista || v_casa;
  end if;
  return v_lista;
end $function$;

-- Visibilidade (RLS de ~40 tabelas). Igual à 0700 para quem vê a rede e para quem não tem lista; com lista:
-- a loja do topo (se for da lista) ou a lista inteira ("Todas as minhas lojas").
create or replace function public.filiais_visiveis()
 returns bigint[]
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp   bigint;
  v_qtd   int;
  v_sel   bigint;
  v_papel text;
  v_casa  bigint;
  v_super boolean;
  v_todas bigint[];
  v_lista bigint[];
begin
  v_emp := get_empresa_id();
  if v_emp is null then return array[]::bigint[]; end if;

  select count(*) into v_qtd from filiais where empresa_id = v_emp and ativo;
  select coalesce(array_agg(id), array[]::bigint[]) into v_todas
    from filiais where empresa_id = v_emp;

  if v_qtd < 2 then return v_todas || 0::bigint; end if;

  select is_super_admin into v_super from usuarios where id = auth.uid();
  select role, filial_id into v_papel, v_casa
    from empresa_usuarios
    where usuario_id = auth.uid() and empresa_id = v_emp and ativo
    limit 1;

  if coalesce(v_super, false) or v_papel in ('owner', 'admin') or public.tem_permissao('lojas.ver_rede') then
    v_sel := filial_atual();
    if v_sel is not null then return array[v_sel]; end if;
    return v_todas || 0::bigint;
  end if;

  if cardinality(public.lojas_da_lista(auth.uid(), v_emp)) > 0 then
    v_lista := public.filiais_atuacao_de(auth.uid(), v_emp);  -- a lista com a principal
    if cardinality(v_lista) > 0 then
      v_sel := filial_atual();                                -- já conferida contra a atuação
      if v_sel is not null and v_sel = any (v_lista) then return array[v_sel]; end if;
      return v_lista;
    end if;
  end if;

  v_casa := coalesce(
    v_casa,
    (select id from filiais where empresa_id = v_emp and matriz and ativo limit 1)
  );
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $function$;

-- Grava a lista e a principal de uma pessoa, auditando. p_lojas vazio = volta à regra antiga (só a principal).
create or replace function public.usuario_lojas_salvar(p_usuario uuid, p_lojas bigint[], p_principal bigint default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_emp bigint := public.get_empresa_id();
  v_super boolean;
  v_meu text; v_alvo text;
  v_minhas bigint[];
  v_lojas bigint[];
  v_matriz bigint;
  v_antes jsonb; v_depois jsonb;
  v_principal_antes bigint;
  v_l bigint;
begin
  if v_uid is null or v_emp is null then raise exception 'SEM_EMPRESA: sem empresa na sessão' using errcode = '42501'; end if;
  select coalesce(is_super_admin, false) into v_super from public.usuarios where id = v_uid;
  if not v_super then
    select role into v_meu from public.empresa_usuarios where usuario_id = v_uid and empresa_id = v_emp and ativo;
    if v_meu is null or v_meu not in ('owner', 'admin') then
      raise exception 'SEM_PERMISSAO: só o dono ou um administrador muda as lojas de alguém' using errcode = '42501';
    end if;
  end if;
  if not public.sessao_pode_escrever() then
    raise exception 'SOMENTE_LEITURA: esta sessão não grava' using errcode = '42501';
  end if;

  select role, filial_id into v_alvo, v_principal_antes
    from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = v_emp and ativo;
  if v_alvo is null then raise exception 'USUARIO_NAO_ENCONTRADO: usuário não encontrado nesta empresa' using errcode = 'P0002'; end if;
  if v_meu = 'admin' and v_alvo = 'owner' then
    raise exception 'SEM_PERMISSAO: só o dono muda as lojas do dono' using errcode = '42501';
  end if;

  -- Só lojas ativas desta empresa, sem repetição; e só lojas que quem salva enxerga.
  select coalesce(array_agg(distinct x), array[]::bigint[]) into v_lojas from unnest(coalesce(p_lojas, array[]::bigint[])) x;
  v_minhas := public.filiais_atuacao_de(v_uid, v_emp);
  foreach v_l in array v_lojas loop
    if not exists (select 1 from public.filiais where id = v_l and empresa_id = v_emp and ativo) then
      raise exception 'LOJA_INVALIDA: loja % não é desta empresa ou está inativa', v_l using errcode = '22023';
    end if;
    if not (v_l = any (v_minhas)) then
      raise exception 'LOJA_NAO_VISIVEL: você não pode dar acesso a uma loja que não enxerga' using errcode = '42501';
    end if;
  end loop;

  -- Principal: a informada (tem de estar na lista, quando há lista); sem informar, a atual se estiver na lista,
  -- senão a matriz se estiver, senão a primeira.
  select id into v_matriz from public.filiais where empresa_id = v_emp and matriz and ativo limit 1;
  if p_principal is not null then
    if not exists (select 1 from public.filiais where id = p_principal and empresa_id = v_emp and ativo) then
      raise exception 'LOJA_INVALIDA: loja principal inválida' using errcode = '22023';
    end if;
    if cardinality(v_lojas) > 0 and not (p_principal = any (v_lojas)) then
      raise exception 'PRINCIPAL_FORA_DA_LISTA: a loja principal precisa estar entre as que a pessoa enxerga' using errcode = '22023';
    end if;
    if not (p_principal = any (v_minhas)) then
      raise exception 'LOJA_NAO_VISIVEL: você não pode dar acesso a uma loja que não enxerga' using errcode = '42501';
    end if;
  end if;

  v_antes := jsonb_build_object('lojas', to_jsonb(public.lojas_da_lista(p_usuario, v_emp)), 'principal', v_principal_antes);

  delete from public.empresa_usuario_lojas where empresa_id = v_emp and usuario_id = p_usuario and not (filial_id = any (v_lojas));
  insert into public.empresa_usuario_lojas (empresa_id, usuario_id, filial_id, criado_por)
    select v_emp, p_usuario, x, v_uid from unnest(v_lojas) x
    on conflict do nothing;

  update public.empresa_usuarios
     set filial_id = case
           when p_principal is not null then p_principal
           when cardinality(v_lojas) = 0 then filial_id
           when coalesce(filial_id, v_matriz) = any (v_lojas) then filial_id
           when v_matriz = any (v_lojas) then v_matriz
           else v_lojas[1] end
   where usuario_id = p_usuario and empresa_id = v_emp
  returning filial_id into v_principal_antes;

  v_depois := jsonb_build_object('lojas', to_jsonb(public.lojas_da_lista(p_usuario, v_emp)), 'principal', v_principal_antes);
  if v_antes is distinct from v_depois then
    perform public.auditar_emp(v_emp, 'usuario_lojas', p_usuario::text, 'alterar', v_antes, v_depois, null, 'equipe.lojas', null);
  end if;
  return v_depois;
end $function$;
revoke all on function public.usuario_lojas_salvar(uuid, bigint[], bigint) from public, anon;
grant execute on function public.usuario_lojas_salvar(uuid, bigint[], bigint) to authenticated, service_role;
