-- ETAPA 1.1d — CUSTO PROTEGIDO, TEMPO 1: SATÉLITES E SINCRONIA NOS DOIS SENTIDOS (26/11/2026; docs/etapa-1.1-plano.md §4.3).
--
-- Só ADICIONA. As colunas antigas (estoque_unidades.preco_custo/custo_reparo, vendas_vendas.valor_custo,
-- compras_pedidos.valor_total) continuam com os MESMOS valores e legíveis como hoje: o app antigo não muda, nem
-- para o Dono. Fecha-se a exposição no tempo 3 (1.1f), depois do app novo (1.1e).
--
--   - três satélites (estoque_unidades_custos, vendas_vendas_custos, compras_pedidos_custos), SELECT só com
--     estoque.ver_custo + empresa + loja visível; nenhum grant de escrita ao navegador;
--   - cópia de tudo o que existe, com prova (contagem e soma por empresa) — se diferir, aborta;
--   - sincronia: coluna antiga → satélite (gatilho AFTER na tabela de origem) e satélite → coluna antiga (gatilho
--     AFTER no satélite), sem laço (marca de transação nexus.custo_sincronizando). AFTER, e não BEFORE, para o
--     vendas_valor_guarda (H2) decidir antes e para não precisar de FK adiada;
--   - custo pendente (nulo): unidade que entra com custo 0 ou nulo por quem NÃO tem estoque.ver_custo (troca nunca);
--   - venda de unidade: o custo vem do satélite da unidade × quantidade (a mesma conta que o PDV antigo faz);
--   - itens.custo (espelho que ninguém lê) deixa de ser preenchido;
--   - funções de leitura (pendentes, resultado) e de escrita do tempo 2, todas exigindo estoque.ver_custo.
-- Sem drop de gatilho nem de política (lição do deadlock de 25/11): create or replace trigger, e as políticas nascem
-- com as tabelas. Volta: supabase/scripts/volta/volta-custo-satelites.sql.

set local lock_timeout = '5s';

-- ── 1. satélites ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.estoque_unidades_custos (
  unidade_id     bigint primary key references public.estoque_unidades(id) on delete cascade,
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  filial_id      bigint,
  preco_custo    numeric,                -- nulo = custo pendente
  custo_reparo   numeric,
  custo_origem   text not null default 'entrada'
                 check (custo_origem in ('entrada', 'troca', 'compra', 'avaliacao', 'orcamento', 'informado', 'migracao')),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now()
);
create table if not exists public.vendas_vendas_custos (
  venda_id             bigint primary key references public.vendas_vendas(id) on delete cascade,
  empresa_id           bigint not null references public.empresas(id) on delete cascade,
  filial_id            bigint,
  valor_custo          numeric,          -- nulo = custo pendente
  custo_preenchido_em  timestamptz,      -- preenchido UMA vez depois da venda (estoque_custo_informar)
  custo_preenchido_por uuid
);
create table if not exists public.compras_pedidos_custos (
  pedido_id   bigint primary key references public.compras_pedidos(id) on delete cascade,
  empresa_id  bigint not null references public.empresas(id) on delete cascade,
  filial_id   bigint,
  valor_total numeric
);
create index if not exists estoque_unidades_custos_pendentes on public.estoque_unidades_custos (empresa_id, filial_id) where preco_custo is null;
create index if not exists vendas_vendas_custos_empresa on public.vendas_vendas_custos (empresa_id);
create index if not exists compras_pedidos_custos_empresa on public.compras_pedidos_custos (empresa_id);

comment on table public.estoque_unidades_custos is 'Custo da unidade (1.1d). Só quem tem estoque.ver_custo lê. Nulo = custo pendente. Escrita só pelas funções e pela sincronia com a coluna antiga.';
comment on table public.vendas_vendas_custos is 'Custo da venda (1.1d), congelado na venda. Só quem tem estoque.ver_custo lê. Nulo = pendente; preenchido uma vez por estoque_custo_informar.';
comment on table public.compras_pedidos_custos is 'Valor do pedido de compra (1.1d). Só quem tem estoque.ver_custo lê.';

