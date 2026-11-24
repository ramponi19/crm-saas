-- Volta da 20261124001300: posvenda_administradores como a 1000 deixou (filtrando participa_roleta).
create or replace function public.posvenda_administradores(p_empresa bigint, out ids uuid[], out eh_dono boolean)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
   where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not coalesce(ausente, false)
     and not conta_servico and participa_roleta;
  eh_dono := false;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null
       and not conta_servico and participa_roleta;
  end if;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'owner' and usuario_id is not null and not conta_servico;
    eh_dono := true;
  end if;
end $$;
