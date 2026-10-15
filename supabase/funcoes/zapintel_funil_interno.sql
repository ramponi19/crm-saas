-- FUNIL INTERNO: AS CONVERSAS DA EQUIPE FICAM FORA DO ZAPINTEL.
--
-- Aplicada no banco em 15/10/2026. O sistema não tinha como saber que uma
-- conversa é interna — vendedor falando com a loja, as contas da própria JM —
-- e elas entravam nas contas: a do Matheus Rosa sozinha tem 1.727 mensagens
-- no tempo de resposta, e o robô de análises chamava TODA conversa sem análise
-- de "interna", escondendo os leads novos de verdade.
--
-- Ideia do Lucas: *"se eu criar um funil por exemplo equipe e colocar as
-- conversas lá resolveria esse problema?"*. Resolve, com uma marca no próprio
-- funil (não pelo nome: renomear "Equipe" quebraria em silêncio). Toda função
-- do ZapIntel que escolhe leads passa por `zapintel_funil_interno`.

alter table public.funis add column if not exists interno boolean not null default false;
comment on column public.funis.interno is
  'Funil da equipe (conversas internas: vendedores, contas da própria loja). Leads nele ficam fora das métricas e análises do ZapIntel. 15/10/2026.';

create or replace function public.zapintel_funil_interno(p_funil bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select interno from funis where id = p_funil), false)
$$;
revoke all on function public.zapintel_funil_interno(bigint) from public, anon, authenticated;