do $$
declare t text;
begin
  foreach t in array array['estoque_unidades_custos', 'vendas_vendas_custos', 'compras_pedidos_custos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_ler') then
    execute format($p$create policy %I on public.%I for select to authenticated
                     using (empresa_id = (select public.get_empresa_id())
                            and (select public.filiais_visiveis()) @> array[coalesce(filial_id, 0)]
                            and (select public.tem_permissao('estoque.ver_custo')))$p$, t || '_ler', t);
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'zz_plataforma_auditar' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger zz_plataforma_auditar after insert or update or delete on public.%I for each row execute function public.plataforma_auditar_escrita()', t);
    end if;
  end loop;
end $$;

-- ── 2. cópia, com prova ─────────────────────────────────────────────────────────────────────────────────────
insert into public.estoque_unidades_custos (unidade_id, empresa_id, filial_id, preco_custo, custo_reparo, custo_origem)
select id, empresa_id, filial_id, preco_custo, custo_reparo, 'migracao' from public.estoque_unidades where empresa_id is not null
on conflict (unidade_id) do nothing;
insert into public.vendas_vendas_custos (venda_id, empresa_id, filial_id, valor_custo)
select id, empresa_id, filial_id, valor_custo from public.vendas_vendas where empresa_id is not null
on conflict (venda_id) do nothing;
insert into public.compras_pedidos_custos (pedido_id, empresa_id, filial_id, valor_total)
select id, empresa_id, filial_id, valor_total from public.compras_pedidos where empresa_id is not null
on conflict (pedido_id) do nothing;

do $$
declare v_dif int;
begin
  select count(*) into v_dif from (
    select empresa_id, count(*) n, sum(coalesce(preco_custo, 0)) s1, sum(coalesce(custo_reparo, 0)) s2, count(preco_custo) c1
      from public.estoque_unidades where empresa_id is not null group by 1
    except
    select empresa_id, count(*), sum(coalesce(preco_custo, 0)), sum(coalesce(custo_reparo, 0)), count(preco_custo)
      from public.estoque_unidades_custos group by 1) x;
  if v_dif > 0 then raise exception 'PROVA DA CÓPIA: unidades × satélite diferem em % empresa(s)', v_dif; end if;
  select count(*) into v_dif from (
    select empresa_id, count(*) n, sum(coalesce(valor_custo, 0)) s, count(valor_custo) c from public.vendas_vendas where empresa_id is not null group by 1
    except
    select empresa_id, count(*), sum(coalesce(valor_custo, 0)), count(valor_custo) from public.vendas_vendas_custos group by 1) x;
  if v_dif > 0 then raise exception 'PROVA DA CÓPIA: vendas × satélite diferem em % empresa(s)', v_dif; end if;
  select count(*) into v_dif from (
    select empresa_id, count(*) n, sum(coalesce(valor_total, 0)) s, count(valor_total) c from public.compras_pedidos where empresa_id is not null group by 1
    except
    select empresa_id, count(*), sum(coalesce(valor_total, 0)), count(valor_total) from public.compras_pedidos_custos group by 1) x;
  if v_dif > 0 then raise exception 'PROVA DA CÓPIA: compras × satélite diferem em % empresa(s)', v_dif; end if;
end $$;

-- ── 3. marca de sincronia (sem laço) ────────────────────────────────────────────────────────────────────────
create or replace function public.custo_sincronizando() returns boolean
language sql stable set search_path to 'public', 'pg_temp' as $$
  select coalesce(current_setting('nexus.custo_sincronizando', true), '') = '1'
$$;
revoke all on function public.custo_sincronizando() from public, anon, authenticated;

-- ── 4. unidade: coluna antiga → satélite ────────────────────────────────────────────────────────────────────
-- BEFORE INSERT: custo pendente. Quem não tem estoque.ver_custo e manda 0 ou nada → nulo (pendente), também na coluna
-- antiga. Troca nunca fica pendente (o valor oferecido é o custo). Com a permissão, 0 é 0.
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
revoke all on function public.custo_unidade_pendente() from public, anon, authenticated;

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
revoke all on function public.custo_unidade_para_satelite() from public, anon, authenticated;

create or replace trigger custo_unidade_pendente before insert on public.estoque_unidades
  for each row execute function public.custo_unidade_pendente();
create or replace trigger custo_unidade_para_satelite after insert or update of preco_custo, custo_reparo, filial_id on public.estoque_unidades
  for each row execute function public.custo_unidade_para_satelite();

