-- ============================================================
-- FASE 5 — Multi-tenant / SaaS Ready
-- ============================================================
-- SEGURO: não apaga nada. JM Store vira empresa #1 automaticamente.
-- Rodar no Supabase SQL Editor em ordem.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELA EMPRESAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id               BIGSERIAL PRIMARY KEY,
  nome             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,          -- ex: "jm-store" → usado na URL/subdomain
  plano            TEXT NOT NULL DEFAULT 'starter'
                   CHECK (plano IN ('free', 'starter', 'pro')),
  status           TEXT NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo', 'suspenso', 'cancelado')),
  -- White-label
  wl_cor           TEXT DEFAULT '#D7282F',
  wl_logo_url      TEXT,
  wl_slogan        TEXT,
  wl_whatsapp      TEXT,
  -- Limites por plano
  limite_usuarios  INT DEFAULT 3,
  limite_leads     INT DEFAULT 500,
  -- Stripe
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  -- Datas
  trial_ends_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 2. SEED — JM Store vira empresa #1
-- ────────────────────────────────────────────────────────────
INSERT INTO empresas (id, nome, slug, plano, status, wl_cor, wl_slogan, wl_whatsapp)
VALUES (1, 'JM Store Importados', 'jm-store', 'pro', 'ativo', '#D7282F', 'Importados com qualidade', NULL)
ON CONFLICT (id) DO NOTHING;

-- Garante que o sequence começa do 2 (próximo cliente)
SELECT setval('empresas_id_seq', GREATEST(1, (SELECT MAX(id) FROM empresas)));

-- ────────────────────────────────────────────────────────────
-- 3. ADICIONAR empresa_id EM TODAS AS TABELAS
--    DEFAULT 1 = JM Store. Dados existentes ficam intactos.
-- ────────────────────────────────────────────────────────────

-- Tabelas com usuario_id (já existiam)
ALTER TABLE clientes              ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE vendas                ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE leads                 ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE lead_mensagens        ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE inventario_unidades   ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE produtos              ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE pedidos_compra        ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE garantias_assistencias ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE despesas              ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE contas_a_pagar        ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE contas_a_receber      ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE lancamentos_financeiros ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE comissoes             ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE metas_comissoes       ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE movimentacao_estoque  ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE pre_vendas            ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE vendas_pagamentos     ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE avaliacoes_seminovos  ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);

-- Tabelas globais (não tinham usuario_id)
ALTER TABLE fornecedores          ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE marcas_produtos       ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE categorias_produtos   ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE subcategorias_produtos ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE tabela_precos         ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE taxas_pagamento       ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);
ALTER TABLE categorias_financeiras ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES empresas(id);

-- ────────────────────────────────────────────────────────────
-- 4. TABELA empresa_usuarios (vínculo usuário ↔ empresa)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresa_usuarios (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT   NOT NULL DEFAULT 'vendedor'
              CHECK (role IN ('owner', 'admin', 'vendedor', 'tecnico')),
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, usuario_id)
);

-- Vincula usuários existentes à JM Store (empresa 1)
INSERT INTO empresa_usuarios (empresa_id, usuario_id, role)
SELECT 1, id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'vendedor' END
FROM usuarios
ON CONFLICT (empresa_id, usuario_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. ÍNDICES (performance nas queries multi-tenant)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_empresa       ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_empresa         ON vendas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_leads_empresa          ON leads(empresa_id);
CREATE INDEX IF NOT EXISTS idx_inventario_empresa     ON inventario_unidades(empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa       ON produtos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_empresa    ON lancamentos_financeiros(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_emp   ON empresa_usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_usr   ON empresa_usuarios(usuario_id);

-- ────────────────────────────────────────────────────────────
-- 6. RLS — Row Level Security por empresa
-- ────────────────────────────────────────────────────────────

-- Função helper: retorna empresa_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_empresa_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT empresa_id
  FROM empresa_usuarios
  WHERE usuario_id = auth.uid()
    AND ativo = TRUE
  LIMIT 1;
$$;

-- Ativar RLS e criar políticas em cada tabela
DO $$
DECLARE
  tabelas TEXT[] := ARRAY[
    'clientes', 'vendas', 'leads', 'lead_mensagens',
    'inventario_unidades', 'produtos', 'pedidos_compra',
    'garantias_assistencias', 'despesas', 'contas_a_pagar',
    'contas_a_receber', 'lancamentos_financeiros', 'comissoes',
    'metas_comissoes', 'movimentacao_estoque', 'pre_vendas',
    'vendas_pagamentos', 'avaliacoes_seminovos', 'fornecedores',
    'marcas_produtos', 'categorias_produtos', 'subcategorias_produtos',
    'tabela_precos', 'taxas_pagamento', 'categorias_financeiras'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- Ativa RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Remove políticas antigas se existirem
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolamento" ON %I', t);

    -- Cria política: usuário só vê dados da própria empresa
    EXECUTE format(
      'CREATE POLICY "tenant_isolamento" ON %I
       USING (empresa_id = get_empresa_id())
       WITH CHECK (empresa_id = get_empresa_id())',
      t
    );
  END LOOP;
END $$;

-- RLS na tabela empresa_usuarios
ALTER TABLE empresa_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_usuarios_isolamento" ON empresa_usuarios;
CREATE POLICY "empresa_usuarios_isolamento" ON empresa_usuarios
  USING (empresa_id = get_empresa_id());

-- RLS na tabela empresas (owner vê só a própria)
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresas_isolamento" ON empresas;
CREATE POLICY "empresas_isolamento" ON empresas
  USING (id = get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 7. TRIGGER — updated_at automático em empresas
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_empresas_updated_at ON empresas;
CREATE TRIGGER trg_empresas_updated_at
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 8. VERIFICAÇÃO FINAL
-- ────────────────────────────────────────────────────────────
SELECT
  'empresas'            AS tabela, COUNT(*) AS registros FROM empresas
UNION ALL SELECT
  'empresa_usuarios',              COUNT(*)               FROM empresa_usuarios
UNION ALL SELECT
  'clientes (empresa 1)',          COUNT(*)               FROM clientes WHERE empresa_id = 1
UNION ALL SELECT
  'leads (empresa 1)',             COUNT(*)               FROM leads    WHERE empresa_id = 1
UNION ALL SELECT
  'vendas (empresa 1)',            COUNT(*)               FROM vendas   WHERE empresa_id = 1;
