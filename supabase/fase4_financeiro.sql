-- ============================================================
-- FASE 4 — Financeiro
-- ============================================================

-- Tabela principal de lançamentos financeiros
CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
  id            BIGSERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao     TEXT NOT NULL,
  valor         NUMERIC(12,2) NOT NULL,
  data_venc     DATE NOT NULL,
  data_pgto     DATE,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  categoria     TEXT,
  forma_pgto    TEXT,
  referencia_id BIGINT,            -- ex: venda_id
  referencia_tp TEXT,              -- ex: 'venda', 'compra', 'os'
  observacoes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Categorias de lançamentos
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id         BIGSERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'ambos')),
  cor        TEXT DEFAULT '#6B8CFF',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de categorias padrão
INSERT INTO categorias_financeiras (nome, tipo, cor) VALUES
  ('Vendas de produtos',   'receita',  '#34D399'),
  ('Serviços/Assistência', 'receita',  '#6B8CFF'),
  ('Outras receitas',      'receita',  '#F4B740'),
  ('Fornecedores',         'despesa',  '#F0353D'),
  ('Aluguel',              'despesa',  '#F59E0B'),
  ('Salários',             'despesa',  '#EC4899'),
  ('Marketing',            'despesa',  '#8B5CF6'),
  ('Impostos',             'despesa',  '#EF4444'),
  ('Manutenção',           'despesa',  '#64748B'),
  ('Outras despesas',      'despesa',  '#94A3B8')
ON CONFLICT DO NOTHING;

-- Index para consultas por período
CREATE INDEX IF NOT EXISTS idx_lancamentos_data_venc  ON lancamentos_financeiros(data_venc);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status     ON lancamentos_financeiros(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo       ON lancamentos_financeiros(tipo);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lancamentos_updated ON lancamentos_financeiros;
CREATE TRIGGER trg_lancamentos_updated
  BEFORE UPDATE ON lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Atualiza status de atrasados automaticamente
CREATE OR REPLACE FUNCTION refresh_status_atrasados()
RETURNS void AS $$
  UPDATE lancamentos_financeiros
  SET status = 'atrasado'
  WHERE status = 'pendente' AND data_venc < CURRENT_DATE;
$$ LANGUAGE sql;
