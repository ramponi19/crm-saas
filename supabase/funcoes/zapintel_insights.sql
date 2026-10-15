-- INSIGHTS DO ZAPINTEL: POR QUE A LOJA VENDE E POR QUE PERDE.
--
-- Aplicada no banco em 14/10/2026.
--
-- Pedido do Lucas em 14/10/2026: *"auditoria nas telas insights (aqui é os
-- insigths de ia focado em venda total)"*. A tela antiga era toda do motor de
-- palavras, e a auditoria mediu:
--   · "Pediu indicação" 89 → uns 5 de verdade (46 eram "você conhece a loja?");
--   · "Chamou pelo nome" não separa venda: 14,8% compram chamando ou não;
--   · "Atendentes" saíam do texto ("seguinte", "CEP", "roxo"); só 83 leads
--     têm responsável;
--   · "Aguardando a loja" 465 contava "Fechado" e "obrigado" (o real: 47);
--   · 431 quentes (análises: 40), 35 clientes (análises: 246).
-- E testou o que costuma virar card e NÃO separa venda — tempo da primeira
-- resposta (13–17% em toda faixa) e hora de chegada (11–16%). Não estão aqui
-- de propósito: um card com eles afirmaria o que o número não sustenta.
--
-- O papel desta tela: o dashboard é o AGORA, a lista é QUEM; os insights são
-- O QUE MUDAR — no período escolhido, a partir das análises e das vendas.
--
-- "Comprou" = a venda está ligada à conversa (zapintel_venda_lead) OU a
-- análise leu a compra (classificação customer). Só a ponte daria 34
-- compradores; com a leitura da análise são 246 — e a diferença entre os dois
-- é justamente o card "Venda total".
--
-- p_dias: 7 | 30 | 90 | null (tudo). As conversas entram se tiveram mensagem
-- no período; as vendas do CRM, pela data da venda.

