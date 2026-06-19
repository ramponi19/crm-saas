-- ============================================================
-- FASE 5 — Stripe / Monetização
-- ============================================================
-- Rodar APÓS fase5_multitenant.sql
-- ============================================================

-- Adiciona colunas Stripe na tabela empresas (se não existirem)
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id         TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status           TEXT DEFAULT 'trialing'
    CHECK (stripe_status IN ('trialing','active','past_due','canceled','incomplete'));

-- Índices para lookup rápido por customer/subscription
CREATE INDEX IF NOT EXISTS idx_empresas_stripe_customer
  ON empresas(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_stripe_sub
  ON empresas(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Tabela de eventos Stripe recebidos (log/idempotência)
CREATE TABLE IF NOT EXISTS stripe_eventos (
  id            TEXT PRIMARY KEY,   -- stripe event id (evita duplicatas)
  tipo          TEXT NOT NULL,
  empresa_id    BIGINT REFERENCES empresas(id),
  payload       JSONB,
  processado_em TIMESTAMPTZ DEFAULT NOW()
);

-- View auxiliar: empresas com status de assinatura
CREATE OR REPLACE VIEW v_empresas_plano AS
SELECT
  id,
  nome,
  slug,
  plano,
  status,
  stripe_status,
  trial_ends_at,
  CASE
    WHEN stripe_status = 'active'   THEN 'Ativo'
    WHEN stripe_status = 'trialing' THEN 'Trial'
    WHEN stripe_status = 'past_due' THEN 'Pagamento pendente'
    WHEN stripe_status = 'canceled' THEN 'Cancelado'
    ELSE 'Indefinido'
  END AS status_label,
  CASE
    WHEN trial_ends_at IS NOT NULL AND trial_ends_at > NOW()
    THEN CEIL(EXTRACT(EPOCH FROM (trial_ends_at - NOW())) / 86400)::INT
    ELSE 0
  END AS dias_trial_restantes
FROM empresas;
