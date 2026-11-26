-- EMPRESA DE DEMONSTRAÇÃO (19/11/2026, pedido do Lucas para apresentar o Nexus): dados FICTÍCIOS e genéricos
-- na empresa `__preview__` (demo = true, fora das métricas). Nenhum dado da JM: nomes, telefones, produtos e
-- conversas inventados aqui. Idempotente: apaga a demonstração anterior da Preview e monta de novo.
--
-- Pré-requisito: o preset "geral" aplicado na Preview (superadmin → Presets → Prever "CRM geral"): funil
-- Novo / Em contato / Negociando / Convertido / Perdido, motivos de perda e campos do core.
-- O público e a automação são criados pela tela (formato que o app grava), DEPOIS deste script — senão a
-- automação "entrou na etapa" dispararia com os negócios daqui.
--
-- Telefones na faixa 55 11 90000-xxxx e canais de demonstração sem token, via "pagina" (fora da renovação de token do Instagram) e external_id "demo-…": nada sai daqui
-- para a Meta. Rodar com o service role (execute_sql); não roda em empresa que não seja a Preview.
-- As empresas daqui imitam as da produção, nascidas ANTES da 1.1i: sem os padrões de configuração gravados
-- (config_semear respeita esta marca; ver 20261126000700_config_padroes_semente).
set nexus.semente_legado = '1';
do $$
declare
  v_emp bigint;
  v_filial bigint;
  v_funil bigint;
  e_novo bigint; e_contato bigint; e_neg bigint; e_ganho bigint; e_perdido bigint;
  v_wa bigint; v_ig bigint;
  t_vip bigint; t_retorno bigint; t_indicacao bigint; t_orcamento bigint; t_atacado bigint;
  v_contato bigint; v_negocio bigint; v_conversa bigint; v_canal bigint;
  i int; j int; v_etapa bigint; v_status text; v_criado timestamptz; v_valor numeric; v_origem text;
  v_msgs jsonb; v_m jsonb; v_t timestamptz; v_ult timestamptz; v_motivo bigint;
  nomes text[] := array['Ana Beatriz Moura','Bruno Carvalho','Camila Duarte','Diego Fernandes','Eduarda Lima','Felipe Araújo',
    'Gabriela Nunes','Henrique Barros','Isabela Castro','João Pedro Ramos','Larissa Melo','Lucas Teixeira','Mariana Rocha',
    'Matheus Pinto','Natália Freitas','Otávio Cardoso','Paula Mendes','Rafael Correia','Sabrina Lopes','Thiago Martins',
    'Vanessa Ribeiro','Vinícius Gomes','Yasmin Batista','Arthur Monteiro','Beatriz Farias','Caio Rezende','Daniela Prado',
    'Eduardo Vieira','Fernanda Queiroz','Gustavo Peixoto','Helena Sampaio','Igor Tavares','Júlia Campos','Leonardo Assis',
    'Manuela Siqueira','Renata Dias'];
  produtos text[] := array['Sofá retrátil 3 lugares','Smart TV 55"','Geladeira frost free 450 L','Notebook 15"',
    'Ar-condicionado 12.000 BTUs','Colchão queen','Máquina de lavar 12 kg','Conjunto de jantar 6 cadeiras',
    'Cafeteira expresso','Guarda-roupa 6 portas','Fogão 5 bocas','Kit home office'];
  precos numeric[] := array[3490, 3999, 4290, 4590, 2890, 2690, 3190, 2490, 1290, 2190, 1890, 1590];
  conversas jsonb := '[
    [["r","Oi, boa tarde! Vi o anúncio e queria saber o preço"],["e","Boa tarde! Tudo bem? Esse modelo está saindo por R$ 3.490 à vista ou em até 10x"],["r","Tem pronta entrega?"],["e","Tem sim, entregamos em até 3 dias úteis na região"],["r","Perfeito, vou ver com meu marido e te falo"]],
    [["r","Olá, vocês fazem entrega em outra cidade?"],["e","Olá! Fazemos para toda a região, o frete é calculado pelo CEP. Pode me passar o seu?"],["r","13840-000"],["e","Para esse CEP o frete fica R$ 90 e chega em 4 dias úteis"]],
    [["r","Bom dia, ainda tem aquela promoção?"],["e","Bom dia! Tem sim, vai até sábado"],["r","Consigo parcelar em 12x?"],["e","Consegue sim, sem juros no cartão"],["r","Então quero fechar"],["e","Ótimo! Vou te mandar o link de pagamento"]],
    [["r","Qual a garantia?"],["e","12 meses de fábrica e mais 12 de garantia estendida, se quiser"],["r","Quanto fica a estendida?"],["e","R$ 249, dá para colocar no mesmo parcelamento"]],
    [["e","Oi! Passando para lembrar do orçamento que te enviei ontem. Alguma dúvida?"],["r","Oi! Achei um pouco acima do que eu esperava"],["e","Entendo. À vista consigo 8% de desconto, fica R$ 3.210"],["r","Aí ficou bom, vou pensar até amanhã"]],
    [["r","Vocês têm em outra cor?"],["e","Temos em cinza e em bege. Te mando as fotos"],["r","O cinza ficou lindo"],["e","Também acho! Quer que eu reserve para você?"],["r","Pode reservar"]],
    [["r","Boa noite, vocês abrem amanhã?"],["e","Bom dia! Abrimos das 9h às 18h, sábado até as 13h"],["r","Vou passar aí de manhã"]],
    [["r","Recebi o produto, tudo certo! Obrigada"],["e","Que bom! Qualquer coisa estamos aqui. Pode nos avaliar no Google?"],["r","Claro, já avaliei"]],
    [["r","Quero trocar a voltagem, comprei errado"],["e","Sem problema, a troca é em até 7 dias. Traz na loja com a nota que trocamos na hora"],["r","Amanhã eu levo"]],
    [["r","Tem cupom para primeira compra?"],["e","Tem sim: 5% com o cupom BEMVINDO no site ou aqui pelo WhatsApp"],["r","Vou usar, obrigado"]]
  ]'::jsonb;
