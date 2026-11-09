#!/usr/bin/env bash
# Conferência da API de PRODUÇÃO depois de migração/deploy (só leitura):
#   anon em planos_config deve dar 42501; auth/v1/health e /api/saude, 200.
#   bash tools/api.sh
# A chave anon (pública por natureza) vem do .env.local; nada é impresso dela.
cd "$(dirname "$0")/.."
URL=https://guiuzbcqkvelqcuogxtd.supabase.co
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | tr -d '"\r')
grep -q "^NEXT_PUBLIC_SUPABASE_URL=.*guiuzbcqkvelqcuogxtd" .env.local || { echo "O .env.local não aponta para a produção; a chave anon dele não serve aqui."; exit 1; }
r=$(curl -s -w " HTTP%{http_code}" "$URL/rest/v1/planos_config?select=id&limit=1" -H "apikey: $ANON")
echo "$(date +%H:%M:%S) planos_config anon: $(echo "$r" | grep -o '"code":"[0-9A-Z]*"') $(echo "$r" | grep -o 'HTTP[0-9]*') | auth $(curl -s -o /dev/null -w '%{http_code}' "$URL/auth/v1/health" -H "apikey: $ANON") | /api/saude $(curl -s -o /dev/null -w '%{http_code}' https://crm-saas-beta.vercel.app/api/saude)"
