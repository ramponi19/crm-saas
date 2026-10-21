-- ZAPINTEL LÊ O CORE (branch fix/zapintel-core, 21/10/2026). Aplicar DEPOIS das 20261022000xxx (Etapa 0).
--
-- Desde o corte de 20/10 o ZapIntel mostrava "a consulta demorou demais" o dia inteiro: as funções
-- liam pelas views de compatibilidade `leads` e `lead_mensagens`, e as duas calculam o negócio
-- principal de cada contato e loja LINHA A LINHA (subconsulta correlacionada; a lead_mensagens ainda
-- soma um ramo NOT EXISTS sobre todas as mensagens). Para uma tela, que olha a empresa inteira, isso
-- virava (na cópia, sem o teto de 8 s): insights 75 s, conversa_calc 217 s, dashboard 1,4 s (4,1 s de
-- média e 7,95 s de máximo em produção). Diagnóstico completo no 06.
--
-- O conserto não muda regra nenhuma: o principal continua sendo, por contato e loja, o negócio ativo
-- mais novo (a mesma ordem da view). Só que agora calculado UMA vez, em conjunto (DISTINCT ON), e
-- casado com as mensagens por igualdade — o que deixa o planejador usar hash join e estimar o tamanho
-- certo (com as views ele achava 5 mensagens onde havia 40 mil e varria CTEs em laço).
--
-- Os três helpers abaixo são SQL simples, STABLE, sem SECURITY DEFINER e sem SET: é o que permite ao
-- Postgres embuti-los na consulta de quem chama (as funções do ZapIntel, todas SECURITY DEFINER do
-- dono, rodam o helper com o mesmo dono — igual às views com security_invoker de antes). Fechados para
-- anon/authenticated: ninguém os chama pela API.
--
-- Loja: `coalesce(filial_id, -1) = coalesce(..., -1)` no lugar de IS NOT DISTINCT FROM — mesmo
-- resultado (id de loja é positivo) e, ao contrário dele, permite hash join.

