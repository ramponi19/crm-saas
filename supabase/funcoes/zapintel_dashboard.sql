-- O DASHBOARD DO ZAPINTEL, CALCULADO NO BANCO E LIDO PELO NAVEGADOR.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- ══ POR QUE NO BANCO ═══════════════════════════════════════════════════════
--
-- Pedido do Lucas em 14/10/2026: *"um dashboard completamente integrado e
-- como falamos sem precisar ficando clicando para atualizar"*. Ao vivo de
-- verdade quer dizer recalcular a cada mensagem que chega — e recalcular na
-- Vercel custa Active CPU (o painel antigo: 2,76 s por cálculo, contra um teto
-- de 4 h/mês para a conta inteira). Aqui o navegador chama esta função direto
-- no Supabase, com a sessão do usuário, e a Vercel não participa. O aviso de
-- "chegou mensagem" também vem do banco (`zapintel_ao_vivo`, abaixo).
--
-- ══ DE ONDE VEM CADA NÚMERO ════════════════════════════════════════════════
--
-- Classificação, urgência, perfil, objeções, sinais e pendências vêm das
-- FICHAS (`zapintel_lead_perfil`) — a leitura da conversa inteira, não o motor
-- de palavra-chave. Medido em 14/10/2026 o motor dizia 421 quentes; as fichas,
-- 40. E o "fechar agora" do motor listava 4 clientes que já tinham comprado.
-- Tempo de resposta, espera, inatividade e horário vêm das MENSAGENS. Dinheiro
-- vem das VENDAS registradas e da ponte venda↔conversa.
--
-- ══ QUEM VÊ O QUÊ ══════════════════════════════════════════════════════════
--
-- `zapintel_escopo` decide empresa e lojas: dono, admin e suporte escolhem
-- entre a rede e uma loja (o seletor "Vendo" do ZapIntel); os demais veem só a
-- própria loja, pela mesma `filiais_visiveis()` da RLS. Sem o complemento
-- ZapIntel ativo, nada sai.

