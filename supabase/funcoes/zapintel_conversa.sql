-- COMO A LOJA CONVERSA — NO GERAL, POR LOJA E POR VENDEDOR.
--
-- Aplicada no banco em 15/10/2026. Pedido do Lucas: *"Conversation
-- Intelligence... vendedor usa giria demais, fala demais e escuta de menos"* e
-- *"da para deixar pronto por vendedor e no geral tb pq assim podemos medir pois
-- sao poucos vendedores"* — com a opção (A): cada vendedor assume o lead.
--
-- ══ QUEM ESCREVEU CADA MENSAGEM DA LOJA ════════════════════════════════════
--
-- Cada loja tem UM número de WhatsApp, usado por todos pelo celular
-- (coexistência). Só 2% das mensagens saem pelo CRM com `usuario_id`. Então o
-- autor vem, nesta ordem, de:
--
--   1. `usuario_id`  — enviada pelo CRM: é fato.
--   2. apresentação  — "Pedro aqui", "aqui é o Luiz", "sou a Rayssa". Os
--                      vendedores se apresentam no áudio; com as transcrições
--                      isso virou texto. Vale para a própria mensagem, para as
--                      seguintes por até 72 h, e para as que vieram até 12 h
--                      ANTES (o "bom dia" digitado antes do áudio).
--   3. dono do lead  — quem pegou o lead no CRM ("Pegar lead"), no momento da
--                      mensagem: `lead_atribuicoes` + `responsavel_desde`.
--
-- A apresentação passa à frente do dono porque é o próprio vendedor dizendo
-- quem está falando AGORA; o dono pode ser de semanas atrás.
--
-- Os nomes vêm de `usuarios` (ativos da empresa, menos o dono da conta):
-- primeiro e segundo nome, só os que nenhum outro usuário tem, mais o nome
-- composto; sem acento, z=s e y=i ("Luiz" = "Luis"), "-ão" no lugar do "-o"
-- final ("Pedrão"). Mensagem que bate com duas pessoas não é atribuída.
--
-- Medido em 15/10 (90 dias, JM): 53% das mensagens da loja com autor
-- (apresentação 13.446, dono 2.093, CRM 1.266). Conferido contra o PDV: o
-- vendedor da venda NÃO é necessariamente quem conversou — em Mogi um atende
-- no WhatsApp e o outro fecha no balcão. Por isso a venda aqui é "a conversa
-- virou venda", e não "venda do vendedor".
--
-- ══ O QUE SE MEDE ══════════════════════════════════════════════════════════
--
-- Por mensagem do autor: palavras por mensagem, % áudio, % com pergunta,
-- % com gíria, % com risada. Por conversa em que ele falou: quanto da conversa
-- é a loja falando (palavras, contando áudio transcrito), % das sequências da
-- loja com 3+ mensagens sem o cliente responder, e se virou venda. Tempo de
-- resposta: os turnos de `zapintel_turnos` (a MESMA conta do dashboard e da
-- tela Atendimento), atribuídos a quem respondeu.
--
-- GÍRIA: lista fixa de palavras do português informal, contada só como
-- vocativo quando a palavra também tem uso comum ("cara" com vírgula ou
-- pontuação — "é cara" de preço não conta; "irmão" idem). A tela mostra quais
-- palavras e exemplos, para quem lê conferir.
--
-- ══ GUARDADO, NÃO CALCULADO A CADA ABERTURA ═══════════════════════════════
--
-- A conta leva ~5 s em 30 dias, e o banco corta em 8 s a consulta de quem está
-- logado. Testado em 15/10 com a tela aberta: junto das outras consultas da
-- página, passou do limite. Então:
--
--   zapintel_conversa_calc     a conta (abaixo), sem acesso de fora;
--   zapintel_conversa_cache    o resultado, por empresa + lojas + período;
--   zapintel_conversa          a tela: confere o acesso, devolve o guardado
--                              (até 26 h) ou calcula se não houver ou se
--                              pedirem "recalcular";
--   zapintel_conversa_aquecer  calcula rede e cada loja, 7 e 30 dias, todo dia
--                              às 05:00 UTC pelo `pg_cron` (abaixo).
--
-- POR QUE `pg_cron` E NÃO O CRON DA VERCEL: a Vercel chama o banco pelo
-- PostgREST, que herda os 8 s do `authenticator` — aquecer as 6 combinações leva
-- ~30 s. Dentro do banco não há esse corte, e não gasta CPU da Vercel.
--
-- p_dias: 7 | 30 (a tela não pede mais que 30).
create or replace function public.zapintel_conversa_calc(
  p_emp bigint,
  p_lojas bigint[],
  p_dias int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp    bigint := p_emp;
  v_lojas  bigint[] := p_lojas;
  v_desde  timestamptz := case when p_dias is null then '-infinity'::timestamptz else now() - make_interval(days => p_dias) end;
  v_out    jsonb;
begin
  with
  L as materialized (
    select l.id, l.filial_id from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id)
      and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  NOMES as (
    select f.id, coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome) rotulo
    from filiais f where f.empresa_id = v_emp
  ),
  -- ── Quem é quem: os nomes viram padrão de apresentação ──────────────────
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
  -- ── Todas as mensagens do período (com 3 dias antes, para a apresentação) ─
  M as materialized (
    select m.id, m.lead_id, m.created_at, m.direcao, m.tipo, m.usuario_id,
           coalesce(nullif(trim(m.transcricao), ''), m.conteudo, '') t
    from lead_mensagens m join L on L.id = m.lead_id
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
    -- Filtro barato antes: só quem tem "aqui", "sou" ou "meu nome" passa pelas
    -- expressões de cada pessoa. O Postgres guarda 32 expressões compiladas;
    -- com todas testadas em todas as mensagens, ele recompilava sem parar
    -- (11 s para 7 dias).
    where e.direcao = 'enviada' and e.fala and e.lt ~ '(aqui|sou |meu nome)'
    group by e.id
  ),
  POS as (
    select a.lead_id, a.created_at em, a.para_responsavel dono
    from lead_atribuicoes a join L on L.id = a.lead_id where a.empresa_id = v_emp
    union all
    -- `ld`, não `l`: no Postgres `l` e `L` são o mesmo nome.
    select ld.id, ld.responsavel_desde, ld.responsavel_id from leads ld join L on L.id = ld.id
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
  -- ── Gíria e risada ─────────────────────────────────────────────────────
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
  -- Mensagens DA LOJA no período, com autor, loja e as marcas de cada uma.
  E as materialized (
    select e.id, e.lead_id, L.filial_id, e.created_at, e.tipo, e.fala, e.t, a.autor, a.fonte,
           case when e.fala then coalesce(array_length(regexp_split_to_array(trim(e.t), '\s+'), 1), 0) else 0 end palavras,
           (e.fala and e.t like '%?%') pergunta,
           (e.fala and e.lt ~ '(k{3,}|(ha){2,}|(rs){2,})') risada,
           -- Uma expressão com todas as palavras decide se há gíria; a lista de quais
           -- só é montada para quem bateu (ver o filtro do INTRO).
           case when e.fala and e.lt ~ (select string_agg('(' || rx || ')', '|') from GW)
                then array(select g.palavra from GW g where e.lt ~ g.rx) else '{}'::text[] end girias
    from MT e join AUT a on a.id = e.id join L on L.id = e.lead_id
    where e.direcao = 'enviada' and e.created_at >= v_desde
  ),
  -- Fala do cliente por conversa no período.
  CLI as (
    select lead_id, count(*) n,
           sum(case when fala then coalesce(array_length(regexp_split_to_array(trim(t), '\s+'), 1), 0) else 0 end) palavras
    from MT where direcao = 'recebida' and created_at >= v_desde group by lead_id
  ),
  -- Sequências: blocos seguidos da mesma direção. A da loja conta para quem a abriu.
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
  SEQL as (select lead_id, 100.0 * count(*) filter (where n >= 3) / count(*) raj from SEQ group by lead_id),
  VENDEU as (
    -- `lead_id is not null`: com um nulo aqui, `x in (VENDEU)` vira nulo em vez
    -- de falso, e o lado "não vendeu" sumia da comparação.
    select distinct z.lead_id from zapintel_venda_lead z join vendas v on v.id = z.venda_id
    where z.empresa_id = v_emp and z.lead_id is not null and coalesce(v.data_venda, v.created_at) >= v_desde
  ),
  -- Tempo de resposta: a mesma conta das outras telas, atribuída a quem respondeu.
  TH as materialized (select * from zapintel_turnos(v_emp, v_lojas, v_desde) where aberto),
  -- A resposta é a mensagem da loja em `chegou + espera`; sem resposta, conta
  -- para quem mais falou na conversa.
  PRED as (
    select lead_id, autor from (
      select lead_id, autor, row_number() over (partition by lead_id order by count(*) desc, max(created_at) desc) r
      from E where autor is not null group by lead_id, autor) z where r = 1
  ),
  -- Palavras da loja por conversa, e quem mais falou nela.
  PAL as (
    select E.lead_id, max(E.filial_id) filial_id, sum(E.palavras) p,
           (select PRED.autor from PRED where PRED.lead_id = E.lead_id) dono
    from E group by E.lead_id
  ),
  -- A resposta de cada turno é a próxima mensagem da loja — achada por janela,
  -- como em `zapintel_turnos`. (Uma junção por faixa de horário entre turnos e
  -- mensagens era quadrática: 11 s para 7 dias.)
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
  -- `materialized`: RESP é lido dentro da subconsulta de CADA linha (vendedor,
  -- loja, geral). Sem isso o Postgres o embute ali e roda `zapintel_turnos` uma
  -- vez por linha — 7,3 s em 30 dias.
  RESP as materialized (
    select R2.lead_id, R2.espera, coalesce(R2.autor, PRED.autor) autor
    from R2 left join PRED on PRED.lead_id = R2.lead_id
  ),
  -- ── Por quem: cada vendedor, "não identificado", e as lojas ─────────────
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
            -- Quanto da conversa é a loja falando: as palavras DELE contra as do cliente
            -- nas conversas em que ele falou.
            -- Quanto da conversa é a loja falando: todas as palavras da loja contra as
            -- do cliente, por CONVERSA — cada uma conta para quem mais falou nela.
            -- (Contar só as palavras dele contra todas as do cliente dava 57% para
            -- cada vendedor e 69% no total.)
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

    -- ── O que separa as conversas que viraram venda ─────────────────────
    -- Conversas com 3+ mensagens da loja e 2+ do cliente no período.
    'venda', (select jsonb_agg(y.x order by y.vendeu desc) from (select vendeu, jsonb_build_object(
        'vendeu', vendeu, 'conversas', count(*),
        'falaLojaPct', round(avg(fala_loja)), 'perguntasPct', round(avg(perg)),
        'giriaPct', round(avg(gir)), 'audioPct', round(avg(aud)), 'rajadaPct', round(avg(raj))) x
      from (
        select E.lead_id, E.lead_id in (select lead_id from VENDEU) vendeu,
               100.0 * sum(E.palavras) / nullif(sum(E.palavras) + coalesce(max(CLI.palavras), 0), 0) fala_loja,
               100.0 * count(*) filter (where E.pergunta) / nullif(count(*) filter (where E.fala), 0) perg,
               100.0 * count(*) filter (where cardinality(E.girias) > 0) / nullif(count(*) filter (where E.fala), 0) gir,
               100.0 * count(*) filter (where E.tipo = 'audio') / count(*) aud,
               max(SEQL.raj) raj
        from E left join CLI on CLI.lead_id = E.lead_id left join SEQL on SEQL.lead_id = E.lead_id
        group by E.lead_id
        having count(*) >= 3 and coalesce(max(CLI.n), 0) >= 2
      ) c group by vendeu) y)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.zapintel_conversa_calc(bigint, bigint[], int) from public, anon, authenticated;

create table if not exists public.zapintel_conversa_cache (
  empresa_id bigint not null,
  chave      text not null,          -- '<dias>:<lojas em ordem>'
  dados      jsonb not null,
  gerado_em  timestamptz not null default now(),
  primary key (empresa_id, chave)
);
-- Só as funções abaixo (dono) leem e gravam.
alter table public.zapintel_conversa_cache enable row level security;
revoke all on public.zapintel_conversa_cache from anon, authenticated;

create or replace function public.zapintel_conversa_chave(p_dias int, p_lojas bigint[])
returns text language sql immutable as $$
  select coalesce(p_dias, 30)::text || ':' || array_to_string(array(select x from unnest(p_lojas) x order by x), ',')
$$;

drop function if exists public.zapintel_conversa(int, bigint, bigint);
create or replace function public.zapintel_conversa(
  p_dias int default 30,
  p_filial bigint default null,
  p_empresa bigint default null,
  p_recalcular boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_chave text;
  v_dados jsonb;
  v_em    timestamptz;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(p_filial, p_empresa) e;
  v_chave := zapintel_conversa_chave(p_dias, v_lojas);
  if not p_recalcular then
    select c.dados, c.gerado_em into v_dados, v_em from zapintel_conversa_cache c
     where c.empresa_id = v_emp and c.chave = v_chave and c.gerado_em > now() - interval '26 hours';
    if found then return v_dados || jsonb_build_object('geradoEm', v_em); end if;
  end if;
  v_dados := zapintel_conversa_calc(v_emp, v_lojas, coalesce(p_dias, 30));
  insert into zapintel_conversa_cache (empresa_id, chave, dados, gerado_em) values (v_emp, v_chave, v_dados, now())
  on conflict (empresa_id, chave) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;
  return v_dados || jsonb_build_object('geradoEm', now());
end;
$$;

revoke all on function public.zapintel_conversa(int, bigint, bigint, boolean) from public, anon;
grant execute on function public.zapintel_conversa(int, bigint, bigint, boolean) to authenticated;

-- A rede (todas as lojas + "sem loja", como `zapintel_escopo` monta para dono e
-- admin) e cada loja sozinha, em 7 e 30 dias.
create or replace function public.zapintel_conversa_aquecer(p_empresa bigint)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lojas bigint[];
  v_dias int;
  v_n int := 0;
  f record;
begin
  for f in select null::bigint id union all select id from filiais where empresa_id = p_empresa loop
    foreach v_dias in array array[7, 30] loop
      if f.id is not null then v_lojas := array[f.id];
      else select coalesce(array_agg(id), array[]::bigint[]) || 0::bigint into v_lojas from filiais where empresa_id = p_empresa;
      end if;
      insert into zapintel_conversa_cache (empresa_id, chave, dados, gerado_em)
      values (p_empresa, zapintel_conversa_chave(v_dias, v_lojas), zapintel_conversa_calc(p_empresa, v_lojas, v_dias), now())
      on conflict (empresa_id, chave) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.zapintel_conversa_aquecer(bigint) from public, anon, authenticated, service_role;

-- 05:00 UTC = 02:00 em Brasília, depois da ponte venda↔conversa (cron da Vercel
-- `ponte-vendas`, 04:40 UTC), porque a conta usa as vendas ligadas.
create extension if not exists pg_cron;
select cron.schedule(
  'zapintel-conversa-aquecer',
  '0 5 * * *',
  $$select public.zapintel_conversa_aquecer(m.empresa_id) from public.empresa_modulos m where m.modulo = 'inteligencia' and m.ativo$$
);
