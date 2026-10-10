-- Os leads que TÊM conversa, com a janela de cada uma.
--
-- Aplicada no banco em 10/10/2026. Mora aqui porque função que só existe no
-- Supabase é código sem histórico: ninguém vê quando mudou nem por quê.
--
-- POR QUE EM SQL, E NÃO NO SERVIDOR DE APLICAÇÃO
--
-- A ponte precisa de três coisas por lead: quando a conversa começou, quando
-- terminou e quantas mensagens tem. Trazer as 55.291 mensagens para calcular
-- min/max/count seria 8,93 MB de egress por execução — contra 5 GB/mês no
-- plano free. O Postgres faz isso pelo índice sem mover linha nenhuma.
--
-- POR QUE O `join` (e não `left join`) NÃO É DETALHE
--
-- Exigir que exista mensagem é o que dissolve a ambiguidade dos telefones
-- repetidos. Em 18/09/2026 nasceram 154 leads duplicados, todos sem nenhuma
-- mensagem; sem este filtro cada um viraria um candidato falso na ponte, e
-- 9 vendas casariam com 2 ou 3 conversas em vez de uma.
create or replace function public.zapintel_leads_com_conversa(p_empresa bigint)
returns table (
  id         bigint,
  telefone   text,
  origem_id  text,
  primeira   timestamptz,
  ultima     timestamptz,
  mensagens  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.telefone, l.origem_id,
         min(m.created_at) as primeira,
         max(m.created_at) as ultima,
         count(*)          as mensagens
  from public.leads l
  join public.lead_mensagens m on m.lead_id = l.id
  where l.empresa_id = p_empresa
  group by l.id, l.telefone, l.origem_id
$$;

-- Chamada só pelo service role, de dentro da rota, que já filtra por empresa.
-- `security definer` sem esta revogação seria um furo: qualquer sessão
-- autenticada leria a janela de conversa de qualquer empresa.
revoke all on function public.zapintel_leads_com_conversa(bigint) from public, anon, authenticated;

comment on function public.zapintel_leads_com_conversa(bigint) is
  'Leads com pelo menos uma mensagem, com janela e contagem. Base da ponte venda->conversa do ZapIntel.';
