-- SEMENTE DO BANCO LOCAL DESCARTÁVEL (scripts/teste-local.sh; docs/design-pos-venda.md §8.6.1).
--
-- Só dados FICTÍCIOS. Reproduz o ESQUELETO da produção com os MESMOS ids (empresas 1 e 5, lojas,
-- funis, etapas, motivos, campos, categorias, usuários), porque os testes de migração
-- (supabase/scripts/testes/teste-*.sql) foram escritos com esses ids. Nenhum nome, telefone, e-mail ou
-- negócio real: a empresa 1 aqui é a "JM de teste", com o funil e as categorias da JM e clientes inventados.
--
-- Usuários (senha SÓ LOCAL "teste-local-123", e-mails @teste.invalid):
--   a632db2c… dono da JM de teste         f4ec6a87… vendedora da JM de teste (loja 6)
--   f47a8e4f… dono da Nexus Demonstração  96867cc0… admin da Nexus Demonstração
--   0e5e0000…0001 vendedor da Nexus Demonstração (loja 1)
-- Recusa rodar fora do 127.0.0.1 (o script confere a conexão antes).

do $$ begin
  if exists (select 1 from empresas where slug = 'jm-store') then
    raise exception 'RECUSADO: a empresa jm-store existe, isto parece a produção. A semente só roda no banco local descartável.';
  end if;
end $$;

-- ── usuários (auth + identidades; o gatilho handle_new_user cria public.usuarios) ──────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, crypt('teste-local-123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', u.nome), now(), now(), '', '', '', ''
  from (values
    ('a632db2c-c42b-4973-8008-2d5ca2dbf479', 'dono.jm@teste.invalid', 'Dono JM de teste'),
    ('f4ec6a87-103a-4ff3-b533-8347b028daf0', 'vendedora.jm@teste.invalid', 'Vendedora JM de teste'),
    ('f47a8e4f-a428-4bf6-8a82-d43088751d2c', 'dono.demo@teste.invalid', 'Dono Demonstração'),
    ('96867cc0-8331-4c79-be63-09a313b35ea0', 'admin.demo@teste.invalid', 'Admin Demonstração'),
    ('0e5e0000-0000-4000-8000-000000000001', 'vendedor.demo@teste.invalid', 'Vendedor Demonstração')
  ) u(id, email, nome)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  from auth.users u where u.email like '%@teste.invalid'
on conflict do nothing;

-- ── empresas, lojas, funis, etapas ───────────────────────────────────────────────────────────────
insert into empresas (id, nome, slug, plano, status, limite_usuarios, limite_leads, demo) overriding system value
values (1, 'JM de teste', 'jm-teste', 'base', 'ativo', 0, 0, false),
       (5, 'Nexus Demonstração', '__preview__', 'base', 'ativo', 3, 500, true)
on conflict (id) do nothing;

insert into filiais (id, empresa_id, nome, matriz) overriding system value values
  (1, 5, 'Loja Demonstração', true), (3, 1, 'Loja Centro (teste)', true), (6, 1, 'Loja Shopping (teste)', false)
on conflict (id) do nothing;

insert into funis (id, empresa_id, nome, padrao, interno) overriding system value values
  (1, 1, 'Funil principal', true, false), (3, 1, 'Time (teste)', false, true), (4, 1, 'Candidatos (teste)', false, true),
  (10, 5, 'Funil principal', true, false)
on conflict (id) do nothing;

insert into funil_etapas (id, empresa_id, funil_id, ordem, slug, label, tipo, ativo) overriding system value values
  (18, 1, 1, 1, 'novo', 'Novo', 'normal', true), (17, 1, 1, 2, 'em_contato', 'Em contato', 'normal', true),
  (27, 1, 1, 3, 'orcamento', 'Orçamento', 'normal', true), (16, 1, 1, 12, 'negociando', 'Negociando', 'negociacao', true),
  (15, 1, 1, 13, 'convertido', 'Convertido', 'ganho', true), (38, 1, 1, 14, 'pos_venda', 'Pós Venda', 'normal', true),
  (14, 1, 1, 16, 'perdido', 'Perdido', 'perdido', true),
  (53, 1, 3, 0, 'time_jm', 'Time', 'normal', true), (54, 1, 4, 0, 'candidatos', 'Candidatos', 'normal', true),
  (73, 5, 10, 0, 'novo', 'Novo', 'normal', true), (74, 5, 10, 1, 'em_contato', 'Em contato', 'normal', true),
  (75, 5, 10, 2, 'negociando', 'Negociando', 'negociacao', true), (76, 5, 10, 3, 'convertido', 'Convertido', 'ganho', true),
  (77, 5, 10, 4, 'perdido', 'Perdido', 'perdido', true)
on conflict (id) do nothing;

insert into motivos_perda (id, empresa_id, label, ordem) overriding system value values
  (1, 1, 'Preço', 1), (2, 1, 'Sem estoque', 2), (3, 1, 'Comprou com concorrente', 3), (4, 1, 'Sumiu / não respondeu', 4),
  (9, 1, 'Condição de pagamento', 5), (10, 1, 'Desistiu da compra', 6),
  (29, 5, 'Preço', 0), (30, 5, 'Condição de pagamento', 1), (31, 5, 'Escolheu um concorrente', 2),
  (32, 5, 'Sumiu / não respondeu', 3), (33, 5, 'Desistiu', 4), (34, 5, 'Não era o momento', 5)