-- ── 5. venda: custo da unidade na venda + coluna antiga → satélite ──────────────────────────────────────────
-- BEFORE INSERT com unidade: o custo vem do satélite da unidade × quantidade (pendente se a unidade estiver pendente);
-- o que o navegador mandar é ignorado. Sem unidade: o valor recebido, como hoje.
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
revoke all on function public.custo_venda_da_unidade() from public, anon, authenticated;

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
revoke all on function public.custo_venda_para_satelite() from public, anon, authenticated;

create or replace trigger custo_venda_da_unidade before insert on public.vendas_vendas
  for each row execute function public.custo_venda_da_unidade();
create or replace trigger custo_venda_para_satelite after insert or update of valor_custo, filial_id on public.vendas_vendas
  for each row execute function public.custo_venda_para_satelite();

-- ── 6. compra: coluna antiga → satélite ─────────────────────────────────────────────────────────────────────
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
revoke all on function public.custo_compra_para_satelite() from public, anon, authenticated;
create or replace trigger custo_compra_para_satelite after insert or update of valor_total, filial_id on public.compras_pedidos
  for each row execute function public.custo_compra_para_satelite();

-- ── 7. satélite → coluna antiga (é o que deixa a volta do app do tempo 2 segura) ────────────────────────────
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
revoke all on function public.custo_satelite_para_coluna() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['estoque_unidades_custos', 'vendas_vendas_custos', 'compras_pedidos_custos'] loop
    execute format('create or replace trigger custo_satelite_para_coluna after insert or update on public.%I for each row execute function public.custo_satelite_para_coluna()', t);
  end loop;
end $$;

-- ── 8. guarda do satélite da venda ──────────────────────────────────────────────────────────────────────────
-- O custo da venda não muda depois de preenchido, nem em venda concluída (salvo o preenchimento ÚNICO de um custo
-- pendente), por QUALQUER caminho, inclusive service_role. Exceção só da marca de script do hotfix.
create or replace function public.vendas_custo_guarda()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_status text;
begin
  if new.valor_custo is not distinct from old.valor_custo
     and new.custo_preenchido_em is not distinct from old.custo_preenchido_em then
    return new;
  end if;
  if coalesce(current_setting('nexus.venda_valor_ajuste', true), '') <> '' then return new; end if;
  if old.custo_preenchido_em is not null then
    raise exception 'CUSTO_CONGELADO: o custo desta venda já foi preenchido em %', old.custo_preenchido_em using errcode = '42501';
  end if;
  select status into v_status from public.vendas_vendas where id = new.venda_id;
  if v_status = 'concluida' and not (old.valor_custo is null and new.custo_preenchido_em is not null) then
    raise exception 'CUSTO_CONGELADO: venda concluída não muda de custo (só o preenchimento único de um custo pendente)' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.vendas_custo_guarda() from public, anon, authenticated;
create or replace trigger vendas_custo_guarda before update on public.vendas_vendas_custos
  for each row execute function public.vendas_custo_guarda();

-- ── 9. itens.custo: o espelho deixa de copiar o custo (ninguém no app lê) ───────────────────────────────────
create or replace function public.estoque_item_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ref text := case when tg_table_name in ('produtos', 'estoque_produtos') then 'estoque_produtos' else 'estoque_unidades' end;
  v_titulo text;
  v_contato bigint;
begin
  if tg_op = 'DELETE' then
    delete from itens where empresa_id = old.empresa_id and ref_tabela = v_ref and ref_id = old.id;
    return old;
  end if;
  if v_ref = 'estoque_produtos' then
    insert into itens (empresa_id, tipo, modulo_dono, titulo, codigo, status, preco, dados, ref_tabela, ref_id)
    values (new.empresa_id, 'produto', 'estoque', coalesce(nullif(new.nome, ''), 'Produto'), new.codigos,
            case when coalesce(new.ativo, true) then 'ativo' else 'inativo' end, new.preco,
            jsonb_strip_nulls(jsonb_build_object('_categoria_tipo', new.categoria_tipo, '_marca_id', new.marca_id,
                                                 '_categoria_id', new.categoria_id, '_garantia_dias', new.garantia_dias)),
            v_ref, new.id)
    on conflict on constraint itens_ref_key do update set titulo = excluded.titulo, codigo = excluded.codigo,
      status = excluded.status, preco = excluded.preco, dados = excluded.dados;
  else
    select p.nome into v_titulo from public.estoque_produtos p where p.id = new.produto_id;
    select n.contato_id into v_contato from negocios n where n.id = new.reservado_lead_id;
    -- 1.1d: custo fora do espelho (C9). itens.custo fica nulo.
    insert into itens (empresa_id, filial_id, tipo, modulo_dono, titulo, identificador, status, preco, custo, dados, ref_tabela, ref_id)
    values (new.empresa_id, new.filial_id,
            case when new.placa is not null or new.chassi is not null then 'veiculo' else 'unidade' end, 'estoque',
            trim(concat_ws(' ', coalesce(v_titulo, 'Unidade'), new.armazenamento, new.cor)),
            coalesce(nullif(new.imei, ''), nullif(new.numero_serie, ''), nullif(new.placa, ''), nullif(new.chassi, '')),
            new.status, new.preco_venda, null,
            jsonb_strip_nulls(jsonb_build_object('_produto_id', new.produto_id, '_contato_id', v_contato,
                                                 '_grupo_pdv', new.grupo_pdv, '_quantidade', new.quantidade)),
            v_ref, new.id)
    on conflict on constraint itens_ref_key do update set filial_id = excluded.filial_id, tipo = excluded.tipo,
      titulo = excluded.titulo, identificador = excluded.identificador, status = excluded.status,
      preco = excluded.preco, custo = null, dados = excluded.dados;
  end if;
  return new;
