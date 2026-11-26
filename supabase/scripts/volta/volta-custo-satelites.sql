-- VOLTA da 20261126000300_custo_satelites (1.1d, tempo 1). As colunas antigas nunca deixaram de ter o valor
-- (a sincronia é nos dois sentidos): nada a restaurar nelas. Tira gatilhos, funções e satélites; o espelho
-- itens.custo volta a ser preenchido a partir da coluna antiga.
-- ATENÇÃO: só serve enquanto o app do tempo 2 (1.1e) NÃO estiver no ar (ele lê os satélites).
set local lock_timeout = '5s';

drop trigger if exists custo_unidade_pendente on public.estoque_unidades;
drop trigger if exists custo_unidade_para_satelite on public.estoque_unidades;
drop trigger if exists custo_venda_da_unidade on public.vendas_vendas;
drop trigger if exists custo_venda_para_satelite on public.vendas_vendas;
drop trigger if exists custo_compra_para_satelite on public.compras_pedidos;

drop function if exists public.compras_pedido_salvar(jsonb);
drop function if exists public.estoque_unidade_criar(jsonb);
drop function if exists public.venda_custo_ajustar(bigint, numeric, text);
drop function if exists public.estoque_custo_informar(bigint, numeric, numeric, text);
drop function if exists public.venda_resultado(bigint);
drop function if exists public.vendas_resultado(bigint[]);
drop function if exists public.estoque_custos_pendentes_resumo();
drop function if exists public.estoque_custos_pendentes(bigint);
drop function if exists public.custo_exigir_permissao();

drop table if exists public.vendas_vendas_custos;
drop table if exists public.estoque_unidades_custos;
drop table if exists public.compras_pedidos_custos;

drop function if exists public.vendas_custo_guarda();
drop function if exists public.custo_satelite_para_coluna();
drop function if exists public.custo_compra_para_satelite();
drop function if exists public.custo_venda_para_satelite();
drop function if exists public.custo_venda_da_unidade();
drop function if exists public.custo_unidade_para_satelite();
drop function if exists public.custo_unidade_pendente();
drop function if exists public.custo_sincronizando();

-- espelho como era (20261105000600_drop_views_lote4.sql): custo copiado da unidade
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
    insert into itens (empresa_id, filial_id, tipo, modulo_dono, titulo, identificador, status, preco, custo, dados, ref_tabela, ref_id)
    values (new.empresa_id, new.filial_id,
            case when new.placa is not null or new.chassi is not null then 'veiculo' else 'unidade' end, 'estoque',
            trim(concat_ws(' ', coalesce(v_titulo, 'Unidade'), new.armazenamento, new.cor)),
            coalesce(nullif(new.imei, ''), nullif(new.numero_serie, ''), nullif(new.placa, ''), nullif(new.chassi, '')),
            new.status, new.preco_venda, new.preco_custo,
            jsonb_strip_nulls(jsonb_build_object('_produto_id', new.produto_id, '_contato_id', v_contato,
                                                 '_grupo_pdv', new.grupo_pdv, '_quantidade', new.quantidade)),
            v_ref, new.id)
    on conflict on constraint itens_ref_key do update set filial_id = excluded.filial_id, tipo = excluded.tipo,
      titulo = excluded.titulo, identificador = excluded.identificador, status = excluded.status,
      preco = excluded.preco, custo = excluded.custo, dados = excluded.dados;
  end if;
  return new;
end $function$;
update public.itens i set custo = u.preco_custo
  from public.estoque_unidades u
 where i.ref_tabela = 'estoque_unidades' and i.ref_id = u.id and i.custo is distinct from u.preco_custo;
