-- Por lead: quando o cliente falou por último, quando a loja falou por último
-- e quantas mensagens a conversa tem. Base do "quem está esperando a loja" do
-- assistente do CRM.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- ══ POR QUE NÃO `leads.ultima_recebida_at` ═════════════════════════════════
--
-- As colunas do lead são mantidas pelo webhook e erram quando o histórico é
-- sincronizado depois. Medido em 14/10/2026: em 59 de 1.902 leads, "a última
-- fala é do cliente" dava resposta diferente olhando a coluna e olhando as
-- mensagens. A pergunta mais comum ao assistente vai ser justamente "quem
-- está esperando resposta" — ela precisa vir da conversa.
--
-- ══ QUEM PODE VER ══════════════════════════════════════════════════════════
--
-- Executável só pelo service role. A rota cruza o resultado com os leads que
-- o USUÁRIO enxerga (consulta com a sessão dele, sob a RLS de filial), então
-- esta função nunca decide sozinha o que alguém vê.
create or replace function public.assistente_status_conversas(p_empresa bigint)
returns table (
  lead_id          bigint,
  ultima_recebida  timestamptz,
  ultima_enviada   timestamptz,
  mensagens        integer
)
language sql
stable
security definer
set search_path = public
as $$
  select m.lead_id,
         max(m.created_at) filter (where m.direcao = 'recebida'),
         max(m.created_at) filter (where m.direcao = 'enviada'),
         count(*)::int
  from public.lead_mensagens m
  where m.empresa_id = p_empresa
  group by m.lead_id
$$;

revoke all on function public.assistente_status_conversas(bigint) from public, anon, authenticated;

comment on function public.assistente_status_conversas(bigint) is
  'Por lead: ultima fala do cliente, ultima fala da loja e total de mensagens, lidos de lead_mensagens. Base do assistente do CRM; a rota filtra pelos leads visiveis ao usuario.';