end $function$;
update public.itens set custo = null where custo is not null;

-- ── 10. leitura com permissão ───────────────────────────────────────────────────────────────────────────────
create or replace function public.custo_exigir_permissao() returns bigint
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.get_empresa_id();
begin
  if v_emp is null or not coalesce(public.tem_permissao('estoque.ver_custo'), false) then
    raise exception 'SEM_PERMISSAO: custo só com a permissão "Ver custo, margem e lucro"' using errcode = '42501';
  end if;
  return v_emp;
end $$;
revoke all on function public.custo_exigir_permissao() from public, anon;
grant execute on function public.custo_exigir_permissao() to authenticated;

create or replace function public.estoque_custos_pendentes(p_filial bigint default null)
returns table (unidade_id bigint, filial_id bigint, produto text, identificador text, status text, criada_em timestamptz, venda_id bigint)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.custo_exigir_permissao();
begin
  return query
  select u.id, u.filial_id, coalesce(p.nome, 'Unidade'), coalesce(nullif(u.imei, ''), nullif(u.numero_serie, ''), nullif(u.placa, '')),
         u.status, u.created_at,
         (select max(v.id) from public.vendas_vendas v where v.unidade_id = u.id and v.empresa_id = v_emp)
    from public.estoque_unidades_custos c
    join public.estoque_unidades u on u.id = c.unidade_id
    left join public.estoque_produtos p on p.id = u.produto_id
   where c.empresa_id = v_emp and c.preco_custo is null and coalesce(u.ativo, true)
     and u.status in ('disponivel', 'reservado', 'pendente', 'vendido')
     and public.filiais_visiveis() @> array[coalesce(u.filial_id, 0)]
     and (p_filial is null or u.filial_id = p_filial)
   order by u.created_at;
end $$;
revoke all on function public.estoque_custos_pendentes(bigint) from public, anon;
grant execute on function public.estoque_custos_pendentes(bigint) to authenticated;

create or replace function public.estoque_custos_pendentes_resumo()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.custo_exigir_permissao();
begin
  return (select jsonb_build_object('total', count(*), 'por_loja', coalesce(jsonb_object_agg(f, n) filter (where f is not null), '{}'::jsonb))
            from (select coalesce(filial_id, 0)::text f, count(*) n from public.estoque_custos_pendentes(null) group by 1) x);
end $$;
revoke all on function public.estoque_custos_pendentes_resumo() from public, anon;
grant execute on function public.estoque_custos_pendentes_resumo() to authenticated;

-- Lucro e margem calculados no banco: custo pendente = margem desconhecida (nulo), nunca 100%.
create or replace function public.vendas_resultado(p_ids bigint[])
returns table (venda_id bigint, valor_venda numeric, valor_custo numeric, lucro numeric, margem numeric)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.custo_exigir_permissao();
begin
  return query
  select v.id, v.valor_venda, c.valor_custo,
         case when c.valor_custo is null then null else v.valor_venda - c.valor_custo end,
         case when c.valor_custo is null or coalesce(v.valor_venda, 0) = 0 then null
              else round(100 * (v.valor_venda - c.valor_custo) / v.valor_venda, 1) end
    from public.vendas_vendas v
    left join public.vendas_vendas_custos c on c.venda_id = v.id
   where v.id = any(p_ids) and v.empresa_id = v_emp
     and public.filiais_visiveis() @> array[coalesce(v.filial_id, 0)];