create or replace function public.zapintel_principal(p_emp bigint)
returns table (id bigint, contato_id bigint, filial_id bigint)
language sql stable
as $$
  select distinct on (n.contato_id, n.filial_id) n.id, n.contato_id, n.filial_id
  from public.negocios n
  where n.empresa_id = p_emp
  order by n.contato_id, n.filial_id,
           coalesce(((n.dados -> '_lead') ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc
$$;

comment on function public.zapintel_principal(bigint) is
  'Negócio principal de cada contato em cada loja da empresa (mesma regra das views leads/lead_mensagens), calculado em conjunto.';

create or replace function public.zapintel_mensagens(p_emp bigint)
returns table (id bigint, lead_id bigint, contato_id bigint, direcao text, conteudo text, transcricao text,
               tipo text, origem text, created_at timestamptz, filial_id bigint, empresa_id bigint, usuario_id uuid)
language sql stable
as $$
  select m.id, p.id, m.contato_id, m.direcao, m.conteudo, m.transcricao, m.tipo, m.origem, m.created_at,
         m.filial_id, m.empresa_id, m.usuario_id
  from public.mensagens m
  join public.zapintel_principal(p_emp) p
    on p.contato_id = m.contato_id and coalesce(p.filial_id, -1) = coalesce(m.filial_id, -1)
  where m.empresa_id = p_emp
$$;

comment on function public.zapintel_mensagens(bigint) is
  'Mensagens da empresa com o lead_id do negócio principal (o primeiro ramo de lead_mensagens). As sem negócio ficam de fora: o ZapIntel nunca as usava.';

create or replace function public.zapintel_negocios(p_emp bigint)
returns table (id bigint, contato_id bigint, nome text, telefone text, origem text, origem_id text, filial_id bigint,
               created_at timestamptz, kanban_status text, convertido_em bigint, produto_interessado text, ativo boolean,
               funil_id bigint, empresa_id bigint, responsavel_id uuid, responsavel_desde timestamptz)
language sql stable
as $$
  select n.id, n.contato_id, c.nome, c.telefone, c.origem, c.origem_id, n.filial_id, n.created_at,
         coalesce(e.slug, (n.dados -> '_lead') ->> 'kanban_status'),
         ((n.dados -> '_lead') ->> 'convertido_em')::bigint,
         n.dados ->> 'produto_interessado',
         coalesce(((n.dados -> '_lead') ->> 'ativo')::boolean, true),
         n.funil_id, n.empresa_id, n.responsavel_id,
         ((n.dados -> '_lead') ->> 'responsavel_desde')::timestamptz
  from public.negocios n
  join public.contatos c on c.id = n.contato_id
  left join public.funil_etapas e on e.id = n.etapa_id
  where n.empresa_id = p_emp
$$;

comment on function public.zapintel_negocios(bigint) is
  'As colunas da view leads que o ZapIntel usa, sem o LATERAL de conversas (que ele não lê).';

-- Mesmo dono das funções do ZapIntel (que rodam SECURITY DEFINER e precisam executar estes): em
-- produção a migração já roda como postgres; na cópia e no Supabase local, quem aplica pode ser outro.
alter function public.zapintel_principal(bigint) owner to postgres;
alter function public.zapintel_mensagens(bigint) owner to postgres;
alter function public.zapintel_negocios(bigint) owner to postgres;
revoke all on function public.zapintel_principal(bigint), public.zapintel_mensagens(bigint), public.zapintel_negocios(bigint)
  from public, anon, authenticated;

-- As funções do ZapIntel, reescritas sobre os helpers. Corpo igual ao de antes (pós-Etapa 0) fora
-- das fontes de dados; nas buscas por um lead dentro de laço, onde a linha já é o negócio principal,
-- elas leem `mensagens` direto pelo contato e loja (índice mensagens_contato_idx).

-- zapintel_dashboard
CREATE OR REPLACE FUNCTION public.zapintel_dashboard(p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp     bigint;
  v_lojas   bigint[];
  v_agora   timestamptz := now();
  v_hoje    timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_mes     timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_mes_ant timestamptz := ((date_trunc('month', now() at time zone 'America/Sao_Paulo')) - interval '1 month') at time zone 'America/Sao_Paulo';
  v_out     jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from zapintel_mensagens(v_emp) m
    where m.empresa_id = v_emp
    group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao, p.gerado_em,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p
    where p.empresa_id = v_emp
  ),
  B as materialized (
    select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp
  ),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um,
           F.fm, F.versao, F.gerado_em, F.score, F.rotulo, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls,
           coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  HOJE as (
    select count(*) filter (where m.direcao = 'recebida') recebidas,
           count(*) filter (where m.direcao = 'enviada')  enviadas,
           count(distinct m.lead_id) conversas
    from zapintel_mensagens(v_emp) m
    where m.empresa_id = v_emp and m.created_at >= v_hoje and coalesce(m.filial_id, 0) = any (v_lojas)
  ),
  RS as materialized (
    select * from zapintel_turnos(v_emp, v_lojas, v_agora - interval '7 days') where aberto
  ),
  RESP as (
    select percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440)) mediana,
           count(*) filter (where espera < 5) rapidas,
           count(*) filter (where espera is null or espera >= 240) longas,
           count(*) filter (where espera is null) sem_resposta,
           count(*) total
    from RS
  ),
  V as (
    select v.id, v.grupo_pdv, v.valor_venda, v.data_venda, v.filial_id, v.status
    from vendas v
    where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas)
      and v.data_venda >= v_agora - interval '120 days'
  ),
  TICKET as (
    select case when count(distinct coalesce(grupo_pdv::text, id::text)) = 0 then null
                else sum(valor_venda) / count(distinct coalesce(grupo_pdv::text, id::text)) end ticket
    from V where data_venda >= v_agora - interval '90 days' and status <> 'cancelada'
  ),
  VMES as (
    select coalesce(sum(valor_venda) filter (where data_venda >= v_mes), 0) mes_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_mes) mes_qtd,
           coalesce(sum(valor_venda) filter (where data_venda >= v_mes_ant and data_venda < v_mes_ant + (v_agora - v_mes)), 0) ant_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_mes_ant and data_venda < v_mes_ant + (v_agora - v_mes)) ant_qtd,
           coalesce(sum(valor_venda) filter (where data_venda >= v_hoje), 0) hoje_valor,
           count(distinct coalesce(grupo_pdv::text, id::text)) filter (where data_venda >= v_hoje) hoje_qtd
    from V where status <> 'cancelada'
  ),
  OBJ as (
    select zapintel_familia_objecao(o->>'rotulo') familia, o->>'rotulo' rotulo,
           (o->>'desfecho') ~* 'aberto' em_aberto, X.id
    from X, jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
  ),
  PEND as (
    select X.id, X.nome, X.filial_id, X.urg, X.um, t pendencia
    from X, jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t
    where t like '⚠%'
  ),
  SIL as (
    select X.id, X.comprou, ult.texto
    from X
    cross join lateral (
      select coalesce(nullif(trim(u.transcricao), ''), u.conteudo) texto, u.direcao, u.created_at,
             lead(u.direcao) over (order by u.created_at desc, u.id desc) dir_antes,
             lead(u.created_at) over (order by u.created_at desc, u.id desc) quando_antes
      from (select * from mensagens u0 where u0.contato_id = X.contato_id and coalesce(u0.filial_id, -1) = coalesce(X.filial_id, -1) order by u0.created_at desc, u0.id desc limit 2) u
      order by u.created_at desc limit 1
    ) ult
    where X.ue is not null and (X.ur is null or X.ue > X.ur)
      and X.ue < v_agora - interval '3 days' and X.ue >= v_agora - interval '60 days' and X.n >= 4
      and not (ult.dir_antes = 'enviada' and ult.created_at - ult.quando_antes > interval '20 hours')
      and ult.texto is not null and length(ult.texto) > 8 and ult.texto !~ '^[\[{]'
      and ult.texto !~* '(enviad[oa] pelo celular|^reagiu|n[ãa]o envia ao crm|mensagem com bot|^figurinha|^sticker)'
      and ult.texto !~* '(curr[ií]culo|vaga|entrevista|sal[áa]rio|rua |avenida|cep|endere[çc]o|bairro)'
  ),
  MODELOS as (
    select initcap(regexp_replace(lower(trim(mm[1] || coalesce(' ' || mm[2], ''))), '\s+', ' ', 'g')) modelo, m.lead_id
    from zapintel_mensagens(v_emp) m
    cross join lateral regexp_matches(
      coalesce(nullif(trim(m.transcricao), ''), m.conteudo, ''),
      'iphone\s*(1[1-9]|[89]|se|xr|xs)\s*(pro\s*max|pro|plus|max|mini|e)?', 'gi') mm
    where m.empresa_id = v_emp and m.direcao = 'recebida'
      and m.created_at >= v_agora - interval '30 days' and coalesce(m.filial_id, 0) = any (v_lojas)
  )
  select jsonb_build_object(
    'geradoEm', v_agora,
    'empresa', v_emp,
    'ultimaMensagem', (select max(um) from X),
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', rotulo) order by id), '[]') from NOMES where id = any (v_lojas)),

    'agora', (select jsonb_build_object(
        'recebidasHoje', HOJE.recebidas,
        'enviadasHoje', HOJE.enviadas,
        'conversasHoje', HOJE.conversas,
        'leadsNovosHoje', (select count(*) from X where created_at >= v_hoje),
        'esperando', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and cls <> 'unqualified'),
        'esperandoForaDoFunil', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and cls = 'unqualified'),
        'esperandoMais1h', (select count(*) from X where esperando and ur >= v_agora - interval '72 hours' and ur < v_agora - interval '1 hour' and cls <> 'unqualified'),
        'esperandoAntigos', (select count(*) from X where esperando and ur < v_agora - interval '72 hours' and cls <> 'unqualified'),
        'esperaMaisAntiga', (select min(ur) from X where esperando and ur >= v_agora - interval '72 hours' and cls <> 'unqualified')
      ) from HOJE),

    'resposta', (select jsonb_build_object(
        'medianaMin', round(mediana::numeric),
        'ate5Pct', case when total > 0 then round(100.0 * rapidas / total) else null end,
        'mais4hPct', case when total > 0 then round(100.0 * longas / total) else null end,
        'semResposta', sem_resposta,
        'retomadas', total,
        'horario', zapintel_horario(v_emp)
      ) from RESP),

    'fila', (select coalesce(jsonb_agg(f order by f.ordem, f.desde), '[]') from (
        select X.id "leadId", X.nome, (select rotulo from NOMES where NOMES.id = X.filial_id) loja,
               X.ur desde, X.cls classificacao, X.urg urgencia,
               X.score::int score, X.rotulo,
               fp.perfil->>'proximaAcao' "proximaAcao", fp.perfil->>'mensagemSugerida' "mensagemSugerida",
               (X.tem_ficha and X.fm <> X.n) desatualizada,
               (select left(coalesce(nullif(trim(u.transcricao), ''), u.conteudo, '[' || coalesce(u.tipo, 'anexo') || ']'), 160)
                  from mensagens u where u.contato_id = X.contato_id and coalesce(u.filial_id, -1) = coalesce(X.filial_id, -1) and u.direcao = 'recebida'
                  order by u.created_at desc, u.id desc limit 1) "ultimaFala",
               (select count(*) from mensagens u where u.contato_id = X.contato_id and coalesce(u.filial_id, -1) = coalesce(X.filial_id, -1) and u.direcao = 'recebida' and u.created_at > coalesce(X.ue, '-infinity')) "naoRespondidas",
               (case when X.cls = 'sem_analise' then 1 else case X.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end) * 10
                 + (case X.cls when 'hot' then 0 when 'customer' then 1 when 'warm' then 2 when 'followup' then 3 when 'sem_analise' then 4 else 5 end) ordem
        from X
        left join zapintel_lead_perfil fp on fp.lead_id = X.id and fp.empresa_id = v_emp
        where X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified'
        order by ordem, X.ur
        limit 14
      ) f),

    'funil', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from X group by cls) c),

    'dinheiro', (select jsonb_build_object(
        'ticketMedio', round(TICKET.ticket::numeric, 2),
        'quentes', (select count(*) from X where cls = 'hot'),
        'mornos', (select count(*) from X where cls = 'warm'),
        'mesValor', VMES.mes_valor, 'mesQtd', VMES.mes_qtd,
        'mesAnteriorValor', VMES.ant_valor, 'mesAnteriorQtd', VMES.ant_qtd,
        'hojeValor', VMES.hoje_valor, 'hojeQtd', VMES.hoje_qtd,
        'clientesLidos', (select count(*) from X where cls = 'customer'),
        'clientesComVenda', (select count(*) from X where comprou),
        'semRegistro', (select count(*) from X where cls = 'customer' and not comprou and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null and gerado_em is not null and X.um >= v_agora - interval '90 days')
      ) from TICKET, VMES),

    'pendencias', jsonb_build_object(
        'total', (select count(*) from PEND),
        'leads', (select count(distinct id) from PEND),
        'itens', (select coalesce(jsonb_agg(p order by p.ordem, p.um desc), '[]') from (
            select PEND.id "leadId", PEND.nome, (select rotulo from NOMES where NOMES.id = PEND.filial_id) loja,
                   ltrim(substr(PEND.pendencia, 2)) texto, PEND.urg urgencia, PEND.um,
                   case PEND.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ordem
            from PEND
            where PEND.um >= v_agora - interval '45 days'
            order by ordem, PEND.um desc
            limit 12) p)
      ),

    'objecoes', (select coalesce(jsonb_agg(o order by o.leads desc), '[]') from (
        select familia, count(distinct id) leads, count(distinct id) filter (where em_aberto) "emAberto",
               (select jsonb_agg(r) from (select rotulo r from OBJ o2 where o2.familia = OBJ.familia
                                          group by rotulo order by count(*) desc limit 3) x) exemplos
        from OBJ group by familia) o),

    'sinais', (select coalesce(jsonb_agg(s order by s.leads desc), '[]') from (
        select upper(left(trim(sg->>'rotulo'), 1)) || lower(substr(trim(sg->>'rotulo'), 2)) rotulo, count(distinct X.id) leads
        from X, jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) sg
        where X.cls in ('hot', 'warm', 'followup')
        group by 1 order by 2 desc limit 8) s),

    'perfis', (select coalesce(jsonb_agg(p order by p.leads desc), '[]') from (
        select X.rotulo, count(*) leads
        from X where X.tem_ficha and X.cls not in ('unqualified')
        group by 1 order by 2 desc limit 10) p),

    'inatividade', (select jsonb_build_array(
        jsonb_build_object('faixa', 'hoje',  'leads', count(*) filter (where um >= v_hoje)),
        jsonb_build_object('faixa', '1-2',   'leads', count(*) filter (where um <  v_hoje and um >= v_hoje - interval '2 days')),
        jsonb_build_object('faixa', '3-7',   'leads', count(*) filter (where um <  v_hoje - interval '2 days' and um >= v_hoje - interval '7 days')),
        jsonb_build_object('faixa', '8-14',  'leads', count(*) filter (where um <  v_hoje - interval '7 days' and um >= v_hoje - interval '14 days')),
        jsonb_build_object('faixa', '15-30', 'leads', count(*) filter (where um <  v_hoje - interval '14 days' and um >= v_hoje - interval '30 days')),
        jsonb_build_object('faixa', '30+',   'leads', count(*) filter (where um <  v_hoje - interval '30 days'))
      ) from X where cls not in ('customer', 'lost', 'unqualified')),

    'calor', (select coalesce(jsonb_agg(jsonb_build_array(dow, hora, n)), '[]') from (
        select extract(isodow from m.created_at at time zone 'America/Sao_Paulo')::int dow,
               extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int hora,
               count(*) n
        from zapintel_mensagens(v_emp) m
        where m.empresa_id = v_emp and m.direcao = 'recebida' and m.created_at >= v_agora - interval '28 days'
          and coalesce(m.filial_id, 0) = any (v_lojas)
        group by 1, 2) h),

    'modelos', (select coalesce(jsonb_agg(md order by md.leads desc), '[]') from (
        select replace(replace(modelo, 'Iphone', 'iPhone'), 'Se', 'SE') modelo, count(distinct lead_id) leads
        from MODELOS group by 1 order by 2 desc limit 8) md),

    'analises', jsonb_build_object(
        'comAnalise', (select count(*) from X where tem_ficha),
        'desatualizadas', (select count(*) from X where tem_ficha and (fm <> n or versao is distinct from p_versao)),
        'semAnalise', (select count(*) from X where cls = 'sem_analise'),
        'semResposta', (select count(*) from X where cls = 'sem_resposta')
      ),

    'silencio', (select coalesce(jsonb_agg(si order by si.vezes desc), '[]') from (
        select left(texto, 160) frase, count(*) vezes, count(*) filter (where comprou) venderam
        from SIL group by left(texto, 160) having count(*) >= 2
        order by 2 desc limit 8) si),

    'porLoja', (select coalesce(jsonb_agg(pl order by pl.id), '[]') from (
        select NOMES.id, NOMES.rotulo nome,
               (select count(*) from X where X.filial_id = NOMES.id and X.um >= v_agora - interval '7 days') ativos7d,
               (select count(*) from X where X.filial_id = NOMES.id and X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified') esperando,
               (select count(*) from X where X.filial_id = NOMES.id and X.cls = 'hot') quentes,
               (select coalesce(sum(valor_venda), 0) from V where V.filial_id = NOMES.id and V.data_venda >= v_mes and V.status <> 'cancelada') "vendasMes",
               (select round((percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440)))::numeric)
                  from RS where RS.filial_id = NOMES.id) "respostaMin"
        from NOMES where NOMES.id = any (v_lojas)) pl)
  ) into v_out;

  return v_out;
