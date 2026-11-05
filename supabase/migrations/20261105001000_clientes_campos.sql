-- Lote 8 das views (05/11/2026), passo 1 de 2: os campos do cliente, ANTES do deploy do app.
-- Só dados (sem DDL): não recarrega o cache do PostgREST.
--
-- A camada lib/clientes.ts lê e grava o cliente em contatos, sem a view `clientes`:
--   * tipo e origem do cliente viram campos do core (core/campos.ts) — contatos.tipo
--     (pessoa/empresa) e contatos.origem (canal de entrada) dizem outra coisa;
--   * análise cadastral, corretor e proprietário viram campos do módulo Imóveis
--     (modulo_dono = 'imoveis', core/modulos.ts), como tipo de negócio, valor e região já eram.
-- Até aqui esses cinco viviam na marca dados._cliente. Este passo COPIA o valor para dados
-- (a marca fica intacta: o app antigo continua lendo dela até o deploy). O passo 2
-- (20261105001100) copia de novo — pega o que o app antigo gravou nesse meio-tempo —, tira
-- as chaves da marca e derruba a view.
--
-- Idempotente. Volta: nada a desfazer para o app antigo (ele não lê dados.tipo_cliente etc.);
-- os campos novos ficam.

-- 1. Campos do core em todas as empresas (os quatro primeiros já existiam nas empresas do corte).
insert into public.campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, opcoes, ordem)
select e.id, 'contato', c.chave, c.rotulo, c.tipo, c.opcoes::jsonb, c.ordem
  from public.empresas e
 cross join (values
   ('data_nascimento', 'Data de nascimento', 'data', '[]', 10),
   ('estado_civil', 'Estado civil', 'texto', '[]', 20),
   ('profissao', 'Profissão', 'texto', '[]', 30),
   ('nacionalidade', 'Nacionalidade', 'texto', '[]', 40),
   ('tipo_cliente', 'Tipo de cliente', 'opcao', '["Novo","Ativo","VIP","Recorrente","Inativo"]', 50),
   ('origem_cliente', 'Origem do cliente', 'texto', '[]', 60)) c(chave, rotulo, tipo, opcoes, ordem)
on conflict (empresa_id, entidade, chave) do nothing;

-- 2. Campos do módulo Imóveis nas empresas com o módulo ligado (o app cria ao instalar).
insert into public.campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, opcoes, modulo_dono, ordem)
select m.empresa_id, 'contato', c.chave, c.rotulo, c.tipo, c.opcoes::jsonb, 'imoveis', c.ordem
  from public.empresa_modulos m
 cross join (values
   ('tipo_negocio', 'Tipo de negócio', 'opcao', '["compra","locacao","captacao","investidor","lancamento"]', 100),
   ('valor_pretendido', 'Valor pretendido', 'moeda', '[]', 110),
   ('regiao_interesse', 'Região de interesse', 'texto', '[]', 120),
   ('status_aprovacao', 'Análise cadastral', 'opcao', '["pendente","em_analise","aprovado","reprovado"]', 130),
   ('corretor_id', 'Corretor', 'texto', '[]', 140),
   ('proprietario', 'Proprietário', 'booleano', '[]', 150)) c(chave, rotulo, tipo, opcoes, ordem)
 where m.modulo = 'imoveis' and m.ativo
on conflict (empresa_id, entidade, chave) do nothing;

-- 3. Copia os cinco da marca para dados — só o campo que a empresa tem ativo, como o gatilho
--    compat_clientes_iud fazia. Tipo e origem normalizados para a lista da tela
--    ("novo" e "loja_fisica" eram o padrão das colunas da view).
update public.contatos c
   set dados = c.dados || coalesce((
     select jsonb_object_agg(x.k, x.v)
       from jsonb_each(jsonb_strip_nulls(jsonb_build_object(
              'tipo_cliente', case lower(c.dados #>> '{_cliente,tipo_cliente}')
                                when 'novo' then 'Novo' when 'ativo' then 'Ativo' when 'vip' then 'VIP'
                                when 'recorrente' then 'Recorrente' when 'inativo' then 'Inativo' end,
              'origem_cliente', case c.dados #>> '{_cliente,origem_cliente}'
                                  when 'loja_fisica' then 'Loja física' else c.dados #>> '{_cliente,origem_cliente}' end,
              'status_aprovacao', c.dados #> '{_cliente,status_aprovacao}',
              'proprietario', c.dados #> '{_cliente,proprietario}',
              'corretor_id', c.dados #> '{_cliente,corretor_id}'))) x(k, v)
      where exists (select 1 from public.campos_personalizados cp
                     where cp.empresa_id = c.empresa_id and cp.entidade = 'contato' and cp.chave = x.k and cp.ativo)), '{}'::jsonb)
 where c.dados ? '_cliente'
   and (c.dados -> '_cliente') ?| array['tipo_cliente', 'origem_cliente', 'status_aprovacao', 'proprietario', 'corretor_id'];
