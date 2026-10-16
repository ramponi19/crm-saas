-- TESTE — quem escreve nos modelos de contrato (supabase/pendentes/06). Não grava
-- nada: termina em exceção, que desfaz tudo. Criado em 16/10/2026.
--
-- As linhas de teste usam ids NEGATIVOS explícitos (OVERRIDING SYSTEM VALUE): não
-- consomem a sequência de ids (que o ROLLBACK não devolveria) e não tocam em
-- nenhuma linha real. As duas tabelas não têm gatilho.
--
-- Espera o estado DEPOIS da 06:
--   dono e admin da JM ... inserem, atualizam e apagam (documento) na JM
--   vendedor da JM ....... INSERT recusado; UPDATE e DELETE não alcançam linha; SELECT continua (1)
--   outra empresa ........ tudo recusado e não enxerga a linha (0)
--   versão de modelo ..... ninguém apaga direto (sem política de DELETE, como antes da 06)
-- ANTES da 06 este teste FALHA de propósito no vendedor — é o achado.
--
-- Ensaio sem aplicar: rodar o conteúdo de supabase/pendentes/06 e este bloco dentro
-- de um único DO que termina em exceção (o que foi feito em 16/10; ver o doc do achado).
do $$
declare
  ok int := 0; falhas text := ''; saida text := '';
  nomes text[] := array['dono JM', 'admin JM', 'vendedor JM', 'dono outra empresa'];
  gestor boolean[] := array[true, true, false, false];
  mesma boolean[] := array[true, true, true, false];
  uids uuid[];
  i int; n bigint; estado text;
  ins_doc text; ins_mod text; upd_doc bigint; upd_mod bigint; del_doc bigint; del_mod bigint; sel bigint;
  aplicada boolean;
begin
  aplicada := (select count(*) from pg_policy
    where polrelid in ('public.contrato_documentos'::regclass, 'public.contrato_modelos'::regclass)
      and polname like '%\_dono\_admin' escape '\') = 5;

  select array[
    (select usuario_id from empresa_usuarios where empresa_id = 1 and role = 'owner' and ativo order by usuario_id limit 1),
    (select usuario_id from empresa_usuarios where empresa_id = 1 and role = 'admin' and ativo order by usuario_id limit 1),
    (select usuario_id from empresa_usuarios where empresa_id = 1 and role = 'vendedor' and ativo order by usuario_id limit 1),
    (select usuario_id from empresa_usuarios where empresa_id = 3 and ativo order by usuario_id limit 1)] into uids;

  -- Linhas de teste (como dono do banco, antes de trocar de papel).
  insert into contrato_documentos (id, empresa_id, nome) overriding system value values (-990001, 1, '__teste_06__');
  insert into contrato_modelos (id, empresa_id, documento_id, versao, paginas) overriding system value
    values (-990001, 1, -990001, -990001, '[]');
  for i in 1..4 loop
    insert into contrato_documentos (id, empresa_id, nome) overriding system value values (-990300 - i, 1, '__teste_06_apagar__');
    -- Versões extras entram inativas: o índice contrato_modelos_um_ativo deixa um só ativo por documento.
    insert into contrato_modelos (id, empresa_id, documento_id, versao, paginas, ativo) overriding system value
      values (-990400 - i, 1, -990001, -990400 - i, '[]', false);
  end loop;

  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', uids[i], 'role', 'authenticated')::text, true);
    set local role authenticated;

    begin
      insert into contrato_documentos (id, empresa_id, nome) overriding system value values (-990100 - i, 1, '__teste_06_novo__');
      ins_doc := 'ok';
    exception when others then ins_doc := sqlstate; end;
    begin
      insert into contrato_modelos (id, empresa_id, documento_id, versao, paginas, ativo) overriding system value
        values (-990200 - i, 1, -990001, -990200 - i, '[]', false);
      ins_mod := 'ok';
    exception when others then ins_mod := sqlstate; end;

    update contrato_documentos set nome = nome where id = -990001; get diagnostics upd_doc = row_count;
    update contrato_modelos set ativo = ativo where id = -990001; get diagnostics upd_mod = row_count;
    delete from contrato_documentos where id = -990300 - i; get diagnostics del_doc = row_count;
    delete from contrato_modelos where id = -990400 - i; get diagnostics del_mod = row_count;
    select count(*) into sel from contrato_modelos where id = -990001;

    reset role;

    saida := saida || format(E'\n%s: insert doc=%s modelo=%s | update doc=%s modelo=%s | delete doc=%s modelo=%s | select=%s',
      nomes[i], ins_doc, ins_mod, upd_doc, upd_mod, del_doc, del_mod, sel);

    -- O esperado depois da 06.
    if (ins_doc = 'ok') = gestor[i] then ok := ok + 1; else falhas := falhas || format(' [%s insert doc=%s]', nomes[i], ins_doc); end if;
    if (ins_mod = 'ok') = gestor[i] then ok := ok + 1; else falhas := falhas || format(' [%s insert modelo=%s]', nomes[i], ins_mod); end if;
    if upd_doc = gestor[i]::int then ok := ok + 1; else falhas := falhas || format(' [%s update doc=%s]', nomes[i], upd_doc); end if;
    if upd_mod = gestor[i]::int then ok := ok + 1; else falhas := falhas || format(' [%s update modelo=%s]', nomes[i], upd_mod); end if;
    if del_doc = gestor[i]::int then ok := ok + 1; else falhas := falhas || format(' [%s delete doc=%s]', nomes[i], del_doc); end if;
    if del_mod = 0 then ok := ok + 1; else falhas := falhas || format(' [%s apagou versão de modelo direto]', nomes[i]); end if;
    if sel = mesma[i]::int then ok := ok + 1; else falhas := falhas || format(' [%s select=%s]', nomes[i], sel); end if;
  end loop;

  raise exception E'CONTRATOS ESCRITA (06 aplicada: %): % ok, % falhas%\nresultado por perfil:%',
    case when aplicada then 'sim' else 'não' end,
    ok, (length(falhas) - length(replace(falhas, '[', ''))),
    case when falhas = '' then '' else E'\nfalhas:' || falhas end, saida;
end $$;