end $function$;

-- zapintel_dashboard_lista
CREATE OR REPLACE FUNCTION public.zapintel_dashboard_lista(p_tipo text, p_valor text DEFAULT NULL::text, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_agora timestamptz := now();
  v_hoje  timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from zapintel_mensagens(v_emp) m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao, p.gerado_em,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, F.fm, F.versao, F.gerado_em, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls, coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  ESCOLHA as (
    select X.*, null::text detalhe from X
    where (p_tipo = 'classe' and X.cls = p_valor)
       or (p_tipo = 'esperando' and X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified')
       or (p_tipo = 'sem_registro' and X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
           and X.convertido_em is null and X.um >= v_agora - interval '90 days')
       or (p_tipo = 'desatualizadas' and X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao))
       or (p_tipo = 'perfil' and X.rotulo = p_valor)
       or (p_tipo = 'inatividade' and X.cls not in ('customer', 'lost', 'unqualified') and (
            (p_valor = 'hoje'  and X.um >= v_hoje) or
            (p_valor = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (p_valor = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (p_valor = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (p_valor = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (p_valor = '30+'   and X.um < v_hoje - interval '30 days')))
    union all
    select X.*, (select string_agg(ltrim(substr(t, 2)), ' · ') from jsonb_array_elements_text(X.ps) t where t like '⚠%') from X
    where p_tipo = 'pendencias' and exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%')
    union all
    select X.*, (select string_agg((o->>'rotulo') || ' — ' || coalesce(o->>'desfecho', ''), ' · ')
                 from jsonb_array_elements(X.obj) o where zapintel_familia_objecao(o->>'rotulo') = p_valor) from X
    where p_tipo = 'objecao' and exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                         where zapintel_familia_objecao(o->>'rotulo') = p_valor)
    union all
    select X.*, (select string_agg(s->>'evidencia', ' · ') from jsonb_array_elements(X.si) s
                 where lower(trim(s->>'rotulo')) = lower(p_valor)) from X
    where p_tipo = 'sinal' and exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                       where lower(trim(s->>'rotulo')) = lower(p_valor))
    union all
    select X.*, null from X
    where p_tipo = 'modelo' and exists (
      select 1 from mensagens m
      where m.contato_id = X.contato_id and coalesce(m.filial_id, -1) = coalesce(X.filial_id, -1) and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
        and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~* ('iphone\s*' || replace(p_valor, ' ', '\s*') || '(?![0-9a-z])'))
  )
  select jsonb_build_object(
    'total', (select count(*) from ESCOLHA),
    'leads', (select coalesce(jsonb_agg(e order by e.ordem, e."ultimaMensagem" desc), '[]') from (
        select ESCOLHA.id "leadId", ESCOLHA.nome, (select rotulo from NOMES where NOMES.id = ESCOLHA.filial_id) loja,
               ESCOLHA.um "ultimaMensagem", ESCOLHA.cls classificacao, ESCOLHA.urg urgencia,
               ESCOLHA.score::int score, ESCOLHA.rotulo, ESCOLHA.acao "proximaAcao",
               ESCOLHA.esperando, ESCOLHA.detalhe,
               case ESCOLHA.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ordem
        from ESCOLHA
        order by ordem, ESCOLHA.um desc
        limit 120) e)
  ) into v_out;
  return v_out;
end $function$;

-- zapintel_leads_lista
CREATE OR REPLACE FUNCTION public.zapintel_leads_lista(p_filtros jsonb DEFAULT '{}'::jsonb, p_ordem text DEFAULT 'prioridade'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint, p_versao text DEFAULT 'p2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp    bigint;
  v_lojas  bigint[];
  v_agora  timestamptz := now();
  v_hoje   timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_f      jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca  text := nullif(trim(coalesce(p_filtros->>'busca', '')), '');
  v_padrao text;
  v_por    int := least(greatest(coalesce(p_por_pagina, 50), 10), 200);
  v_pag    int := greatest(coalesce(p_pagina, 1), 1);
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  if v_busca is not null then
    v_padrao := '%' || regexp_replace(replace(replace(v_busca, '%', ' '), '_', ' '), '\s+', '%', 'g') || '%';
  end if;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.telefone, l.origem, l.origem_id, l.filial_id, l.created_at,
           l.kanban_status, l.convertido_em, l.produto_interessado
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um, min(m.created_at) pm
    from zapintel_mensagens(v_emp) m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.mensagens fm, p.versao,
           p.perfil->>'classificacao' cls0, p.perfil->>'urgencia' urg0,
           p.perfil->>'score' score, p.perfil->>'perfil' rotulo, p.perfil->>'proximaAcao' acao,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp),
  ACHADOS as materialized (
    select distinct m.lead_id from zapintel_mensagens(v_emp) m
    where v_padrao is not null and m.empresa_id = v_emp
      and (m.conteudo ilike v_padrao or m.transcricao ilike v_padrao)
    union
    select p.lead_id from zapintel_lead_perfil p
    where v_padrao is not null and p.empresa_id = v_emp
      and (p.perfil->>'diagnostico' ilike v_padrao or p.perfil->>'relato' ilike v_padrao)
  ),
  X as materialized (
    select L.*, M.n, M.ur, M.ue, M.um, M.pm,
           F.fm, F.versao, F.score, F.rotulo, F.acao, F.obj, F.ps, F.si,
           (F.lead_id is not null) tem_ficha,
           coalesce(F.cls0, case when M.ur is null then 'sem_resposta' else 'sem_analise' end) cls,
           coalesce(F.urg0, 'low') urg,
           (B.lead_id is not null) comprou,
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
  ),
  BASE as materialized (
    select X.* from X
    where (v_f->>'urgencia' is null or X.urg = v_f->>'urgencia')
      and (v_f->>'canal' is null or coalesce(X.origem, 'whatsapp') = v_f->>'canal')
      and (coalesce((v_f->>'esperando')::boolean, false) = false
           or (X.esperando and X.ur >= v_agora - interval '72 hours' and X.cls <> 'unqualified'))
      and (coalesce((v_f->>'sem_registro')::boolean, false) = false
           or (X.cls = 'customer' and not X.comprou and coalesce(X.kanban_status, '') <> 'convertido'
               and X.convertido_em is null and X.um >= v_agora - interval '90 days'))
      and (coalesce((v_f->>'desatualizadas')::boolean, false) = false
           or (X.tem_ficha and (X.fm <> X.n or X.versao is distinct from p_versao)))
      and (coalesce((v_f->>'pendencias')::boolean, false) = false
           or exists (select 1 from jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t where t like '⚠%'))
      and (v_f->>'perfil' is null or X.rotulo = v_f->>'perfil')
      and (v_f->>'sinal' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                           where lower(trim(s->>'rotulo')) = lower(v_f->>'sinal')))
      and (v_f->>'objecao' is null or exists (select 1 from jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
                                             where zapintel_familia_objecao(o->>'rotulo') = v_f->>'objecao'))
      and (v_f->>'parado' is null or (X.cls not in ('customer', 'lost', 'unqualified') and (
            (v_f->>'parado' = 'hoje'  and X.um >= v_hoje) or
            (v_f->>'parado' = '1-2'   and X.um < v_hoje and X.um >= v_hoje - interval '2 days') or
            (v_f->>'parado' = '3-7'   and X.um < v_hoje - interval '2 days' and X.um >= v_hoje - interval '7 days') or
            (v_f->>'parado' = '8-14'  and X.um < v_hoje - interval '7 days' and X.um >= v_hoje - interval '14 days') or
            (v_f->>'parado' = '15-30' and X.um < v_hoje - interval '14 days' and X.um >= v_hoje - interval '30 days') or
            (v_f->>'parado' = '30+'   and X.um < v_hoje - interval '30 days'))))
      and (v_f->>'modelo' is null or exists (
            select 1 from mensagens m
            where m.contato_id = X.contato_id and coalesce(m.filial_id, -1) = coalesce(X.filial_id, -1) and m.direcao = 'recebida' and m.created_at >= v_agora - interval '30 days'
              and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
                  ('iphone\s*' || replace(v_f->>'modelo', ' ', '\s*') || '(?![0-9a-z])')))
      and (v_f->>'dias' is null or X.um >= v_agora - make_interval(days => (v_f->>'dias')::int))
      and (coalesce((v_f->>'funil')::boolean, false) = false or X.cls not in ('unqualified', 'sem_analise', 'sem_resposta'))
      and (v_f->>'sinal_familia' is null or exists (select 1 from jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
                                                  where zapintel_familia_sinal(s->>'rotulo') = v_f->>'sinal_familia'))
      and (v_f->>'fase' is null or (v_f->>'fase' = 'aberto' and X.cls in ('hot', 'warm', 'followup', 'stalled')))
      and (coalesce((v_f->>'largada')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours' and X.esperando))
      and (coalesce((v_f->>'retomar')::boolean, false) = false
           or (X.cls in ('hot', 'warm', 'followup', 'stalled') and X.um < v_agora - interval '72 hours'
               and X.ue is not null and not X.esperando))
      and (v_padrao is null
           or X.nome ilike v_padrao or X.telefone ilike v_padrao or X.produto_interessado ilike v_padrao
           or X.id in (select lead_id from ACHADOS))
  ),
  FINAL as materialized (
    select BASE.*,
           (case when BASE.cls = 'sem_analise' then 1
                 else case BASE.urg when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end) prioridade
    from BASE
    where v_f->>'classe' is null or BASE.cls = v_f->>'classe'
  ),
  PAGINA as (
    select * from FINAL
    order by
      case when p_ordem = 'prioridade' then FINAL.prioridade end asc nulls last,
      case when p_ordem = 'prioridade' then (case when FINAL.esperando and FINAL.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
      case when p_ordem = 'prioridade' then FINAL.um end desc nulls last,
      case when p_ordem = 'recentes' then FINAL.um end desc nulls last,
      case when p_ordem = 'parados' then FINAL.um end asc nulls last,
      case when p_ordem = 'score' then FINAL.score::int end desc nulls last,
      case when p_ordem = 'mensagens' then FINAL.n end desc nulls last,
      FINAL.id desc
    limit v_por offset (v_pag - 1) * v_por
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'total', (select count(*) from FINAL),
    'pagina', v_pag,
    'porPagina', v_por,
    'contagens', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from BASE group by cls) c),
    'totalSemClasse', (select count(*) from BASE),
    'leads', (select coalesce(jsonb_agg(r), '[]') from (
        select P.id "leadId", P.nome, P.telefone, P.origem, P.origem_id "origemId",
               (select rotulo from NOMES where NOMES.id = P.filial_id) loja,
               P.cls classificacao, P.urg urgencia, P.score::int score, P.rotulo, P.acao "proximaAcao",
               P.tem_ficha "temAnalise", (P.tem_ficha and P.fm <> P.n) desatualizada,
               P.comprou,
               (P.esperando and P.ur >= v_agora - interval '72 hours' and P.cls <> 'unqualified') esperando,
               P.ur "ultimaDoCliente", P.um "ultimaMensagem", P.pm "primeiraMensagem", P.n mensagens,
               jsonb_array_length(coalesce(P.si, '[]'::jsonb)) sinais,
               jsonb_array_length(coalesce(P.obj, '[]'::jsonb)) objecoes,
               (select count(*) from jsonb_array_elements_text(coalesce(P.ps, '[]'::jsonb)) t where t like '⚠%') alertas
        from PAGINA P
        order by
          case when p_ordem = 'prioridade' then P.prioridade end asc nulls last,
          case when p_ordem = 'prioridade' then (case when P.esperando and P.ur >= v_agora - interval '72 hours' then 0 else 1 end) end asc nulls last,
          case when p_ordem = 'prioridade' then P.um end desc nulls last,
          case when p_ordem = 'recentes' then P.um end desc nulls last,
          case when p_ordem = 'parados' then P.um end asc nulls last,
          case when p_ordem = 'score' then P.score::int end desc nulls last,
          case when p_ordem = 'mensagens' then P.n end desc nulls last,
          P.id desc) r)
  ) into v_out;
  return v_out;
end $function$;

-- zapintel_insights
CREATE OR REPLACE FUNCTION public.zapintel_insights(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, max(m.created_at) um
    from zapintel_mensagens(v_emp) m where m.empresa_id = v_emp group by m.lead_id
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->>'diagnostico' diag,
           p.perfil->'objecoes' obj, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  B as materialized (select distinct lead_id from zapintel_venda_lead where empresa_id = v_emp and lead_id is not null),
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
  OB as (
    select distinct X.id, X.comprou, X.cls, zapintel_familia_objecao(o->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.obj, '[]'::jsonb)) o
  ),
  SI as (
    select distinct X.id, X.comprou, zapintel_familia_sinal(s->>'rotulo') familia
    from X, jsonb_array_elements(coalesce(X.si, '[]'::jsonb)) s
  ),
  PE as (
    select X.id, X.nome, X.cls, X.um, X.filial_id, t texto,
           case when X.cls = 'customer' then 'pos'
                when X.cls = 'lost' then 'perdido'
                else 'aberto' end fase
    from X, jsonb_array_elements_text(coalesce(X.ps, '[]'::jsonb)) t
    where t like '⚠%'
  ),
  CL as (select X.* from X where X.cls = 'customer'),
  PEDIU as (
    select distinct m.lead_id from zapintel_mensagens(v_emp) m join CL on CL.id = m.lead_id
    where m.empresa_id = v_emp and m.direcao = 'enviada'
      and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~*
          '(me indica|indicar algu|indica algu|conhece algu[eé]m que|algu[eé]m que (queira|precise|esteja)|indica a gente|indica a loja|nos indicar|pode indicar|indique)'
  ),
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
            select m.lead_id from zapintel_mensagens(v_emp) m join zapintel_negocios(v_emp) l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde) z),
        'conversasNovasAntes', (select count(*) from (
            select m.lead_id from zapintel_mensagens(v_emp) m join zapintel_negocios(v_emp) l on l.id = m.lead_id
            where m.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
            group by m.lead_id having min(m.created_at) >= v_desde - make_interval(days => p_dias) and min(m.created_at) < v_desde) z))
      end,
    'vendaTotal', (select jsonb_build_object(
        'registradas', V.vendas, 'valor', V.valor,
        'ticket', case when V.vendas > 0 then round(V.valor / V.vendas) end,
        'comConversa', V.com_conversa,
        'lidasNasConversas', (select count(*) from X where cls = 'customer'),
        'ligadas', (select count(*) from X where ligada),
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
$function$;

-- zapintel_posvenda
CREATE OR REPLACE FUNCTION public.zapintel_posvenda(p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from zapintel_negocios(v_emp) l
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
           MU.um um
    from L left join F on F.lead_id = L.id left join VL on VL.lead_id = L.id
    left join (select m.lead_id, max(m.created_at) um from zapintel_mensagens(v_emp) m group by m.lead_id) MU on MU.lead_id = L.id
    where F.cls = 'customer' or VL.lead_id is not null
  ),
  PEDIU as (
    select distinct m.lead_id from zapintel_mensagens(v_emp) m join C on C.id = m.lead_id
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
          'ordem', case when pendencias is not null then '0' else '1' end) c
        from R) z), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$function$;

