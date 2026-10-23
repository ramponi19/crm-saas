-- TESTE da 20261024000100 (empresa_segredos + modulo_pedidos.status), numa cópia ou no
-- Supabase local. Não grava nada: termina em ROLLBACK.
--   psql -v ON_ERROR_STOP=1 -f supabase/testes/segredos_e_pedidos.sql
\set ON_ERROR_STOP on
begin;
create temp table _r (passo text, ok boolean) on commit drop;
grant all on _r to authenticated, anon, service_role;

-- 1. empresa_segredos: só service_role. Um segredo de teste gravado como postgres.
insert into public.empresa_segredos (empresa_id, chave, valor_cifrado) values (1, 'teste_rls', 'cifrado-de-mentira');

do $$
declare n int; papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', json_build_object('role', papel,
      'sub', (select usuario_id from empresa_usuarios where empresa_id = 1 and role = 'owner' and ativo limit 1))::text, true);
    execute format('set local role %I', papel);
    begin
      execute 'select count(*) from public.empresa_segredos' into n;
      insert into _r values (papel || ' le empresa_segredos: ' || n || ' linhas (esperado: permissão negada)', false);
    exception when insufficient_privilege then
      insert into _r values (papel || ' não lê empresa_segredos', true);
    end;
    reset role;
  end loop;
  set local role service_role;
  select count(*) into n from public.empresa_segredos where chave = 'teste_rls';
  insert into _r values ('service_role lê empresa_segredos', n = 1);
  reset role;
end $$;

-- 2. modulo_pedidos.status
do $$
declare v_id bigint; v_id2 bigint;
begin
  insert into public.modulo_pedidos (empresa_id, modulo) values (1, '/teste-status') returning id into v_id;
  insert into _r select 'pedido nasce pendente', status = 'pendente' from public.modulo_pedidos where id = v_id;

  begin
    insert into public.modulo_pedidos (empresa_id, modulo) values (1, '/teste-status');
    insert into _r values ('segundo pendente do mesmo módulo entrou (não devia)', false);
  exception when unique_violation then insert into _r values ('segundo pendente do mesmo módulo barrado', true);
  end;

  update public.modulo_pedidos set status = 'recusado', recusado_em = now() where id = v_id;
  insert into _r select 'recusar não apaga (linha continua, recusado)', status = 'recusado' from public.modulo_pedidos where id = v_id;

  insert into public.modulo_pedidos (empresa_id, modulo) values (1, '/teste-status') returning id into v_id2;
  insert into _r values ('pedido novo depois de recusado entra', v_id2 is not null);

  begin
    update public.modulo_pedidos set status = 'atendido' where id = v_id2;
    insert into _r values ('atendido sem atendido_em entrou (não devia)', false);
  exception when check_violation then insert into _r values ('atendido exige atendido_em', true);
  end;

  begin
    update public.modulo_pedidos set status = 'qualquer' where id = v_id2;
    insert into _r values ('status inválido entrou (não devia)', false);
  exception when check_violation then insert into _r values ('status só pendente/atendido/recusado', true);
  end;

  update public.modulo_pedidos set status = 'atendido', atendido_em = now() where id = v_id2;
  insert into _r select 'atender com atendido_em', status = 'atendido' from public.modulo_pedidos where id = v_id2;
end $$;

select passo, ok from _r order by ok, passo;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'segredos_e_pedidos: há passo errado (ver acima)'; end if;
end $$;
rollback;
