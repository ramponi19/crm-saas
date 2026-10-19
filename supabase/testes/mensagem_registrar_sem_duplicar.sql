-- mensagem_registrar versão B (depois do corte) NÃO duplica negócio. Roda na cópia migrada; desfeito no fim.
--   psql -v ON_ERROR_STOP=1 -d <copia> -f supabase/testes/mensagem_registrar_sem_duplicar.sql
-- Cenário 1 — contato 1333 (Instagram 3104989889695698, loja 3; 13 negócios, 12 desativados no funil
-- principal e 1 aberto no funil interno "Time JM"): três mensagens seguidas, desativando o negócio
-- pela view leads (como a tela) entre elas. Tem de terminar com UM negócio aberto e nenhum criado.
-- Cenário 2 — contato que não existe: a 1ª mensagem cria contato + negócio; as outras reabrem o mesmo.
\set ON_ERROR_STOP on
begin;
create temp table resultado (cenario text, passo text, detalhe text);
grant all on resultado to service_role;

do $$
declare
  v_canal bigint := (select id from canais where empresa_id = 1 and tipo = 'instagram' and filial_id = 3);
  v_total0 int := (select count(*) from negocios where contato_id = 1333);
  v_aberto bigint; v_contato bigint; i int;
  aberto_sql constant text := 'select string_agg(n.id::text, '','' order by n.id) from negocios n where n.contato_id = $1
                                and n.status = ''aberto'' and coalesce((n.dados -> ''_lead'' ->> ''ativo'')::boolean, true)';
begin
  -- cenário 1
  for i in 1 .. 3 loop
    execute 'set local role service_role';
    perform mensagem_registrar(1, v_canal, 'teste-dup-1333-' || i,
              jsonb_build_object('identidade', '3104989889695698', 'direcao', 'recebida', 'conteudo', 'mensagem ' || i));
    execute 'reset role';
    execute aberto_sql into v_aberto using 1333::bigint;
    insert into resultado values ('1333', 'mensagem ' || i, format('negócio aberto: %s (etapa %s, funil %s); negócios do contato: %s',
      v_aberto, (select e.slug from negocios n join funil_etapas e on e.id = n.etapa_id where n.id = v_aberto),
      (select funil_id from negocios where id = v_aberto), (select count(*) from negocios where contato_id = 1333)));
    if i < 3 then
      update leads set ativo = false where id = v_aberto;   -- desativar pela tela
      insert into resultado values ('1333', 'desativa ' || v_aberto, '');
    end if;
  end loop;
  insert into resultado values ('1333', 'FIM', format('abertos: %s · negócios antes %s, depois %s · reaberto_por_mensagem: %s · mensagens na conversa do canal: %s',
    (select count(*) from negocios n where n.contato_id = 1333 and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)),
    v_total0, (select count(*) from negocios where contato_id = 1333),
    (select count(*) from negocio_historico h join negocios n on n.id = h.negocio_id where n.contato_id = 1333 and h.acao = 'reaberto_por_mensagem'),
    (select count(*) from mensagens where external_id like 'teste-dup-1333-%')));

  -- cenário 2
  for i in 1 .. 3 loop
    execute 'set local role service_role';
    perform mensagem_registrar(1, v_canal, 'teste-dup-novo-' || i,
              jsonb_build_object('identidade', 'ig-teste-novo', 'direcao', 'recebida', 'conteudo', 'oi ' || i, 'nome', 'Teste novo'));
    execute 'reset role';
    select contato_id into v_contato from contato_identidades where empresa_id = 1 and canal_tipo = 'instagram' and external_id = 'ig-teste-novo';
    execute aberto_sql into v_aberto using v_contato;
    insert into resultado values ('novo', 'mensagem ' || i, format('negócio aberto: %s (etapa %s); negócios do contato: %s', v_aberto,
      (select e.slug from negocios n join funil_etapas e on e.id = n.etapa_id where n.id = v_aberto),
      (select count(*) from negocios where contato_id = v_contato)));
    if i < 3 then update leads set ativo = false where id = v_aberto; end if;
  end loop;
  insert into resultado values ('novo', 'FIM', format('abertos: %s · negócios: %s · aparece no funil (view leads, ativo): %s',
    (select count(*) from negocios n where n.contato_id = v_contato and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)),
    (select count(*) from negocios where contato_id = v_contato),
    (select count(*) from leads l join negocios n on n.id = l.id where n.contato_id = v_contato and l.ativo)));
end $$;

select cenario, passo, detalhe from resultado;
rollback;
