-- Teste da 1.1h parte 2: H1 (20261126001200/0210/0220, contração) e H2 (20261126001300, leitura protegida).
-- Semente: empresa 1 (JM de teste); dono a632…; admin …0201 (Administrador: tem estoque.ver_custo e auditoria.ver);
-- vendedor M1 …0101. Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; e text; v jsonb; n bigint; c bigint;
  DONO constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  ADM  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1   constant uuid := '0e5e0000-0000-4000-8000-000000000101';
begin
  -- H1. nada do formato antigo; ponte desligada; coluna de permissões fora; core_horario só da tabela nova
  r := r || jsonb_build_object('h1_formato_antigo', (select count(*) from configuracoes_sistema where chave ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' or chave in ('horario', 'horario_comercial')),
    'h1_ponte_ligada', (select tgenabled <> 'D' from pg_trigger where tgname = 'configuracoes_sistema_ponte'),
    'h1_coluna_permissoes', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'empresas' and column_name = 'permissoes'),
    -- sem linha na tabela nova vale o padrão fixo (o formato antigo não entra mais)
    'h1_horario_da_tabela', core_horario(1) = coalesce((select valor from empresa_config where empresa_id = 1 and filial_id is null and modulo = 'core' and chave = 'horario'),
                                                    core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}')));
  -- config_salvar grava só a tabela nova e devolve o envelope montado
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  v := config_salvar('distribuicao', 'sem_dono', '"roleta"'::jsonb, 6);
  r := r || jsonb_build_object('h1_salvar_envelope', v -> 'lojas' -> '6', 'h1_salvar_sem_linha_antiga',
    not exists (select 1 from configuracoes_sistema where empresa_id = 1 and chave = 'distribuicao.sem_dono'));

  -- H2. uma chave da precificação (marcada) e a Auditoria dela
  insert into empresa_config (empresa_id, filial_id, modulo, chave, valor) values (1, null, 'precificacao', 'margem_padrao', '30');
  perform auditar_emp(1, 'config', 'precificacao.margem_padrao', 'alterar', '{"valor": null}', '{"valor": 30}', null, 'teste', null);
  perform auditar_emp(1, 'config', 'core.horario', 'alterar', '{"valor": null}', '{"valor": 1}', null, 'teste', null);
  -- um cargo só com auditoria.ver (sem estoque.ver_custo) para o vendedor
  insert into empresa_cargos (empresa_id, nome, papel_base) values (1, 'Auditor teste', 'vendedor') returning id into c;
  insert into empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c, 1, 'auditoria.ver');
  update empresa_usuarios set cargo_id = c where empresa_id = 1 and usuario_id = M1;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from empresa_config where modulo = 'precificacao';
  r := r || jsonb_build_object('h2_vendedor_tabela', n, 'h2_vendedor_config_valor', config_valor('precificacao', 'margem_padrao'),
    'h2_vendedor_chave_comum', config_valor('distribuicao', 'sem_dono', 6),
    'h2_vendedor_auditoria', (select jsonb_agg(entidade_id order by entidade_id) from auditoria_eventos where origem = 'teste'));
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', ADM::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from empresa_config where modulo = 'precificacao';
  r := r || jsonb_build_object('h2_admin_tabela', n, 'h2_admin_config_valor', config_valor('precificacao', 'margem_padrao'),
    'h2_admin_auditoria', (select jsonb_agg(entidade_id order by entidade_id) from auditoria_eventos where origem = 'teste'));
  execute 'reset role';

  -- funções internas (jobs) continuam lendo
  r := r || jsonb_build_object('h2_interna', config_valor_emp(1, 'precificacao', 'margem_padrao'));
  raise exception 'RESULTADO_TESTE_CONFIG_H1_H2 %', r::text;
end $teste$;
