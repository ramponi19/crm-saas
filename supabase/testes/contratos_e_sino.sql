-- TESTE — bucket de contratos e contador do sino. Não grava nada (termina em
-- exceção, que desfaz). Criado em 15/10/2026.
--
-- Contratos: dono e vendedor da JM listam os fundos da JM; outra empresa lista
-- ZERO; anônimo não lista. ANTES de supabase/pendentes/02_contratos_bucket.sql
-- este teste FALHA de propósito ("outra empresa lista N") — é o vazamento.
--
-- Sino: para cada perfil, o contador `leads.msgs_nao_lidas` (o que o sino lê
-- desde 15/10) é igual à contagem das mensagens recebidas não lidas, lead a
-- lead, sob a mesma RLS.
do $$
declare
  ok int := 0; falhas text := '';
  uids uuid[]; nomes text[] := array['dono JM', 'admin JM', 'vendedor JM', 'vendedor sem loja', 'outra empresa', 'empresa de prévia'];
  i int; n bigint; igual boolean; jm bigint;
begin
  select array[
    (select eu.usuario_id from empresa_usuarios eu where eu.empresa_id=1 and eu.role='owner' and eu.ativo limit 1),
    (select eu.usuario_id from empresa_usuarios eu where eu.empresa_id=1 and eu.role='admin' and eu.ativo limit 1),
    (select eu.usuario_id from empresa_usuarios eu where eu.empresa_id=1 and eu.role='vendedor' and eu.ativo and eu.filial_id is not null limit 1),
    (select au.id from auth.users au where au.email='reviewer.meta@jmstore.app'),
    (select eu.usuario_id from empresa_usuarios eu where eu.empresa_id=3 and eu.ativo limit 1),
    (select eu.usuario_id from empresa_usuarios eu where eu.empresa_id=5 and eu.ativo limit 1)] into uids;
  select count(*) into jm from storage.objects where bucket_id = 'contratos' and (storage.foldername(name))[1] = '1';

  for i in 1..6 loop
    perform set_config('request.jwt.claims', json_build_object('sub', uids[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from storage.objects where bucket_id = 'contratos';
    select (select md5(coalesce(string_agg(v.lead_id || ':' || v.nao_lidas, ',' order by v.lead_id), '')) from v_leads_nao_lidas v join leads l on l.id = v.lead_id and l.ativo)
         = (select md5(coalesce(string_agg(l.id || ':' || l.msgs_nao_lidas, ',' order by l.id), '')) from leads l where l.ativo and l.msgs_nao_lidas > 0)
      into igual;
    reset role;
    if i <= 4 then
      if n = jm then ok := ok + 1; else falhas := falhas || format(' [%s lista %s fundos, esperado %s]', nomes[i], n, jm); end if;
    else
      if n = 0 then ok := ok + 1; else falhas := falhas || format(' [%s lista %s fundos de OUTRA empresa]', nomes[i], n); end if;
    end if;
    if igual then ok := ok + 1; else falhas := falhas || format(' [sino de %s diverge da contagem]', nomes[i]); end if;
  end loop;

  begin
    set local role anon;
    select count(*) into n from storage.objects where bucket_id = 'contratos';
    reset role;
    if n = 0 then ok := ok + 1; else falhas := falhas || format(' [anônimo lista %s fundos]', n); end if;
  exception when others then ok := ok + 1;  -- recusado = bloqueado
  end;

  raise exception 'CONTRATOS E SINO: % ok, % falhas%', ok, (falhas <> '')::int * (length(falhas) - length(replace(falhas, '[', ''))),
    case when falhas = '' then '' else ' —' || falhas end;
end $$;
