-- 1.1h parte 2: config_salvar não grava mais o envelope; t1 vira nulo e os itens 9a/9b provam que gravar o envelope
-- direto (sem linha antiga) não altera a tabela nova.
-- Teste da 20261125000400_empresa_config (etapa 1.1a): armazenamento definitivo, ponte nos dois sentidos e
-- auditoria. O comportamento das funções (respostas e códigos de erro) continua provado pelo
-- teste-config-provisoria.sql, que roda sem mudança sobre o corpo novo.
-- Bloco que termina com RAISE: tudo é desfeito; o resultado volta em RESULTADO_TESTE_EMPRESA_CONFIG {...}.
-- Empresa 1 = JM de teste (lojas 3 e 6; dono a632db2c…, vendedora f4ec6a87…). Empresa 5 = Demonstração (loja 1).
-- 1.1h parte 2 (26/11/2026): a H1 desligou a ponte envelope → empresa_config. Este teste carrega a configuração
-- pelo envelope antigo (atalho de carga dos dados); a ponte é ligada SÓ dentro da transação do teste (desfeita no fim).
alter table public.configuracoes_sistema enable trigger configuracoes_sistema_ponte;
do $teste$
declare
  r jsonb := '{}';
  e text;
  v jsonb;
  v_n int;
  v_dono1 constant text := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  v_vend1 constant text := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  v_dono5 constant text := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_aud0  bigint := (select coalesce(max(id), 0) from auditoria_eventos);