-- Os sinais da análise são texto livre ("modelo e cor definidos", "cliente da
-- casa", 600+ rótulos diferentes). Agrupados como as objeções. "Depois da
-- compra" (fechou, satisfeita, recebeu) existe para SAIR da comparação: um
-- sinal que descreve a compra não prevê a compra. Indicação vem antes de tudo
-- porque "chegou por indicação" cairia em "chegou" (depois da compra).
create or replace function public.zapintel_familia_sinal(r text)
returns text
language sql
immutable
as $$
  select case
    when r ~* 'indica' then 'Veio por indicação'
    when r ~* '(fechou|comprou|satisfeit|gostou|elogi|recebeu|chegou|pagou|entregue|feliz|agradec|retirou|levou)' then 'Depois da compra'
    when r ~* '(decid|fecha com|vai fechar|quer fechar|vai comprar|quer comprar|disse que fecha|pronto para fechar|pronta para fechar)' then 'Disse que ia comprar'
    when r ~* '(cliente|volt|recorrente|já compr|ja compr|conhece o dono|da casa|fiel)' then 'Já é da casa'
    when r ~* '(troca|entrada|usado|aparelho bom|aparelho ótimo|aparelho otimo)' then 'Tem aparelho para dar de entrada'
    when r ~* '(à vista|a vista|pix|dinheiro|orçamento|orcamento|tem o valor|limite|cartão|cartao|parcel|pagamento)' then 'Pagamento resolvido'
    when r ~* '(modelo|cor|escolh|defini|capacidade|gb)' then 'Já escolheu o aparelho'
    when r ~* '(data|marc|hoje|amanhã|amanha|ia à loja|ia a loja|visita|buscar|retirar|horário|horario)' then 'Marcou dia ou visita'
    when r ~* '(entrega|prazo|frete|motoboy|endereço|endereco)' then 'Perguntou de entrega'
    when r ~* '(presente|aniversário|aniversario|natal)' then 'É presente'
    when r ~* '(urgên|urgen|precis|necessidade|quebrou|caiu|estragou|parou)' then 'Precisa logo'
    when r ~* 'primeiro iphone' then 'Primeiro iPhone'
    when r ~* '(quer|interess|pergunt|pediu)' then 'Demonstrou interesse'
    else 'Outros'
  end
$$;

create or replace function public.zapintel_insights(
  p_dias int default 30,
  p_filial bigint default null,
  p_empresa bigint default null
)
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
  v_desde timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.nome, l.filial_id, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, max(m.created_at) um
    from lead_mensagens m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->>'diagnostico' diag,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp and lead_id is not null),
  -- Só conversa com análise e com movimento no período. Fora do funil (vaga de
  -- emprego, fornecedor, engano) não entra em conta de venda.
  X as materialized (
    select L.*, M.um, F.cls, F.diag, F.obj, F.ps, F.si,
           (B.lead_id is not null) ligada,
           (B.lead_id is not null or F.cls = 'customer') comprou
    from L join M on M.lead_id = L.id join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
    where M.um >= v_desde and F.cls <> 'unqualified'
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),

  -- ── 1. VENDA TOTAL ───────────────────────────────────────────────────────
  -- Uma venda do PDV com 3 itens são 3 linhas e 1 venda: conta-se o grupo.
  V as (
    select count(distinct coalesce(v.grupo_pdv::text, v.id::text)) vendas,
           coalesce(sum(v.valor_venda), 0) valor,
           count(distinct coalesce(v.grupo_pdv::text, v.id::text)) filter (
             where exists (select 1 from zapintel_venda_lead z where z.venda_id = v.id and z.lead_id is not null)) com_conversa
    from vendas v
    where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas)
      and v.status in ('concluida', 'encomenda')
      and coalesce(v.data_venda, v.created_at) >= v_desde
  ),

  -- ── 2. OBJEÇÕES CONTRA O RESULTADO ───────────────────────────────────────
  OB as (
    select distinct X.id, X.comprou, X.cls, zapintel_familia_objecao(o->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
  ),

  -- ── 3. O QUE QUEM COMPROU TINHA ANTES ────────────────────────────────────
  SI as (
    select distinct X.id, X.comprou, zapintel_familia_sinal(s->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
  ),

  -- ── 4. PROMESSAS DA LOJA EM ABERTO ───────────────────────────────────────
  PE as (
    select X.id, X.nome, X.cls, X.um, X.filial_id, t texto,
           case when X.cls = 'customer' then 'pos'
                when X.cls = 'lost' then 'perdido'
                else 'aberto' end fase
    from X, jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t
    where t like '⚠%'
  ),

  -- ── 5. CLIENTES: RECOMPRA E INDICAÇÃO ────────────────────────────────────
  CL as (select X.* from X where X.cls = 'customer'),
  -- Pedido de indicação de VERDADE, em frase que não deixa dúvida. "indica"
  -- solto pegava "você conhece a loja?" e "o que eu recomendaria".
  PEDIU as (
    select distinct m.lead_id from lead_mensagens m join CL on CL.id = m.lead_id
    where m.empresa_id = v_emp and m.direcao = 'enviada'
      and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
          '(me indica|indicar algu|indica algu|conhece algu[eé]m que|algu[eé]m que (queira|precise|esteja)|indica a gente|indica a loja|nos indicar|pode indicar|indique)'
  ),

  -- ── 6. PERDIDOS: POR QUÊ ─────────────────────────────────────────────────
  -- A família da PRIMEIRA objeção que a análise listou, como etiqueta de cada
  -- exemplo. A contagem de perdidos por família fica na tabela de objeções
  -- (qualquer objeção), que é a mesma conta do filtro da lista.
  PD as (
    select X.id, X.nome, X.diag, X.filial_id,
           coalesce((select zapintel_familia_objecao(o->>'rotulo')
                     from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) with ordinality o(o, i)
                     order by i limit 1), 'Sem objeção registrada') familia
    from X where X.cls = 'lost'
  )
  select jsonb_build_object(
    'dias', p_dias,
    'empresa', v_emp,
    'calculadoEm', v_agora,
    'conversas', (select count(*) from X),
    'taxaBase', (select round(100.0 * count(*) filter (where comprou) / nullif(count(*), 0), 1) from X),

    -- O período anterior, do mesmo tamanho (15/10/2026): substitui a tela
    -- Comparar, que comparava classificação e score do motor de palavras.
    'comparacao', case when p_dias is null then null else jsonb_build_object(
        'vendas', (select count(distinct coalesce(v.grupo_pdv::text, v.id::text)) from vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'valor', (select coalesce(sum(v.valor_venda), 0) from vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'conversasNovas', (select count(*) from (
            select m.lead_id from lead_mensagens m join leads l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde) z),
        'conversasNovasAntes', (select count(*) from (
            select m.lead_id from lead_mensagens m join leads l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde - make_interval(days => p_dias) and min(m.created_at) < v_desde) z))
      end,
    'vendaTotal', (select jsonb_build_object(
        'registradas', V.vendas, 'valor', V.valor,
        'ticket', case when V.vendas > 0 then round(V.valor / V.vendas) end,
        'comConversa', V.com_conversa,
        'lidasNasConversas', (select count(*) from X where cls = 'customer'),
        'ligadas', (select count(*) from X where ligada),
        -- A mesma regra do filtro "Compraram sem registro" da lista.
        'semRegistro', (select count(*) from X where cls = 'customer' and not ligada
                          and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null
                          and um >= v_agora - interval '90 days'))
      from V),

    'objecoes', coalesce((select jsonb_agg(o) from (
        select jsonb_build_object(
          'familia', familia, 'leads', count(*),
          'compraram', count(*) filter (where comprou),
          'pct', round(100.0 * count(*) filter (where comprou) / count(*), 1),
          'perdidos', count(*) filter (where cls = 'lost'),
          'emAberto', count(*) filter (where cls in ('hot', 'warm', 'followup', 'stalled'))) o
        from OB where familia <> 'Outros' group by familia having count(*) >= 3
        order by count(*) filter (where cls = 'lost') desc, count(*) desc) z), '[]'::jsonb),

    'sinais', coalesce((select jsonb_agg(s) from (
        select jsonb_build_object(
          'familia', familia, 'leads', count(*),
          'compraram', count(*) filter (where comprou),
          'pct', round(100.0 * count(*) filter (where comprou) / count(*), 1)) s
        from SI where familia not in ('Depois da compra', 'Outros')
        group by familia having count(*) >= 5
        order by 1.0 * count(*) filter (where comprou) / count(*) desc) z), '[]'::jsonb),

    'pendencias', jsonb_build_object(
        'total', (select count(distinct id) from PE),
        'fases', coalesce((select jsonb_object_agg(fase, n) from (select fase, count(distinct id) n from PE group by fase) z), '{}'::jsonb),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', id, 'nome', nome, 'fase', fase, 'texto', texto, 'ultimaMensagem', um,
                                      'loja', (select rotulo from NOMES where NOMES.id = PE.filial_id)) i
            -- Seis por fase: a tela tem uma aba por fase, e um corte geral
            -- deixaria pós-venda e perdidos vazios atrás das 159 em aberto.
            from (select PE.*, row_number() over (partition by fase order by um desc) rn from PE) PE
            where rn <= 6) z), '[]'::jsonb)),

    'clientes', jsonb_build_object(
        'total', (select count(*) from CL),
        'chegaramPorIndicacao', (select count(distinct id) from SI where familia = 'Veio por indicação'),
        'pediuIndicacao', (select count(*) from PEDIU),
        'semConversa60d', (select count(*) from CL where um < v_agora - interval '60 days'),
        'semIndicacaoPedida', (select count(*) from CL where not exists (select 1 from PEDIU where PEDIU.lead_id = CL.id))),

    'perdidos', jsonb_build_object(
        'total', (select count(*) from PD),
        'exemplos', coalesce((select jsonb_agg(e) from (
            select jsonb_build_object('leadId', id, 'nome', nome, 'familia', familia, 'diagnostico', diag,
                                      'loja', (select rotulo from NOMES where NOMES.id = PD.filial_id)) e
            from PD where diag is not null order by id desc limit 6) z), '[]'::jsonb))
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.zapintel_insights(int, bigint, bigint) from public, anon;
grant execute on function public.zapintel_insights(int, bigint, bigint) to authenticated;
