-- Volta da 20261105000600_drop_views_lote4: recria as 7 views como estavam na produção em
-- 04/11/2026 (colunas, security_invoker, grants). As duas funções NÃO voltam ao corpo antigo:
-- lendo estoque_produtos, funcionam com ou sem a view.
begin;
create view public.produtos with (security_invoker = true) as
  select id, nome, marca_id, categoria_id, subcategoria_id, cores, armazenamentos, ativo, created_at, codigos,
         categoria_tipo, empresa_id, preco, descricao, foto_url, disponivel, garantia_dias
    from public.estoque_produtos;
create view public.categorias_produtos with (security_invoker = true) as
  select id, nome, ativo, usuario_id, created_at, tipo_formulario, ordem, empresa_id
    from public.estoque_categorias;
create view public.marcas_produtos with (security_invoker = true) as
  select id, nome, created_at, ativo, ordem, empresa_id
    from public.estoque_marcas;
create view public.fornecedores with (security_invoker = true) as
  select id, nome_fantasia, razao_social, cnpj, telefone, email, contato, observacoes, ativo, created_at, empresa_id
    from public.estoque_fornecedores;
create view public.inventario_unidades with (security_invoker = true) as
  select id, produto_id, imei, imei2, numero_serie, bateria, condicao, cor, armazenamento, preco_custo, preco_venda,
         fornecedor_id, observacoes, status, usuario_id, ativo, created_at, anatel_resultado, tipo, estado,
         custo_reparo, cliente_id, fotos_urls, empresa_id, placa, chassi, renavam, km, ano, reservado_lead_id,
         reservado_por, reservado_em, reserva_expira_em, grupo_pdv, recebido_em, recebido_por, quantidade, filial_id
    from public.estoque_unidades;
create view public.tabela_precos with (security_invoker = true) as
  select id, empresa_id, modelo, armazenamento, condicao, preco_sugerido, observacoes, ativo, created_at
    from public.estoque_tabela_precos;
create view public.avaliacoes_usados with (security_invoker = true) as
  select id, empresa_id, lead_id, veiculo, km, fotos_urls, valor_mercado, valor_ofertado, status, observacoes,
         usuario_id, unidade_id, created_at, filial_id
    from public.avaliacao_usados;

grant all on public.produtos, public.categorias_produtos, public.marcas_produtos, public.fornecedores,
  public.inventario_unidades, public.tabela_precos, public.avaliacoes_usados
  to anon, authenticated, service_role;
commit;
