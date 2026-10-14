-- O AVISO "CHEGOU MENSAGEM" DO DASHBOARD DO ZAPINTEL — SEM PULSO, SEM VERCEL.
--
-- Aplicada no banco em 14/10/2026.
-- Mora aqui porque função que só existe no Supabase é código sem histórico.
--
-- ══ POR QUE BROADCAST, E NÃO "ESCUTAR A TABELA" ════════════════════════════
--
-- `lead_mensagens` já está na publicação do Realtime, mas a escuta de tabela
-- passa pela RLS de quem escuta — e para dono e admin a RLS de loja segue a
-- loja SELECIONADA no CRM (`filial_atual()`). Em 14/10/2026 a conta do dono da
-- JM estava com Mogi Guaçu selecionado: um dashboard de "Toda a rede" ouviria
-- só Mogi e ficaria cego para Jaguariúna. Foi exatamente o que aconteceu em
-- 09/10 com o primeiro "tempo real" do ZapIntel (ver useLeads.tsx).
--
-- Então o próprio banco avisa, num canal por empresa: `zapintel:<empresa>`.
-- O aviso NÃO carrega conteúdo — só "chegaram N mensagens, nestas lojas". Quem
-- recebe pede o dashboard de novo (`zapintel_dashboard`), e é ali, com a sessão
-- e o escopo de quem pede, que se decide o que cada pessoa vê.
--
-- ══ POR STATEMENT, NÃO POR LINHA ═══════════════════════════════════════════
--
-- A sincronização de histórico grava centenas de mensagens num INSERT só. Um
-- aviso por linha seriam centenas de recálculos em cada tela aberta. Por
-- statement é um aviso por lote.
--
-- ══ NUNCA PODE DERRUBAR A GRAVAÇÃO ═════════════════════════════════════════
--
-- Este gatilho fica no caminho do webhook do WhatsApp. Se o Realtime falhar, a
-- mensagem do cliente TEM de ser gravada mesmo assim — perde-se o aviso, não a
-- conversa. Daí o `exception when others`.

create or replace function public.zapintel_avisar(p_empresa bigint, p_evento text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(p_dados, p_evento, 'zapintel:' || p_empresa, true);
exception when others then
  raise warning '[zapintel_avisar] aviso ao vivo falhou: %', sqlerrm;
end $$;

revoke all on function public.zapintel_avisar(bigint, text, jsonb) from public, anon, authenticated;

create or replace function public.tg_zapintel_mensagens_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select empresa_id, count(*) n,
           count(*) filter (where direcao = 'recebida') recebidas,
           array_agg(distinct coalesce(filial_id, 0)) lojas
    from novas group by empresa_id
  loop
    perform zapintel_avisar(r.empresa_id, 'mensagens',
      jsonb_build_object('n', r.n, 'recebidas', r.recebidas, 'lojas', to_jsonb(r.lojas)));
  end loop;
  return null;
exception when others then
  raise warning '[zapintel_ao_vivo] %', sqlerrm;
  return null;
end $$;

drop trigger if exists zapintel_ao_vivo on public.lead_mensagens;
create trigger zapintel_ao_vivo
  after insert on public.lead_mensagens
  referencing new table as novas
  for each statement execute function public.tg_zapintel_mensagens_ao_vivo();

-- Ficha nova ou refeita: o dashboard muda (classificação, fila, pendências).
create or replace function public.tg_zapintel_ficha_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform zapintel_avisar(new.empresa_id, 'analises', jsonb_build_object('lead', new.lead_id));
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists zapintel_ficha_ao_vivo on public.zapintel_lead_perfil;
create trigger zapintel_ficha_ao_vivo
  after insert or update on public.zapintel_lead_perfil
  for each row execute function public.tg_zapintel_ficha_ao_vivo();

-- Venda registrada: muda dinheiro e "compraram sem registro".
create or replace function public.tg_zapintel_vendas_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select empresa_id, count(*) n from novas group by empresa_id loop
    perform zapintel_avisar(r.empresa_id, 'vendas', jsonb_build_object('n', r.n));
  end loop;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists zapintel_vendas_ao_vivo on public.vendas;
create trigger zapintel_vendas_ao_vivo
  after insert on public.vendas
  referencing new table as novas
  for each statement execute function public.tg_zapintel_vendas_ao_vivo();

-- Quem pode OUVIR o canal: gente da própria empresa (ou o suporte). O aviso
-- não tem conteúdo, mas mesmo assim cada empresa só ouve o seu.
drop policy if exists "zapintel ao vivo: ouvir a propria empresa" on realtime.messages;
create policy "zapintel ao vivo: ouvir a propria empresa"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      realtime.topic() = 'zapintel:' || public.get_empresa_id()::text
      or (realtime.topic() like 'zapintel:%'
          and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.is_super_admin))
    )
  );
