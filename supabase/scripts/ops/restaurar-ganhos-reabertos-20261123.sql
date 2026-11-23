-- RESTAURA AS VENDAS APAGADAS PELA REABERTURA POR MENSAGEM (23/11/2026, M1 / docs/design-pos-venda.md §0).
--
-- NÃO RODAR SEM O OK DO LUCAS. Roda DEPOIS da migração 20261123000200_ganho_protegido.sql.
--
-- Os 8 negócios da JM que a `core_negocio_do_canal` antiga reabriu estando GANHOS. O estado de antes
-- está em negocio_historico (acao = 'reaberto_por_mensagem', detalhe.status = 'ganho'); a etapa de
-- antes era 15 (Convertido) em todos.
--
-- Classes (decididas pelo Lucas a partir da tabela das mensagens):
--   (a) só pós-venda/dúvida      → volta a ser ganho, com o ganho_em original
--   (b) negociação nova de verdade → volta a ser ganho E nasce um negócio novo aberto, na etapa e
--                                    com o responsável que o card tem hoje (a conversa segue nele)
--   (c) 487 — já foi marcado ganho de novo em 19/11 (ganho_em = 19/11), mas a conversa depois disso
--       segue negociando. Só entra aqui com a decisão do Lucas (bloco comentado no fim).
--
-- Backup: tabela _backup_ganhos_reabertos_20261123 (as 8 linhas inteiras de negocios, como estão).
-- Volta: o bloco VOLTA no fim (comentado).

-- ─── 0. Conferência: o estado de hoje é o que a tabela mostrou ───────────────────────────────────
do $$
declare v int;
begin
  select count(*) into v from negocios n
   where n.empresa_id = 1 and n.id in (2644, 2415, 2657, 581, 647, 1007, 4388) and n.status = 'aberto';
  if v <> 7 then raise exception 'esperava 7 negócios abertos (a + b), achei %', v; end if;
end $$;

-- ─── 1. Backup ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public._backup_ganhos_reabertos_20261123 as
  select now() as backup_em, n.* from public.negocios n
   where n.id in (2644, 2415, 2657, 581, 647, 1007, 4388, 487);
alter table public._backup_ganhos_reabertos_20261123 enable row level security;  -- só service role lê

-- ─── 2. Restauração ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record; v_novo bigint; v_n int := 0;
  -- classe por negócio (ajustar aqui se o Lucas mudar alguma)
  v_classe constant jsonb := '{"2644":"a","2415":"a","2657":"a","581":"a","647":"b","1007":"b","4388":"b"}';
begin
  for c in
    select n.id, n.contato_id, n.filial_id, n.funil_id, n.etapa_id, n.responsavel_id, n.dados,
           h.id as hist_id, h.em as reaberto_em, h.de_etapa_id,
           (h.detalhe ->> 'ganho_em')::timestamptz as ganho_em_original,
           coalesce((h.detalhe ->> 'ativo')::boolean, true) as ativo_original,
           v_classe ->> n.id::text as classe
      from negocios n
      join lateral (select * from negocio_historico h
                     where h.negocio_id = n.id and h.acao = 'reaberto_por_mensagem' and h.detalhe ->> 'status' = 'ganho'
                     order by h.em desc limit 1) h on true
     where n.empresa_id = 1 and n.status = 'aberto' and v_classe ? n.id::text
  loop
    -- (b) primeiro o negócio novo, com o que o card tem hoje (etapa e responsável da negociação nova)
    v_novo := null;
    if c.classe = 'b' then
      insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
      values (1, c.filial_id, c.contato_id, c.funil_id, c.etapa_id, 'aberto', c.responsavel_id,
              jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true,
                'origem', c.dados -> '_lead' ->> 'origem', 'origem_id', c.dados -> '_lead' ->> 'origem_id'))))
      returning id into v_novo;
      insert into negocio_historico (empresa_id, negocio_id, para_etapa_id, acao, detalhe)
      values (1, v_novo, c.etapa_id, 'novo_apos_ganho',
              jsonb_build_object('ganho_anterior', c.id, 'ganho_em', c.ganho_em_original, 'origem', 'restauracao_m1_20261123'));
    end if;

    -- o ganho volta como era (etapa, data e arquivamento)
    update negocios
       set status = 'ganho', etapa_id = coalesce(c.de_etapa_id, 15), ganho_em = c.ganho_em_original,
           dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || jsonb_build_object('ativo', c.ativo_original))
     where id = c.id and status = 'aberto';

    insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, detalhe)
    values (1, c.id, c.etapa_id, coalesce(c.de_etapa_id, 15), 'ganho_restaurado',
            jsonb_strip_nulls(jsonb_build_object('motivo', 'M1: venda apagada pela reabertura por mensagem',
              'reaberto_em', c.reaberto_em, 'historico_reabertura', c.hist_id, 'classe', c.classe,
              'negocio_novo', v_novo, 'backup', '_backup_ganhos_reabertos_20261123')));
    v_n := v_n + 1;
  end loop;
  if v_n <> 7 then raise exception 'esperava restaurar 7, restaurei % — nada foi gravado', v_n; end if;
end $$;

-- ─── 3. (c) 487 — SÓ COM A DECISÃO DO LUCAS ──────────────────────────────────────────────────────
-- Opção recomendada se NÃO houve venda em 19/11: o negócio volta a ser a venda de 08/09 e a
-- negociação do 17 Pro Max segue num negócio novo, aberto em Negociando.
-- do $$
-- declare v_novo bigint; v_resp uuid;
-- begin
--   select responsavel_id into v_resp from negocios where id = 487;
--   insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
--   select 1, filial_id, contato_id, funil_id, 16, 'aberto', responsavel_id,
--          jsonb_build_object('_lead', jsonb_build_object('ativo', true)) from negocios where id = 487
--   returning id into v_novo;
--   perform set_config('nexus.reabrir_negocio', '487', true);   -- troca de ganho_em: só com a marca
--   update negocios set ganho_em = '2026-09-08T12:29:50.12+00:00' where id = 487 and status = 'ganho';
--   perform set_config('nexus.reabrir_negocio', '', true);
--   insert into negocio_historico (empresa_id, negocio_id, acao, detalhe) values
--     (1, 487, 'ganho_restaurado', jsonb_build_object('motivo', 'M1: ganho de 19/11 sem venda; volta a data da venda de 08/09',
--        'ganho_em_trocado', '2026-11-19T18:03:44.251+00:00', 'negocio_novo', v_novo, 'backup', '_backup_ganhos_reabertos_20261123')),
--     (1, v_novo, 'novo_apos_ganho', jsonb_build_object('ganho_anterior', 487, 'origem', 'restauracao_m1_20261123'));
-- end $$;

-- ─── VOLTA (comentada) ───────────────────────────────────────────────────────────────────────────
-- A volta usa a marca da RPC para passar pelo gatilho, negócio a negócio:
-- do $$ declare b record; begin
--   for b in select * from _backup_ganhos_reabertos_20261123 loop
--     perform set_config('nexus.reabrir_negocio', b.id::text, true);
--     update negocios set status = b.status, etapa_id = b.etapa_id, ganho_em = b.ganho_em, dados = b.dados where id = b.id;
--   end loop;
--   perform set_config('nexus.reabrir_negocio', '', true);
--   delete from negocios n using negocio_historico h
--    where h.negocio_id = n.id and h.acao = 'novo_apos_ganho' and h.detalhe ->> 'origem' = 'restauracao_m1_20261123';
--   delete from negocio_historico where acao = 'ganho_restaurado' and detalhe ->> 'backup' = '_backup_ganhos_reabertos_20261123';
-- end $$;
