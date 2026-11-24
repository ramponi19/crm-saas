-- RÉGUAS DE PÓS-VENDA DA JM (empresa 1) — DADO DE CONFIGURAÇÃO DA JM, NÃO CÓDIGO DO NEXUS.
-- Roteiros da proposta revisão 2 (docs/pos-venda-modelos-proposta-jm.md). Só rodar com o OK do Lucas, DEPOIS de instalar
-- o Pós-venda na JM. Grava as duas réguas DESATIVADAS (v_ativar = false); ligar é decisão à parte (Configurações › Pós-venda).
-- Idempotente: régua com o mesmo nome já existente não é recriada. Nada é apagado.
-- Modelos da Meta: liga ao passo o modelo de mesmo nome se já existir APROVADO na JM (jm_pos_*); senão o passo fica sem
-- modelo (a tela mostra o aviso) e o modelo é escolhido depois, quando a Meta aprovar.
-- Categorias pelo nome (sem id fixo): "iPhone" = a categoria da JM cujo nome contém "iphone".
-- Variáveis do roteiro: {{nome}} = primeiro nome, {{produto}} = produto comprado (o mesmo que {{1}}/{{2}} dos modelos).
-- Rodar como service (SQL editor / MCP). Uso em simulação: copiar o bloco com v_ativar = true DENTRO de uma transação desfeita.
do $jm$
declare
  E constant bigint := 1;
  v_ativar constant boolean := false;
  v_iphone bigint; v_ip bigint; v_ge bigint;
begin
  if not exists (select 1 from empresa_modulos where empresa_id = E and modulo = 'posvenda') then
    raise exception 'O Pós-venda não está instalado na JM: instale antes (ok do Lucas).';
  end if;
  select id into v_iphone from estoque_categorias where empresa_id = E and ativo and nome ilike '%iphone%' order by id limit 1;
  if v_iphone is null then raise exception 'Categoria iPhone não encontrada na JM.'; end if;

  -- Régua do iPhone ─────────────────────────────────────────────────────────────────────────────
  if not exists (select 1 from posvenda_cadencias where empresa_id = E and nome = 'iPhone') then
    insert into posvenda_cadencias (empresa_id, nome, ativo, prioridade, filtros, ao_recomprar)
    values (E, 'iPhone', v_ativar, 100, jsonb_build_object('categorias', jsonb_build_array(v_iphone)), 'reiniciar')
    returning id into v_ip;
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, grupo, filtros, roteiro, modelo_id) values
      (E, v_ip, 1, 1, 'whatsapp', 'Tudo certo com a compra', 'relacionamento', '{}',
       'Oi, {{nome}}! Aqui é da JM Store. Está tudo certo com o seu {{produto}}? Se precisar de ajuda para configurar ou passar os dados do aparelho antigo, é só responder esta mensagem.',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_entrega' and status = 'aprovado' limit 1)),
      (E, v_ip, 2, 7, 'pesquisa', 'Experiência (nota)', 'relacionamento', '{}',
       'Oi, {{nome}}! Já faz uma semana com o seu {{produto}}. De 0 a 10, quanto você recomendaria a JM Store para um amigo? Responda só com o número.',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_experiencia' and status = 'aprovado' limit 1)),
      (E, v_ip, 3, 30, 'whatsapp', 'Acessórios', 'relacionamento', '{}',
       'Oi, {{nome}}! Um mês com o {{produto}}. Para proteger o aparelho, temos capas, películas e carregadores na JM Store. Quer ver as opções?',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_acessorios' and status = 'aprovado' limit 1)),
      (E, v_ip, 4, 90, 'whatsapp', 'Bateria (usado)', 'produto', '{"condicao":"usado"}',
       'Oi, {{nome}}! Passando para saber da bateria do seu {{produto}}. Em Ajustes › Bateria você vê a saúde da bateria. Se notar algo diferente, responda esta mensagem que a gente orienta.',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_bateria' and status = 'aprovado' limit 1)),
      (E, v_ip, 5, 330, 'whatsapp', 'Troca', 'produto', '{}',
       'Oi, {{nome}}! Já faz quase um ano com o seu {{produto}}. Se pensa em trocar de aparelho, a JM Store avalia o seu atual como parte do pagamento. Quer saber quanto ele vale?',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_troca' and status = 'aprovado' limit 1));
  end if;

  -- Régua geral (toda venda sem régua da categoria: iPad, Mac, Watch, acessórios, perfumes, outros) ──────────
  -- Decisão em aberto no relatório: a troca do D+330 também alcança acessórios e perfumes.
  if not exists (select 1 from posvenda_cadencias where empresa_id = E and nome = 'Geral') then
    insert into posvenda_cadencias (empresa_id, nome, ativo, prioridade, filtros, ao_recomprar)
    values (E, 'Geral', v_ativar, 0, '{}', 'reiniciar')
    returning id into v_ge;
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, grupo, filtros, roteiro, modelo_id) values
      (E, v_ge, 1, 7, 'pesquisa', 'Experiência (nota)', 'relacionamento', '{}',
       'Oi, {{nome}}! Já faz uma semana com o seu {{produto}}. De 0 a 10, quanto você recomendaria a JM Store para um amigo? Responda só com o número.',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_experiencia' and status = 'aprovado' limit 1)),
      (E, v_ge, 2, 330, 'whatsapp', 'Troca', 'produto', '{}',
       'Oi, {{nome}}! Já faz quase um ano com o seu {{produto}}. Se pensa em trocar, a JM Store avalia o seu atual como parte do pagamento. Quer saber quanto ele vale?',
       (select id from modelos_mensagem where empresa_id = E and nome = 'jm_pos_troca' and status = 'aprovado' limit 1));
  end if;

  raise notice 'Réguas da JM: iPhone %, Geral % (ativas: %)', v_ip, v_ge, v_ativar;
end $jm$;
