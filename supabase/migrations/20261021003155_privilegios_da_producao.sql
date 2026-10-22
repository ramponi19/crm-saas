-- PRIVILÉGIOS DA PRODUÇÃO NO BANCO MONTADO SÓ PELAS MIGRAÇÕES (21/10/2026).
--
-- Desde junho (db_grant_revoke_dangerous_privileges e seguintes) a produção dá a anon e a
-- authenticated MENOS do que o padrão do Supabase em várias tabelas: anon só lê,
-- authenticated não tem TRUNCATE/REFERENCES/TRIGGER, e algumas tabelas são só leitura.
-- O baseline (20261019000000) foi tirado sem os privilégios, então o `supabase start`
-- subia tudo com o padrão completo — mais aberto que a produção. Para testes de RLS isso é
-- grave: um teste passaria localmente e falharia (ou o contrário) na produção.
--
-- Copiado da produção em 21/10/2026 (privilégios de tabela e por coluna de anon e
-- authenticated). Cada par (tabela, papel) é zerado e regravado.
--
-- Aplicada na produção em 21/10/2026 18:48, ela NÃO foi sem efeito: o `revoke all` também tirou
-- o MAINTAIN (privilégio do PG17 — VACUUM/ANALYZE/REINDEX/REFRESH/LOCK) que o padrão do Supabase
-- dava a anon e authenticated nas 25 tabelas da lista (planos_config não tinha), e a lista abaixo
-- não o devolve. Decisão do Lucas: fica removido — nenhum papel da API precisa dele. Fora isso,
-- igual (comparação por aclexplode contra o dump das 18:41). Ver o 06, seção 11.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- anon só lê; authenticated lê e grava, sem TRUNCATE/REFERENCES/TRIGGER
      ('assistencia_garantias',       'select', 'select, insert, update, delete'),
      ('configuracoes_sistema',       'select', 'select, insert, update, delete'),
      ('empresa_usuarios',            'select', 'select, insert, update, delete'),
      ('estoque_categorias',          'select', 'select, insert, update, delete'),
      ('estoque_fornecedores',        'select', 'select, insert, update, delete'),
      ('estoque_marcas',              'select', 'select, insert, update, delete'),
      ('estoque_movimentacoes',       'select', 'select, insert, update, delete'),
      ('estoque_produtos',            'select', 'select, insert, update, delete'),
      ('estoque_subcategorias',       'select', 'select, insert, update, delete'),
      ('estoque_unidades',            'select', 'select, insert, update, delete'),
      ('financeiro_cobrancas',        'select', 'select, insert, update, delete'),
      ('financeiro_config_pagamento', 'select', 'select, insert, update, delete'),
      ('financeiro_lancamentos',      'select', 'select, insert, update, delete'),
      ('financeiro_taxas',            'select', 'select, insert, update, delete'),
      ('metas_comissoes',             'select', 'select, insert, update, delete'),
      ('v_empresas_plano',            'select', 'select, insert, update, delete'),
      ('vendas_comissoes',            'select', 'select, insert, update, delete'),
      ('vendas_pagamentos',           'select', 'select, insert, update, delete'),
      ('vendas_pedidos_compra',       'select', 'select, insert, update, delete'),
      ('vendas_pre_vendas',           'select', 'select, insert, update, delete'),
      ('vendas_vendas',               'select', 'select, insert, update, delete'),
      -- só leitura para os dois
      ('empresas',                    'select', 'select'),
      ('planos_config',               'select', 'select'),
      ('stripe_eventos',              'select', 'select'),
      -- casos próprios
      ('superadmin_logs',             'select', 'select, insert'),
      ('usuarios',                    'select', 'select, insert, delete')
    ) as t(tabela, anon, autenticado)
  loop
    execute format('revoke all on table public.%I from anon, authenticated', r.tabela);
    execute format('grant %s on table public.%I to anon', r.anon, r.tabela);
    execute format('grant %s on table public.%I to authenticated', r.autenticado, r.tabela);
  end loop;
end $$;

-- Por coluna (o `revoke all` acima derrubou os que existiam): o dono edita o nome e a
-- marca da empresa; cada um edita o próprio nome, e-mail e o último acesso.
grant update (nome, wl_cor, wl_logo_url, wl_slogan, wl_whatsapp) on table public.empresas to authenticated;
grant update (email, nome, ultimo_acesso) on table public.usuarios to authenticated;