begin
  -- ── Só a Preview ───────────────────────────────────────────────────────────
  select id into v_emp from empresas where slug = '__preview__' and demo;
  if v_emp is null then raise exception 'demonstração: empresa __preview__ (demo) não encontrada — nada feito'; end if;
  select id into v_funil from funis where empresa_id = v_emp and padrao and not interno order by id limit 1;
  if v_funil is null then raise exception 'demonstração: aplique antes o preset "geral" na Preview (funil padrão ausente)'; end if;
  select id into e_novo from funil_etapas where funil_id = v_funil and slug = 'novo';
  select id into e_contato from funil_etapas where funil_id = v_funil and slug = 'em_contato';
  select id into e_neg from funil_etapas where funil_id = v_funil and slug = 'negociando';
  select id into e_ganho from funil_etapas where funil_id = v_funil and slug = 'convertido';
  select id into e_perdido from funil_etapas where funil_id = v_funil and slug = 'perdido';
  if e_novo is null or e_ganho is null or e_perdido is null then raise exception 'demonstração: etapas do preset geral não encontradas'; end if;
  perform setseed(0.19112026);

  -- ── Limpa a demonstração anterior ──────────────────────────────────────────
  delete from automacao_execucoes where empresa_id = v_emp;
  delete from tarefas where empresa_id = v_emp;
  delete from mensagens where empresa_id = v_emp;
  delete from conversas where empresa_id = v_emp;
  delete from negocio_historico where empresa_id = v_emp;
  delete from negocios where empresa_id = v_emp;
  delete from contato_identidades where empresa_id = v_emp;
  delete from contatos where empresa_id = v_emp;
  delete from etiquetas where empresa_id = v_emp;
  delete from canais where empresa_id = v_emp and external_id like 'demo-%';

  -- ── Empresa, loja e canais de demonstração ─────────────────────────────────
  update empresas set nome = 'Nexus Demonstração', cidade = 'Mogi Guaçu', estado = 'SP' where id = v_emp;
  select id into v_filial from filiais where empresa_id = v_emp order by matriz desc, id limit 1;
  update filiais set nome = 'Loja Centro' where id = v_filial;
  insert into canais (empresa_id, filial_id, tipo, external_id, nome_exibicao, status, via, coexistencia, conectado_em, ultima_msg_em)
  values (v_emp, v_filial, 'whatsapp', 'demo-preview-whatsapp', '+55 11 4000-0000 · Demonstração', 'ativo', 'pagina', true, now() - interval '40 days', now())
  returning id into v_wa;
  insert into canais (empresa_id, filial_id, tipo, external_id, nome_exibicao, status, via, conectado_em, ultima_msg_em)
  values (v_emp, v_filial, 'instagram', 'demo-preview-instagram', '@loja.demonstracao', 'ativo', 'pagina', now() - interval '40 days', now())
  returning id into v_ig;

  -- ── Etiquetas ──────────────────────────────────────────────────────────────
  insert into etiquetas (empresa_id, nome, cor) values (v_emp, 'VIP', 'ambar') returning id into t_vip;
  insert into etiquetas (empresa_id, nome, cor) values (v_emp, 'Retornar', 'azul') returning id into t_retorno;
  insert into etiquetas (empresa_id, nome, cor) values (v_emp, 'Indicação', 'verde') returning id into t_indicacao;
  insert into etiquetas (empresa_id, nome, cor) values (v_emp, 'Orçamento enviado', 'cinza') returning id into t_orcamento;
  insert into etiquetas (empresa_id, nome, cor) values (v_emp, 'Atacado', 'vermelho') returning id into t_atacado;

  -- ── Contatos, negócios e conversas ─────────────────────────────────────────
  for i in 1 .. array_length(nomes, 1) loop
    v_origem := (array['whatsapp','whatsapp','whatsapp','instagram','instagram','indicacao'])[1 + (i % 6)];
    v_criado := now() - make_interval(days => (i * 37) % 42, hours => (i * 5) % 9);
    insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, origem, origem_id, ativo, created_at, etiqueta_ids, observacoes)
    values (v_emp, v_filial, nomes[i],
            case when v_origem <> 'instagram' then '55119000' || lpad((10000 + i * 137)::text, 5, '0') end,
            case when v_origem <> 'instagram' then '+55119000' || lpad((10000 + i * 137)::text, 5, '0') end,
            case when v_origem = 'instagram' then lower(replace(split_part(nomes[i], ' ', 1), 'í', 'i')) || '.' || (100 + i) end,
            v_origem,
            case when v_origem = 'whatsapp' then '55119000' || lpad((10000 + i * 137)::text, 5, '0')
                 when v_origem = 'instagram' then 'demo-ig-' || i end,
            true, v_criado,
            (case when i % 7 = 0 then array[t_vip] else '{}'::bigint[] end)
              || (case when i % 5 = 0 then array[t_retorno] else '{}'::bigint[] end)
              || (case when v_origem = 'indicacao' then array[t_indicacao] else '{}'::bigint[] end)
              || (case when i % 4 = 1 and i > 8 then array[t_orcamento] else '{}'::bigint[] end)
              || (case when i = 12 or i = 29 then array[t_atacado] else '{}'::bigint[] end),
            null)
    returning id into v_contato;
    if v_origem in ('whatsapp', 'instagram') then
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (v_emp, v_contato, v_origem,
              case when v_origem = 'whatsapp' then '55119000' || lpad((10000 + i * 137)::text, 5, '0') else 'demo-ig-' || i end,
              case when v_origem = 'whatsapp' then v_wa else v_ig end);
    end if;

    -- Etapa: 8 novos, 8 em contato, 8 negociando, 8 convertidos, 4 perdidos.
    v_etapa := case when i <= 8 then e_novo when i <= 16 then e_contato when i <= 24 then e_neg when i <= 32 then e_ganho else e_perdido end;
    v_status := case when v_etapa = e_ganho then 'ganho' when v_etapa = e_perdido then 'perdido' else 'aberto' end;
    v_valor := precos[1 + (i % array_length(produtos, 1))] * (1 + (i % 3));
    v_motivo := case when v_status = 'perdido' then (select id from motivos_perda where empresa_id = v_emp order by id offset (i % 4) limit 1) end;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, valor_estimado, motivo_perda_id,
                          ganho_em, perdido_em, entrou_etapa_em, created_at, dados)
    values (v_emp, v_filial, v_contato, v_funil, v_etapa, v_status, v_valor, v_motivo,
            case when v_status = 'ganho' then v_criado + make_interval(days => 1 + i % 4) end,
            case when v_status = 'perdido' then v_criado + make_interval(days => 2) end,
            v_criado + make_interval(hours => 2 + i % 20), v_criado,
            jsonb_build_object('produto_interessado', produtos[1 + (i % array_length(produtos, 1))],
                               '_lead', jsonb_build_object('ativo', true, 'origem', v_origem)))
    returning id into v_negocio;

    -- Conversa para os que vieram por canal (até 24 contatos), com o histórico de exemplo.
    if v_origem in ('whatsapp', 'instagram') and i <= 34 then
      v_canal := case when v_origem = 'whatsapp' then v_wa else v_ig end;
      insert into conversas (empresa_id, filial_id, contato_id, canal_id, created_at)
      values (v_emp, v_filial, v_contato, v_canal, v_criado) returning id into v_conversa;
      v_msgs := conversas -> (i % jsonb_array_length(conversas));
      -- Os mais recentes da lista conversaram hoje; os demais, no dia em que chegaram.
      v_t := case when i % 3 = 0 then now() - make_interval(mins => 20 + i * 7) else v_criado + interval '10 minutes' end;
      j := 0;
      for v_m in select value from jsonb_array_elements(v_msgs) loop
        j := j + 1;
        v_t := v_t + make_interval(mins => 2 + (j * 3) % 11);
        insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, canal_id,
                               lida, status_entrega, status_em, created_at, external_id)
        values (v_emp, v_filial, v_conversa, v_contato,
                case when v_m ->> 0 = 'r' then 'recebida' else 'enviada' end, v_m ->> 1, 'texto', v_origem, v_canal,
                -- As de hoje que terminam no cliente ficam sem ler (aparecem como "aguardando" na Comunicação).
                not (v_m ->> 0 = 'r' and i % 3 = 0),
                case when v_m ->> 0 = 'e' then 'lida' end, case when v_m ->> 0 = 'e' then v_t end, v_t,
                'demo-' || v_emp || '-' || i || '-' || j);
      end loop;
    end if;
  end loop;

  -- ── Tarefas ────────────────────────────────────────────────────────────────
  insert into tarefas (empresa_id, filial_id, negocio_id, lead_id, contato_id, titulo, tipo, vencimento, concluida, concluida_em, origem, created_at)
  select v_emp, v_filial, n.id, n.id, n.contato_id, x.titulo, x.tipo, now() + x.vence, x.feita, case when x.feita then now() - interval '1 day' end, 'manual', now() - interval '2 days'
    from (values
      (9,  'Ligar para confirmar a entrega', 'ligacao', interval '2 hours', false),
      (12, 'Enviar orçamento do conjunto completo', 'email', interval '-1 day', false),
      (17, 'Retornar sobre o desconto à vista', 'whatsapp', interval '4 hours', false),
      (19, 'Mandar fotos das outras cores', 'whatsapp', interval '1 day', false),
      (21, 'Visita à loja marcada', 'visita', interval '2 days', false),
      (23, 'Follow-up do orçamento', 'whatsapp', interval '-3 hours', false),
      (25, 'Pedir avaliação no Google', 'outro', interval '-2 days', true),
      (27, 'Conferir montagem agendada', 'ligacao', interval '-1 day', true),
      (3,  'Primeiro contato', 'whatsapp', interval '30 minutes', false),
      (5,  'Primeiro contato', 'whatsapp', interval '1 hour', false)
    ) as x(ordem, titulo, tipo, vence, feita)
    join lateral (select ng.id, ng.contato_id from negocios ng join contatos c on c.id = ng.contato_id
                   where ng.empresa_id = v_emp and c.nome = nomes[x.ordem] limit 1) n on true;
end $$;

select (select nome from empresas where slug = '__preview__') empresa,
       (select count(*) from contatos c join empresas e on e.id = c.empresa_id where e.slug = '__preview__') contatos,
       (select string_agg(fe.label || ':' || cnt, ', ' order by fe.ordem) from (select etapa_id, count(*) cnt from negocios n join empresas e on e.id = n.empresa_id where e.slug = '__preview__' group by etapa_id) q join funil_etapas fe on fe.id = q.etapa_id) funil,
       (select count(*) from conversas cv join empresas e on e.id = cv.empresa_id where e.slug = '__preview__') conversas,
       (select count(*) from mensagens m join empresas e on e.id = m.empresa_id where e.slug = '__preview__') mensagens,
       (select count(*) from tarefas t join empresas e on e.id = t.empresa_id where e.slug = '__preview__') tarefas,
       (select count(*) from etiquetas t join empresas e on e.id = t.empresa_id where e.slug = '__preview__') etiquetas;