end $$;
revoke all on function public.vendas_resultado(bigint[]) from public, anon;
grant execute on function public.vendas_resultado(bigint[]) to authenticated;

create or replace function public.venda_resultado(p_venda bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  perform public.custo_exigir_permissao();
  return (select to_jsonb(r) from public.vendas_resultado(array[p_venda]) r);
end $$;
revoke all on function public.venda_resultado(bigint) from public, anon;
grant execute on function public.venda_resultado(bigint) to authenticated;

-- ── 11. escrita com permissão ───────────────────────────────────────────────────────────────────────────────
-- Informar o custo de uma unidade. Se ela foi VENDIDA com custo pendente, a venda recebe o custo UMA vez.
create or replace function public.estoque_custo_informar(p_unidade bigint, p_custo numeric, p_reparo numeric default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_emp bigint := public.custo_exigir_permissao();
  u record; c record; v record; v_venda bigint := null;
begin
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = '42501'; end if;
  if p_custo is null or p_custo < 0 or coalesce(p_reparo, 0) < 0 then raise exception 'CUSTO_INVALIDO' using errcode = '22023'; end if;
  select * into u from public.estoque_unidades where id = p_unidade and empresa_id = v_emp
     and public.filiais_visiveis() @> array[coalesce(filial_id, 0)];
  if u.id is null then raise exception 'UNIDADE_NAO_ENCONTRADA' using errcode = 'P0002'; end if;
  select * into c from public.estoque_unidades_custos where unidade_id = p_unidade;

  update public.estoque_unidades_custos
     set preco_custo = p_custo, custo_reparo = coalesce(p_reparo, custo_reparo), custo_origem = 'informado',
         atualizado_por = auth.uid(), atualizado_em = now()
   where unidade_id = p_unidade;
  perform public.auditar_emp(v_emp, 'unidade', p_unidade::text, 'custo_informado',
    jsonb_build_object('preco_custo', c.preco_custo, 'custo_reparo', c.custo_reparo),
    jsonb_build_object('preco_custo', p_custo, 'custo_reparo', coalesce(p_reparo, c.custo_reparo)), p_motivo, 'estoque_custo_informar', u.filial_id);

  if u.status = 'vendido' then
    select vv.id, vv.quantidade, vc.valor_custo, vc.custo_preenchido_em into v
      from public.vendas_vendas vv join public.vendas_vendas_custos vc on vc.venda_id = vv.id
     where vv.unidade_id = p_unidade and vv.empresa_id = v_emp and vv.status <> 'cancelada'
     order by vv.id desc limit 1;
    if v.id is not null and v.valor_custo is null and v.custo_preenchido_em is null then
      update public.vendas_vendas_custos
         set valor_custo = p_custo * coalesce(nullif(v.quantidade, 0), 1), custo_preenchido_em = now(), custo_preenchido_por = auth.uid()
       where venda_id = v.id;
      perform public.auditar_emp(v_emp, 'venda', v.id::text, 'custo_preenchido_pos_venda',
        jsonb_build_object('valor_custo', null), jsonb_build_object('valor_custo', p_custo * coalesce(nullif(v.quantidade, 0), 1)),
        p_motivo, 'estoque_custo_informar', u.filial_id);
      v_venda := v.id;
    end if;
  end if;
  return jsonb_build_object('unidade', p_unidade, 'venda_preenchida', v_venda);
end $$;
revoke all on function public.estoque_custo_informar(bigint, numeric, numeric, text) from public, anon;
grant execute on function public.estoque_custo_informar(bigint, numeric, numeric, text) to authenticated;

-- Custo de encomenda (só status 'encomenda', como o H3).
create or replace function public.venda_custo_ajustar(p_venda bigint, p_custo numeric, p_motivo text default null)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.custo_exigir_permissao(); v record; v_antes numeric;
begin
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = '42501'; end if;
  if p_custo is not null and p_custo < 0 then raise exception 'CUSTO_INVALIDO' using errcode = '22023'; end if;
  select id, status, filial_id into v from public.vendas_vendas where id = p_venda and empresa_id = v_emp
     and public.filiais_visiveis() @> array[coalesce(filial_id, 0)];
  if v.id is null then raise exception 'VENDA_NAO_ENCONTRADA' using errcode = 'P0002'; end if;
  if v.status is distinct from 'encomenda' then
    raise exception 'Preço e custo só se ajustam em encomenda (situação: %)', coalesce(v.status, 'sem situação') using errcode = '42501';
  end if;
  select valor_custo into v_antes from public.vendas_vendas_custos where venda_id = p_venda;
  update public.vendas_vendas_custos set valor_custo = p_custo where venda_id = p_venda;
  perform public.auditar_emp(v_emp, 'venda', p_venda::text, 'custo',
    jsonb_build_object('valor_custo', v_antes), jsonb_build_object('valor_custo', p_custo), p_motivo, 'venda_custo_ajustar', v.filial_id);
end $$;
revoke all on function public.venda_custo_ajustar(bigint, numeric, text) from public, anon;
grant execute on function public.venda_custo_ajustar(bigint, numeric, text) to authenticated;

-- Criar unidade (tempo 2). INVOKER: a RLS e as travas de hoje valem. O custo só entra com a permissão ou na troca;
-- sem isso a unidade nasce com custo pendente.
create or replace function public.estoque_unidade_criar(p jsonb)
returns bigint language plpgsql security invoker set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.get_empresa_id(); v_id bigint; v_cols text; v_p jsonb;
  v_ve boolean := coalesce(public.tem_permissao('estoque.ver_custo'), false);
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = '42501'; end if;
  v_p := (coalesce(p, '{}'::jsonb) - 'id' - 'empresa_id' - 'created_at') || jsonb_build_object('empresa_id', v_emp);
  if not (v_ve or coalesce(v_p ->> 'tipo', '') = 'troca') then
    v_p := v_p - 'preco_custo' - 'custo_reparo';   -- sem a permissão: nasce com custo pendente
  end if;
  -- só as colunas enviadas: as que faltam ficam com o padrão da tabela (ativo, status, tipo, quantidade...)
  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(v_p) k
   where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'estoque_unidades' and c.column_name = k and c.is_generated = 'NEVER');
  execute format('insert into public.estoque_unidades (%1$s) select %1$s from jsonb_populate_record(null::public.estoque_unidades, $1) returning id', v_cols)
    using v_p into v_id;
  return v_id;
end $$;
revoke all on function public.estoque_unidade_criar(jsonb) from public, anon;
grant execute on function public.estoque_unidade_criar(jsonb) to authenticated;

-- Salvar pedido de compra (tempo 2). INVOKER. O valor só entra com a permissão.
create or replace function public.compras_pedido_salvar(p jsonb)
returns bigint language plpgsql security invoker set search_path to 'public', 'pg_temp' as $$
declare v_emp bigint := public.get_empresa_id(); v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_ve boolean := coalesce(public.tem_permissao('estoque.ver_custo'), false);
  v_hoje date;
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = '42501'; end if;
  v_hoje := (now() at time zone coalesce(public.empresa_fuso(v_emp), 'America/Sao_Paulo'))::date;   -- o dia da loja
  if v_id is null then
    insert into public.compras_pedidos (empresa_id, filial_id, fornecedor_id, descricao, valor_total, status, observacoes, usuario_id, data_pedido)
    values (v_emp, nullif(p ->> 'filial_id', '')::bigint, nullif(p ->> 'fornecedor_id', '')::bigint, p ->> 'descricao',
            case when v_ve then nullif(p ->> 'valor_total', '')::numeric end, coalesce(p ->> 'status', 'pendente'), p ->> 'observacoes',
            auth.uid(), coalesce(to_date(nullif(p ->> 'data_pedido', ''), 'YYYY-MM-DD'), v_hoje))
    returning id into v_id;
  else
    update public.compras_pedidos
       set fornecedor_id = coalesce(nullif(p ->> 'fornecedor_id', '')::bigint, fornecedor_id),
           descricao = coalesce(p ->> 'descricao', descricao),
           valor_total = case when v_ve and p ? 'valor_total' then nullif(p ->> 'valor_total', '')::numeric else valor_total end,
           status = coalesce(p ->> 'status', status), observacoes = coalesce(p ->> 'observacoes', observacoes)
     where id = v_id and empresa_id = v_emp;
    if not found then raise exception 'PEDIDO_NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.compras_pedido_salvar(jsonb) from public, anon;
grant execute on function public.compras_pedido_salvar(jsonb) to authenticated;
