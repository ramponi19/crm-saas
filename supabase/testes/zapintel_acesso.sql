-- TESTE DE ACESSO DO ZAPINTEL NO BANCO — por papel e entre empresas.
--
-- Não grava nada: simula a sessão de usuários reais (request.jwt.claims) e
-- termina SEMPRE com uma exceção, que desfaz a transação. O resultado vem na
-- mensagem: "ZAPINTEL ACESSO: N ok, 0 falhas" ou a lista do que falhou.
-- Rodar inteiro no SQL do Supabase (ou pelo MCP). Criado em 15/10/2026.
--
-- Cobre a regra que as rotas de API passaram a usar (`zapintelAcesso` →
-- `zapintel_escopo`) e as funções que as telas chamam direto do navegador.
do $$
declare
  ok int := 0; falhas text := '';
  dono uuid; vend uuid; imob uuid; prev uuid;
  r record; j jsonb; n_dono int; n_vend int; lojas_vend bigint[]; jag bigint; mogi bigint;
  procedure_ok text;
begin
  select eu.usuario_id into dono from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id where eu.empresa_id = 1 and eu.role = 'owner' and eu.ativo and not coalesce(u.is_super_admin, false) limit 1;
  select eu.usuario_id into vend from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id where eu.empresa_id = 1 and eu.role = 'vendedor' and eu.ativo and not coalesce(u.is_super_admin, false) limit 1;
  select eu.usuario_id into imob from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id where eu.empresa_id = 3 and eu.ativo and not coalesce(u.is_super_admin, false) limit 1;
  select eu.usuario_id into prev from empresa_usuarios eu join usuarios u on u.id = eu.usuario_id where eu.empresa_id = 5 and eu.ativo and not coalesce(u.is_super_admin, false) limit 1;
  select min(l.id) into jag from leads l where l.empresa_id = 1 and l.ativo and l.filial_id = 6;
  select min(l.id) into mogi from leads l where l.empresa_id = 1 and l.ativo and l.filial_id = 3;

  -- 1. Dono vê as duas lojas e "sem loja"; vendedor só as dele.
  perform set_config('request.jwt.claims', json_build_object('sub', dono, 'role', 'authenticated')::text, true);
  select e.filiais into lojas_vend from zapintel_escopo(null, null) e;
  if lojas_vend @> array[3, 6, 0]::bigint[] then ok := ok + 1; else falhas := falhas || ' [dono não vê todas as lojas]'; end if;
  n_dono := (zapintel_leads_lista('{}'::jsonb) ->> 'total')::int;

  -- 2. Vendedor: SEM ZapIntel (decisão de 15/10/2026 — só dono, admin e
  --    superadmin). Exige supabase/pendentes/05_zapintel_so_dono_admin.sql;
  --    antes dela, estas duas checagens falham de propósito.
  perform set_config('request.jwt.claims', json_build_object('sub', vend, 'role', 'authenticated')::text, true);
  begin
    perform zapintel_escopo(null, null);
    falhas := falhas || ' [vendedor ainda passa por zapintel_escopo — falta a 05]';
  exception when others then if sqlstate = '42501' then ok := ok + 1; else falhas := falhas || ' [vendedor: erro inesperado ' || sqlstate || ']'; end if;
  end;
  begin
    perform zapintel_dashboard(null, null, 'p2');
    falhas := falhas || ' [vendedor abriu o dashboard do ZapIntel — falta a 05]';
  exception when others then ok := ok + 1;
  end;
  select coalesce(array_agg(filial_id), '{}') into lojas_vend from empresa_usuarios where usuario_id = vend and empresa_id = 1 and ativo;

  -- 3. Busca por número: vendedor não acha lead da outra loja; dono acha com aviso.
  if (select count(*) from buscar_lead_por_numero(case when 6 = any (lojas_vend) then mogi else jag end)) = 0
    then ok := ok + 1; else falhas := falhas || ' [vendedor achou lead de outra loja na busca]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', dono, 'role', 'authenticated')::text, true);
  if (select count(*) from buscar_lead_por_numero(jag)) = 1 then ok := ok + 1; else falhas := falhas || ' [dono não achou lead]'; end if;

  -- 4. Outra empresa: pedir a JM (p_empresa = 1) devolve a PRÓPRIA empresa, nunca a JM.
  if imob is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', imob, 'role', 'authenticated')::text, true);
    select e.empresa into n_vend from zapintel_escopo(null, 1) e;
    if n_vend = 3 then ok := ok + 1; else falhas := falhas || ' [imobiliária obteve escopo de outra empresa]'; end if;
    j := zapintel_leads_lista('{}'::jsonb, 'prioridade', 1, 50, null, 1);
    if not exists (select 1 from jsonb_array_elements(j -> 'leads') x join leads l on l.id = (x ->> 'leadId')::bigint where l.empresa_id <> 3)
      then ok := ok + 1; else falhas := falhas || ' [imobiliária viu lead de outra empresa]'; end if;
    if (select count(*) from buscar_lead_por_numero(jag)) = 0 then ok := ok + 1; else falhas := falhas || ' [imobiliária achou lead da JM]'; end if;
  end if;

  -- 5. Empresa sem o ZapIntel ligado: bloqueada em todas as funções das telas.
  if prev is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', prev, 'role', 'authenticated')::text, true);
    foreach procedure_ok in array array['dashboard', 'lista', 'insights', 'atendimento', 'posvenda', 'resumo'] loop
      begin
        case procedure_ok
          when 'dashboard' then perform zapintel_dashboard(null, null, 'p2');
          when 'lista' then perform zapintel_leads_lista('{}'::jsonb);
          when 'insights' then perform zapintel_insights(30, null, null);
          when 'atendimento' then perform zapintel_atendimento(30, null, null);
          when 'posvenda' then perform zapintel_posvenda(null, null);
          when 'resumo' then perform zapintel_resumo(null);
        end case;
        falhas := falhas || format(' [empresa sem ZapIntel abriu %s]', procedure_ok);
      exception when others then
        if sqlstate = '42501' then ok := ok + 1; else falhas := falhas || format(' [%s: erro inesperado %s]', procedure_ok, sqlstate); end if;
      end;
    end loop;
  end if;

  -- 6. Funções internas não são chamáveis por usuário logado.
  foreach procedure_ok in array array['zapintel_analises_pendentes(bigint,text)', 'zapintel_turnos(bigint,bigint[],timestamptz)',
                                      'zapintel_conversa_calc(bigint,bigint[],integer)', 'rate_limit_bump(text,timestamptz)'] loop
    if not has_function_privilege('authenticated', ('public.' || procedure_ok)::regprocedure, 'execute')
       and not has_function_privilege('anon', ('public.' || procedure_ok)::regprocedure, 'execute')
      then ok := ok + 1; else falhas := falhas || format(' [%s aberta a logado/anônimo]', procedure_ok); end if;
  end loop;

  raise exception 'ZAPINTEL ACESSO: % ok, % falhas%', ok,
    coalesce(nullif(array_length(regexp_split_to_array(trim(falhas), '\] \['), 1), 0), 0) * (falhas <> '')::int,
    case when falhas = '' then '' else ' —' || falhas end;
end $$;
