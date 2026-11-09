-- FUSO DA EMPRESA NO BANCO (10/11/2026). Pedido do Lucas: funções que cortam por dia ou mês
-- usam o fuso da empresa (AT TIME ZONE), não Brasília fixo nem o UTC do servidor.
--
-- 1. empresa_fuso(p_empresa): o fuso salvo em configuracoes_sistema (chave 'fuso', valor
--    {"fuso": "<IANA>"} ou o texto), validado pelo próprio Postgres; sem linha ou inválido,
--    'America/Sao_Paulo' — a mesma regra de lib/fuso-empresa.ts no app.
-- 2. ZapIntel (dashboard, dashboard_lista, leads_lista, atendimento, turnos): os 18 pontos de
--    'America/Sao_Paulo' fixo passam a usar o fuso da empresa. Nas plpgsql o fuso é lido uma
--    vez, logo depois de resolver a empresa (zapintel_escopo), e "hoje"/"mês" saem dele; na
--    turnos (sql), por uma CTE materializada. Os corpos são os da PRODUÇÃO (md5 conferido em
--    10/11), só com essa troca. Para quem está em Brasília (todas as empresas de hoje) o
--    resultado é idêntico.
-- 3. refresh_status_atrasados: "vencido" é data_venc antes do dia DA LOJA (era current_date,
--    o dia UTC: das 21h às 24h o vencimento de hoje já virava "atrasado").
-- Volta: supabase/scripts/volta/volta-fuso-empresa.sql (corpos exatos de antes).

create or replace function public.empresa_fuso(p_empresa bigint)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_valor jsonb;
  v_fuso  text;
begin
  select c.valor into v_valor from public.configuracoes_sistema c
   where c.empresa_id = p_empresa and c.chave = 'fuso';
  v_fuso := case jsonb_typeof(v_valor) when 'object' then v_valor ->> 'fuso' when 'string' then v_valor #>> '{}' end;
  if v_fuso is null or btrim(v_fuso) = '' then return 'America/Sao_Paulo'; end if;
  begin
    perform now() at time zone v_fuso;  -- fuso desconhecido: erro aqui, cai no padrão
    return v_fuso;
  exception when others then
    return 'America/Sao_Paulo';
  end;
end;
$$;

revoke all on function public.empresa_fuso(bigint) from public, anon, authenticated;
grant execute on function public.empresa_fuso(bigint) to service_role;

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
        select extract(isodow from m.created_at at time zone v_fuso)::int dow,
               extract(hour from m.created_at at time zone v_fuso)::int hora,
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

CREATE OR REPLACE FUNCTION public.zapintel_atendimento(p_dias integer DEFAULT 30, p_filial bigint DEFAULT NULL::bigint, p_empresa bigint DEFAULT NULL::bigint)
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
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_hor    jsonb;
  v_out    jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  -- O fuso DA EMPRESA (configuracoes_sistema.fuso, padrão Brasília) — 10/11/2026.
  v_fuso := empresa_fuso(v_emp);
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
          'inicio', (date_trunc('week', chegou at time zone v_fuso))::date,
          'turnos', count(*),
          'mediana', round(percentile_cont(0.5) within group (order by least(coalesce(espera, 1440), 1440))::numeric),
          'ate5', round(100.0 * count(*) filter (where espera < 5) / count(*)),
          'mais4h', round(100.0 * count(*) filter (where espera is null or espera >= 240) / count(*))) s
        from TH where aberto and chegou >= v_agora - interval '8 weeks'
        group by date_trunc('week', chegou at time zone v_fuso)) z), '[]'::jsonb),
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

CREATE OR REPLACE FUNCTION public.zapintel_turnos(p_emp bigint, p_lojas bigint[], p_desde timestamp with time zone)
 RETURNS TABLE(lead_id bigint, filial_id bigint, chegou timestamp with time zone, espera numeric, dow integer, hora integer, aberto boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  -- O fuso DA EMPRESA, uma vez por chamada (10/11/2026).
  FZ as materialized (select empresa_fuso(p_emp) fz),
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
           extract(dow from MS.created_at at time zone FZ.fz)::int dow,
           extract(hour from MS.created_at at time zone FZ.fz)::int hora,
           (extract(hour from MS.created_at at time zone FZ.fz) * 60
            + extract(minute from MS.created_at at time zone FZ.fz))::int minuto
    from MS join L on L.id = MS.lead_id cross join FZ
    where MS.direcao = 'recebida' and MS.dir_ant is distinct from 'recebida'
      and MS.created_at >= p_desde
  )
  select T.lead_id, T.filial_id, T.chegou, T.espera, T.dow, T.hora,
         (T.dow = any (HH.dias) and T.minuto >= HH.ini and T.minuto < HH.fim) aberto
  from T, HH
$function$;

CREATE OR REPLACE FUNCTION public.refresh_status_atrasados()
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update public.financeiro_lancamentos l
     set status = 'atrasado'
   where l.status = 'pendente'
     and l.data_venc < (now() at time zone public.empresa_fuso(l.empresa_id))::date;
$function$;
