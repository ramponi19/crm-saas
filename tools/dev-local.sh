#!/usr/bin/env bash
# App em modo dev (:3010) contra o Supabase LOCAL — para e2e que não pedem build.
#   bash tools/dev-local.sh
# O .env.local tem as chaves da PRODUÇÃO: aqui cada chave que fala com fora é sobrescrita
# (o Next não troca o que já está no ambiente), e o script recusa se a URL não for 127.0.0.1.
# Chaves locais: tests/e2e/status.local.env (fora do git), gerado com
#   npx supabase status -o env > tests/e2e/status.local.env
# EDGE_WEBHOOK_URL aponta para a Edge rodando no deno (o e2e da Transmissão sobe ela em :8000).
set -e
cd "$(dirname "$0")/.."
ENVF=tests/e2e/status.local.env
[ -f "$ENVF" ] || { echo "Falta $ENVF (ver o cabeçalho)."; exit 1; }
set -a; eval "$(grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' "$ENVF")"; set +a
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_DB_CORE=v1 NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_APP_URL=http://localhost:3010
export CRON_SECRET=cron-local-de-teste EDGE_INTERNAL_SECRET=edge-interna-local-de-teste EDGE_WEBHOOK_URL="${EDGE_WEBHOOK_URL:-http://127.0.0.1:8000}"
# Chave de canal SÓ DE TESTE (a mesma que o e2e passa para a Edge local).
export CHANNEL_ENCRYPTION_KEY="${CHANNEL_ENCRYPTION_KEY_TESTE:-$(printf 'e2e0%.0s' {1..16})}"
export ANTHROPIC_API_KEY= STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= VAPID_PRIVATE_KEY= VERCEL_OIDC_TOKEN= META_APP_SECRET= PAYMENT_ENCRYPTION_KEY=
case "$NEXT_PUBLIC_SUPABASE_URL" in *127.0.0.1*) ;; *) echo "RECUSADO: não é o Supabase local"; exit 1;; esac
exec npx next dev -p 3010
