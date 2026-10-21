-- ⚠ SUPERADA EM 21/10/2026 — NÃO REAPLICAR ESTE ARQUIVO.
-- A versão em vigor está em supabase/migrations/20261022001000_zapintel_le_o_core.sql (lê negocios e
-- mensagens direto; este arquivo lê as views leads/lead_mensagens, que custavam até 200 s por chamada
-- depois do corte). O texto abaixo fica como histórico das regras e das decisões.
--
-- PÓS-VENDA DO ZAPINTEL: QUEM JÁ COMPROU E PRECISA DA LOJA.
--
-- Aplicada no banco em 15/10/2026. Substitui a tela antiga, que listava só os
-- 35 "clientes" do motor de palavras (as análises leem 246), deduzia o produto
-- por palavra-chave e sugeria mensagens prometendo "brinde especial" e "preço
-- especial" que a loja nunca ofereceu.
--
-- Cliente = a análise leu a compra (classificação customer) OU há venda do CRM
-- ligada à conversa (zapintel_venda_lead). Conversas de funil interno ficam
-- de fora, como em todo o ZapIntel.
--
-- Para cada cliente: o que comprou (da venda ligada, quando há), as pendências
-- de pós-venda que a análise apontou (⚠), se a loja já pediu indicação (frase
-- inequívoca, a mesma regra do Insights), se ele chegou por indicação, quanto
-- tempo está sem conversa, e a mensagem que a análise sugeriu.
create or replace function public.zapintel_posvenda(p_filial bigint default null, p_empresa bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.telefone, l.filial_id, l.origem
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si,
           p.perfil->>'mensagemSugerida' msg, p.perfil->>'diagnostico' diag
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  VL as materialized (
    select distinct on (z.lead_id) z.lead_id, coalesce(v.data_venda, v.created_at) quando, v.valor_venda, pr.nome produto
    from zapintel_venda_lead z join vendas v on v.id = z.venda_id
    left join produtos pr on pr.id = v.produto_id
    where z.empresa_id = v_emp and z.lead_id is not null and v.status in ('concluida', 'encomenda')
    order by z.lead_id, coalesce(v.data_venda, v.created_at) desc
  ),
  C as materialized (
    select L.*, F.ps, F.si, F.msg, F.diag, VL.quando venda_em, VL.valor_venda, VL.produto,
           (select max(m.created_at) from lead_mensagens m where m.lead_id = L.id) um
    from L left join F on F.lead_id = L.id left join VL on VL.lead_id = L.id
    where F.cls = 'customer' or VL.lead_id is not null
  ),
  PEDIU as (
    select distinct m.lead_id from lead_mensagens m join C on C.id = m.lead_id
    where m.empresa_id = v_emp and m.direcao = 'enviada'
      and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
          '(me indica|indicar algu|indica algu|conhece algu[eé]m que|algu[eé]m que (queira|precise|esteja)|indica a gente|indica a loja|nos indicar|pode indicar|indique)'
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  R as (
    select C.*,
           (select array_agg(t) from jsonb_array_elements_text(coalesce(C.ps, '[]'::jsonb)) t where t like '⚠%') pendencias,
           exists (select 1 from PEDIU where PEDIU.lead_id = C.id) pediu,
           exists (select 1 from jsonb_array_elements(coalesce(C.si, '[]'::jsonb)) s
                   where zapintel_familia_sinal(s->>'rotulo') = 'Veio por indicação') veio_indicado
    from C
  )
  select jsonb_build_object(
    'empresa', v_emp,
    'total', (select count(*) from R),
    'comVendaRegistrada', (select count(*) from R where venda_em is not null),
    'comPendencia', (select count(*) from R where pendencias is not null),
    'semPedidoIndicacao', (select count(*) from R where not pediu),
    'semConversa60d', (select count(*) from R where um < v_agora - interval '60 days'),
    'clientes', coalesce((select jsonb_agg(c order by c->>'ordem', c->>'ultimaMensagem' desc) from (
        select jsonb_build_object(
          'leadId', id, 'nome', nome, 'telefone', telefone, 'origem', origem,
          'loja', (select rotulo from NOMES where NOMES.id = R.filial_id),
          'produto', produto, 'valor', valor_venda, 'vendaEm', venda_em,
          'ultimaMensagem', um,
          'pendencias', to_jsonb(pendencias),
          'pediuIndicacao', pediu, 'veioIndicado', veio_indicado,
          'mensagem', msg, 'diagnostico', diag,
          -- Pendência primeiro: é o cliente que pode estar insatisfeito agora.
          'ordem', case when pendencias is not null then '0' else '1' end) c
        from R) z), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.zapintel_posvenda(bigint, bigint) from public, anon;
grant execute on function public.zapintel_posvenda(bigint, bigint) to authenticated;
