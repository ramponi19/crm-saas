-- Teste da 20261126000100_auditoria_plataforma_servico. JM de teste (empresa 1); superadmin local …0901 (semente).
-- Simula o PostgREST: request.jwt.claims (papel) e request.headers (o cabeçalho x-nexus-usuario que o app manda).
-- Termina com RAISE: nada fica gravado.
do $t$
declare
  r jsonb := '{}';
  SUPER uuid := '0e5e0000-0000-4000-8000-000000000901';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  n0 bigint;
begin
  -- o superadmin entra na empresa 1 (mesma RPC do app)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', SUPER::text, 'role', 'authenticated')::text, true);
  perform set_impersonation(1);

  select count(*) into n0 from auditoria_eventos where impersonado_por = SUPER and acao like 'plataforma\_%' and acao not in ('plataforma_entrou', 'plataforma_acessou', 'plataforma_saiu');

  -- 1. rota com chave de serviço + cabeçalho do superadmin: audita, sem valores, origem 'gatilho servico'
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', jsonb_build_object('x-nexus-usuario', SUPER::text)::text, true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('1_servico_com_superadmin', (
    select jsonb_build_object('acao', acao, 'tabela', split_part(entidade_id, ':', 1), 'depois', depois, 'origem', origem,
                              'empresa', empresa_id, 'usuario_e_plataforma', usuario_id = SUPER and impersonado_por = SUPER)
      from auditoria_eventos where impersonado_por = SUPER and acao = 'plataforma_update' order by id desc limit 1));

  -- 2. empresas (gatilho novo): a linha não tem empresa_id, vale a empresa impersonada
  update empresas set nome = nome where id = 1;   -- nenhum campo muda: ainda é uma escrita da plataforma
  update empresas set cidade = coalesce(cidade, '') || ' ' where id = 1;
  r := r || jsonb_build_object('2_empresas', (
    select jsonb_build_object('entidade', entidade_id, 'empresa', empresa_id, 'tem_cidade', depois -> 'campos' ? 'cidade',
                              'so_nomes_de_campos', (select bool_and(jsonb_typeof(c) = 'string') from jsonb_array_elements(depois -> 'campos') c)
                                                    and depois - 'campos' = '{}'::jsonb)
      from auditoria_eventos where impersonado_por = SUPER and entidade_id = 'empresas:1' order by id desc limit 1));

  -- 2b. usuarios (gatilho da 0200): a linha de outra pessoa vai, só com o nome do campo; a própria linha do superadmin não
  update usuarios set nome = nome || ' ' where id = M1;
  update usuarios set filial_atual_id = 3 where id = SUPER;
  r := r || jsonb_build_object('2b_usuarios', jsonb_build_object(
    'outra_pessoa', (select depois from auditoria_eventos where impersonado_por = SUPER and entidade_id = 'usuarios:' || M1::text order by id desc limit 1),
    'propria_linha', (select count(*) from auditoria_eventos where entidade_id = 'usuarios:' || SUPER::text)));

  -- 3. cabeçalho com quem NÃO é superadmin (Administrador A): nenhuma linha
  select count(*) into n0 from auditoria_eventos where acao like 'plataforma\_%';
  perform set_config('request.headers', jsonb_build_object('x-nexus-usuario', A::text)::text, true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('3_nao_superadmin', (select count(*) from auditoria_eventos where acao like 'plataforma\_%') - n0);

  -- 4. o mesmo cabeçalho vindo de authenticated (navegador) é ignorado: vale só o auth.uid() (Administrador A)
  select count(*) into n0 from auditoria_eventos where acao like 'plataforma\_%';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A::text, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', jsonb_build_object('x-nexus-usuario', SUPER::text)::text, true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('4_cabecalho_de_navegador_ignorado', (select count(*) from auditoria_eventos where acao like 'plataforma\_%') - n0);

  -- 5. service_role sem cabeçalho (rotinas, webhooks): nenhuma linha
  select count(*) into n0 from auditoria_eventos where acao like 'plataforma\_%';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', '{}', true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('5_servico_sem_cabecalho', (select count(*) from auditoria_eventos where acao like 'plataforma\_%') - n0);

  -- 6. cabeçalho malformado: não audita e não derruba a escrita
  select count(*) into n0 from auditoria_eventos where acao like 'plataforma\_%';
  perform set_config('request.headers', '{"x-nexus-usuario":"nao-e-uuid"}', true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('6_malformado', jsonb_build_object('linhas', (select count(*) from auditoria_eventos where acao like 'plataforma\_%') - n0, 'gravou', found));

  -- 7. superadmin com a impersonação vencida: nenhuma linha (só o próprio superadmin mexe nessa coluna: trava de escalonamento)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', SUPER::text, 'role', 'authenticated')::text, true);
  update usuarios set impersonando_expires_at = now() - interval '1 minute' where id = SUPER;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select count(*) into n0 from auditoria_eventos where acao like 'plataforma\_%';
  perform set_config('request.headers', jsonb_build_object('x-nexus-usuario', SUPER::text)::text, true);
  update empresa_usuarios set participa_roleta = not participa_roleta where empresa_id = 1 and usuario_id = M1;
  r := r || jsonb_build_object('7_impersonacao_vencida', (select count(*) from auditoria_eventos where acao like 'plataforma\_%') - n0);

  -- 8. sessão direta do superadmin (como já era): continua auditando, origem 'gatilho'
  perform set_config('request.jwt.claims', jsonb_build_object('sub', SUPER::text, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  update usuarios set impersonando_expires_at = now() + interval '1 hour' where id = SUPER;
  update contatos set nome = nome where id = (select min(id) from contatos where empresa_id = 1);
  r := r || jsonb_build_object('8_sessao_direta', (
    select origem from auditoria_eventos where impersonado_por = SUPER and entidade_id like 'contatos:%' order by id desc limit 1));

  raise exception 'RESULTADO_TESTE_AUDITORIA_PLATAFORMA_SERVICO %', r::text;
end $t$;