-- zapintel_atendimento
CREATE OR REPLACE FUNCTION public.zapintel_atendimento(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp    bigint;
  v_lojas  bigint[];
  v_agora  timestamptz := now();
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_hor    jsonb;
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_hor := zapintel_horario(v_emp);

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.filial_id, l.responsavel_id
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  TH as materialized (
    select * from zapintel_turnos(v_emp, v_lojas, least(v_desde, v_agora - interval '8 weeks'))
  ),
  F as (
    select p.lead_id, p.perfil->>'classificacao' cls, (p.perfil->>'score')::int score
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  U as materialized (
    select m.lead_id, max(m.created_at) um,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada') ue
    from zapintel_mensagens(v_emp) m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  ABERTO as (
    select L.id, L.contato_id, L.nome, L.filial_id, F.cls, F.score, U.um, U.ur, U.ue
    from L join U on U.lead_id = L.id join F on F.lead_id = L.id
    where F.cls in ('hot', 'warm', 'followup', 'stalled')
      and U.um < v_agora - interval '72 hours' and U.um >= v_desde
  ),
  LARGADAS as (select * from ABERTO where ur is not null and (ue is null or ur > ue)),
  RETOMAR  as (select * from ABERTO where ue is not null and (ur is null or ue >= ur)),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  )
  select jsonb_build_object(
    'dias', p_dias,
    'empresa', v_emp,
    'horario', v_hor - 'configurado',
    'horarioConfigurado', (v_hor->>'configurado')::boolean,
    'resposta', coalesce((select jsonb_agg(r order by r->>'loja' nulls first) from (
        select jsonb_build_object(
          'loja', case when grouping(filial_id) = 1 then null else (select rotulo from NOMES where NOMES.id = TH.filial_id) end,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'p75', round(percentile_cont(0.75) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'ate30', round(100.0 * count(*) filter (where espera < 30) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) r
        from TH where aberto and chegou >= v_desde
        group by rollup (filial_id)) z), '[]'::jsonb),
    'foraDoHorario', (select jsonb_build_object(
        'turnos', count(*) filter (where not aberto),
        'pct', round(100.0 * count(*) filter (where not aberto) / nullif(count(*), 0)),
        'mediana', round((percentile_cont(0.5) within group (order by least(coalesce(espera, 2880), 2880)) filter (where not aberto))::numeric),
        'ate1h', round(100.0 * count(*) filter (where not aberto and espera < 60) / nullif(count(*) filter (where not aberto), 0)))
      from TH where chegou >= v_desde),
    'semanas', coalesce((select jsonb_agg(s order by s->>'inicio') from (
        select jsonb_build_object(
          'inicio', (date_trunc('week', chegou at time zone 'America/Sao_Paulo'))::date,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) s
        from TH where aberto and chegou >= v_agora - interval '8 weeks'
        group by date_trunc('week', chegou at time zone 'America/Sao_Paulo')) z), '[]'::jsonb),
    'cobertura', coalesce((select jsonb_agg(c) from (
        select jsonb_build_object('dow', dow, 'hora', hora, 'turnos', count(*),
               'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) c
        from TH where chegou >= v_desde group by dow, hora) z), '[]'::jsonb),
    'largadas', jsonb_build_object(
        'total', (select count(*) from LARGADAS),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', LARGADAS.id, 'nome', nome, 'classe', cls, 'desde', ur,
                   'loja', (select rotulo from NOMES where NOMES.id = LARGADAS.filial_id),
                   'fala', (select left(coalesce(nullif(trim(m.transcricao), ''), m.conteudo), 160)
                            from mensagens m where m.contato_id = LARGADAS.contato_id and coalesce(m.filial_id, -1) = coalesce(LARGADAS.filial_id, -1) and m.direcao = 'recebida'
                            order by m.created_at desc, m.id desc limit 1)) i
            from LARGADAS order by ur desc limit 8) z), '[]'::jsonb)),
    'retomar', jsonb_build_object(
        'total', (select count(*) from RETOMAR),
        'itens', coalesce((select jsonb_agg(i) from (
            select jsonb_build_object('leadId', RETOMAR.id, 'nome', nome, 'classe', cls, 'score', score, 'desde', ue,
                   'loja', (select rotulo from NOMES where NOMES.id = RETOMAR.filial_id)) i
            from RETOMAR order by score desc nulls last, ue desc limit 8) z), '[]'::jsonb))
  ) into v_out;

  return v_out;
end;
$function$;

-- zapintel_conversa_calc
CREATE OR REPLACE FUNCTION public.zapintel_conversa_calc(p_emp bigint, p_lojas bigint[], p_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp    bigint := p_emp;
  v_lojas  bigint[] := p_lojas;
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_out    jsonb;
begin
  

  with
  L as materialized (
    select l.id, l.filial_id from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  US as (
    select u.id, u.nome, eu.filial_id,
           translate(lower(trim(u.nome)), 'áàâãäéèêëíìîïóòôõöúùûüçzy', 'aaaaaeeeeiiiiooooouuuucsi') n
    from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id
    where eu.empresa_id = v_emp and eu.ativo and eu.role <> 'owner'
  ),
  TK as (select id, split_part(n, ' ', 1) t1, nullif(split_part(n, ' ', 2), '') t2 from US),
  TOK as (
    select id, tok from (select id, t1 tok from TK union all select id, t2 from TK where t2 is not null) x
    where length(tok) >= 3
      and not exists (select 1 from TK o where o.id <> x.id and (o.t1 = x.tok or o.t2 = x.tok))
    union all select id, t1 || ' ' || t2 from TK where t2 is not null
  ),
  RG as (
    select id, '(^|[^a-z])' || alt || '( [a-z]+)?,? aqui([^a-z]|$)|aqui (e|eh) (o|a) ' || alt
           || '([^a-z]|$)|(^|[^a-z])sou (o|a) ' || alt || '([^a-z]|$)|meu nome e ' || alt || '([^a-z]|$)' rx
    from (select id, '(' || string_agg(regexp_replace(tok, 'o$', '(o|ao)'), '|') || ')' alt from TOK group by id) z
  ),
  M as materialized (
    select m.id, m.lead_id, m.created_at, m.direcao, m.tipo, m.usuario_id,
           coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') t
    from zapintel_mensagens(v_emp) m join L on L.id = m.lead_id
    where m.empresa_id = v_emp and m.created_at >= v_desde - interval '3 days'
  ),
  MT as materialized (
    select M.*,
           (t <> '' and t !~ '^\s*[\[{]' and t !~* 'enviad[ao] pelo celular$') fala,
           lower(t) lt
    from M
  ),
  INTRO as (
    select e.id, (array_agg(rg.id))[1] quem, count(*) q
    from MT e join RG rg on translate(e.lt, 'áàâãäéèêëíìîïóòôõöúùûüçzy', 'aaaaaeeeeiiiiooooouuuucsi') ~ rg.rx
    where e.direcao = 'enviada' and e.fala and e.lt ~ '(aqui|sou |meu nome)'
    group by e.id
  ),
  POS as (
    select a.negocio_id lead_id, a.em, a.para_responsavel dono
    from negocio_historico a join L on L.id = a.negocio_id where a.empresa_id = v_emp
     and a.acao in ('pegar', 'devolver', 'transferir', 'atribuir', 'distribuir')
    union all
    select ld.id, ld.responsavel_desde, ld.responsavel_id from zapintel_negocios(v_emp) ld join L on L.id = ld.id
    where ld.responsavel_id is not null and ld.responsavel_desde is not null
  ),
  S as (
    select e.lead_id, e.created_at em, e.id, e.usuario_id crm, case when i.q = 1 then i.quem end intro, null::uuid dono, 0 k
    from MT e left join INTRO i on i.id = e.id where e.direcao = 'enviada'
    union all
    select lead_id, em, null, null, null, dono, 1 from POS
  ),
  C as (
    select S.*, count(intro) over w1 gi, count(k) filter (where k = 1) over w1 gp, count(intro) over w2 gn
    from S
    window w1 as (partition by lead_id order by em, k desc, id),
           w2 as (partition by lead_id order by em desc, k, id desc)
  ),
  C2 as (
    select C.*,
      first_value(intro) over (partition by lead_id, gi order by em, k desc, id) i_ant,
      first_value(em)    over (partition by lead_id, gi order by em, k desc, id) i_ant_em,
      first_value(dono)  over (partition by lead_id, gp order by em, k desc, id) d_ant,
      first_value(intro) over (partition by lead_id, gn order by em desc, k, id desc) i_dep,
      first_value(em)    over (partition by lead_id, gn order by em desc, k, id desc) i_dep_em
    from C
  ),
  AUT as materialized (
    select id,
      case when crm is not null then crm
           when intro is not null then intro
           when i_ant is not null and i_ant_em >= em - interval '72 hours' then i_ant
           when d_ant is not null then d_ant
           when i_dep is not null and i_dep_em <= em + interval '12 hours' then i_dep end autor,
      case when crm is not null then 'crm'
           when intro is not null or (i_ant is not null and i_ant_em >= em - interval '72 hours') then 'apresentacao'
           when d_ant is not null then 'dono'
           when i_dep is not null and i_dep_em <= em + interval '12 hours' then 'apresentacao'
           else 'nenhum' end fonte
    from C2 where k = 0
  ),
  GW(palavra, rx) as (values
    ('cara',      ',\s*cara($|[^a-zà-ú])|(^|[^a-zà-ú])cara\s*[,!?]'),
    ('bora',      '(^|[^a-zà-ú])bora($|[^a-zà-ú])'),
    ('mano',      '(^|[^a-zà-ú])mano($|[^a-zà-ú])'),
    ('mana',      '(^|[^a-zà-ú])mana($|[^a-zà-ú])'),
    ('patrão',    '(^|[^a-zà-ú])patrão($|[^a-zà-ú])'),
    ('pô',        '(^|[^a-zà-ú])pô($|[^a-zà-ú])'),
    ('irmão',     ',\s*irmão($|[^a-zà-ú])|(^|[^a-zà-ú])irmão\s*[,!?]'),
    ('parceiro',  ',\s*parceiro($|[^a-zà-ú])|(^|[^a-zà-ú])parceiro\s*[,!?]'),
    ('parça',     '(^|[^a-zà-ú])parça($|[^a-zà-ú])'),
    ('tá ligado', '(^|[^a-zà-ú])t[áa] ligad[oa]($|[^a-zà-ú])'),
    ('de boa',    '(^|[^a-zà-ú])de boa($|[^a-zà-ú])'),
    ('véi',       '(^|[^a-zà-ú])véi[o]?($|[^a-zà-ú])'),
    ('brother',   '(^|[^a-zà-ú])(brother|bro)($|[^a-zà-ú])'),
    ('blz',       '(^|[^a-zà-ú])blz($|[^a-zà-ú])'),
    ('vlw',       '(^|[^a-zà-ú])vlw($|[^a-zà-ú])'),
    ('tmj',       '(^|[^a-zà-ú])tmj($|[^a-zà-ú])'),
    ('slk',       '(^|[^a-zà-ú])slk($|[^a-zà-ú])'),
    ('mlk',       '(^|[^a-zà-ú])mlk($|[^a-zà-ú])')
  ),
  E as materialized (
    select e.id, e.lead_id, L.filial_id, e.created_at, e.tipo, e.fala, e.t, a.autor, a.fonte,
           case when e.fala then coalesce(array_length(regexp_split_to_array(trim(e.t), '\s+'), 1), 0) else 0 end palavras,
           (e.fala and e.t like '%?%') pergunta,
           (e.fala and e.lt ~ '(k{3,}|(ha){2,}|(rs){2,})') risada,
           case when e.fala and e.lt ~ (select string_agg('(' || rx || ')', '|') from GW)
                then array(select g.palavra from GW g where e.lt ~ g.rx) else '{}'::text[] end girias
    from MT e join AUT a on a.id = e.id join L on L.id = e.lead_id
    where e.direcao = 'enviada' and e.created_at >= v_desde
  ),
  CLI as (
    select lead_id, count(*) n,
           sum(case when fala then coalesce(array_length(regexp_split_to_array(trim(t), '\s+'), 1), 0) else 0 end) palavras
    from MT where direcao = 'recebida' and created_at >= v_desde group by lead_id
  ),
  SEQ0 as (
    select MT.id, MT.lead_id, MT.direcao, MT.created_at,
           case when lag(MT.direcao) over (partition by MT.lead_id order by MT.created_at, MT.id) is distinct from MT.direcao then 1 else 0 end novo
    from MT where MT.created_at >= v_desde
  ),
  SEQ1 as (select SEQ0.*, sum(novo) over (partition by lead_id order by created_at, id) g from SEQ0),
  SEQ as (
    select s.lead_id, s.g, count(*) n,
           (array_agg(a.autor order by s.created_at, s.id))[1] autor
    from SEQ1 s join AUT a on a.id = s.id where s.direcao = 'enviada' group by s.lead_id, s.g
  ),
  SEQL as materialized (select lead_id, 100.0 * count(*) filter (where n >= 3) / count(*) raj from SEQ group by lead_id),
  VENDEU as (
    select distinct z.lead_id from zapintel_venda_lead z join vendas v on v.id = z.venda_id
    where z.empresa_id = v_emp and z.lead_id is not null and coalesce(v.data_venda, v.created_at) >= v_desde
  ),
  TH as materialized (select * from zapintel_turnos(v_emp, v_lojas, v_desde) where aberto),
  PRED as (
    select lead_id, autor from (
      select lead_id, autor, row_number() over (partition by lead_id order by count(*) desc, max(created_at) desc) r
      from E where autor is not null group by lead_id, autor) z where r = 1
  ),
  PAL as (
    select E.lead_id, max(E.filial_id) filial_id, sum(E.palavras) p,
           (select PRED.autor from PRED where PRED.lead_id = E.lead_id) dono
    from E group by E.lead_id
  ),
  NX as (
    select lead_id, created_at,
           min(case when direcao = 'enviada' then created_at end) over (
             partition by lead_id order by created_at desc, id desc
             rows between unbounded preceding and 1 preceding) resp
    from MT
  ),
  R2 as (
    select TH.lead_id, TH.chegou, TH.espera,
           (array_agg(E.autor order by E.id) filter (where E.autor is not null))[1] autor
    from TH
    left join (select distinct on (lead_id, created_at) lead_id, created_at, resp from NX order by lead_id, created_at, resp) nx
      on nx.lead_id = TH.lead_id and nx.created_at = TH.chegou
    left join E on E.lead_id = nx.lead_id and E.created_at = nx.resp
    group by TH.lead_id, TH.chegou, TH.espera
  ),
  RESP as materialized (
    select R2.lead_id, R2.espera, coalesce(R2.autor, PRED.autor) autor
    from R2 left join PRED on PRED.lead_id = R2.lead_id
  ),
  GRP as (
    select 'vendedor' tipo, autor::text chave from E group by autor
    union all select 'loja', filial_id::text from E group by filial_id
    union all select 'geral', null
  ),
  LINHA as (
    select g.tipo, g.chave,
      (select jsonb_build_object(
          'mensagens', count(*),
          'conversas', count(distinct E.lead_id),
          'vendas', count(distinct E.lead_id) filter (where E.lead_id in (select lead_id from VENDEU)),
          'palavrasPorMsg', round(avg(nullif(E.palavras, 0))::numeric, 1),
          'audioPct', round(100.0 * count(*) filter (where E.tipo = 'audio') / nullif(count(*), 0)),
          'perguntasPct', round(100.0 * count(*) filter (where E.pergunta) / nullif(count(*) filter (where E.fala), 0)),
          'giriaPct', round(100.0 * count(*) filter (where cardinality(E.girias) > 0) / nullif(count(*) filter (where E.fala), 0)),
          'risadaPct', round(100.0 * count(*) filter (where E.risada) / nullif(count(*) filter (where E.fala), 0)),
          'palavrasLoja', sum(E.palavras))
        from E
        where case g.tipo when 'vendedor' then E.autor::text is not distinct from g.chave
                          when 'loja' then E.filial_id::text is not distinct from g.chave else true end) m,
      g.chave is null and g.tipo = 'vendedor' sem_autor
    from GRP g
  )
  select jsonb_build_object(
    'dias', p_dias,
    'cobertura', (select jsonb_build_object(
        'mensagens', count(*),
        'crm', count(*) filter (where fonte = 'crm'),
        'apresentacao', count(*) filter (where fonte = 'apresentacao'),
        'dono', count(*) filter (where fonte = 'dono'),
        'nenhum', count(*) filter (where fonte = 'nenhum')) from E),
    'linhas', coalesce((select jsonb_agg(x order by ordem, (x->>'conversas')::int desc) from (
        select case LINHA.tipo when 'geral' then 0 when 'loja' then 1 else 2 end ordem,
          LINHA.m || jsonb_build_object(
            'tipo', LINHA.tipo,
            'id', LINHA.chave,
            'nome', case LINHA.tipo
                      when 'geral' then null
                      when 'loja' then (select rotulo from NOMES where NOMES.id::text = LINHA.chave)
                      else coalesce((select nome from usuarios where id::text = LINHA.chave), 'Não identificado') end,
            'loja', case when LINHA.tipo = 'vendedor' then
                      (select rotulo from NOMES join US on US.filial_id = NOMES.id where US.id::text = LINHA.chave) end,
            'falaLojaPct', (select round(100.0 * sum(PAL.p) / nullif(sum(PAL.p) + sum(coalesce(CLI.palavras, 0)), 0))
                            from PAL left join CLI on CLI.lead_id = PAL.lead_id where case LINHA.tipo
                              when 'vendedor' then PAL.dono::text is not distinct from LINHA.chave
                              when 'loja' then PAL.filial_id::text is not distinct from LINHA.chave else true end),
            'rajadaPct', (select round(100.0 * count(*) filter (where SEQ.n >= 3) / nullif(count(*), 0))
                          from SEQ join L on L.id = SEQ.lead_id where case LINHA.tipo
                            when 'vendedor' then SEQ.autor::text is not distinct from LINHA.chave
                            when 'loja' then L.filial_id::text is not distinct from LINHA.chave else true end),
            'resposta', (select jsonb_build_object(
                            'turnos', count(*),
                            'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
                            'ate5', round(100.0 * count(*) filter (where espera < 5) / nullif(count(*), 0)))
                         from RESP join L on L.id = RESP.lead_id where case LINHA.tipo
                           when 'vendedor' then RESP.autor::text is not distinct from LINHA.chave
                           when 'loja' then L.filial_id::text is not distinct from LINHA.chave else true end),
            'girias', coalesce((select jsonb_agg(jsonb_build_object('palavra', p, 'n', n) order by n desc) from (
                         select gw p, count(*) n from E, unnest(E.girias) gw where case LINHA.tipo
                           when 'vendedor' then E.autor::text is not distinct from LINHA.chave
                           when 'loja' then E.filial_id::text is not distinct from LINHA.chave else true end
                         group by gw order by count(*) desc limit 6) z), '[]'::jsonb),
            'exemplos', case when LINHA.tipo = 'vendedor' and LINHA.chave is not null then
                         coalesce((select jsonb_agg(jsonb_build_object('leadId', lead_id, 'texto', texto, 'audio', audio)) from (
                           select E.lead_id, left(E.t, 180) texto, E.tipo = 'audio' audio from E
                           where E.autor::text = LINHA.chave and cardinality(E.girias) >= 2
                           order by cardinality(E.girias) desc, E.created_at desc limit 3) z), '[]'::jsonb) end
          ) x
        from LINHA) z), '[]'::jsonb),
    'venda', (select jsonb_agg(y.x order by y.vendeu desc) from (select vendeu, jsonb_build_object(
        'vendeu', vendeu, 'conversas', count(*),
        'falaLojaPct', round(avg(fala_loja)), 'perguntasPct', round(avg(perg)),
        'giriaPct', round(avg(gir)), 'audioPct', round(avg(aud)), 'rajadaPct', round(avg(raj))) x
      from (
        select EA.lead_id, EA.lead_id in (select lead_id from VENDEU) vendeu,
               100.0 * EA.pal / nullif(EA.pal + coalesce(CLI.palavras, 0), 0) fala_loja,
               EA.perg, EA.gir, EA.aud, SEQL.raj raj
        from (
          select E.lead_id, count(*) n, sum(E.palavras) pal,
                 100.0 * count(*) filter (where E.pergunta) / nullif(count(*) filter (where E.fala), 0) perg,
                 100.0 * count(*) filter (where cardinality(E.girias) > 0) / nullif(count(*) filter (where E.fala), 0) gir,
                 100.0 * count(*) filter (where E.tipo = 'audio') / count(*) aud
          from E group by E.lead_id
        ) EA
        left join CLI on CLI.lead_id = EA.lead_id left join SEQL on SEQL.lead_id = EA.lead_id
        where EA.n >= 3 and coalesce(CLI.n, 0) >= 2
      ) c group by vendeu) y)
  ) into v_out;

  return v_out;
end;
$function$;

-- zapintel_turnos
CREATE OR REPLACE FUNCTION public.zapintel_turnos(p_emp bigint, p_lojas bigint[], p_desde timestamp with time zone)
 RETURNS TABLE(lead_id bigint, filial_id bigint, chegou timestamp with time zone, espera numeric, dow integer, hora integer, aberto boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  H as materialized (select zapintel_horario(p_emp) h),
  HH as materialized (
    select split_part(h->>'inicio', ':', 1)::int * 60 + split_part(h->>'inicio', ':', 2)::int ini,
           split_part(h->>'fim', ':', 1)::int * 60 + split_part(h->>'fim', ':', 2)::int fim,
           array(select jsonb_array_elements_text(h->'dias')::int) dias
    from H
  ),
  L as (
    select l.id, l.filial_id from zapintel_negocios(p_emp) l
    where l.empresa_id = p_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (p_lojas)
  ),
  ATIVOS as (
    select distinct m.lead_id from zapintel_mensagens(p_emp) m join L on L.id = m.lead_id
    where m.empresa_id = p_emp and m.created_at >= p_desde
  ),
  MS as (
    select m.lead_id, m.direcao, m.created_at,
           lag(m.direcao) over (partition by m.lead_id order by m.created_at, m.id) dir_ant,
           min(case when m.direcao = 'enviada' then m.created_at end) over (
             partition by m.lead_id order by m.created_at desc, m.id desc
             rows between unbounded preceding and 1 preceding) resposta
    from zapintel_mensagens(p_emp) m join ATIVOS A on A.lead_id = m.lead_id
    where m.empresa_id = p_emp
  ),
  T as (
    select MS.lead_id, L.filial_id, MS.created_at chegou,
           (extract(epoch from MS.resposta - MS.created_at) / 60)::numeric espera,
           extract(dow from MS.created_at at time zone 'America/Sao_Paulo')::int dow,
           extract(hour from MS.created_at at time zone 'America/Sao_Paulo')::int hora,
           (extract(hour from MS.created_at at time zone 'America/Sao_Paulo') * 60
            + extract(minute from MS.created_at at time zone 'America/Sao_Paulo'))::int minuto
    from MS join L on L.id = MS.lead_id
    where MS.direcao = 'recebida' and MS.dir_ant is distinct from 'recebida'
      and MS.created_at >= p_desde
  )
  select T.lead_id, T.filial_id, T.chegou, T.espera, T.dow, T.hora,
         (T.dow = any (HH.dias) and T.minuto >= HH.ini and T.minuto < HH.fim) aberto
  from T, HH
$function$;

-- zapintel_resumo
CREATE OR REPLACE FUNCTION public.zapintel_resumo(p_empresa bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(null, p_empresa) e;

  with
  L as materialized (
    select l.id, l.filial_id from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*) n, max(m.created_at) um
    from zapintel_mensagens(v_emp) m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  C as (select L.id, L.filial_id, M.n, M.um from L join M on M.lead_id = L.id)
  select jsonb_build_object(
    'empresa', v_emp,
    'empresaNome', (select nome from empresas where id = v_emp),
    'segmento', (select preset_onboarding from empresas where id = v_emp),
    'conversas', (select count(*) from C),
    'semConversa', (select count(*) from L) - (select count(*) from C),
    'mensagens', (select coalesce(sum(n), 0) from C),
    'ultimaMensagem', (select max(um) from C),
    'lojas', (select jsonb_build_array(jsonb_build_object('id', null, 'nome', 'Toda a rede', 'leads', count(*))) from C)
             || coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome,
                                   'leads', (select count(*) from C where C.filial_id = f.id)) order by f.id)
                          from filiais f where f.empresa_id = v_emp and f.ativo and f.id = any (v_lojas)), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$function$;

-- zapintel_analises_pendentes
CREATE OR REPLACE FUNCTION public.zapintel_analises_pendentes(p_empresa bigint, p_versao text)
 RETURNS TABLE(lead_id bigint, nome text, filial text, tem_ficha boolean, gerado_em timestamp with time zone, mensagens_na_ficha integer, mensagens_agora integer, ultima timestamp with time zone, loja_deve boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with agora as (
    select m.lead_id,
           count(*)::int as n,
           (count(*) filter (where nullif(trim(m.transcricao), '') is not null))::int as tr,
           (floor(extract(epoch from max(m.created_at)) / 60) * 60000)::bigint as marca,
           max(m.created_at) as ultima,
           bool_or(m.direcao = 'recebida') as cliente_falou
    from public.zapintel_mensagens(p_empresa) m
    where m.empresa_id = p_empresa
    group by m.lead_id
  ),
  ultima_dir as (
    select distinct on (m.lead_id) m.lead_id, m.direcao
    from public.zapintel_mensagens(p_empresa) m
    where m.empresa_id = p_empresa
    order by m.lead_id, m.created_at desc, m.id desc
  )
  select l.id, l.nome,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome),
         p.lead_id is not null,
         p.gerado_em,
         p.mensagens,
         a.n,
         a.ultima,
         u.direcao = 'recebida'
  from public.zapintel_negocios(p_empresa) l
  join agora a on a.lead_id = l.id
  left join ultima_dir u on u.lead_id = l.id
  left join public.filiais f on f.id = l.filial_id
  left join public.zapintel_lead_perfil p on p.lead_id = l.id and p.empresa_id = p_empresa
  where l.empresa_id = p_empresa
    and l.ativo
    and not zapintel_funil_interno(l.funil_id)
    and (
      (p.lead_id is null and a.cliente_falou)
      or (p.lead_id is not null and (
            p.versao is distinct from p_versao
         or p.marca is distinct from a.marca
         or p.mensagens is distinct from a.n
         or p.transcritos is distinct from a.tr))
    )
$function$;

-- zapintel_leads_com_conversa
CREATE OR REPLACE FUNCTION public.zapintel_leads_com_conversa(p_empresa bigint)
 RETURNS TABLE(id bigint, telefone text, origem_id text, primeira timestamp with time zone, ultima timestamp with time zone, mensagens bigint, telefone_no_texto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with achado as (
    select l.id, regexp_replace(t[1], '\D', '', 'g') as fone
    from public.zapintel_negocios(p_empresa) l
    join public.zapintel_mensagens(p_empresa) m
      on m.lead_id = l.id and m.direcao = 'recebida'   -- so a fala do CLIENTE
    cross join lateral regexp_matches(
      coalesce(m.conteudo, ''), '(\(?\d{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4})', 'g'
    ) as t
    where l.empresa_id = p_empresa
  ),
  valido as (
    select id, fone from achado
    where length(fone) = 11
      and substring(fone, 1, 2)::int between 11 and 99
      and substring(fone, 3, 1) = '9'
  ),
  repetido as (
    select fone from valido group by fone having count(distinct id) > 2
  ),
  escolhido as (
    select distinct on (id) id, fone
    from valido where fone not in (select fone from repetido)
    order by id, fone
  )
  select l.id, l.telefone, l.origem_id,
         min(m.created_at) as primeira,
         max(m.created_at) as ultima,
         count(*)          as mensagens,
         max(e.fone)       as telefone_no_texto
  from public.zapintel_negocios(p_empresa) l
  join public.zapintel_mensagens(p_empresa) m on m.lead_id = l.id
  left join escolhido e on e.id = l.id
  where l.empresa_id = p_empresa
  group by l.id, l.telefone, l.origem_id
$function$;
