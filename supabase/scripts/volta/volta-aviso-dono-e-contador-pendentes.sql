-- VOLTA da 20261126000500_aviso_dono_e_contador_pendentes: devolve os corpos anteriores das duas funções (sem aviso; total
-- contando lojas). A tabela usuario_avisos FICA (com os avisos já criados): apagar perderia avisos; o app antigo não a lê.
begin;
set local lock_timeout = '5s';
create or replace function public.usuario_cargo_trocar(p_usuario uuid, p_cargo bigint)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint := public.get_empresa_id(); v_antes bigint; v_novo record; v_ruins text[];
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = 'P0001'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = 'P0001'; end if;
  if not public.tem_permissao('equipe.cargos') then raise exception 'SEM_PERMISSAO: trocar cargo' using errcode = 'P0001'; end if;
  select id, sistema into v_novo from public.empresa_cargos where id = p_cargo and empresa_id = v_emp;
  if v_novo.id is null then raise exception 'CARGO_INVALIDO' using errcode = 'P0001'; end if;
  if p_usuario = auth.uid() then
    raise exception 'PROPRIO_CARGO: ninguém troca o próprio cargo' using errcode = 'P0001';
  end if;
  select cargo_id into v_antes from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = v_emp;
  if not found then raise exception 'SEM_VINCULO' using errcode = 'P0001'; end if;
  if not public.sessao_e_dono() then
    if v_novo.sistema or exists (select 1 from public.empresa_cargos where id = v_antes and sistema) then
      raise exception 'SO_DONO: só o Dono põe ou tira alguém do cargo Dono' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.empresa_cargo_permissoes where cargo_id in (v_antes, p_cargo) and permissao = 'equipe.cargos') then
      raise exception 'SO_DONO: só o Dono muda o cargo de quem edita cargos' using errcode = 'P0001';
    end if;
    select array_agg(permissao) into v_ruins from public.empresa_cargo_permissoes
     where cargo_id = p_cargo and not public.tem_permissao(permissao);
    if v_ruins is not null then
      raise exception 'SEM_PERMISSAO: o cargo tem o que você não tem (%)', array_to_string(v_ruins, ', ') using errcode = 'P0001';
    end if;
  end if;
  update public.empresa_usuarios set cargo_id = p_cargo where usuario_id = p_usuario and empresa_id = v_emp;
  perform public.auditar_emp(v_emp, 'usuario', p_usuario::text, 'trocar_cargo',
    jsonb_build_object('cargo', v_antes), jsonb_build_object('cargo', p_cargo), null, 'usuario_cargo_trocar');
end $function$;
create or replace function public.estoque_custos_pendentes_resumo()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint := public.custo_exigir_permissao();
begin
  return (select jsonb_build_object('total', count(*), 'por_loja', coalesce(jsonb_object_agg(f, n) filter (where f is not null), '{}'::jsonb))
            from (select coalesce(filial_id, 0)::text f, count(*) n from public.estoque_custos_pendentes(null) group by 1) x);
end $function$;
commit;
