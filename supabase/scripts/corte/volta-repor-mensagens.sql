-- =====================================================================================
-- VOLTA DO CORTE, último passo (DEPOIS do restore, do externos.sql e do revoke_rpc): repõe
-- as mensagens salvas por volta-salvar-mensagens.sql, pela mensagem_registrar versão A
-- (que o restore trouxe de volta). external_id repetido é ignorado pela própria função.
--
--   psql "<conexão>" -X -v ON_ERROR_STOP=1 -f volta-repor-mensagens.sql
--
-- Mensagem de negócio que NASCEU na janela (contato novo) não tem lead antigo para onde
-- ir: fica de fora e é listada. O próximo recado dessa pessoa cria o lead pelo webhook;
-- o texto perdido está no CSV.
-- =====================================================================================
\set ON_ERROR_STOP on
begin;
create temp table repor (id bigint, empresa_id bigint, canal_id bigint, external_id text, dados jsonb);
\copy repor from 'mensagens-pos-corte.csv' with (format csv, header)
select count(*) as no_arquivo,
       count(*) filter (where exists (select 1 from public.leads l where l.id = (r.dados ->> 'lead_id')::bigint)) as com_lead_antigo
  from repor r;
select count(*) filter (where public.mensagem_registrar(r.empresa_id,
         case when exists (select 1 from public.canais_conectados c where c.id = r.canal_id) then r.canal_id end,
         r.external_id, r.dados) is not null) as repostas
  from (select * from repor order by id) r
 where exists (select 1 from public.leads l where l.id = (r.dados ->> 'lead_id')::bigint);
select id, empresa_id, dados ->> 'lead_id' as negocio_novo, left(dados ->> 'conteudo', 40) as inicio
  from repor r where not exists (select 1 from public.leads l where l.id = (r.dados ->> 'lead_id')::bigint);
commit;
