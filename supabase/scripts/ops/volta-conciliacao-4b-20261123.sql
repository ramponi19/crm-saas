-- VOLTA DA FASE 4B DA CONCILIAÇÃO (23/11/2026) — devolve os negócios convertidos ao estado do backup.
--
-- Fonte: public._backup_conciliacao_20261123 (1 linha por negócio, com o negócio inteiro em `negocio`).
-- Só desfaz o negócio que AINDA está como a 4B deixou (status ganho, etapa 15 e ganho_em = ganho_em_novo):
-- se alguém mexeu depois, ele fica e aparece na lista "nao_desfeitos" para olhar à mão.
-- O gatilho negocios_ganho_protegido (M1) barra tirar do ganho; a volta usa a mesma exceção da RPC
-- reabrir_negocio (nexus.reabrir_negocio = id), negócio a negócio, e grava 'conciliacao_zip_desfeita'.
--
-- Para desfazer só um lote, troque `true` por `b.lote = 1` (ou 2) no filtro.
-- Rodar como postgres/service_role (SQL editor ou MCP). Nada é apagado.

do $volta$
declare b record; v_ok int := 0; v_nao jsonb := '[]';
begin
  for b in
    select k.*, n.status st_atual, n.etapa_id etapa_atual, n.ganho_em ganho_atual
      from public._backup_conciliacao_20261123 k join public.negocios n on n.id = k.negocio_id
     where true and n.empresa_id = 1
     order by k.negocio_id
  loop
    if b.st_atual <> 'ganho' or b.etapa_atual <> 15 or b.ganho_atual is distinct from b.ganho_em_novo then
      v_nao := v_nao || jsonb_build_object('negocio', b.negocio_id, 'status', b.st_atual, 'etapa', b.etapa_atual, 'ganho_em', b.ganho_atual);
      continue;
    end if;
    perform set_config('nexus.reabrir_negocio', b.negocio_id::text, true);
    update public.negocios n set
      status          = b.negocio->>'status',
      etapa_id        = (b.negocio->>'etapa_id')::bigint,
      ganho_em        = (b.negocio->>'ganho_em')::timestamptz,
      perdido_em      = (b.negocio->>'perdido_em')::timestamptz,
      motivo_perda_id = (b.negocio->>'motivo_perda_id')::bigint,
      valor_estimado  = (b.negocio->>'valor_estimado')::numeric
     where n.id = b.negocio_id and n.empresa_id = 1 and n.status = 'ganho';
    perform set_config('nexus.reabrir_negocio', '', true);
    insert into public.negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, detalhe)
    values (1, b.negocio_id, 15, (b.negocio->>'etapa_id')::bigint, 'conciliacao_zip_desfeita',
            jsonb_build_object('id_pedido', b.id_pedido, 'origem', b.origem, 'status_restaurado', b.negocio->>'status'));
    v_ok := v_ok + 1;
  end loop;
  raise notice 'desfeitos: %, nao_desfeitos (mexidos depois da 4B): %', v_ok, v_nao;
end $volta$;
