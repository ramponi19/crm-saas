-- AUDITORIA DO ZAPINTEL — 15/10/2026. Aplicado no banco nesta data.
--
-- 1. CRÍTICO: duas cópias de segurança de 10/10 estavam no schema `public`,
--    sem RLS e com SELECT para `anon` — a chave pública do navegador lia 154
--    leads com telefone. Foram para o schema `backup` (não exposto na API).
--    Nada apagado.
alter table public._backup_leads_dup_20261010 set schema backup;
alter table public._backup_tarefas_dup_20261010 set schema backup;
revoke all on backup._backup_leads_dup_20261010, backup._backup_tarefas_dup_20261010 from anon, authenticated;

-- 2. Funções puras sem search_path fixo (aviso function_search_path_mutable).
alter function public.zapintel_familia_sinal(text) set search_path = public;
alter function public.zapintel_conversa_chave(int, bigint[]) set search_path = public;

-- 3. Chave estrangeira sem índice (aviso unindexed_foreign_keys): a ponte
--    venda↔conversa é lida por lead em todas as telas.
create index if not exists zapintel_venda_lead_lead_id_idx on public.zapintel_venda_lead (lead_id);

-- A política do canal ao vivo (auth_rls_initplan) foi corrigida em
-- zapintel_ao_vivo.sql.

-- 4. Integridade: a ficha de IA não tinha chave estrangeira para o lead — lead
--    apagado ou mesclado deixava a ficha órfã (0 órfãs em 15/10, conferido antes).
alter table public.zapintel_lead_perfil
  add constraint zapintel_lead_perfil_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete cascade;

-- 5. Desempenho: zapintel_turnos chamava zapintel_horario() uma vez por turno
--    (1,3 s → 0,27 s com `materialized`). Ver zapintel_turnos.sql.

-- ══ FASE 2 (15/10/2026, fechamento técnico) ════════════════════════════════

-- 6. `v_orfaos_chat_midia` (view SECURITY DEFINER, sem uso no código — a
--    retenção lê `storage_orfaos`) era legível pela chave anônima: 8 nomes de
--    arquivo de mídia de conversa. Só a chave de serviço lê agora.
revoke all on public.v_orfaos_chat_midia from anon, authenticated;
alter view public.v_orfaos_chat_midia set (security_invoker = true);

-- 7. RLS de leads e lead_mensagens: a mesma regra, com get_empresa_id() avaliado
--    UMA vez por consulta em vez de uma por linha. A contagem de não lidas do
--    sino (86.856 chamadas desde junho, média 482 ms — o maior gasto de CPU do
--    banco feito pelo app) caiu para ~30 ms; resultado idêntico para dono,
--    admin, vendedor, outra empresa e empresa de prévia (conferido por hash).
alter policy tenant_isolamento on public.lead_mensagens
  using ((empresa_id = (select get_empresa_id())) and ((select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]))
  with check (empresa_id = (select get_empresa_id()));
alter policy tenant_isolamento on public.leads
  using ((empresa_id = (select get_empresa_id())) and ((select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]))
  with check ((empresa_id = (select get_empresa_id())) and ((select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]));
