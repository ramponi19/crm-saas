-- ETAPA 1.1c — MARCA "ATENDE CLIENTES" POR PESSOA (25/11/2026; decisão do Lucas, docs/etapa-1.1-plano.md §3.3).
--
-- Antes: o ZapIntel tirava do reconhecimento pelo nome ("aqui é o Eduardo") quem tinha papel `owner`. Com Matheus e
-- Eduardo promovidos a Dono (passo 1 da 1.1c), as apresentações deles pelo celular deixaram de identificá-los.
-- Agora quem decide é uma marca explícita do vínculo: `empresa_usuarios.atende_clientes`.
--   - ligada para todos (padrão true), inclusive Donos;
--   - desligada, sempre, em cargo de Consulta (`empresa_cargos.somente_leitura`): o gatilho do cargo força false,
--     do mesmo jeito que já força `participa_roleta = false`;
--   - `zapintel_conversa_calc` reconhece pelo nome só quem está ativo e com a marca ligada. Mais nada muda na função.
--
-- Compatível com o app no ar: coluna nova com padrão (só metadado), o app de hoje não a lê. Uma tabela só
-- (empresa_usuarios), com lock_timeout; sem drop (lição de 25/11, memória migracao-ddl-deadlock).
-- Volta: supabase/scripts/volta/volta-atende-clientes.sql.

set local lock_timeout = '5s';

alter table public.empresa_usuarios add column if not exists atende_clientes boolean not null default true;
comment on column public.empresa_usuarios.atende_clientes is
  'A pessoa conversa com clientes pela loja: o ZapIntel a reconhece quando ela se apresenta pelo nome. Sempre false em cargo de Consulta (gatilho empresa_usuarios_cargo_papel).';

-- Quem já está em cargo de Consulta começa desligado (em 25/11/2026: ninguém).
update public.empresa_usuarios eu set atende_clientes = false
  from public.empresa_cargos c
 where c.id = eu.cargo_id and c.somente_leitura and eu.atende_clientes;

create or replace function public.empresa_usuarios_cargo_papel()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cargo record;
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.usuarios u where u.id = new.usuario_id and u.is_super_admin) then
      raise exception 'PLATAFORMA_SEM_VINCULO: conta da plataforma não entra na equipe de uma empresa' using errcode = 'P0001';
    end if;
  end if;

  if not exists (select 1 from public.empresa_cargos where empresa_id = new.empresa_id) then
    perform public.cargos_semear(new.empresa_id);
  end if;

  if tg_op = 'INSERT' and new.cargo_id is null
     or tg_op = 'UPDATE' and new.cargo_id is not distinct from old.cargo_id and new.role is distinct from old.role then
    select id into new.cargo_id from public.empresa_cargos
     where empresa_id = new.empresa_id and papel_base = coalesce(new.role, 'vendedor') and not somente_leitura
     order by sistema desc, id limit 1;
  end if;

  select * into v_cargo from public.empresa_cargos where id = new.cargo_id and empresa_id = new.empresa_id;
  if v_cargo.id is null then
    raise exception 'CARGO_INVALIDO: o cargo não é desta empresa' using errcode = 'P0001';
  end if;
  new.role := v_cargo.papel_base;
  if v_cargo.somente_leitura then
    new.participa_roleta := false;
    new.atende_clientes := false;
  end if;
  return new;
end $$;
revoke all on function public.empresa_usuarios_cargo_papel() from public, anon, authenticated;

-- A lista de colunas ganha atende_clientes: ligar a marca de uma conta de Consulta passa pelo gatilho e volta a false.
create or replace trigger empresa_usuarios_cargo_papel
  before insert or update of cargo_id, role, empresa_id, atende_clientes on public.empresa_usuarios
  for each row execute function public.empresa_usuarios_cargo_papel();

-- zapintel_conversa_calc: igual à de produção (20261110000200 + work_mem de 20261123000800), trocando só a linha
-- do CTE US: `eu.role <> 'owner'` → `eu.atende_clientes`.
CREATE OR REPLACE FUNCTION public.zapintel_conversa_calc(p_emp bigint, p_lojas bigint[], p_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '16MB'
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
    where l.empresa_id = v_emp and l.ativo and not exists (select 1 from funis fi where fi.id = l.funil_id and fi.interno)
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
    where eu.empresa_id = v_emp and eu.ativo and eu.atende_clientes
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
    select distinct z.lead_id from zapintel_venda_lead z join public.vendas_vendas v on v.id = z.venda_id
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
