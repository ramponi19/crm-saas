-- M2 — CONFIGURAÇÃO POR EMPRESA E LOJA, PROVISÓRIA SOBRE configuracoes_sistema (23/11/2026; D6 do
-- docs/design-pos-venda.md §8.1).
--
-- Enquanto o empresa_config do PDV v2 não existe, as chaves novas (pós-venda e ciclo de vida) ficam em
-- configuracoes_sistema com duas convenções que tornam a migração futura mecânica:
--   1. chave = '<modulo>.<chave>'  (o par (modulo, chave) do empresa_config). Nada existente usa ponto:
--      as chaves de hoje (horario_comercial, sla_atendimento, roleta_leads:3, ...) não são tocadas;
--   2. valor = envelope {"empresa": <valor|null>, "lojas": {"<filial_id>": <valor>}, "atualizado_por", "atualizado_em"}
--      — cada entrada vira uma linha do empresa_config (filial_id nulo = empresa).
-- E ninguém lê a tabela direto para essas chaves: só por estas funções, com nome e assinatura iguais às
-- do PDV v2 §A (config_valor / config_salvar) mais a variante com empresa explícita para gatilho e Edge
-- (config_valor_emp). Quando o empresa_config existir, troca-se o CORPO das três; as assinaturas ficam.
--
-- Leitura: valor da loja → valor da empresa → null (o padrão fica no chamador, coalesce com o manifesto).
-- Escrita: só dono/admin (is_empresa_admin, que cobre o superadmin impersonando), sessão que pode escrever,
-- loja da própria empresa. NÃO exige o módulo ligado: a D9 pede o responsável padrão preenchido ANTES de
-- ligar o pós-venda.
--
-- Segurança (pedido do Lucas, 23/11):
--   - as funções só leem e gravam chaves '<modulo>.<chave>' com módulo e chave validados
--     (^[a-z][a-z0-9_]{0,62}$): nenhuma chave antiga da tabela (horario_comercial, roleta_leads:3,
--     sla_atendimento, whatsapp_saude...) é alcançável por elas, nem montando o nome;
--   - NENHUM SEGREDO (token, chave de API, senha) vai para '<modulo>.<chave>'. Segredo fica onde está hoje
--     (cofre, variáveis de ambiente). config_salvar recusa nomes que pareçam segredo (CHAVE_PROIBIDA).
--
-- Volta: supabase/scripts/volta/volta-config-provisoria.sql.

-- Leitura com a empresa explícita (gatilhos, Edge, funções do módulo). Só service_role e funções
-- SECURITY DEFINER: para o usuário, a empresa vem da sessão (config_valor).
create or replace function public.config_valor_emp(p_empresa bigint, p_modulo text, p_chave text, p_filial bigint default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
           case when p_filial is not null then nullif(c.valor -> 'lojas' -> p_filial::text, 'null'::jsonb) end,
           nullif(c.valor -> 'empresa', 'null'::jsonb))
    from public.configuracoes_sistema c
   where c.empresa_id = p_empresa
     -- só o formato novo: módulo e chave validados, nunca uma chave antiga da tabela
     and p_modulo ~ '^[a-z][a-z0-9_]{0,62}$'
     and p_chave ~ '^[a-z][a-z0-9_]{0,62}$'
     and c.chave = p_modulo || '.' || p_chave
$$;
revoke all on function public.config_valor_emp(bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function public.config_valor_emp(bigint, text, text, bigint) to service_role;

-- Leitura pela sessão (telas e RPCs chamadas pelo usuário). Mesma assinatura do PDV v2 §A.
create or replace function public.config_valor(p_modulo text, p_chave text, p_filial bigint default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.config_valor_emp(public.get_empresa_id(), p_modulo, p_chave, p_filial)
$$;
revoke all on function public.config_valor(text, text, bigint) from public, anon;
grant execute on function public.config_valor(text, text, bigint) to authenticated, service_role;

-- Escrita. p_filial nulo = valor da empresa; com loja = valor só daquela loja.
-- p_valor nulo (ou JSON null) numa loja tira o valor da loja (volta a valer o da empresa).
-- Devolve o envelope gravado.
create or replace function public.config_salvar(p_modulo text, p_chave text, p_valor jsonb, p_filial bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp   bigint := public.get_empresa_id();
  v_chave text;
  v_env   jsonb;
begin
  if v_emp is null then
    raise exception 'SEM_EMPRESA: sessão sem empresa' using errcode = 'P0001';
  end if;
  if not public.sessao_pode_escrever() then
    raise exception 'SOMENTE_LEITURA: a empresa está em modo somente leitura' using errcode = 'P0001';
  end if;
  if not public.is_empresa_admin(v_emp) then
    raise exception 'SEM_PERMISSAO: só dono ou administrador altera a configuração' using errcode = 'P0001';
  end if;
  if coalesce(p_modulo, '') !~ '^[a-z][a-z0-9_]{0,62}$' or coalesce(p_chave, '') !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'CHAVE_INVALIDA: módulo e chave em minúsculas, letras, números e _' using errcode = 'P0001';
  end if;
  -- segredo não mora aqui: fica no cofre / variável de ambiente
  if p_chave ~ '(token|secret|segredo|senha|password|passwd|api_?key|apikey|credencial|private_?key)' then
    raise exception 'CHAVE_PROIBIDA: segredo (token, chave de API, senha) não é guardado na configuração' using errcode = 'P0001';
  end if;
  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial and f.empresa_id = v_emp) then
    raise exception 'FILIAL_INVALIDA: a loja não é desta empresa' using errcode = 'P0001';
  end if;

  v_chave := p_modulo || '.' || p_chave;
  -- duas gravações da mesma chave ao mesmo tempo: a segunda espera e soma sobre a primeira
  perform pg_advisory_xact_lock(hashtext('config:' || v_emp || ':' || v_chave));

  select c.valor into v_env from public.configuracoes_sistema c where c.empresa_id = v_emp and c.chave = v_chave;
  v_env := jsonb_build_object('empresa', coalesce(v_env -> 'empresa', 'null'::jsonb),
                              'lojas',   coalesce(v_env -> 'lojas', '{}'::jsonb));
  if p_filial is null then
    v_env := jsonb_set(v_env, '{empresa}', coalesce(p_valor, 'null'::jsonb));
  elsif p_valor is null or p_valor = 'null'::jsonb then
    v_env := jsonb_set(v_env, '{lojas}', (v_env -> 'lojas') - p_filial::text);
  else
    v_env := jsonb_set(v_env, array['lojas', p_filial::text], p_valor);
  end if;
  v_env := v_env || jsonb_build_object('atualizado_por', auth.uid(), 'atualizado_em', now());

  insert into public.configuracoes_sistema (empresa_id, chave, valor, updated_at)
  values (v_emp, v_chave, v_env, now())
  on conflict (empresa_id, chave) do update set valor = excluded.valor, updated_at = excluded.updated_at;
  return v_env;
end $$;
revoke all on function public.config_salvar(text, text, jsonb, bigint) from public, anon;
grant execute on function public.config_salvar(text, text, jsonb, bigint) to authenticated, service_role;

comment on function public.config_valor_emp(bigint, text, text, bigint) is
  'Configuração provisória (D6): loja → empresa → null, sobre configuracoes_sistema chave <modulo>.<chave>. Migra para empresa_config trocando só o corpo.';
comment on function public.config_valor(text, text, bigint) is 'config_valor_emp com a empresa da sessão (mesma assinatura do PDV v2 §A).';
comment on function public.config_salvar(text, text, jsonb, bigint) is 'Grava no envelope {empresa, lojas}; só dono/admin; loja da própria empresa.';
