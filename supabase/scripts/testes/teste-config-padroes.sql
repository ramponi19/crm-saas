-- Teste da 20261126000700_config_padroes_semente (1.1i): a empresa nova nasce com a configuração completa; instalar o
-- pós-venda grava os parâmetros dele; os valores gravados são OS MESMOS que as funções aplicavam quando a empresa não
-- tinha nada; empresas antigas (1 e 5 da semente) não mudam; reinstalar não duplica nem sobrescreve.
-- Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; e_nova bigint; f_nova bigint; antes_jm bigint; antes_demo bigint; n int;
  semeado jsonb; padrao_horario jsonb; padrao_sem_dono text; padrao_lib jsonb;
begin
  -- a semente marca a sessão como "empresas antigas"; aqui o teste age como a produção
  perform set_config('nexus.semente_legado', '', true);
  select count(*) into antes_jm from empresa_config where empresa_id = 1;
  select count(*) into antes_demo from empresa_config where empresa_id = 5;

  -- 1. empresa nova (como o cadastro: empresa e depois a loja)
  insert into empresas (nome, slug) values ('Empresa padrão teste', 'padrao-teste-' || txid_current()) returning id into e_nova;
  insert into filiais (empresa_id, nome, matriz) values (e_nova, 'Matriz', true) returning id into f_nova;
  select jsonb_object_agg(modulo || '.' || chave, valor) into semeado from empresa_config where empresa_id = e_nova and filial_id is null;
  r := r || jsonb_build_object('1_chaves_ao_nascer', (select jsonb_agg(k order by k) from jsonb_object_keys(semeado) k),
                               '1_sem_posvenda', not exists (select 1 from empresa_config where empresa_id = e_nova and modulo = 'posvenda'),
                               '1_iguais_ao_catalogo', not exists (select 1 from config_padroes() d where d.modulo_requerido is null
                                   and (semeado -> (d.modulo || '.' || d.chave)) is distinct from d.valor));

  -- 2. os valores semeados = o que as funções davam SEM configuração (apaga as linhas e recalcula pelo caminho antigo)
  delete from empresa_config where empresa_id = e_nova;
  padrao_horario := core_horario(e_nova, f_nova);
  padrao_sem_dono := core_sem_dono_modo(e_nova, f_nova);
  padrao_lib := core_liberar_lote_esteira(e_nova);
  r := r || jsonb_build_object('2_horario_igual', semeado -> 'core.horario' = padrao_horario,
                               '2_sem_dono_igual', semeado ->> 'distribuicao.sem_dono' = padrao_sem_dono,
                               '2_sem_ofertas_confirmacao_igual', semeado -> 'core.sem_ofertas' ->> 'confirmacao' = core_sem_ofertas_confirmacao_padrao(),
                               '2_liberacao_sem_config', padrao_lib -> f_nova::text ->> 'pulado');
  -- com o padrão gravado, a liberação continua "desligado" (mesmo resultado)
  perform config_semear(e_nova, null);
  r := r || jsonb_build_object('2_liberacao_com_padrao_igual', core_liberar_lote_esteira(e_nova) = padrao_lib,
                               '2_horario_com_padrao_igual', core_horario(e_nova, f_nova) = padrao_horario);

  -- 3. instalar o pós-venda grava os parâmetros dele; reinstalar não duplica nem sobrescreve o que a empresa mudou
  insert into empresa_modulos (empresa_id, modulo, ativo) values (e_nova, 'posvenda', true);
  r := r || jsonb_build_object('3_posvenda', (select jsonb_object_agg(chave, valor) from empresa_config where empresa_id = e_nova and modulo = 'posvenda'));
  update empresa_config set valor = '45' where empresa_id = e_nova and modulo = 'posvenda' and chave = 'teto_diario';
  update empresa_modulos set ativo = false where empresa_id = e_nova and modulo = 'posvenda';
  update empresa_modulos set ativo = true where empresa_id = e_nova and modulo = 'posvenda';
  select count(*) into n from empresa_config where empresa_id = e_nova;
  r := r || jsonb_build_object('3_reinstalar', jsonb_build_array(n, (select valor from empresa_config where empresa_id = e_nova and modulo = 'posvenda' and chave = 'teto_diario')),
                               '3_semear_de_novo', config_semear(e_nova, null));

  -- 4. empresas antigas não mudam; a marca da semente desliga a semente
  r := r || jsonb_build_object('4_jm_igual', (select count(*) from empresa_config where empresa_id = 1) = antes_jm,
                               '4_demo_igual', (select count(*) from empresa_config where empresa_id = 5) = antes_demo);
  perform set_config('nexus.semente_legado', '1', true);
  r := r || jsonb_build_object('4_marca_legado', config_semear(e_nova + 0, null));
  raise exception 'RESULTADO_TESTE_CONFIG_PADROES %', r::text;
end $teste$;
