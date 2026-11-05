-- Volta da 20261105000800_drop_views_lote6: recria as 4 views como estavam na produção em
-- 05/11/2026 (colunas, security_invoker, grants) e a propagar_filial_do_lead() (morta, sem
-- gatilho; volta só para a volta ser completa). Rodar antes do Instant Rollback.
begin;
create view public.imoveis with (security_invoker = true) as
  select id, empresa_id, proprietario_id, codigo, titulo, tipo, finalidade, status, descricao, valor_venda,
         valor_locacao, valor_condominio, valor_iptu, iptu_periodicidade, area_util, area_total, quartos, suites,
         banheiros, vagas, matricula, aceita_permuta, aceita_financiamento, publicar_portais, cep, logradouro,
         numero, complemento, bairro, cidade, uf, latitude, longitude, ocultar_numero_publico, fotos, created_at,
         updated_at, captado_por, captado_em
    from public.imoveis_imoveis;
create view public.chaves_imoveis with (security_invoker = true) as
  select id, empresa_id, imovel_id, codigo, status, com_quem, retirada_em, devolucao_prevista, observacoes,
         usuario_id, created_at
    from public.imoveis_chaves;
create view public.negocios_imobiliarios with (security_invoker = true) as
  select id, empresa_id, imovel_id, lead_id, cliente_id, tipo, valor, corretor_id, captador_id, status,
         assinado_em, vistoria_em, chaves_entregues_em, locacao_inicio, locacao_fim, observacoes, criado_por,
         created_at, updated_at, percentual, comissao_total, comissao_captador, comissao_vendedor, cashback,
         comissao_status, comissao_paga_em, cliente_nome, imovel_codigo, origem, cashback_percentual,
         comissao_aprovada_em
    from public.imoveis_negocios;
create view public.lead_perfil_busca with (security_invoker = true) as
  select id, empresa_id, lead_id, finalidade, tipos, cidades, bairros, preco_min, preco_max, quartos_min,
         vagas_min, ativo, created_at, updated_at, cliente_id, quartos_max, suites_min, area_min, area_max,
         caracteristicas, observacoes, filial_id
    from public.imoveis_perfis_busca;
grant all on public.imoveis, public.chaves_imoveis, public.negocios_imobiliarios, public.lead_perfil_busca
  to anon, authenticated, service_role;

create or replace function public.propagar_filial_do_lead()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update lead_mensagens      set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update lead_perfil_busca   set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update cadencia_inscricoes set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  update clientes            set filial_id = new.filial_id where lead_id = new.id and filial_id is distinct from new.filial_id;
  return new;
end $function$;
revoke execute on function public.propagar_filial_do_lead() from public, anon, authenticated;
grant execute on function public.propagar_filial_do_lead() to service_role;
commit;
