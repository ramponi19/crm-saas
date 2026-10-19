-- =====================================================================================
-- CORTE, logo depois do script de migração (passo d): traz para o core o que o webhook
-- gravou ENQUANTO o script rodava.
--
-- O script lê leads/lead_mensagens num snapshot e só renomeia as tabelas no fim. O que
-- entrou nesse meio-tempo (20 s na cópia; mais em produção) foi gravado na tabela antiga e
-- ficou só em old_* — a checagem do passo 4 compara com a contagem do início e não vê.
--
--   psql "<conexão>" -X -v ON_ERROR_STOP=1 -f reconciliar-janela.sql
-- Idempotente. Lead novo da janela entra pela view leads com o MESMO id (as mensagens dele
-- apontam para esse id); mensagem entra por mensagem_registrar (versão B). Cliente novo da
-- janela só é listado (raro; cadastrar de novo pela tela).
-- =====================================================================================
\set ON_ERROR_STOP on
begin;
select count(*) as leads_da_janela from public.old_leads o where not exists (select 1 from public.negocios n where n.id = o.id);
insert into public.leads select o.* from public.old_leads o where not exists (select 1 from public.negocios n where n.id = o.id);

create temp table janela as
  select o.* from public.old_lead_mensagens o
   where not exists (select 1 from public.mensagens m where m.id = o.id and m.created_at = o.created_at)
     and (o.external_id is null or not exists (select 1 from public.mensagens m where m.external_id = o.external_id));
select count(*) as mensagens_da_janela from janela;
select count(*) filter (where public.mensagem_registrar(j.empresa_id, j.canal_id, j.external_id,
         to_jsonb(j) - 'id' - 'empresa_id' - 'canal_id' - 'external_id') is not null) as repostas
  from (select * from janela order by id) j;

select o.id as cliente_da_janela, o.empresa_id, o.nome from public.old_clientes o
 where not exists (select 1 from migracao.mapa_contato m where m.origem = 'cliente' and m.old_id = o.id);
commit;
