-- Volta da 20261123000700_dados_venda_reservada: devolve o core_validar_dados de antes (md5 fb1fdf86...).
-- ATENÇÃO: com a volta, `dados.venda` é recusada de novo e marcar ganho pela tela falha. Só usar junto
-- com a volta do app (deploy anterior à Entrega A) e depois de tirar `venda` dos negócios que já a têm.
create or replace function public.core_validar_dados() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entidade text := tg_argv[0];
  r record;
  c record;
begin
  if new.dados is null or jsonb_typeof(new.dados) <> 'object' then
    raise exception 'dados precisa ser um objeto jsonb' using errcode = '22023';
  end if;
  for r in select key, value from jsonb_each(new.dados) loop
    continue when left(r.key, 1) = '_';
    select cp.tipo, cp.opcoes into c
      from campos_personalizados cp
     where cp.empresa_id = new.empresa_id and cp.entidade = v_entidade and cp.chave = r.key and cp.ativo;
    if not found then
      raise exception 'campo personalizado desconhecido: %.%', v_entidade, r.key using errcode = '22023';
    end if;
    continue when jsonb_typeof(r.value) = 'null';
    if (c.tipo in ('numero', 'moeda') and jsonb_typeof(r.value) <> 'number')
       or (c.tipo = 'booleano' and jsonb_typeof(r.value) <> 'boolean')
       or (c.tipo in ('texto', 'data', 'opcao') and jsonb_typeof(r.value) <> 'string')
       or (c.tipo = 'multi' and jsonb_typeof(r.value) <> 'array')
       or (c.tipo = 'data' and (r.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}')
       or (c.tipo = 'opcao' and jsonb_array_length(c.opcoes) > 0 and not c.opcoes @> jsonb_build_array(r.value))
       or (c.tipo = 'multi' and jsonb_array_length(c.opcoes) > 0 and not c.opcoes @> r.value) then
      raise exception 'valor inválido para %.% (tipo %)', v_entidade, r.key, c.tipo using errcode = '22023';
    end if;
  end loop;
  return new;
end
$$;
