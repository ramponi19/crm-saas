-- PROVA no banco LOCAL das migrações 20261109000300 (canais_empresa_fixa) e 000400
-- (distribuir só sem dono). Tudo numa transação desfeita no fim: não deixa rastro.
-- Usa a empresa 1 e a 5 e os negócios/usuários da 1 (banco montado por tools/banco/montar-local.sh).
--
--   ida  (espera as travas):         PGOPTIONS="-c prova.modo=ida"   psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres" -X -A -t -q -f tests/banco/prova-canais-distribuir.sql
--   volta (depois dos scripts de volta; espera o comportamento antigo): PGOPTIONS="-c prova.modo=volta" ...
--
-- Rodado em 09/11/2026: ida, volta e ida — todas as linhas OK. Só no banco local.
begin;
set local client_min_messages = notice;
create temp table res(n serial, linha text) on commit drop;

do $$
declare
  modo text := current_setting('prova.modo');
  e1 constant bigint := 1;
  e2 constant bigint := 5;
  cid bigint; v bigint; msg text; dono uuid; u uuid; u2 uuid; neg_com bigint; neg_sem bigint;
  ok boolean;
begin
  -- Canal de teste da empresa 1.
  insert into canais (empresa_id, tipo, external_id, access_token_enc)
  values (e1, 'whatsapp', 'prova-num-1', 'enc:a') returning id into cid;

  -- 1. Reconectar o MESMO canal na MESMA empresa (upsert da rota) passa.
  begin
    insert into canais (empresa_id, tipo, external_id, access_token_enc, status)
    values (e1, 'whatsapp', 'prova-num-1', 'enc:b', 'ativo')
    on conflict (tipo, external_id) do update
      set empresa_id = excluded.empresa_id, access_token_enc = excluded.access_token_enc,
          status = excluded.status, updated_at = now();
    select count(*) into v from canais where id = cid and access_token_enc = 'enc:b' and empresa_id = e1;
    insert into res(linha) values (case when v = 1 then 'OK' else 'FALHOU' end || ' reconectar mesmo canal na mesma empresa');
  exception when others then
    insert into res(linha) values ('FALHOU reconectar mesmo canal na mesma empresa: ' || sqlerrm);
  end;

  -- 2. Atualizações da Edge (token, status, erro, ultima_msg, sync) passam.
  begin
    update canais set status = 'erro', ultimo_erro = 'x', ultimo_erro_em = now() where id = cid;
    update canais set status = 'ativo', ultimo_erro = null where id = cid;
    update canais set ultima_msg_em = now() where id = cid;
    update canais set sync_contatos_em = now() where id = cid;
    update canais set sync_historico_em = now(), sync_historico_pct = 100 where id = cid;
    update canais set access_token_enc = 'enc:c', token_expira_em = now() + interval '60 days' where id = cid;
    insert into res(linha) values ('OK atualizações da Edge/renovação (status, erro, ultima_msg, sync, token)');
  exception when others then
    insert into res(linha) values ('FALHOU atualizações da Edge: ' || sqlerrm);
  end;

  -- 3. Outra empresa conectando o MESMO número (upsert) é barrada pelo gatilho.
  begin
    insert into canais (empresa_id, tipo, external_id, access_token_enc)
    values (e2, 'whatsapp', 'prova-num-1', 'enc:ladrao')
    on conflict (tipo, external_id) do update
      set empresa_id = excluded.empresa_id, access_token_enc = excluded.access_token_enc;
    select empresa_id into v from canais where id = cid;
    insert into res(linha) values (case
      when modo = 'volta' and v = e2 then 'OK (volta) sem gatilho o upsert troca a empresa, como antes'
      else 'FALHOU outra empresa tomou o canal (empresa agora ' || v || ')' end);
    update canais set empresa_id = e1, access_token_enc = 'enc:c' where id = cid; -- devolve (só na volta chega aqui)
  exception when others then
    get stacked diagnostics msg = message_text;
    select empresa_id into v from canais where id = cid;
    insert into res(linha) values (case
      when modo = 'ida' and msg ilike '%outra empresa%' and v = e1 then 'OK outra empresa barrada pelo gatilho: "' || msg || '"'
      else 'FALHOU outra empresa: ' || msg end);
  end;

  -- 4. UPDATE direto de empresa_id (script, service role) também é barrado.
  begin
    update canais set empresa_id = e2 where id = cid;
    insert into res(linha) values (case when modo = 'volta' then 'OK (volta) update direto de empresa passa, como antes'
      else 'FALHOU update direto de empresa_id passou' end);
    update canais set empresa_id = e1 where id = cid;
  exception when others then
    insert into res(linha) values (case when modo = 'ida' then 'OK update direto de empresa_id barrado' else 'FALHOU ' || sqlerrm end);
  end;

  -- 5. Desconectar (DELETE) passa.
  begin
    delete from canais where id = cid;
    get diagnostics v = row_count;
    insert into res(linha) values (case when v = 1 then 'OK desconectar (delete)' else 'FALHOU desconectar apagou ' || v end);
  exception when others then
    insert into res(linha) values ('FALHOU desconectar: ' || sqlerrm);
  end;

  -- 6. Depois de desconectar, a OUTRA empresa conecta o número normalmente (insert novo).
  begin
    insert into canais (empresa_id, tipo, external_id, access_token_enc)
    values (e2, 'whatsapp', 'prova-num-1', 'enc:novo')
    on conflict (tipo, external_id) do update set empresa_id = excluded.empresa_id;
    insert into res(linha) values ('OK número desconectado pode ser conectado por outra empresa');
  exception when others then
    insert into res(linha) values ('FALHOU conectar número livre: ' || sqlerrm);
  end;

  -- 7/8. Distribuição: não reatribui lead com dono; atribui lead sem dono.
  select usuario_id into u from empresa_usuarios where empresa_id = e1 and ativo order by usuario_id limit 1;
  select usuario_id into u2 from empresa_usuarios where empresa_id = e1 and ativo and usuario_id <> u order by usuario_id limit 1;
  select id into neg_com from negocios where empresa_id = e1 and responsavel_id = u order by id limit 1;
  if neg_com is null then
    select id into neg_com from negocios where empresa_id = e1 order by id limit 1;
    update negocios set responsavel_id = u where id = neg_com;
  end if;
  select id into neg_sem from negocios where empresa_id = e1 and id <> neg_com order by id desc limit 1;
  update negocios set responsavel_id = null where id = neg_sem;

  perform negocio_atribuir(neg_com, u2, 'distribuir', null);
  select responsavel_id into dono from negocios where id = neg_com;
  insert into res(linha) values (case
    when modo = 'ida' and dono = u then 'OK distribuir NÃO reatribui lead com dono'
    when modo = 'volta' and dono = u2 then 'OK (volta) distribuir reatribui lead com dono, como antes'
    else 'FALHOU distribuir lead com dono: dono ficou ' || coalesce(dono::text, 'nulo') end);

  perform negocio_atribuir(neg_sem, u2, 'distribuir', null);
  select responsavel_id into dono from negocios where id = neg_sem;
  insert into res(linha) values (case when dono = u2 then 'OK distribuir atribui lead sem dono'
    else 'FALHOU distribuir lead sem dono: ' || coalesce(dono::text, 'nulo') end);

  -- 9. As outras ações seguem trocando o dono (transferir com dono).
  perform negocio_atribuir(neg_com, u2, 'transferir', null);
  select responsavel_id into dono from negocios where id = neg_com;
  insert into res(linha) values (case when dono = u2 then 'OK transferir troca o dono' else 'FALHOU transferir' end);
end $$;

select linha from res order by n;
rollback;