begin
  -- 1. config_salvar grava uma linha por empresa/loja, o envelope igual (ponte) e a auditoria
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1, 'role', 'authenticated')::text, true);
  perform config_salvar('core', 'teste_cfg', '10'::jsonb);
  v := config_salvar('core', 'teste_cfg', '"loja3"'::jsonb, 3);
  r := r || jsonb_build_object(
    't1_linhas', (select jsonb_agg(jsonb_build_object('filial', filial_id, 'valor', valor) order by filial_id nulls first)
                    from empresa_config where empresa_id = 1 and modulo = 'core' and chave = 'teste_cfg'),
    't1_envelope_tabela_antiga', (select valor - 'atualizado_em' - 'atualizado_por' from configuracoes_sistema where empresa_id = 1 and chave = 'core.teste_cfg'),
    't1_resposta', v - 'atualizado_em' - 'atualizado_por',
    't1_autor', (select atualizado_por::text from empresa_config where empresa_id = 1 and chave = 'teste_cfg' and filial_id is null),
    't1_auditoria', (select jsonb_agg(jsonb_build_object('id', entidade_id, 'antes', antes, 'depois', depois, 'filial', filial_id) order by id)
                       from auditoria_eventos where id > v_aud0 and entidade = 'config'));

  -- 2. mesmo valor de novo: grava, mas não audita (nada mudou)
  select count(*) into v_n from auditoria_eventos where id > v_aud0;
  perform config_salvar('core', 'teste_cfg', '10'::jsonb);
  r := r || jsonb_build_object('t2_sem_auditoria_repetida', v_n = (select count(*) from auditoria_eventos where id > v_aud0));

  -- 3. tirar o valor da loja (null) apaga a linha da loja e audita
  perform config_salvar('core', 'teste_cfg', null, 3);
  r := r || jsonb_build_object(
    't3_linha_da_loja', (select count(*) from empresa_config where empresa_id = 1 and chave = 'teste_cfg' and filial_id = 3),
    't3_le_empresa', config_valor('core', 'teste_cfg', 3),
    't3_auditoria_depois_nulo', (select depois from auditoria_eventos where id > v_aud0 and entidade_id = 'core.teste_cfg@3' order by id desc limit 1));

  -- 4. PONTE envelope → tabela: quem grava o envelope direto (teste, script de operação) é lido pelas funções
  insert into configuracoes_sistema (empresa_id, chave, valor)
  values (5, 'posvenda.teto_diario', '{"empresa": 12, "lojas": {"1": 4, "999": 7}}')
  on conflict (empresa_id, chave) do update set valor = excluded.valor;
  r := r || jsonb_build_object(
    't4_insert_empresa', config_valor_emp(5, 'posvenda', 'teto_diario'),
    't4_insert_loja', config_valor_emp(5, 'posvenda', 'teto_diario', 1),
    't4_loja_inexistente_ignorada', (select count(*) from empresa_config where empresa_id = 5 and chave = 'teto_diario' and filial_id = 999));
  update configuracoes_sistema set valor = '{"empresa": 20, "lojas": {}}' where empresa_id = 5 and chave = 'posvenda.teto_diario';
  r := r || jsonb_build_object('t4_update_empresa', config_valor_emp(5, 'posvenda', 'teto_diario'),
    't4_update_loja_cai_na_empresa', config_valor_emp(5, 'posvenda', 'teto_diario', 1));
  delete from configuracoes_sistema where empresa_id = 5 and chave = 'posvenda.teto_diario';
  r := r || jsonb_build_object('t4_delete', coalesce(config_valor_emp(5, 'posvenda', 'teto_diario'), 'null'::jsonb),
    't4_delete_linhas', (select count(*) from empresa_config where empresa_id = 5 and chave = 'teto_diario'));

  -- 5. a ponte não toca chave antiga (sem ponto) nem a de roleta
  select count(*) into v_n from empresa_config;
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'teste_sem_ponto', '{"empresa": 1}');
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'roleta_leads:99', '{"ultimo_usuario_id": null}');
  r := r || jsonb_build_object('t5_chaves_antigas_fora', v_n = (select count(*) from empresa_config));

  -- 6. a gravação de config_salvar não é refeita pela ponte (sem duplicar, sem perder o autor)
  perform config_salvar('core', 'teste_cfg', '11'::jsonb);
  r := r || jsonb_build_object('t6_uma_linha_empresa',
    (select count(*) from empresa_config where empresa_id = 1 and chave = 'teste_cfg' and filial_id is null),
    't6_autor_mantido', (select atualizado_por::text from empresa_config where empresa_id = 1 and chave = 'teste_cfg' and filial_id is null));

  -- 7. RLS e privilégios: a vendedora lê a configuração da própria empresa; ninguém da API grava direto
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vend1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object(
    't7_vendedora_le_jm', (select count(*) > 0 from empresa_config where empresa_id = 1),
    't7_vendedora_le_demo', (select count(*) from empresa_config where empresa_id = 5));
  begin
    insert into empresa_config (empresa_id, modulo, chave, valor) values (1, 'core', 'invasao', '1'); e := 'inseriu';
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t7_insert_direto', e);
  begin
    update empresa_config set valor = '999' where empresa_id = 1; e := 'tentou';
  exception when others then e := sqlstate; end;
  r := r || jsonb_build_object('t7_update_direto', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t7_dono5_le_jm', (select count(*) from empresa_config where empresa_id = 1));
  execute 'reset role';

  -- 8. a migração copiou tudo: para toda chave '<modulo>.<chave>' do envelope, mesmo valor nas duas formas
  r := r || jsonb_build_object('t8_envelope_igual_tabela', not exists (
    select 1
      from configuracoes_sistema c
     where c.chave ~ '^[a-z][a-z0-9_]{0,62}\.[a-z][a-z0-9_]{0,62}$'
       and nullif(c.valor -> 'empresa', 'null'::jsonb) is distinct from
           config_valor_emp(c.empresa_id, split_part(c.chave, '.', 1), substr(c.chave, length(split_part(c.chave, '.', 1)) + 2))));

  -- 9. LAÇO DA SINCRONIZAÇÃO (pedido do Lucas, 25/11): gravar no formato antigo e na tabela nova não
  --    dispara cadeia. Por construção há um gatilho só (configuracoes_sistema → empresa_config) e nenhum no
  --    sentido inverso; o caminho tabela nova → envelope é só o config_salvar, marcado para a ponte não refazer.
  --    Com teto de tempo e de profundidade: uma cadeia estouraria um dos dois.
  perform set_config('statement_timeout', '3s', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object(
    't9_gatilhos_em_empresa_config', (select count(*) from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                                        where t.tgrelid = 'public.empresa_config'::regclass and not t.tgisinternal
                                          and f.prosrc ilike '%configuracoes_sistema%'),
    't9_gatilhos_ponte', (select count(*) from pg_trigger where tgrelid = 'public.configuracoes_sistema'::regclass and not tgisinternal
                                                         and tgname = 'configuracoes_sistema_ponte'),
    't9_ponte_nao_grava_envelope', position('configuracoes_sistema' in
        regexp_replace((select prosrc from pg_proc where proname = 'empresa_config_do_envelope'), 'from public\.configuracoes_sistema', '', 'g')) = 0);
  -- 9a. sequência mista na mesma transação: salvar (tabela nova + envelope), gravar o envelope direto, salvar de novo
  perform config_salvar('core', 'teste_laco', '1'::jsonb);
  update configuracoes_sistema set valor = '{"empresa": 2, "lojas": {"3": 5}}' where empresa_id = 1 and chave = 'core.teste_laco';
  r := r || jsonb_build_object('t9a_envelope_direto_depois_do_salvar',
    jsonb_build_array(config_valor_emp(1, 'core', 'teste_laco'), config_valor_emp(1, 'core', 'teste_laco', 3)),
    't9a_marca_limpa_depois_do_salvar', coalesce(current_setting('nexus.config_salvando', true), '') = '');
  v := config_salvar('core', 'teste_laco', '3'::jsonb);
  r := r || jsonb_build_object('t9a_salvar_de_novo', v - 'atualizado_em' - 'atualizado_por',
    't9a_linhas', (select count(*) from empresa_config where empresa_id = 1 and chave = 'teste_laco'));
  -- 9b. 200 gravações alternadas: terminam dentro do teto, com uma linha de empresa e o mesmo valor nas duas formas
  for v_n in 1..100 loop
    perform config_salvar('core', 'teste_laco', to_jsonb(v_n));
    update configuracoes_sistema set valor = jsonb_build_object('empresa', v_n + 1000, 'lojas', '{}'::jsonb)
     where empresa_id = 1 and chave = 'core.teste_laco';
  end loop;
  r := r || jsonb_build_object('t9b_final_tabela', config_valor_emp(1, 'core', 'teste_laco'),
    't9b_final_envelope', (select valor -> 'empresa' from configuracoes_sistema where empresa_id = 1 and chave = 'core.teste_laco'),
    't9b_uma_linha', (select count(*) from empresa_config where empresa_id = 1 and chave = 'teste_laco'));
  -- 9c. gravação direta na tabela nova (só o service_role pode; ninguém faz hoje) não volta para o envelope
  insert into empresa_config (empresa_id, modulo, chave, valor) values (1, 'core', 'teste_so_tabela', '7');
  r := r || jsonb_build_object('t9c_sem_envelope', not exists (select 1 from configuracoes_sistema where empresa_id = 1 and chave = 'core.teste_so_tabela'));
  perform set_config('statement_timeout', '0', true);

  raise exception 'RESULTADO_TESTE_EMPRESA_CONFIG %', r::text;
end $teste$;
