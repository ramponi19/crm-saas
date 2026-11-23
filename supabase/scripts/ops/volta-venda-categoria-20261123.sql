-- Volta da classificação da venda de 23/11/2026 (categoria e condição em negocios.dados.venda).
-- Lotes na tabela _backup_venda_categoria_20261123: '4b_147' (conciliação) e 'antigos_72' (ganhos antigos).
-- Devolve o `dados` de antes SÓ onde a única diferença ainda é a chave `venda` gravada pelo lote (se alguém
-- mexeu no negócio depois, ele fica de fora e aparece na contagem). Nada é apagado: o histórico ganha uma
-- linha 'venda_classificada_desfeita' por negócio. Trocar o lote em v_lote; rodar a parte 1 antes (só leitura).

-- 1. Conferência (só leitura)
select b.lote, count(*) total,
       count(*) filter (where (n.dados - 'venda') = b.dados_antes and n.dados->'venda'->>'origem' in ('conciliacao_zip', 'pedido_grupo')) volta_limpa,
       count(*) filter (where (n.dados - 'venda') is distinct from b.dados_antes) mexido_depois
  from _backup_venda_categoria_20261123 b join negocios n on n.id = b.negocio_id
 group by b.lote;

-- 2. Volta de um lote
do $$
declare v_lote text := '4b_147'; n_up int; n_hist int;
begin
  with alvo as (
    select n.id, n.etapa_id, b.dados_antes from negocios n join _backup_venda_categoria_20261123 b on b.negocio_id = n.id
     where b.lote = v_lote and n.empresa_id = 1
       and (n.dados - 'venda') = b.dados_antes and n.dados->'venda'->>'origem' in ('conciliacao_zip', 'pedido_grupo')
  ), up as (
    update negocios n set dados = a.dados_antes from alvo a where n.id = a.id returning n.id
  ), h as (
    insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, por_usuario, detalhe)
    select 1, a.id, a.etapa_id, a.etapa_id, 'venda_classificada_desfeita', null, jsonb_build_object('lote', v_lote) from alvo a
    returning negocio_id
  )
  select (select count(*) from up), (select count(*) from h) into n_up, n_hist;
  raise notice 'lote %: % negocios devolvidos, % linhas de historico', v_lote, n_up, n_hist;
end $$;
