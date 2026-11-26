-- VOLTA da 20261126000600_horario_liberacao_tabela_nova: as duas funções voltam a ler o envelope de configuracoes_sistema.
-- Só vale enquanto o envelope existir (antes da segunda parte da 1.1h).
begin;
set local lock_timeout = '5s';
create or replace function public.core_horario(p_empresa bigint, p_filial bigint default null::bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v jsonb; c jsonb;
begin
  select valor into c from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'core.horario';
  if p_filial is not null then
    v := c -> 'lojas' -> p_filial::text;
    if public.core_horario_valido(v) then return v; end if;
  end if;
  v := c -> 'empresa';
  if public.core_horario_valido(v) then return v; end if;
  v := public.core_horario_do_antigo((select valor from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'horario_comercial'));
  if v is not null then return v; end if;
  return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
end $function$;
create or replace function public.core_liberar_lotes_do_dia()
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare e bigint; v jsonb := '{}';
begin
  for e in select empresa_id from public.configuracoes_sistema where chave = 'distribuicao.liberacao_diaria' order by empresa_id loop
    begin
      v := v || jsonb_build_object(e::text, public.core_liberar_lote_esteira(e));
    exception when others then
      v := v || jsonb_build_object(e::text, jsonb_build_object('erro', sqlerrm));
    end;
  end loop;
  return v;
end $function$;
commit;
