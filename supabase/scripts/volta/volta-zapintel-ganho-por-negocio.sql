-- VOLTA de 20261123000400_zapintel_ganho_por_negocio.sql: as seis funções exatamente como estavam
-- em produção em 23/11/2026 (corpos com md5 conferido). As funções que leem a zapintel_negocios
-- não dependem das colunas novas, então a ordem abaixo é segura.

drop function if exists public.zapintel_negocios(bigint);
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
revoke all on function public.zapintel_negocios(bigint) from public, anon, authenticated;
grant execute on function public.zapintel_negocios(bigint) to service_role;

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
  v_fuso   text;
  v_agora   timestamptz := now();
  v_hoje    timestamptz;
  v_mes     timestamptz;
  v_mes_ant timestamptz;
  v_out     jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  -- O fuso DA EMPRESA (configuracoes_sistema.fuso, padrão Brasília) — 10/11/2026.
  v_fuso := empresa_fuso(v_emp);
  v_hoje := (date_trunc('day', now() at time zone v_fuso)) at time zone v_fuso;
  v_mes := (date_trunc('month', now() at time zone v_fuso)) at time zone v_fuso;
  v_mes_ant := ((date_trunc('month', now() at time zone v_fuso)) - interval '1 month') at time zone v_fuso;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno) and coalesce(l.filial_id, 0) = any (v_lojas)
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
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando,
           -- A regra única de "esperando resposta" (esperando_resposta, 11/11/2026): 72 h, envio que falhou não conta.
           (ESP.negocio_id is not null) esperando_ja
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
    left join esperando_resposta(v_emp, v_lojas) ESP on ESP.negocio_id = L.id
  ),
  -- Agregações da X numa passada só (10/11/2026): eram ~25 subconsultas, cada uma relendo a X.
  XA as materialized (
    select max(um) ultima,
           count(*) filter (where created_at >= v_hoje) novos_hoje,
           count(*) filter (where esperando_ja and cls <> 'unqualified') esperando,
           count(*) filter (where esperando_ja and cls = 'unqualified') esperando_fora,
           count(*) filter (where esperando_ja and ur < v_agora - interval '1 hour' and cls <> 'unqualified') esperando_1h,
           count(*) filter (where esperando and ur < v_agora - interval '72 hours' and cls <> 'unqualified') esperando_antigos,
           min(ur) filter (where esperando_ja and cls <> 'unqualified') espera_antiga,
           count(*) filter (where cls = 'hot') quentes,
           count(*) filter (where cls = 'warm') mornos,
           count(*) filter (where cls = 'customer') clientes,
           count(*) filter (where comprou) com_venda,
           count(*) filter (where cls = 'customer' and not comprou and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null and gerado_em is not null and X.um >= v_agora - interval '90 days') sem_registro,
           count(*) filter (where tem_ficha) com_analise,
           count(*) filter (where tem_ficha and (fm <> n or versao is distinct from p_versao)) desatualizadas,
           count(*) filter (where cls = 'sem_analise') sem_analise,
           count(*) filter (where cls = 'sem_resposta') sem_resposta
    from X
  ),
  XL as (
    select X.filial_id,
           count(*) filter (where X.um >= v_agora - interval '7 days') ativos7d,
           count(*) filter (where X.esperando_ja and X.cls <> 'unqualified') esperando,
           count(*) filter (where X.cls = 'hot') quentes
    from X group by X.filial_id
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
    from public.vendas_vendas v
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
  -- Modelos mais pedidos (17/11/2026): os produtos do CATÁLOGO da empresa citados nas mensagens recebidas
  -- em 30 dias — nenhuma regra de ramo no banco (antes: uma expressão de um modelo de celular). O nome mais longo vence
  -- ("Mesa Lyon Grande" não conta também como "Mesa Lyon"). Sem catálogo, a lista vem vazia.
  PRODUTOS as materialized (
    select p.nome, public.zapintel_padrao_produto(p.nome) padrao,
           lower(regexp_replace(p.nome, '\s+', '', 'g')) chave,
           lower(split_part(trim(p.nome), ' ', 1)) primeira
    from estoque_produtos p
    where p.empresa_id = v_emp and p.ativo and length(trim(p.nome)) >= 3
  ),
  CITADAS as materialized (
    select m.id, m.lead_id, m.tipo, m.created_at, coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') texto
    from zapintel_mensagens(v_emp) m
    where m.empresa_id = v_emp and m.direcao = 'recebida'
      and m.created_at >= v_agora - interval '30 days' and coalesce(m.filial_id, 0) = any (v_lojas)
      and exists (select 1 from PRODUTOS p
                  where position(p.primeira in lower(coalesce(nullif(trim(m.transcricao), ''), m.conteudo, ''))) > 0)
  ),
  -- Veio de anúncio (17/11/2026, noite): o card do anúncio de clique para o WhatsApp (tipo 'anuncio', o
  -- título e o texto do ANÚNCIO) e a mensagem pronta que chega com ele (até 2 min depois) não são palavras
  -- do cliente. Na JM, 237 dos 287 clientes do primeiro colocado eram o próprio anúncio.
  ANUNCIOS as materialized (
    select a.lead_id, a.created_at
    from zapintel_mensagens(v_emp) a
    where a.empresa_id = v_emp and a.tipo = 'anuncio'
      and a.created_at >= v_agora - interval '30 days' - interval '2 minutes'
  ),
  ACHADOS as (
    select c.id, c.lead_id, p.nome, p.chave,
           (c.tipo = 'anuncio' or exists (
              select 1 from ANUNCIOS a
              where a.lead_id = c.lead_id
                and c.created_at between a.created_at - interval '1 minute' and a.created_at + interval '2 minutes')) via_anuncio
    from CITADAS c join PRODUTOS p on c.texto ~* p.padrao
  ),
  MODELOS as (
    select a.nome modelo, a.lead_id, a.via_anuncio from ACHADOS a
    where not exists (select 1 from ACHADOS b
                      where b.id = a.id and length(b.chave) > length(a.chave) and b.chave like a.chave || '%')
  )
  select jsonb_build_object(
    'geradoEm', v_agora,
    'empresa', v_emp,
    'ultimaMensagem', (select ultima from XA),
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', rotulo) order by id), '[]') from NOMES where id = any (v_lojas)),

    'agora', (select jsonb_build_object(
        'recebidasHoje', HOJE.recebidas,
        'enviadasHoje', HOJE.enviadas,
        'conversasHoje', HOJE.conversas,
        'leadsNovosHoje', (select novos_hoje from XA),
        'esperando', (select esperando from XA),
        'esperandoForaDoFunil', (select esperando_fora from XA),
        'esperandoMais1h', (select esperando_1h from XA),
        'esperandoAntigos', (select esperando_antigos from XA),
        'esperaMaisAntiga', (select espera_antiga from XA)
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
        where X.esperando_ja and X.cls <> 'unqualified'
        order by ordem, X.ur
        limit 14
      ) f),

    'funil', (select coalesce(jsonb_object_agg(cls, n), '{}') from (select cls, count(*) n from X group by cls) c),

    'dinheiro', (select jsonb_build_object(
        'ticketMedio', round(TICKET.ticket::numeric, 2),
        'quentes', (select quentes from XA),
        'mornos', (select mornos from XA),
        'mesValor', VMES.mes_valor, 'mesQtd', VMES.mes_qtd,
        'mesAnteriorValor', VMES.ant_valor, 'mesAnteriorQtd', VMES.ant_qtd,
        'hojeValor', VMES.hoje_valor, 'hojeQtd', VMES.hoje_qtd,
        'clientesLidos', (select clientes from XA),
        'clientesComVenda', (select com_venda from XA),
        'semRegistro', (select sem_registro from XA)
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
        select extract(isodow from m.created_at at time zone v_fuso)::int dow,
               extract(hour from m.created_at at time zone v_fuso)::int hora,
               count(*) n
        from zapintel_mensagens(v_emp) m
        where m.empresa_id = v_emp and m.direcao = 'recebida' and m.created_at >= v_agora - interval '28 days'
          and coalesce(m.filial_id, 0) = any (v_lojas)
        group by 1, 2) h),

    'modelos', (select coalesce(jsonb_agg(md order by md.leads desc), '[]') from (
        -- sozinho = escreveu o produto com as próprias palavras em alguma mensagem; anuncio = só pelo anúncio
        select modelo, count(distinct lead_id) leads,
               count(distinct lead_id) filter (where not via_anuncio) sozinho,
               count(distinct lead_id) - count(distinct lead_id) filter (where not via_anuncio) anuncio
        from MODELOS group by 1 order by 2 desc limit 8) md),

    'analises', jsonb_build_object(
        'comAnalise', (select com_analise from XA),
        'desatualizadas', (select desatualizadas from XA),
        'semAnalise', (select sem_analise from XA),
        'semResposta', (select sem_resposta from XA)
      ),

    'silencio', (select coalesce(jsonb_agg(si order by si.vezes desc), '[]') from (
        select left(texto, 160) frase, count(*) vezes, count(*) filter (where comprou) venderam
        from SIL group by left(texto, 160) having count(*) >= 2
        order by 2 desc limit 8) si),

    'porLoja', (select coalesce(jsonb_agg(pl order by pl.id), '[]') from (
        select NOMES.id, NOMES.rotulo nome,
               coalesce(XL.ativos7d, 0) ativos7d,
               coalesce(XL.esperando, 0) esperando,
               coalesce(XL.quentes, 0) quentes,
               (select coalesce(sum(valor_venda), 0) from V where V.filial_id = NOMES.id and V.data_venda >= v_mes and V.status <> 'cancelada') "vendasMes",
               (select round((percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440)))::numeric)
                  from RS where RS.filial_id = NOMES.id) "respostaMin"
        from NOMES left join XL on XL.filial_id = NOMES.id where NOMES.id = any (v_lojas)) pl)
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
  v_fuso text;
  v_agora timestamptz := now();
  v_hoje  timestamptz;
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  -- O fuso DA EMPRESA (configuracoes_sistema.fuso, padrão Brasília) — 10/11/2026.
  v_fuso := empresa_fuso(v_emp);
  v_hoje := (date_trunc('day', now() at time zone v_fuso)) at time zone v_fuso;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno) and coalesce(l.filial_id, 0) = any (v_lojas)
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
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando,
           -- A regra única de "esperando resposta" (esperando_resposta, 11/11/2026): 72 h, envio que falhou não conta.
           (ESP.negocio_id is not null) esperando_ja
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
    left join esperando_resposta(v_emp, v_lojas) ESP on ESP.negocio_id = L.id
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  ESCOLHA as (
    select X.*, null::text detalhe from X
    where (p_tipo = 'classe' and X.cls = p_valor)
       or (p_tipo = 'esperando' and X.esperando_ja and X.cls <> 'unqualified')
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
        and coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') ~* public.zapintel_padrao_produto(p_valor))
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
  v_fuso  text;
  v_agora  timestamptz := now();
  v_hoje   timestamptz;
  v_f      jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca  text := nullif(trim(coalesce(p_filtros->>'busca', '')), '');
  v_padrao text;
  v_por    int := least(greatest(coalesce(p_por_pagina, 50), 10), 200);
  v_pag    int := greatest(coalesce(p_pagina, 1), 1);
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  -- O fuso DA EMPRESA (configuracoes_sistema.fuso, padrão Brasília) — 10/11/2026.
  v_fuso := empresa_fuso(v_emp);
  v_hoje := (date_trunc('day', now() at time zone v_fuso)) at time zone v_fuso;
  if v_busca is not null then
    v_padrao := '%' || regexp_replace(replace(replace(v_busca, '%', ' '), '_', ' '), '\s+', '%', 'g') || '%';
  end if;

  with
  L as materialized (
    select l.id, l.contato_id, l.nome, l.telefone, l.origem, l.origem_id, l.filial_id, l.created_at,
           l.kanban_status, l.convertido_em, l.produto_interessado
    from zapintel_negocios(v_emp) l
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno) and coalesce(l.filial_id, 0) = any (v_lojas)
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
           (M.ur is not null and (M.ue is null or M.ur > M.ue)) esperando,
           -- A regra única de "esperando resposta" (esperando_resposta, 11/11/2026): 72 h, envio que falhou não conta.
           (ESP.negocio_id is not null) esperando_ja
    from L join M on M.lead_id = L.id
    left join F on F.lead_id = L.id
    left join B on B.lead_id = L.id
    left join esperando_resposta(v_emp, v_lojas) ESP on ESP.negocio_id = L.id
  ),
  BASE as materialized (
    select X.* from X
    where (v_f->>'urgencia' is null or X.urg = v_f->>'urgencia')
      and (v_f->>'canal' is null or coalesce(X.origem, 'whatsapp') = v_f->>'canal')
      and (coalesce((v_f->>'esperando')::boolean, false) = false
           or (X.esperando_ja and X.cls <> 'unqualified'))
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
                  public.zapintel_padrao_produto(v_f->>'modelo')))
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
      case when p_ordem = 'prioridade' then (case when FINAL.esperando_ja then 0 else 1 end) end asc nulls last,
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
               (P.esperando_ja and P.cls <> 'unqualified') esperando,
               P.ur "ultimaDoCliente", P.um "ultimaMensagem", P.pm "primeiraMensagem", P.n mensagens,
               jsonb_array_length(coalesce(P.si, '[]'::jsonb)) sinais,
               jsonb_array_length(coalesce(P.obj, '[]'::jsonb)) objecoes,
               (select count(*) from jsonb_array_elements_text(coalesce(P.ps, '[]'::jsonb)) t where t like '⚠%') alertas
        from PAGINA P
        order by
          case when p_ordem = 'prioridade' then P.prioridade end asc nulls last,
          case when p_ordem = 'prioridade' then (case when P.esperando_ja then 0 else 1 end) end asc nulls last,
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
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, max(m.created_at) um, min(m.created_at) pm
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
  -- Agregações da X numa passada só, e as conversas novas pela M (10/11/2026): antes eram
  -- ~10 releituras da X e duas varreduras de TODAS as mensagens com uma chamada por linha.
  XA as materialized (
    select count(*) conversas,
           round(100.0 * count(*) filter (where comprou) / nullif(count(*), 0), 1) taxa,
           count(*) filter (where cls = 'customer') clientes,
           count(*) filter (where ligada) ligadas,
           count(*) filter (where cls = 'customer' and not ligada
                              and coalesce(kanban_status, '') <> 'convertido' and convertido_em is null
                              and um >= v_agora - interval '90 days') sem_registro,
           count(*) filter (where cls = 'customer' and um < v_agora - interval '60 days') sem_conversa_60d
    from X
  ),
  NOV as (
    select count(*) filter (where M.pm >= v_desde) novas,
           count(*) filter (where M.pm >= v_desde - make_interval(days => p_dias) and M.pm < v_desde) antes
    from L join M on M.lead_id = L.id
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
    from public.vendas_vendas v
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
    'conversas', (select conversas from XA),
    'taxaBase', (select taxa from XA),
    'comparacao', case when p_dias is null then null else jsonb_build_object(
        'vendas', (select count(distinct coalesce(v.grupo_pdv::text, v.id::text)) from public.vendas_vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'valor', (select coalesce(sum(v.valor_venda), 0) from public.vendas_vendas v
                   where v.empresa_id = v_emp and coalesce(v.filial_id, 0) = any (v_lojas) and v.status in ('concluida', 'encomenda')
                     and coalesce(v.data_venda, v.created_at) >= v_desde - make_interval(days => p_dias)
                     and coalesce(v.data_venda, v.created_at) < v_desde),
        'conversasNovas', (select novas from NOV),
        'conversasNovasAntes', (select antes from NOV))
      end,
    'vendaTotal', (select jsonb_build_object(
        'registradas', V.vendas, 'valor', V.valor,
        'ticket', case when V.vendas > 0 then round(V.valor / V.vendas) end,
        'comConversa', V.com_conversa,
        'lidasNasConversas', (select clientes from XA),
        'ligadas', (select ligadas from XA),
        'semRegistro', (select sem_registro from XA))
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
        'total', (select clientes from XA),
        'chegaramPorIndicacao', (select count(distinct id) from SI where familia = 'Veio por indicação'),
        'pediuIndicacao', (select count(*) from PEDIU),
        'semConversa60d', (select sem_conversa_60d from XA),
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
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  F as materialized (
    select p.lead_id, p.perfil->>'classificacao' cls, p.perfil->'pontasSoltas' ps, p.perfil->'sinais' si,
           p.perfil->>'mensagemSugerida' msg, p.perfil->>'diagnostico' diag
    from zapintel_lead_perfil p where p.empresa_id = v_emp
  ),
  VL as materialized (
    select distinct on (z.lead_id) z.lead_id, coalesce(v.data_venda, v.created_at) quando, v.valor_venda, pr.nome produto
    from zapintel_venda_lead z join public.vendas_vendas v on v.id = z.venda_id
    left join public.estoque_produtos pr on pr.id = v.produto_id
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
