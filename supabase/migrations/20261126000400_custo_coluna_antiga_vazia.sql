-- ETAPA 1.1f — CUSTO PROTEGIDO, TEMPO 3: COLUNA ANTIGA VAZIA PARA TODOS (26/11/2026; docs/etapa-1.1-plano.md §4.5).
--
-- SOBE LOGO DEPOIS DA 1.1e (o app que lê e grava só nos satélites), na MESMA janela: com a 1.1e no ar e o smoke ok.
--   - estoque_unidades.preco_custo/custo_reparo, vendas_vendas.valor_custo (e, por consequência, a coluna gerada
--     lucro) e compras_pedidos.valor_total ficam NULOS para todos. O custo continua inteiro nos satélites (prova);
--   - o gatilho coluna antiga → satélite vira só PORTA DE ENTRADA: o que alguém ainda gravar na coluna vai para o
--     satélite (com as regras de permissão e de pendente) e a coluna volta a nulo;
--   - o gatilho satélite → coluna antiga fica desligado (a função não faz mais nada);
--   - venda de unidade: o custo vem do satélite da unidade × quantidade, direto para o satélite da venda.
-- Sem DDL nas tabelas do app: só troca o CORPO das funções dos gatilhos da 1.1d (mesmos nomes e assinaturas) e
-- esvazia as colunas uma vez, com lock_timeout (lição do deadlock de 25/11). Volta:
-- supabase/scripts/volta/volta-custo-coluna-antiga-vazia.sql (copia os satélites de volta e religa a sincronia).

set local lock_timeout = '5s';

-- ── 1. porta de entrada: unidade ────────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT: nada de custo na coluna (a AFTER grava no satélite e a coluna nasce nula).
create or replace function public.custo_unidade_pendente()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  -- 1.1f: a regra do pendente mora na custo_unidade_para_satelite (que vê o id da unidade); aqui nada muda.
  return new;
end $$;

create or replace function public.custo_unidade_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_ve boolean; v_antes record; v_custo numeric; v_reparo numeric; v_gravar boolean;
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  -- sem usuário (chave de serviço, script, cron) = escrita confiável do servidor; o navegador sempre tem usuário
  v_ve := auth.uid() is null or coalesce(public.tem_permissao('estoque.ver_custo'), false) or coalesce(new.tipo, '') = 'troca';
  select preco_custo, custo_reparo into v_antes from public.estoque_unidades_custos where unidade_id = new.id;
  perform set_config('nexus.custo_sincronizando', '1', true);
  if tg_op = 'INSERT' then
    -- quem tem a permissão (ou a troca) grava o custo; sem ela, ou com 0/nulo sem ela, nasce pendente
    v_custo := case when v_ve and not (coalesce(new.preco_custo, 0) = 0 and coalesce(new.tipo, '') <> 'troca'
                                       and auth.uid() is not null and not coalesce(public.tem_permissao('estoque.ver_custo'), false))
                    then new.preco_custo end;
    v_reparo := case when v_ve then new.custo_reparo end;
    insert into public.estoque_unidades_custos (unidade_id, empresa_id, filial_id, preco_custo, custo_reparo, custo_origem, atualizado_por)
    values (new.id, new.empresa_id, new.filial_id, v_custo, v_reparo,
            case when new.tipo = 'troca' then 'troca' else 'entrada' end, auth.uid())
    on conflict (unidade_id) do nothing;
  else
    v_gravar := v_ve and (new.preco_custo is not null or new.custo_reparo is not null)
                and (coalesce(new.preco_custo, v_antes.preco_custo), coalesce(new.custo_reparo, v_antes.custo_reparo))
                    is distinct from (v_antes.preco_custo, v_antes.custo_reparo);   -- reenviar o mesmo valor não audita
    if v_gravar then
      update public.estoque_unidades_custos
         set preco_custo = coalesce(new.preco_custo, preco_custo), custo_reparo = coalesce(new.custo_reparo, custo_reparo),
             custo_origem = 'informado', atualizado_por = auth.uid(), atualizado_em = now()
       where unidade_id = new.id;
      perform public.auditar_emp(new.empresa_id, 'unidade', new.id::text, 'custo',
        jsonb_build_object('preco_custo', v_antes.preco_custo, 'custo_reparo', v_antes.custo_reparo),
        jsonb_build_object('preco_custo', coalesce(new.preco_custo, v_antes.preco_custo), 'custo_reparo', coalesce(new.custo_reparo, v_antes.custo_reparo)),
        null, 'coluna antiga (porta de entrada)', new.filial_id);
    end if;
    if new.filial_id is distinct from old.filial_id then
      update public.estoque_unidades_custos set filial_id = new.filial_id where unidade_id = new.id;
    end if;
  end if;
  -- a coluna antiga volta a nulo
  if new.preco_custo is not null or new.custo_reparo is not null then
    update public.estoque_unidades set preco_custo = null, custo_reparo = null where id = new.id;
  end if;
  perform set_config('nexus.custo_sincronizando', '', true);
  return null;
