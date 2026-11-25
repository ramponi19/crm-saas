-- Teste da 20261125000800_atende_clientes. JM de teste (empresa 1, loja 3): Administrador A (…0201), vendedor M1 (…0101).
-- A vira "Eduardo Teste" e se apresenta pelo celular (mensagem sem usuario_id). Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}';
  A uuid := '0e5e0000-0000-4000-8000-000000000201'; M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  c_dono bigint; c_consulta bigint; c_vend bigint; ct bigint; n bigint; k bigint; cv bigint; z jsonb; z0 jsonb;
begin
  -- 1. padrão: todos ligados; ninguém de Consulta na semente
  res := res || jsonb_build_object('1_padrao', jsonb_build_object(
    'desligados', (select count(*) from empresa_usuarios where not atende_clientes),
    'vinculos_maior_que_zero', (select count(*) > 0 from empresa_usuarios)));

  select id into c_dono from empresa_cargos where empresa_id = 1 and sistema;
  select id into c_consulta from empresa_cargos where empresa_id = 1 and somente_leitura order by id limit 1;
  select id into c_vend from empresa_cargos where empresa_id = 1 and papel_base = 'vendedor' and not somente_leitura order by id limit 1;

  update usuarios set nome = 'Eduardo Teste' where id = A;
  update empresa_usuarios set cargo_id = c_dono where empresa_id = 1 and usuario_id = A;   -- A vira Dono (owner)

  -- base: a semente pode ter mensagens na loja 3; os casos abaixo medem a DIFERENÇA para ela
  z0 := zapintel_conversa_calc(1, array[3]::bigint[], 30);

  insert into contatos (empresa_id, filial_id, nome, telefone_e164) values (1, 3, 'Cliente Atende Teste', '+5519900002222') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n;
  insert into canais (empresa_id, filial_id, tipo, external_id, status, via) values (1, 3, 'whatsapp', 'teste-atende-clientes', 'ativo', 'pagina') returning id into k;
  insert into conversas (empresa_id, filial_id, contato_id, canal_id) values (1, 3, ct, k) returning id into cv;
  insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo, created_at) values
    (1, 3, ct, k, cv, 'recebida', 'Oi, tem iPhone 15?', 'texto', now() - interval '2 hours'),
    (1, 3, ct, k, cv, 'enviada', 'Bom dia! Aqui é o Eduardo, tudo bem? Temos sim.', 'texto', now() - interval '1 hour'),
    (1, 3, ct, k, cv, 'enviada', 'Quer que eu separe um para você?', 'texto', now() - interval '59 minutes');

  -- 2. Dono com a marca ligada: reconhecido pela apresentação (antes da 0800, owner ficava de fora)
  z := zapintel_conversa_calc(1, array[3]::bigint[], 30);
  res := res || jsonb_build_object('2_dono_ligado', jsonb_build_object(
    'papel', (select role from empresa_usuarios where empresa_id = 1 and usuario_id = A),
    'apresentacao_a_mais', (z -> 'cobertura' ->> 'apresentacao')::int - (z0 -> 'cobertura' ->> 'apresentacao')::int,
    'mensagens_do_A', (select (x ->> 'mensagens')::int from jsonb_array_elements(z -> 'linhas') x where x ->> 'tipo' = 'vendedor' and x ->> 'id' = A::text)));

  -- 3. marca desligada: deixa de ser reconhecido; as mensagens não viram do cliente
  update empresa_usuarios set atende_clientes = false where empresa_id = 1 and usuario_id = A;
  z := zapintel_conversa_calc(1, array[3]::bigint[], 30);
  res := res || jsonb_build_object('3_desligado', jsonb_build_object(
    'apresentacao_a_mais', (z -> 'cobertura' ->> 'apresentacao')::int - (z0 -> 'cobertura' ->> 'apresentacao')::int,
    'nenhum_a_mais', (z -> 'cobertura' ->> 'nenhum')::int - (z0 -> 'cobertura' ->> 'nenhum')::int,
    'enviadas_a_mais', (z -> 'cobertura' ->> 'mensagens')::int - (z0 -> 'cobertura' ->> 'mensagens')::int,
    'linha_do_A', (select count(*) from jsonb_array_elements(z -> 'linhas') x where x ->> 'tipo' = 'vendedor' and x ->> 'id' = A::text)));

  -- 4. cargo de Consulta força desligado, mesmo pedindo ligado; e não religa por update direto
  update empresa_usuarios set atende_clientes = true, cargo_id = c_consulta where empresa_id = 1 and usuario_id = M1;
  res := res || jsonb_build_object('4a_consulta_desliga', (select atende_clientes from empresa_usuarios where empresa_id = 1 and usuario_id = M1));
  update empresa_usuarios set atende_clientes = true where empresa_id = 1 and usuario_id = M1;
  res := res || jsonb_build_object('4b_consulta_nao_religa', (select atende_clientes from empresa_usuarios where empresa_id = 1 and usuario_id = M1));

  -- 5. sair da Consulta não religa sozinho (a marca é explícita); ligar à mão vale
  update empresa_usuarios set cargo_id = c_vend where empresa_id = 1 and usuario_id = M1;
  res := res || jsonb_build_object('5a_vendedor_continua_desligado', (select atende_clientes from empresa_usuarios where empresa_id = 1 and usuario_id = M1));
  update empresa_usuarios set atende_clientes = true where empresa_id = 1 and usuario_id = M1;
  res := res || jsonb_build_object('5b_ligado_a_mao', (select atende_clientes from empresa_usuarios where empresa_id = 1 and usuario_id = M1));

  raise exception 'RESULTADO_TESTE_ATENDE_CLIENTES %', res::text;
end $t$;
