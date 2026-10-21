-- ⚠ SUPERADA EM 21/10/2026 — NÃO REAPLICAR ESTE ARQUIVO.
-- A versão em vigor está em supabase/migrations/20261022001000_zapintel_le_o_core.sql (lê negocios e
-- mensagens direto; este arquivo lê as views leads/lead_mensagens, que custavam até 200 s por chamada
-- depois do corte). O texto abaixo fica como histórico das regras e das decisões.
--
-- Os leads que TÊM conversa, com a janela de cada uma — e com o telefone que o
-- CLIENTE disse dentro dela.
--
-- Aplicada no banco em 10/10/2026; o telefone do texto entrou em 11/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- ══ POR QUE EM SQL, E NÃO NO SERVIDOR DE APLICAÇÃO ═════════════════════════
--
-- A ponte precisa de quatro coisas por lead: quando a conversa começou, quando
-- terminou, quantas mensagens tem e um telefone. Trazer as 55 mil mensagens
-- para calcular isso seria 8,93 MB de egress por execução — contra 5 GB/mês no
-- plano free. O Postgres faz pelo índice, sem mover linha nenhuma.
--
-- ══ POR QUE O `join` (e não `left join`) NÃO É DETALHE ═════════════════════
--
-- Exigir que exista mensagem é o que dissolve a ambiguidade dos telefones
-- repetidos. Em 18/09/2026 nasceram 154 leads duplicados, todos sem nenhuma
-- mensagem; sem este filtro cada um viraria um candidato falso, e 9 vendas
-- casariam com 2 ou 3 conversas em vez de uma.
--
-- ══ O TELEFONE DITO NA CONVERSA, E AS TRÊS ARMADILHAS ══════════════════════
--
-- Lead de Instagram não tem telefone (3 em 384): o `origem_id` dele é o id do
-- perfil. Como a ponte casa por telefone, 19% da base entrava no denominador
-- de toda taxa e NUNCA podia entrar no numerador — "Instagram converte 0%" não
-- era medição, era impossibilidade de medir.
--
-- Muita gente manda o próprio número na conversa. Medido em 11/10/2026: 70 dos
-- 390 leads de Instagram têm algo parecido com telefone na fala DELES. As três
-- armadilhas, todas encontradas olhando o resultado:
--
--   1. CHAVE PIX E CPF. `47970940390` aparecia em 29 leads diferentes. CPF tem
--      11 dígitos igual a celular, e o 3º dígito calhava de ser 9. Nenhum
--      cliente manda o mesmo número em 29 conversas — número repetido em mais
--      de 2 leads é da LOJA ou é chave de pagamento.
--   2. O NÚMERO DA LOJA. Do lado `enviada`, `01998424440` aparecia 8 vezes: é
--      o telefone que a loja manda para quem pergunta de VAGA de emprego. Por
--      isso só a fala do CLIENTE (`direcao = 'recebida'`) entra.
--   3. FORMATO. DDD plausível (11–99) e o 9 inicial de celular derrubam preço,
--      data, IMEI e número de pedido.
--
-- Depois dos três filtros sobram 47 leads com telefone utilizável: 16 que são a
-- MESMA PESSOA de um lead de WhatsApp, e 2 que casam com cliente que comprou.
create or replace function public.zapintel_leads_com_conversa(p_empresa bigint)
returns table (
  id                bigint,
  telefone          text,
  origem_id         text,
  primeira          timestamptz,
  ultima            timestamptz,
  mensagens         bigint,
  telefone_no_texto text
)
language sql
stable
security definer
set search_path = public
as $$
  with achado as (
    select l.id, regexp_replace(t[1], '\D', '', 'g') as fone
    from public.leads l
    join public.lead_mensagens m
      on m.lead_id = l.id and m.direcao = 'recebida'   -- só a fala do CLIENTE
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
  from public.leads l
  join public.lead_mensagens m on m.lead_id = l.id
  left join escolhido e on e.id = l.id
  where l.empresa_id = p_empresa
  group by l.id, l.telefone, l.origem_id
$$;

-- Chamada só pelo service role, de dentro da rota, que já filtra por empresa.
-- `security definer` sem esta revogação seria um furo: qualquer sessão
-- autenticada leria a janela de conversa de qualquer empresa.
revoke all on function public.zapintel_leads_com_conversa(bigint) from public, anon, authenticated;

comment on function public.zapintel_leads_com_conversa(bigint) is
  'Leads com pelo menos uma mensagem, com janela, contagem e o telefone dito na conversa pelo CLIENTE (filtrado contra chave Pix, CPF e numero da loja). Base da ponte venda->conversa do ZapIntel.';
