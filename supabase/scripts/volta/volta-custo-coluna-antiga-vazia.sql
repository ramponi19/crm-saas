-- VOLTA da 20261126000400_custo_coluna_antiga_vazia (1.1f). Para quando o app tiver de voltar ao antigo (que lê as
-- colunas): copia o custo dos satélites de volta para as colunas e restaura a sincronia nos dois sentidos da 1.1d
-- (os corpos abaixo são os da 20261126000300, iguais). Os satélites não mudam.
-- Uma transação só: ou volta tudo, ou nada (psql -f manda comando por comando).
begin;
set local lock_timeout = '5s';

create or replace function public.custo_unidade_pendente()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if public.custo_sincronizando() then return new; end if;
  if coalesce(new.tipo, '') <> 'troca'
     and (new.preco_custo is null or (new.preco_custo = 0 and not coalesce(public.tem_permissao('estoque.ver_custo'), false))) then
    new.preco_custo := null;
  end if;
  return new;
end $$;

create or replace function public.custo_unidade_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_antes record;
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  select preco_custo, custo_reparo into v_antes from public.estoque_unidades_custos where unidade_id = new.id;
  perform set_config('nexus.custo_sincronizando', '1', true);
  insert into public.estoque_unidades_custos as s (unidade_id, empresa_id, filial_id, preco_custo, custo_reparo, custo_origem, atualizado_por)
  values (new.id, new.empresa_id, new.filial_id, new.preco_custo, new.custo_reparo,
          case when tg_op = 'INSERT' then case when new.tipo = 'troca' then 'troca' else 'entrada' end else 'informado' end, auth.uid())
  on conflict (unidade_id) do update
     set preco_custo = excluded.preco_custo, custo_reparo = excluded.custo_reparo, filial_id = excluded.filial_id,
         custo_origem = case when (s.preco_custo, s.custo_reparo) is distinct from (excluded.preco_custo, excluded.custo_reparo)
                             then 'informado' else s.custo_origem end,
         atualizado_por = excluded.atualizado_por, atualizado_em = now()
   where (s.preco_custo, s.custo_reparo, s.filial_id) is distinct from (excluded.preco_custo, excluded.custo_reparo, excluded.filial_id);
  perform set_config('nexus.custo_sincronizando', '', true);
  -- auditoria só quando o custo muda numa unidade que já existia (reenviar o mesmo valor não gera linha)
  if tg_op = 'UPDATE' and (v_antes.preco_custo, v_antes.custo_reparo) is distinct from (new.preco_custo, new.custo_reparo) then
    perform public.auditar_emp(new.empresa_id, 'unidade', new.id::text, 'custo',
      jsonb_build_object('preco_custo', v_antes.preco_custo, 'custo_reparo', v_antes.custo_reparo),
      jsonb_build_object('preco_custo', new.preco_custo, 'custo_reparo', new.custo_reparo), null, 'coluna antiga', new.filial_id);
  end if;
  return null;
end $$;

create or replace function public.custo_venda_da_unidade()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_custo numeric; v_achou boolean;
begin
  if public.custo_sincronizando() or new.unidade_id is null then return new; end if;
  select true, preco_custo into v_achou, v_custo from public.estoque_unidades_custos where unidade_id = new.unidade_id;
  if v_achou then
    new.valor_custo := v_custo * coalesce(nullif(new.quantidade, 0), 1);
  end if;
  return new;
end $$;

create or replace function public.custo_venda_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_antes numeric;
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  select valor_custo into v_antes from public.vendas_vendas_custos where venda_id = new.id;
  perform set_config('nexus.custo_sincronizando', '1', true);
  insert into public.vendas_vendas_custos as s (venda_id, empresa_id, filial_id, valor_custo)
  values (new.id, new.empresa_id, new.filial_id, new.valor_custo)
  on conflict (venda_id) do update set valor_custo = excluded.valor_custo, filial_id = excluded.filial_id
   where (s.valor_custo, s.filial_id) is distinct from (excluded.valor_custo, excluded.filial_id);
  perform set_config('nexus.custo_sincronizando', '', true);
  if tg_op = 'UPDATE' and v_antes is distinct from new.valor_custo then
    perform public.auditar_emp(new.empresa_id, 'venda', new.id::text, 'custo',
      jsonb_build_object('valor_custo', v_antes), jsonb_build_object('valor_custo', new.valor_custo), null, 'coluna antiga', new.filial_id);
  end if;
  return null;
end $$;

create or replace function public.custo_compra_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  perform set_config('nexus.custo_sincronizando', '1', true);
  insert into public.compras_pedidos_custos as s (pedido_id, empresa_id, filial_id, valor_total)
  values (new.id, new.empresa_id, new.filial_id, new.valor_total)
  on conflict (pedido_id) do update set valor_total = excluded.valor_total, filial_id = excluded.filial_id
   where (s.valor_total, s.filial_id) is distinct from (excluded.valor_total, excluded.filial_id);
  perform set_config('nexus.custo_sincronizando', '', true);
  return null;
end $$;

create or replace function public.custo_satelite_para_coluna()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if public.custo_sincronizando() then return null; end if;
  perform set_config('nexus.custo_sincronizando', '1', true);
  if tg_table_name = 'estoque_unidades_custos' then
    update public.estoque_unidades set preco_custo = new.preco_custo, custo_reparo = new.custo_reparo
     where id = new.unidade_id and (preco_custo, custo_reparo) is distinct from (new.preco_custo, new.custo_reparo);
  elsif tg_table_name = 'vendas_vendas_custos' then
    update public.vendas_vendas set valor_custo = new.valor_custo
     where id = new.venda_id and valor_custo is distinct from new.valor_custo;
  else
    update public.compras_pedidos set valor_total = new.valor_total
     where id = new.pedido_id and valor_total is distinct from new.valor_total;
  end if;
  perform set_config('nexus.custo_sincronizando', '', true);
  return null;
end $$;

do $$
begin
  perform set_config('nexus.custo_sincronizando', '1', true);
  update public.estoque_unidades u set preco_custo = c.preco_custo, custo_reparo = c.custo_reparo
    from public.estoque_unidades_custos c where c.unidade_id = u.id
     and (u.preco_custo, u.custo_reparo) is distinct from (c.preco_custo, c.custo_reparo);
  perform set_config('nexus.venda_valor_ajuste', 'volta 1.1f', true);   -- H2: venda concluída recebe de volta o custo
  update public.vendas_vendas v set valor_custo = c.valor_custo
    from public.vendas_vendas_custos c where c.venda_id = v.id and v.valor_custo is distinct from c.valor_custo;
  perform set_config('nexus.venda_valor_ajuste', '', true);
  update public.compras_pedidos p set valor_total = c.valor_total
    from public.compras_pedidos_custos c where c.pedido_id = p.id and p.valor_total is distinct from c.valor_total;
  perform set_config('nexus.custo_sincronizando', '', true);
  if exists (select 1 from public.estoque_unidades u join public.estoque_unidades_custos c on c.unidade_id = u.id
              where (u.preco_custo, u.custo_reparo) is distinct from (c.preco_custo, c.custo_reparo))
     or exists (select 1 from public.vendas_vendas v join public.vendas_vendas_custos c on c.venda_id = v.id where v.valor_custo is distinct from c.valor_custo)
     or exists (select 1 from public.compras_pedidos p join public.compras_pedidos_custos c on c.pedido_id = p.id where p.valor_total is distinct from c.valor_total) then
    raise exception 'VOLTA: coluna antiga e satélite ainda diferem';
  end if;
end $$;

commit;