end $$;

-- ── 2. porta de entrada: venda ──────────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT: com unidade, a coluna nasce nula (o custo vem da unidade, na AFTER).
create or replace function public.custo_venda_da_unidade()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if public.custo_sincronizando() or new.unidade_id is null then return new; end if;
  new.valor_custo := null;
  return new;
end $$;

create or replace function public.custo_venda_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_ve boolean := auth.uid() is null or coalesce(public.tem_permissao('estoque.ver_custo'), false); v_custo numeric; v_achou boolean; v_antes numeric;
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  perform set_config('nexus.custo_sincronizando', '1', true);
  if tg_op = 'INSERT' then
    if new.unidade_id is not null then
      select true, preco_custo into v_achou, v_custo from public.estoque_unidades_custos where unidade_id = new.unidade_id;
      v_custo := case when v_achou then v_custo * coalesce(nullif(new.quantidade, 0), 1) end;
    else
      v_custo := case when v_ve then new.valor_custo end;
    end if;
    insert into public.vendas_vendas_custos (venda_id, empresa_id, filial_id, valor_custo)
    values (new.id, new.empresa_id, new.filial_id, v_custo)
    on conflict (venda_id) do nothing;
  else
    select valor_custo into v_antes from public.vendas_vendas_custos where venda_id = new.id;
    if new.valor_custo is not null and v_ve and new.valor_custo is distinct from v_antes then
      update public.vendas_vendas_custos set valor_custo = new.valor_custo where venda_id = new.id;   -- a guarda decide
      perform public.auditar_emp(new.empresa_id, 'venda', new.id::text, 'custo',
        jsonb_build_object('valor_custo', v_antes), jsonb_build_object('valor_custo', new.valor_custo),
        null, 'coluna antiga (porta de entrada)', new.filial_id);
    end if;
    if new.filial_id is distinct from old.filial_id then
      update public.vendas_vendas_custos set filial_id = new.filial_id where venda_id = new.id;
    end if;
  end if;
  if new.valor_custo is not null then
    update public.vendas_vendas set valor_custo = null where id = new.id;
  end if;
  perform set_config('nexus.custo_sincronizando', '', true);
  return null;
end $$;

-- ── 3. porta de entrada: compra ─────────────────────────────────────────────────────────────────────────────
create or replace function public.custo_compra_para_satelite()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_ve boolean := auth.uid() is null or coalesce(public.tem_permissao('estoque.ver_custo'), false);
begin
  if public.custo_sincronizando() or new.empresa_id is null then return null; end if;
  perform set_config('nexus.custo_sincronizando', '1', true);
  if tg_op = 'INSERT' then
    insert into public.compras_pedidos_custos (pedido_id, empresa_id, filial_id, valor_total)
    values (new.id, new.empresa_id, new.filial_id, case when v_ve then new.valor_total end)
    on conflict (pedido_id) do nothing;
  else
    if new.valor_total is not null and v_ve then
      update public.compras_pedidos_custos set valor_total = new.valor_total where pedido_id = new.id;
    end if;
    if new.filial_id is distinct from old.filial_id then
      update public.compras_pedidos_custos set filial_id = new.filial_id where pedido_id = new.id;
    end if;
  end if;
  if new.valor_total is not null then
    update public.compras_pedidos set valor_total = null where id = new.id;
  end if;
  perform set_config('nexus.custo_sincronizando', '', true);
  return null;
end $$;

-- ── 4. satélite → coluna antiga: desligado ──────────────────────────────────────────────────────────────────
create or replace function public.custo_satelite_para_coluna()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  -- 1.1f: a coluna antiga fica vazia; o satélite é a única fonte. (Na volta, o corpo da 1.1d é restaurado.)
  return null;
