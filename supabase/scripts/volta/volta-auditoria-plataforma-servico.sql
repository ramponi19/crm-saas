-- VOLTA da 20261126000100_auditoria_plataforma_servico: a função volta ao corpo da 0700 (só auth.uid()) e saem os
-- 2 gatilhos novos. O app pode continuar mandando o cabeçalho: sem a função nova, ele é ignorado.
set local lock_timeout = '5s';

create or replace function public.plataforma_auditar_escrita()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_emp bigint;
  v_campos jsonb;
  v_linha jsonb;
begin
  if v_uid is null then return null; end if;
  select impersonando_empresa_id into v_emp from public.usuarios
   where id = v_uid and is_super_admin and impersonando_expires_at > now();
  if v_emp is null then return null; end if;

  v_linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_campos
      from jsonb_object_keys(to_jsonb(new)) k
     where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  end if;
  insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, depois, origem)
  values (coalesce((v_linha ->> 'empresa_id')::bigint, v_emp), v_uid, v_uid, 'plataforma',
          tg_table_name || ':' || coalesce(v_linha ->> 'id', '?'), 'plataforma_' || lower(tg_op),
          case when v_campos is not null then jsonb_build_object('campos', v_campos) end, 'gatilho');
  return null;
end $$;
revoke all on function public.plataforma_auditar_escrita() from public, anon, authenticated;

drop trigger if exists zz_plataforma_auditar on public.empresas;
drop trigger if exists zz_plataforma_auditar on public.diagnostico_canais;
drop trigger if exists zz_plataforma_auditar on public.assistente_config;
-- e a da 20261126000200 (rodar sozinha, antes desta):
-- drop trigger if exists zz_plataforma_auditar on public.usuarios;