create or replace function public.zapintel_escopo(p_filial bigint default null, p_empresa bigint default null)
returns table (empresa bigint, filiais bigint[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_super boolean;
  v_emp   bigint;
  v_papel text;
  v_lojas bigint[];
begin
  select coalesce(is_super_admin, false) into v_super from usuarios where id = auth.uid();
  -- O preview do superadmin escolhe a empresa por cookie, que o banco não vê:
  -- a tela manda o id, e só o superadmin pode usar esse atalho.
  v_emp := case when coalesce(v_super, false) and p_empresa is not null then p_empresa else get_empresa_id() end;
  if v_emp is null then raise exception 'sem empresa' using errcode = '42501'; end if;

  if not coalesce(v_super, false) and not exists (
    select 1 from complementos_empresa where empresa_id = v_emp and zapintel_ativo
  ) then
    raise exception 'ZapIntel não está ativo para esta empresa' using errcode = '42501';
  end if;

  select role into v_papel from empresa_usuarios
   where usuario_id = auth.uid() and empresa_id = v_emp and ativo limit 1;

  if coalesce(v_super, false) or v_papel in ('owner', 'admin') then
    select coalesce(array_agg(id), array[]::bigint[]) || 0::bigint into v_lojas
      from filiais where empresa_id = v_emp;
  else
    v_lojas := filiais_visiveis();
  end if;

  if p_filial is not null then
    if not (p_filial = any (v_lojas)) then
      raise exception 'loja fora do seu alcance' using errcode = '42501';
    end if;
    v_lojas := array[p_filial];
  end if;

  return query select v_emp, v_lojas;
end $$;

revoke all on function public.zapintel_escopo(bigint, bigint) from public, anon;
grant execute on function public.zapintel_escopo(bigint, bigint) to authenticated;

-- Família da objeção. As fichas escrevem o rótulo livre ("Juros do
-- parcelamento", "Boleto negado", "Comprou fora"); o dashboard agrupa. A ORDEM
-- importa: "Valor do aparelho" é troca, não preço.
create or replace function public.zapintel_familia_objecao(r text)
returns text
language sql
immutable
as $$
  select case
    -- O que a PRÓPRIA LOJA causou. É a família que mais vale olhar: não depende
    -- do cliente para resolver.
    when r ~* '(resposta lenta|demora|prometid|não veio|nao veio|não entregue|nao entregue|faltar|defeito|contrato|mudou na hora|atraso|esquec|errad|em falta)' then 'Falha da loja'
    when r ~* '(aparelho|troca|usado|seminovo|vender|só venda|so venda|avalia|motorola|samsung)' then 'Troca e usado'
    when r ~* '(antecip|pago antes|paga antes|pagar antes|confian|desconfian|sem ver|sem conhecer|golpe|mandar dados)' then 'Confiança para pagar antes'
    when r ~* '(crédito|credito|boleto|limite|cartão|cartao|score|nome sujo|negad|aprova|financ|pagamento|entrada|parcel)' then 'Crédito e pagamento'
    when r ~* '(concorr|comprou|outra loja|outro lugar|comparand|compara|pesquisand|cotand|cotação|cotacao|proposta melhor|achou outro|fornecedor|internet|paraguai|eua|estados unidos|traz d|já trocou|ganhou|fora)' then 'Concorrência'
    when r ~* '(preço|preco|valor|caro|juros|orçamento|orcamento|dinheiro|diferença|diferenca|contas|desconto|finan|gasto|caixa|recebimento|comércio|comercio|baixar|dólar|dolar|promoç|promoc)' then 'Preço e dinheiro'
    when r ~* '(marido|esposa|mãe|mae|pai|família|familia|filh|decis|namorad|sócio|socio|indecis)' then 'Decide com outra pessoa'
    when r ~* '(cor|memória|memoria|armazenamento|gb|modelo|lacrado|bateria|tamanho|estoque|disponív|disponiv|peça|peca|garantia|chip|esim|câmera|camera|dúvida|duvida|16e|acessório|acessorio)' then 'Produto e estoque'
    when r ~* '(momento|esperar|esperando|aguard|adiad|adiou|depois|pressa|urgência|urgencia|interesse|necessidade|viagem|agenda|horário|horario|prioridade|tempo|pensar|analis|só em|desist|ainda não|ainda nao)' then 'Momento e indecisão'
    when r ~* '(entrega|prazo|frete|retirada|distância|distancia|longe)' then 'Entrega e prazo'
    else 'Outros'
  end
$$;

create or replace function public.zapintel_dashboard(p_filial bigint default null, p_empresa bigint default null, p_versao text default 'p2')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
  -- `materialized` e as colunas extraídas da ficha NÃO são enfeite: medido em
  -- 14/10/2026, a versão que carregava a ficha inteira (jsonb de ~4 KB) por
  -- lead e deixava o planejador estimar 30 leads (são 1.920) levava 3 s. Assim,
  -- 45 ms no núcleo. A ficha inteira só é aberta para os 14 da fila.
  L as materialized (
    select l.id, l.nome, l.filial_id, l.created_at, l.kanban_status, l.convertido_em
    from leads l
    where l.empresa_id = v_emp and l.ativo and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*)::int n,
           max(m.created_at) filter (where m.direcao = 'recebida') ur,
           max(m.created_at) filter (where m.direcao = 'enviada')  ue,
           max(m.created_at) um
    from lead_mensagens m
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
           coalesce(F.cls0, 'sem_analise') cls,
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
    from lead_mensagens m
    where m.empresa_id = v_emp and m.created_at >= v_hoje and coalesce(m.filial_id, 0) = any (v_lojas)
  ),
  -- Tempo de resposta: cada vez que o cliente RETOMA a palavra (a mensagem
  -- anterior foi da loja, ou é a primeira), quanto a loja levou para falar de
  -- novo. Só o que começou em horário comercial (8h-20h, seg-sáb): madrugada
  -- esperando a loja abrir não é atendimento lento.
  R as (
    select m.lead_id, m.filial_id, m.direcao, m.created_at,
           lag(m.direcao) over (partition by m.lead_id order by m.created_at, m.id) anterior
    from lead_mensagens m
    where m.empresa_id = v_emp and m.created_at >= v_agora - interval '7 days'
      and coalesce(m.filial_id, 0) = any (v_lojas)
  ),
  RS as materialized (
    select r.lead_id, r.filial_id, r.created_at t0,
           (select min(e.created_at) from lead_mensagens e
             where e.lead_id = r.lead_id and e.direcao = 'enviada' and e.created_at > r.created_at) t1
    from R r
    where r.direcao = 'recebida' and (r.anterior is null or r.anterior = 'enviada')
      and extract(hour from r.created_at at time zone 'America/Sao_Paulo') between 8 and 19
      and extract(isodow from r.created_at at time zone 'America/Sao_Paulo') <= 6
  ),
  RESP as (
    select percentile_cont(0.5) within group (order by extract(epoch from t1 - t0) / 60) filter (where t1 is not null) mediana,
           count(*) filter (where t1 is not null and t1 - t0 <= interval '15 minutes') rapidas,
           count(*) filter (where t1 is not null) respondidas,
           count(*) filter (where t1 is null) sem_resposta,
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
  -- O QUE A LOJA DISSE ANTES DE O CLIENTE SUMIR (pedido do Lucas, 10/10/2026).
  -- Conversa que estava viva (4+ mensagens) e morreu com a loja falando por
  -- último, há 3 a 60 dias. Se a última fala da loja veio mais de 20 h depois
  -- de outra fala da loja, ela é TENTATIVA DE RETOMADA — mandada porque a
  -- conversa já tinha acabado — e o lead não entra. Vaga de emprego, endereço
  -- e anexo também não: não explicam venda perdida.
  SIL as (
    select X.id, X.comprou, ult.texto
    from X
    cross join lateral (
      select coalesce(nullif(trim(u.transcricao), ''), u.conteudo) texto, u.direcao, u.created_at,
             lead(u.direcao) over (order by u.created_at desc, u.id desc) dir_antes,
             lead(u.created_at) over (order by u.created_at desc, u.id desc) quando_antes
      from (select * from lead_mensagens u0 where u0.lead_id = X.id order by u0.created_at desc, u0.id desc limit 2) u
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
    from lead_mensagens m
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
        'medianaMin', round(mediana::numeric, 1),
        'ate15minPct', case when respondidas > 0 then round(100.0 * rapidas / respondidas) else null end,
        'semResposta', sem_resposta,
        'retomadas', total
      ) from RESP),

    'fila', (select coalesce(jsonb_agg(f order by f.ordem, f.desde), '[]') from (
        select X.id "leadId", X.nome, (select rotulo from NOMES where NOMES.id = X.filial_id) loja,
               X.ur desde, X.cls classificacao, X.urg urgencia,
               X.score::int score, X.rotulo,
               fp.perfil->>'proximaAcao' "proximaAcao", fp.perfil->>'mensagemSugerida' "mensagemSugerida",
               (X.tem_ficha and X.fm <> X.n) desatualizada,
               (select left(coalesce(nullif(trim(u.transcricao), ''), u.conteudo, '[' || coalesce(u.tipo, 'anexo') || ']'), 160)
                  from lead_mensagens u where u.lead_id = X.id and u.direcao = 'recebida'
                  order by u.created_at desc, u.id desc limit 1) "ultimaFala",
               (select count(*) from lead_mensagens u where u.lead_id = X.id and u.direcao = 'recebida' and u.created_at > coalesce(X.ue, '-infinity')) "naoRespondidas",
               -- Lead novo, ainda sem análise, entra como urgência alta: quem acabou
               -- de perguntar preço é exatamente quem não pode esperar a fila.
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
        from lead_mensagens m
        where m.empresa_id = v_emp and m.direcao = 'recebida' and m.created_at >= v_agora - interval '28 days'
          and coalesce(m.filial_id, 0) = any (v_lojas)
        group by 1, 2) h),

    'modelos', (select coalesce(jsonb_agg(md order by md.leads desc), '[]') from (
        select replace(replace(modelo, 'Iphone', 'iPhone'), 'Se', 'SE') modelo, count(distinct lead_id) leads
        from MODELOS group by 1 order by 2 desc limit 8) md),

    'analises', jsonb_build_object(
        'comAnalise', (select count(*) from X where tem_ficha),
        'desatualizadas', (select count(*) from X where tem_ficha and (fm <> n or versao is distinct from p_versao)),
        'semAnalise', (select count(*) from X where not tem_ficha and n >= 2)
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
               (select round((percentile_cont(0.5) within group (order by extract(epoch from t1 - t0) / 60))::numeric, 1)
                  from RS where RS.filial_id = NOMES.id and t1 is not null) "respostaMin"
        from NOMES where NOMES.id = any (v_lojas)) pl)
  ) into v_out;

  return v_out;
end $$;

revoke all on function public.zapintel_dashboard(bigint, bigint, text) from public, anon;
grant execute on function public.zapintel_dashboard(bigint, bigint, text) to authenticated;

comment on function public.zapintel_dashboard(bigint, bigint, text) is
  'Dashboard do ZapIntel inteiro em um JSON, calculado das fichas de IA, mensagens e vendas, no escopo de empresa/loja de quem chama (zapintel_escopo). Chamado direto do navegador.';

-- ══ ÍNDICES (14/10/2026) ════════════════════════════════════════════════════
-- O dashboard agrega lead_mensagens várias vezes por consulta. Sem estes
-- índices cada agregação lia a tabela inteira (64 MB, quase tudo texto e
-- transcrição) — medido: a mesma leitura variou de 80 ms a 1,9 s conforme o
-- cache do banco. Com eles a conta sai do índice (index-only scan): 0,27 s a
-- rede inteira, 0,1 s uma loja.
create index if not exists lead_mensagens_dash_por_lead
  on public.lead_mensagens (empresa_id, lead_id) include (direcao, created_at);
create index if not exists lead_mensagens_dash_por_data
  on public.lead_mensagens (empresa_id, created_at) include (direcao, filial_id, lead_id);
