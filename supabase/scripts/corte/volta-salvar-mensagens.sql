-- =====================================================================================
-- VOLTA DO CORTE, passo 0 (ANTES de esvaziar o public): salva as mensagens que chegaram
-- depois do corte. O dump é de antes; sem isto, tudo o que o webhook gravou na janela some.
--
-- O marco é o maior id de lead_mensagens anotado no passo (b) do runbook: os ids foram
-- preservados na migração e a sequência continua, então id > marco = mensagem nova. (Não
-- dá para usar created_at: o histórico da coexistência grava a data original da Meta.)
--
--   psql "<conexão>" -X -v ON_ERROR_STOP=1 -v marco=<id> -f volta-salvar-mensagens.sql
-- Gera mensagens-pos-corte.csv no diretório atual, no formato que mensagem_registrar
-- (versão A) recebe; volta-repor-mensagens.sql repõe depois do restore.
-- lead_id = negócio principal do contato (a mesma regra da view lead_mensagens).
-- =====================================================================================
\set ON_ERROR_STOP on
-- psql não substitui :marco dentro do \copy; a view temporária recebe a variável.
create temp view pos_corte as
select m.id, m.empresa_id, m.canal_id, m.external_id, jsonb_strip_nulls(jsonb_build_object('lead_id', p.id, 'direcao', m.direcao, 'conteudo', m.conteudo, 'origem', m.origem, 'lida', m.lida, 'tipo', m.tipo, 'midia_url', m.midia_url, 'status_entrega', m.status_entrega, 'status_em', m.status_em, 'erro_envio', m.erro_envio, 'usuario_id', m.usuario_id, 'transcricao', m.transcricao, 'created_at', m.created_at)) as dados
  from public.mensagens m
  left join lateral (select n.id from public.negocios n where n.contato_id = m.contato_id order by coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc limit 1) p on true
 where m.id > :marco order by m.id;
\copy (select * from pos_corte) to 'mensagens-pos-corte.csv' with (format csv, header)
select count(*) as mensagens_salvas from public.mensagens where id > :marco;
