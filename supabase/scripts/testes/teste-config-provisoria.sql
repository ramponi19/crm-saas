-- Teste da M2 (config_valor_emp / config_valor / config_salvar). Roda em produção SEM deixar rastro:
-- tudo num bloco que termina com RAISE (a transação inteira é desfeita) e devolve o resultado na mensagem.
-- Antes da migração aplicada: rodar o corpo de 20261123000500_config_provisoria.sql na MESMA chamada, antes deste.
-- Empresa 5 = Nexus Demonstração (dono f47a8e4f…, loja 1). Empresa 1 = JM (loja 3; vendedora f4ec6a87…).
-- 1.1h parte 2 (26/11/2026): a H1 desligou a ponte envelope → empresa_config. Este teste carrega a configuração
-- pelo envelope antigo (atalho de carga dos dados); a ponte é ligada SÓ dentro da transação do teste (desfeita no fim).
alter table public.configuracoes_sistema enable trigger configuracoes_sistema_ponte;
do $teste$
declare
  r jsonb := '{}';
  e text;
  v jsonb;
  v_dono5 constant text := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_vend1 constant text := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  antigas_antes int := (select count(*) from configuracoes_sistema where position('.' in chave) = 0);
begin
  -- sessão: dono da empresa 5
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono5, 'role', 'authenticated')::text, true);

  -- 1. valor da empresa e da loja; leitura loja → empresa → null
  v := config_salvar('core', 'teste_m2', '5'::jsonb);
  r := r || jsonb_build_object('t1_envelope_empresa', v - 'atualizado_em');
  v := config_salvar('core', 'teste_m2', '7'::jsonb, 1);
  r := r || jsonb_build_object('t2_envelope_com_loja', v - 'atualizado_em',
    't2_loja1', config_valor_emp(5, 'core', 'teste_m2', 1),
    't2_sem_loja', config_valor_emp(5, 'core', 'teste_m2', null),
    't2_loja_sem_valor_cai_na_empresa', config_valor_emp(5, 'core', 'teste_m2', 999),
    't2_pela_sessao_loja1', config_valor('core', 'teste_m2', 1),
    't2_pela_sessao_empresa', config_valor('core', 'teste_m2'));

  -- 3. objeto como valor (o caso do responsável por loja) e chave inexistente
  v := config_salvar('posvenda', 'responsavel_padrao', to_jsonb(v_dono5), 1);
  r := r || jsonb_build_object('t3_responsavel_loja1', config_valor('posvenda', 'responsavel_padrao', 1),
    't3_responsavel_empresa_vazio', config_valor('posvenda', 'responsavel_padrao'),
    't3_chave_inexistente', config_valor('posvenda', 'nao_existe', 1),
    't3_linha_gravada', (select modulo || '.' || chave from empresa_config where empresa_id = 5 and modulo = 'posvenda' and chave = 'responsavel_padrao' limit 1));  -- 1.1h: só a tabela nova

  -- 4. tirar o valor da loja (null) volta a valer o da empresa
  v := config_salvar('core', 'teste_m2', null, 1);
  r := r || jsonb_build_object('t4_lojas_depois', v -> 'lojas', 't4_loja1_agora', config_valor('core', 'teste_m2', 1));

  -- 5. empresa = null apaga o valor da empresa
  v := config_salvar('core', 'teste_m2', null);
  r := r || jsonb_build_object('t5_sem_valor', config_valor('core', 'teste_m2', 1) is null);

  -- 6. recusas
  begin perform config_salvar('core', 'teste_m2', '1'::jsonb, 3); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6_loja_de_outra_empresa', e);
  begin perform config_salvar('Pos-Venda', 'x', '1'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6_modulo_invalido', e);
  begin perform config_salvar('core', 'x y', '1'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6_chave_invalida', e);
  begin perform config_salvar('core', '', '1'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6_chave_vazia', e);

  -- 6b. nome com cara de segredo é recusado
  begin perform config_salvar('integracao', 'api_key', '"x"'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6b_api_key', e);
  begin perform config_salvar('meta', 'token_acesso', '"x"'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6b_token', e);
  begin perform config_salvar('core', 'senha_wifi', '"x"'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t6b_senha', e);

  -- 7. módulo desligado: grava mesmo assim (D9: configurar antes de ligar). Empresa 5 não tem posvenda.
  r := r || jsonb_build_object('t7_posvenda_desligado_na_5', not core_modulo_ligado(5, 'posvenda'),
    't7_gravou_mesmo_assim', config_valor('posvenda', 'responsavel_padrao', 1) is not null);

  -- 8. isolamento: a JM com a mesma chave; o dono da 5 não enxerga o valor da JM
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'core.teste_m2', '{"empresa": 99, "lojas": {}}');
  r := r || jsonb_build_object('t8_dono5_le_a_dele', coalesce(config_valor('core', 'teste_m2'), 'null'::jsonb),
    't8_jm_pela_emp', config_valor_emp(1, 'core', 'teste_m2'));

  -- 9. vendedora da JM: lê, mas não grava
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vend1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t9_vendedora_le', config_valor('core', 'teste_m2'));
  begin perform config_salvar('core', 'teste_m2', '1'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t9_vendedora_grava', e);

  -- 9b. chaves antigas da tabela NÃO são lidas por config_valor/config_valor_emp, de nenhum jeito.
  --     A JM tem horario_comercial, roleta_leads:3 etc.; a vendedora (sessão JM) tenta montar o nome.
  r := r || jsonb_build_object(
    't9b_jm_tem_chaves_antigas', (select count(*) from configuracoes_sistema where empresa_id = 1 and position('.' in chave) = 0),
    't9b_horario_comercial', jsonb_build_array(config_valor('horario', 'comercial'), config_valor('horario_comercial', ''),
                                               config_valor('', 'horario_comercial'), config_valor_emp(1, 'horario_comercial', ''),
                                               config_valor_emp(1, 'horario_comercial', null)),
    't9b_roleta', jsonb_build_array(config_valor('roleta_leads', '3'), config_valor('roleta_leads:3', 'x'), config_valor_emp(1, 'roleta_leads:3', '')),
    't9b_sla', jsonb_build_array(config_valor('sla', 'atendimento'), config_valor('sla_atendimento', 'x')),
    't9b_curinga', jsonb_build_array(config_valor('%', '%'), config_valor('horario_comercial''--', 'x')));

  -- 10. sem sessão: lê nulo, não grava
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('t10_sem_sessao_le', config_valor('core', 'teste_m2'));
  begin perform config_salvar('core', 'teste_m2', '1'::jsonb); e := 'gravou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t10_sem_sessao_grava', e);

  -- 11. permissões das funções
  r := r || jsonb_build_object(
    't11_emp_authenticated', has_function_privilege('authenticated', 'public.config_valor_emp(bigint,text,text,bigint)', 'execute'),
    't11_emp_anon', has_function_privilege('anon', 'public.config_valor_emp(bigint,text,text,bigint)', 'execute'),
    't11_valor_authenticated', has_function_privilege('authenticated', 'public.config_valor(text,text,bigint)', 'execute'),
    't11_valor_anon', has_function_privilege('anon', 'public.config_valor(text,text,bigint)', 'execute'),
    't11_salvar_authenticated', has_function_privilege('authenticated', 'public.config_salvar(text,text,jsonb,bigint)', 'execute'),
    't11_salvar_anon', has_function_privilege('anon', 'public.config_salvar(text,text,jsonb,bigint)', 'execute'));

  -- 12. as chaves antigas (sem ponto) não mudaram
  r := r || jsonb_build_object('t12_chaves_antigas_iguais', antigas_antes = (select count(*) from configuracoes_sistema where position('.' in chave) = 0));

  raise exception 'RESULTADO_TESTE_M2 %', r::text;
end $teste$;
