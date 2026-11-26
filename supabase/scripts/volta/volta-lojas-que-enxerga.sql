-- VOLTA da 20261126001000/0010 (5a): filiais_visiveis volta ao corpo da 0700, filiais_atuacao_de ao da 0900 e
-- usuario_lojas_salvar passa a recusar. A tabela empresa_usuario_lojas fica (sem drop); a lista deixa de ter efeito.
begin;
set local lock_timeout = '5s';
create or replace function public.filiais_atuacao_de(p_usuario uuid, p_empresa bigint)
 returns bigint[]
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_todas bigint[]; v_qtd int; v_papel text; v_cargo bigint; v_casa bigint; v_super boolean;
begin
  if p_empresa is null or p_usuario is null then return array[]::bigint[]; end if;
  select coalesce(array_agg(id order by id) filter (where ativo), array[]::bigint[]), count(*) filter (where ativo)
    into v_todas, v_qtd from public.filiais where empresa_id = p_empresa;
  if v_qtd < 2 then return v_todas; end if;
  select is_super_admin into v_super from public.usuarios where id = p_usuario;
  if coalesce(v_super, false) then return v_todas; end if;
  select role, cargo_id, filial_id into v_papel, v_cargo, v_casa
    from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = p_empresa and ativo limit 1;
  if not found then return array[]::bigint[]; end if;
  if v_papel in ('owner', 'admin')
     or exists (select 1 from public.empresa_cargos c where c.id = v_cargo and c.sistema)
     or exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = v_cargo and cp.permissao = 'lojas.ver_rede') then
    return v_todas;
  end if;
  v_casa := coalesce(v_casa, (select id from public.filiais where empresa_id = p_empresa and matriz and ativo limit 1));
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $function$;

create or replace function public.filiais_visiveis()
 returns bigint[]
 language plpgsql
 stable security definer
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

  v_casa := coalesce(
    v_casa,
    (select id from filiais where empresa_id = v_emp and matriz and ativo limit 1)
  );
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $function$;

create or replace function public.usuario_lojas_salvar(p_usuario uuid, p_lojas bigint[], p_principal bigint default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$ begin raise exception 'SEM_PERMISSAO: lojas que enxerga desligado (volta da 5a)' using errcode = '42501'; end $function$;
commit;
