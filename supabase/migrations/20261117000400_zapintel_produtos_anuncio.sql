-- ZAPINTEL: "PRODUTOS MAIS PEDIDOS" SEPARA "VEIO DE ANÚNCIO" DE "ESCREVEU SOZINHO" (17/11/2026, noite, pedido
-- do Lucas). Conferido em produção (só leitura): o primeiro colocado da JM ("iPhone 18 Pro", 287 clientes) vinha
-- quase todo do card do anúncio de clique para o WhatsApp — a mensagem de tipo 'anuncio' guarda o título e o texto
-- do ANÚNCIO ("iPhone 18 Pro Max em Mogi Guaçu…"), e a Edge a grava como recebida — e da mensagem pronta que chega
-- junto ("Qual é o preço do iPhone 18 Pro Max?"). Não é erro de casamento: o nome é inteiro e o mais longo do
-- catálogo vence (a JM não tem "iPhone 18 Pro Max" cadastrado, por isso o "Pro Max" do anúncio cai no "18 Pro").
--   zapintel_dashboard   'modelos' ganha `sozinho` (clientes que escreveram o produto em alguma mensagem que não
--                        é o anúncio nem a mensagem pronta dele, até 2 min depois) e `anuncio` (o resto); `leads`
--                        segue o total. Nada mais muda (corpo de partida = 20261117000200, aplicada em 17/11).
-- Volta: supabase/scripts/volta/volta-zapintel-anuncio.sql (o corpo da 0200).

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
