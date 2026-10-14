-- Os leads cuja ficha de IA ficou para trás — e os que nunca tiveram uma.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- ══ POR QUE EXISTE ═════════════════════════════════════════════════════════
--
-- Pedido do Lucas em 14/10/2026: *"se nao toda vez que abrir o zapintel a ia
-- vai analisar tudo consumindo token sem precisar. Ai se sofreu alteracao
-- coloca um aviso, nova analise disponivel"*.
--
-- A IA só é chamada quando alguém aperta o botão. Para o botão aparecer no
-- lugar certo, alguém precisa saber QUAIS conversas andaram depois da ficha —
-- e isso é pergunta de banco, não de IA: três números por lead, comparados com
-- os três que foram guardados junto da ficha.
--
-- ══ OS TRÊS NÚMEROS SÃO OS MESMOS DE `marcaDaConversa` ═════════════════════
--
-- `lib/zapintel/perfil.ts` guarda, junto de cada ficha:
--
--   marca ........ instante da última mensagem, em ms, CORTADO NO MINUTO
--                  (a conversa é montada com hora HH:MM — `montar.ts`)
--   mensagens .... quantas mensagens a conversa tinha
--   transcritos .. quantas tinham transcrição de áudio
--
-- Se a conta daqui divergir da de lá por um minuto que seja, todo lead vira
-- "nova análise disponível" e o aviso deixa de significar alguma coisa.
-- Conferido em 14/10/2026: das 1.817 fichas, 1.770 batem nos três números e
-- as 47 restantes têm mensagem nova de verdade.
--
-- ══ QUEM ENTRA COMO "SEM ANÁLISE" ═══════════════════════════════════════════
--
-- O mesmo critério da fila de `scripts/perfil-manual.mts --falta`: pelo menos
-- duas mensagens e pelo menos uma do CLIENTE. Lead que só recebeu disparo da
-- loja não tem o que analisar.
create or replace function public.zapintel_analises_pendentes(p_empresa bigint, p_versao text)
returns table (
  lead_id            bigint,
  nome               text,
  filial             text,
  tem_ficha          boolean,
  gerado_em          timestamptz,
  mensagens_na_ficha integer,
  mensagens_agora    integer,
  ultima             timestamptz,
  loja_deve          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with agora as (
    select m.lead_id,
           count(*)::int as n,
           (count(*) filter (where nullif(trim(m.transcricao), '') is not null))::int as tr,
           (floor(extract(epoch from max(m.created_at)) / 60) * 60000)::bigint as marca,
           max(m.created_at) as ultima,
           bool_or(m.direcao = 'recebida') as cliente_falou
    from public.lead_mensagens m
    where m.empresa_id = p_empresa
    group by m.lead_id
  ),
  ultima_dir as (
    select distinct on (m.lead_id) m.lead_id, m.direcao
    from public.lead_mensagens m
    where m.empresa_id = p_empresa
    order by m.lead_id, m.created_at desc, m.id desc
  )
  -- A filial pelo nome que a equipe usa: a cidade. "JM Store Importados" e
  -- "JM Store Importados · Jaguariúna" repetem a loja e escondem o que difere.
  select l.id, l.nome,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome),
         p.lead_id is not null,
         p.gerado_em,
         p.mensagens,
         a.n,
         a.ultima,
         u.direcao = 'recebida'
  from public.leads l
  join agora a on a.lead_id = l.id
  left join ultima_dir u on u.lead_id = l.id
  left join public.filiais f on f.id = l.filial_id
  left join public.zapintel_lead_perfil p on p.lead_id = l.id and p.empresa_id = p_empresa
  where l.empresa_id = p_empresa
    and l.ativo
    and (
      (p.lead_id is null and a.n >= 2 and a.cliente_falou)
      or (p.lead_id is not null and (
            p.versao is distinct from p_versao
         or p.marca is distinct from a.marca
         or p.mensagens is distinct from a.n
         or p.transcritos is distinct from a.tr))
    )
$$;

-- Chamada só pelo service role, de dentro da rota, que tira a empresa da
-- sessão. `security definer` sem esta revogação seria um furo: qualquer sessão
-- autenticada listaria os leads de qualquer empresa.
revoke all on function public.zapintel_analises_pendentes(bigint, text) from public, anon, authenticated;

comment on function public.zapintel_analises_pendentes(bigint, text) is
  'Leads ativos com ficha de IA desatualizada (marca/mensagens/transcritos/versao diferentes da conversa atual) ou sem ficha (>=2 mensagens, cliente falou). Base do aviso "nova analise disponivel" do ZapIntel.';
