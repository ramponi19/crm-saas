-- VOLTA da 20261126001400 (comissão da pessoa): a RLS de metas_comissoes e vendas_comissoes volta a recortar pela
-- loja do topo. vendas_da_equipe fica (sem uso pelo app anterior).
begin;
set local lock_timeout = '5s';
alter policy tenant_isolamento on public.metas_comissoes
  using (empresa_id = get_empresa_id() and (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)])
  with check (empresa_id = get_empresa_id() and (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]);
alter policy tenant_isolamento on public.vendas_comissoes
  using (empresa_id = get_empresa_id() and (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)])
  with check (empresa_id = get_empresa_id() and (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]);
commit;

-- PARTE 2 (só se a 1410 tiver rodado e for preciso a loja da comissão de volta): recriar a tabela e a função da
-- 20261126001100 (trechos empresa_usuario_comissao e comissao_loja_salvar) e repor do backup:
-- insert into public.empresa_usuario_comissao (empresa_id, usuario_id, filial_id, atualizado_em, atualizado_por)
--   select empresa_id, usuario_id, filial_id, atualizado_em, atualizado_por from public._backup_empresa_usuario_comissao_20261126;