on conflict (id) do nothing;

insert into campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, opcoes, ordem, ativo)
select e.id, c.ent, c.chave, c.rotulo, c.tipo, c.opcoes::jsonb, c.ordem, true
  from (values (1), (5)) e(id),
       (values ('negocio', 'produto_interessado', 'Produto de interesse', 'texto', '[]', 10),
               ('contato', 'data_nascimento', 'Data de nascimento', 'data', '[]', 10),
               ('contato', 'estado_civil', 'Estado civil', 'texto', '[]', 20),
               ('contato', 'profissao', 'Profissão', 'texto', '[]', 30),
               ('contato', 'nacionalidade', 'Nacionalidade', 'texto', '[]', 40),
               ('contato', 'tipo_cliente', 'Tipo de cliente', 'opcao', '["Novo","Ativo","VIP","Recorrente","Inativo"]', 50),
               ('contato', 'origem_cliente', 'Origem do cliente', 'texto', '[]', 60)) c(ent, chave, rotulo, tipo, opcoes, ordem)
on conflict do nothing;

insert into estoque_categorias (id, empresa_id, nome, ordem) overriding system value values
  (1, 1, '📱 Iphone / Smartphone', 1), (2, 1, '📟 Ipad / Tablet', 2), (3, 1, '💻 MacBook / Notebook', 3),
  (4, 1, '⌚ Apple Watch / Smartwatch', 4), (6, 1, '🔌 Acessórios', 5), (7, 1, '🌸 Perfumes', 6), (5, 1, '📦 Outros', 7),
  (16, 5, '📱 Iphone / Smartphone', 1), (15, 5, '📟 Ipad / Tablet', 2), (10, 5, '💻 MacBook / Notebook', 3),
  (11, 5, '⌚ Apple Watch / Smartwatch', 4), (12, 5, '🔌 Acessórios', 5), (13, 5, '🌸 Perfumes', 6), (14, 5, '📦 Outros', 7)
on conflict (id) do nothing;

insert into empresa_menu (empresa_id, itens) values
  (1, '{"base":{"vocabulario":{"usado":"Seminovo","interesse":"Produto interessado"}}}'),
  (5, '{"base":{"vocabulario":{"usado":"Seminovo","interesse":"Interesse"}}}')
on conflict do nothing;

insert into empresa_modulos (empresa_id, modulo, ativo) values
  (1, 'estoque', true), (1, 'gestao_leads', true), (1, 'inteligencia', true), (1, 'orcamentos', true),
  (5, 'chat', true), (5, 'fila', true), (5, 'publicos', true)
on conflict do nothing;

insert into empresa_usuarios (empresa_id, usuario_id, role, ativo, filial_id) values
  (1, 'a632db2c-c42b-4973-8008-2d5ca2dbf479', 'owner', true, null),
  (1, 'f4ec6a87-103a-4ff3-b533-8347b028daf0', 'vendedor', true, 6),
  (5, 'f47a8e4f-a428-4bf6-8a82-d43088751d2c', 'owner', true, null),
  (5, '96867cc0-8331-4c79-be63-09a313b35ea0', 'admin', true, null),
  (5, '0e5e0000-0000-4000-8000-000000000001', 'vendedor', true, 1)
on conflict do nothing;

-- ── JM de teste: alguns clientes e negócios INVENTADOS (o 426 é o ganho que o teste da M3 usa) ────
insert into contatos (id, empresa_id, filial_id, nome, telefone_e164) overriding system value values
  (90001, 1, 3, 'Cliente Teste Um', '+5511900000001'),
  (90002, 1, 3, 'Cliente Teste Dois', '+5511900000002'),
  (90003, 1, 6, 'Cliente Teste Três', '+5511900000003')
on conflict (id) do nothing;
insert into negocios (id, empresa_id, filial_id, contato_id, funil_id, etapa_id, status, valor_estimado, ganho_em, created_at, dados) overriding system value values
  (426, 1, 3, 90001, 1, 15, 'ganho', 7795, '2026-08-01 14:45:43+00', '2026-07-20', '{"_lead":{"ativo":true}}'),
  (90101, 1, 3, 90002, 1, 18, 'aberto', 5995, null, now() - interval '10 days', '{"_lead":{"ativo":true}}'),
  (90102, 1, 6, 90003, 1, 16, 'aberto', 3495, null, now() - interval '5 days', '{"_lead":{"ativo":true}}')
on conflict (id) do nothing;

-- ── sequências depois dos ids fixos ──────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select s.relname seq, t.relname tab, a.attname col
             from pg_class s join pg_depend d on d.objid = s.oid join pg_class t on t.oid = d.refobjid
             join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
            where s.relkind = 'S' and t.relnamespace = 'public'::regnamespace
              and t.relname in ('empresas','filiais','funis','funil_etapas','motivos_perda','estoque_categorias','contatos','negocios') loop
    execute format('select setval(%L, greatest((select coalesce(max(%I), 0) from public.%I), 1) + 1000, false)', 'public.' || r.seq, r.col, r.tab);
  end loop;
end $$;
