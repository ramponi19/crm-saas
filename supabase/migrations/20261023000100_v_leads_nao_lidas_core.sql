-- NÃO LIDAS POR LEAD LIDAS DO CORE (22/10/2026; aplicar com o ok do Lucas — exceção aprovada na viagem).
--
-- A tela de Leads lê `v_leads_nao_lidas` a cada abertura. A view antiga juntava as views de
-- compatibilidade `lead_mensagens` e `leads`, e as duas calculam o negócio principal de cada
-- contato e loja LINHA A LINHA. Com isso o planejador estimava 1 linha onde há 11 mil e cruzava
-- 1.732 negócios × 11.027 mensagens (19 milhões de pares): 2,05 s e ~1,2 GB de blocos lidos por
-- abertura na cópia — o pico de 72% de IOwait de 21/10 19:16 foram três aberturas seguidas.
--
-- Mesma regra, lida do core: o principal de cada contato e loja (o negócio ativo mais novo, a
-- ordem das views — como zapintel_principal), calculado UMA vez em conjunto (DISTINCT ON) e casado
-- com as mensagens por igualdade (coalesce na loja permite hash join). "Lead ativo" da view antiga
-- = principal ativo: contato sem negócio ativo tem principal inativo e fica de fora, como antes.
--
-- Na cópia (dono da JM): 2.055 ms → 76 ms, 159 mil → 30 mil blocos; resultado idêntico (916 leads,
-- 0 diferenças nos dois sentidos). security_invoker: a RLS de negocios/mensagens (loja do vendedor)
-- continua valendo, como valia pelas views. Mesmas colunas, mesmos tipos: os grants ficam.

create or replace view public.v_leads_nao_lidas with (security_invoker = true) as
with principal as (
  select distinct on (n.contato_id, coalesce(n.filial_id, -1))
         n.id, n.contato_id, n.filial_id,
         coalesce(((n.dados -> '_lead') ->> 'ativo')::boolean, true) as ativo
  from public.negocios n
  order by n.contato_id, coalesce(n.filial_id, -1),
           coalesce(((n.dados -> '_lead') ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc
)
select m.empresa_id, p.id as lead_id, count(*)::integer as nao_lidas
from public.mensagens m
join principal p on p.contato_id = m.contato_id and coalesce(p.filial_id, -1) = coalesce(m.filial_id, -1)
where m.lida = false and m.direcao = 'recebida' and p.ativo
group by m.empresa_id, p.id;
