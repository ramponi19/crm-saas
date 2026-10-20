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

-- Cenários 3–5: a Edge de hoje (upsertLead, webhook-leads/index.ts) — procura lead ATIVO pelo origem_id
-- na loja do canal e, sem achar, INSERE pela view leads; o gatilho compat_leads_iud decide.
do $$
declare
  v_lead bigint; v_novo bigint; i int; v0 int := (select count(*) from negocios where contato_id = 1333);
  v_max bigint := (select max(id) from negocios); v_ct record;
begin
  -- 3. três voltas pela loja 3, desativando entre elas
  for i in 1 .. 3 loop
    select id into v_lead from leads where empresa_id = 1 and origem_id = '3104989889695698' and ativo and filial_id = 3 order by id limit 1;
    if v_lead is null then
      insert into leads (empresa_id, nome, origem, origem_id, primeira_msg, kanban_status, ativo, filial_id)
      values (1, 'via webhook', 'instagram', '3104989889695698', 'volta ' || i, 'novo', true, 3) returning id into v_lead;
      insert into resultado values ('edge loja 3', 'volta ' || i, 'sem lead ativo → insert na view devolveu o lead ' || v_lead);
    else
      insert into resultado values ('edge loja 3', 'volta ' || i, 'achou o lead ativo ' || v_lead);
    end if;
    if i < 3 then update leads set ativo = false where id = v_lead; end if;
  end loop;
  insert into resultado values ('edge loja 3', 'FIM', format('negócios do contato: %s antes, %s depois · ativos: %s',
    v0, (select count(*) from negocios where contato_id = 1333),
    (select count(*) from leads l join negocios n on n.id = l.id where n.contato_id = 1333 and l.ativo)));

  -- 4. o mesmo contato pelo Instagram da loja 6: cada loja tem a sua conversa
  insert into leads (empresa_id, nome, origem, origem_id, kanban_status, ativo, filial_id)
  values (1, 'via webhook', 'instagram', '3104989889695698', 'novo', true, 6) returning id into v_novo;
  insert into resultado values ('edge loja 6', 'FIM', format('lead %s · filial %s · novo negócio: %s · negócios do contato: %s',
    v_novo, (select filial_id from negocios where id = v_novo), (v_novo > v_max)::text, (select count(*) from negocios where contato_id = 1333)));

  -- 5. lead criado à mão para um contato que já existe (casa pelo telefone): continua criando negócio novo
  select c.id, c.telefone, (select count(*) from negocios n where n.contato_id = c.id) n into v_ct
    from contatos c where c.empresa_id = 1 and c.telefone_e164 is not null
     and exists (select 1 from negocios n where n.contato_id = c.id and n.filial_id = 3) order by c.id limit 1;
  insert into leads (empresa_id, nome, telefone, origem, kanban_status, ativo, filial_id)
  values (1, 'cadastro manual', v_ct.telefone, 'manual', 'novo', true, 3) returning id into v_novo;
  insert into resultado values ('manual', 'FIM', format('contato %s: negócios %s antes, %s depois · lead %s é negócio novo: %s',
    v_ct.id, v_ct.n, (select count(*) from negocios where contato_id = v_ct.id), v_novo, (v_novo > v_max)::text));
end $$;

select cenario, passo, detalhe from resultado;
rollback;
