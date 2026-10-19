-- Teste da mensagem_registrar pelo contrato que a Edge usa. Roda nos DOIS estados e tem de dar
-- o mesmo resultado: antes do corte (versão A, lead_mensagens é tabela) e depois do script de
-- migração (versão B, lead_mensagens é view). Tudo é desfeito no fim.
--   psql -v ON_ERROR_STOP=1 -d <copia> -f supabase/testes/mensagem_registrar.sql
-- O caminho só da versão B (contato novo pela identidade do canal) é testado no passo 8 do script.
\set ON_ERROR_STOP on
begin;
create temp table resultado (teste text, ok boolean, detalhe text);
grant all on resultado to service_role;

do $$
declare
  v_lead bigint; v_canal bigint; v_n0 int; v_id bigint; v_id2 bigint;
begin
  select l.id into v_lead from leads l where l.empresa_id = 1 and l.ativo order by l.id limit 1;
  select c.id into v_canal from canais_conectados c where c.empresa_id = 1 and c.tipo = 'whatsapp' order by c.id limit 1;
  select msgs_nao_lidas into v_n0 from leads where id = v_lead;

  execute 'set local role service_role';

  v_id := mensagem_registrar(1, v_canal, 'teste-registrar-a1',
            jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida', 'conteudo', 'oi', 'origem', 'whatsapp'));
  insert into resultado values ('grava e devolve o id', v_id is not null and exists (
    select 1 from lead_mensagens where id = v_id and external_id = 'teste-registrar-a1' and canal_id = v_canal
       and empresa_id = 1 and tipo = 'texto' and not lida), format('id %s', v_id));
  insert into resultado values ('gatilho de não lidas disparou',
    (select msgs_nao_lidas from leads where id = v_lead) = v_n0 + 1,
    format('%s → %s', v_n0, (select msgs_nao_lidas from leads where id = v_lead)));
  insert into resultado values ('filial preenchida pelo gatilho do lead',
    (select m.filial_id is not distinct from l.filial_id from lead_mensagens m join leads l on l.id = m.lead_id where m.id = v_id), '');

  v_id2 := mensagem_registrar(1, v_canal, 'teste-registrar-a1',
             jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida', 'conteudo', 'oi de novo'));
  insert into resultado values ('external_id repetido: NULL e nada gravado', v_id2 is null
    and (select count(*) from lead_mensagens where external_id = 'teste-registrar-a1') = 1
    and (select conteudo from lead_mensagens where id = v_id) = 'oi', '');

  -- lead_id como texto (a Edge recebe leadId do corpo da requisição como string)
  v_id2 := mensagem_registrar(1, v_canal, null,
             jsonb_build_object('lead_id', v_lead::text, 'direcao', 'enviada', 'conteudo', 'resposta', 'lida', true,
                                'status_entrega', 'enviada', 'status_em', now()));
  insert into resultado values ('sem external_id e lead_id em texto', v_id2 is not null, format('id %s', v_id2));

  begin
    perform mensagem_registrar(3, v_canal, 'teste-registrar-a2', jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida'));
    insert into resultado values ('lead de outra empresa recusado', false, 'gravou');
  exception when insufficient_privilege then
    insert into resultado values ('lead de outra empresa recusado', true, sqlerrm);
  end;
  begin
    perform mensagem_registrar(1, v_canal, 'teste-registrar-a3', jsonb_build_object('direcao', 'recebida'));
    insert into resultado values ('sem lead_id recusado', false, 'gravou');
  exception when not_null_violation then
    insert into resultado values ('sem lead_id recusado', true, sqlerrm);
  end;
  execute 'reset role';
end $$;

insert into resultado
select 'só service_role executa',
       not has_function_privilege('anon', 'public.mensagem_registrar(bigint,bigint,text,jsonb)', 'execute')
   and not has_function_privilege('authenticated', 'public.mensagem_registrar(bigint,bigint,text,jsonb)', 'execute')
   and has_function_privilege('service_role', 'public.mensagem_registrar(bigint,bigint,text,jsonb)', 'execute'), '';

select case when ok then 'OK  ' else 'FALHOU ' end || teste || coalesce(' — ' || nullif(detalhe, ''), '') as resultado from resultado;
select count(*) filter (where not ok) as falhas from resultado;
rollback;