end $$;

-- ── 5. esvaziar as colunas antigas, com prova ───────────────────────────────────────────────────────────────
do $$
declare
  v_antes jsonb; v_depois jsonb; v_restam bigint;
begin
  select jsonb_build_object(
    'u', (select jsonb_agg(jsonb_build_array(empresa_id, n, s1, s2, c) order by empresa_id) from (select empresa_id, count(*) n, sum(preco_custo) s1, sum(custo_reparo) s2, count(preco_custo) c from public.estoque_unidades_custos group by 1) x),
    'v', (select jsonb_agg(jsonb_build_array(empresa_id, n, s, c) order by empresa_id) from (select empresa_id, count(*) n, sum(valor_custo) s, count(valor_custo) c from public.vendas_vendas_custos group by 1) x),
    'c', (select jsonb_agg(jsonb_build_array(empresa_id, n, s, c) order by empresa_id) from (select empresa_id, count(*) n, sum(valor_total) s, count(valor_total) c from public.compras_pedidos_custos group by 1) x))
    into v_antes;

  -- a coluna antiga tem de estar igual ao satélite antes de apagar (sincronia da 1.1d); senão, para
  if exists (select 1 from public.estoque_unidades u join public.estoque_unidades_custos c on c.unidade_id = u.id
              where (u.preco_custo, u.custo_reparo) is distinct from (c.preco_custo, c.custo_reparo))
     or exists (select 1 from public.vendas_vendas v join public.vendas_vendas_custos c on c.venda_id = v.id
              where v.valor_custo is distinct from c.valor_custo)
     or exists (select 1 from public.compras_pedidos p join public.compras_pedidos_custos c on c.pedido_id = p.id
              where p.valor_total is distinct from c.valor_total)
     or exists (select 1 from public.estoque_unidades u where u.empresa_id is not null and not exists (select 1 from public.estoque_unidades_custos c where c.unidade_id = u.id))
     or exists (select 1 from public.vendas_vendas v where v.empresa_id is not null and not exists (select 1 from public.vendas_vendas_custos c where c.venda_id = v.id))
     or exists (select 1 from public.compras_pedidos p where p.empresa_id is not null and not exists (select 1 from public.compras_pedidos_custos c where c.pedido_id = p.id)) then
    raise exception 'PROVA: coluna antiga e satélite diferem antes de esvaziar; nada foi apagado';
  end if;

  perform set_config('nexus.custo_sincronizando', '1', true);
  update public.estoque_unidades set preco_custo = null, custo_reparo = null where preco_custo is not null or custo_reparo is not null;
  update public.vendas_vendas set valor_custo = null where valor_custo is not null;   -- lucro (gerada) fica nula junto
  update public.compras_pedidos set valor_total = null where valor_total is not null;
  perform set_config('nexus.custo_sincronizando', '', true);

  select jsonb_build_object(
    'u', (select jsonb_agg(jsonb_build_array(empresa_id, n, s1, s2, c) order by empresa_id) from (select empresa_id, count(*) n, sum(preco_custo) s1, sum(custo_reparo) s2, count(preco_custo) c from public.estoque_unidades_custos group by 1) x),
    'v', (select jsonb_agg(jsonb_build_array(empresa_id, n, s, c) order by empresa_id) from (select empresa_id, count(*) n, sum(valor_custo) s, count(valor_custo) c from public.vendas_vendas_custos group by 1) x),
    'c', (select jsonb_agg(jsonb_build_array(empresa_id, n, s, c) order by empresa_id) from (select empresa_id, count(*) n, sum(valor_total) s, count(valor_total) c from public.compras_pedidos_custos group by 1) x))
    into v_depois;
  if v_antes is distinct from v_depois then raise exception 'PROVA: os satélites mudaram (% → %)', v_antes, v_depois; end if;

  select (select count(*) from public.estoque_unidades where preco_custo is not null or custo_reparo is not null)
       + (select count(*) from public.vendas_vendas where valor_custo is not null or lucro is not null)
       + (select count(*) from public.compras_pedidos where valor_total is not null)
       + (select count(*) from public.itens where custo is not null) into v_restam;
  if v_restam > 0 then raise exception 'PROVA: ainda há % valor(es) de custo nas colunas antigas', v_restam; end if;
end $$;
