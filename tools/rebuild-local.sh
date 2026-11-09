#!/usr/bin/env bash
# Rebuild do app LOCAL sem estourar a memória: para o app (:3010) e o Supabase local
# (volume preservado), desliga o WSL, faz o build com as chaves LOCAIS, religa tudo e sobe
# `next start -p 3010` (a :3000 é o projeto Financeiro).
#   bash tools/rebuild-local.sh
# Chaves locais: tests/e2e/status.local.env (fora do git), gerado com
#   npx supabase status -o env > tests/e2e/status.local.env
set -e
cd "$(dirname "$0")/.."
ENVF=tests/e2e/status.local.env
[ -f "$ENVF" ] || { echo "Falta $ENVF (ver o cabeçalho)."; exit 1; }
mkdir -p .gate
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'next.*start -p 3010' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -Confirm:\$false }"
[ -f supabase/.temp/linked-project.json ] && mv supabase/.temp/linked-project.json supabase/.temp/linked-project.json.rebuild
trap 'mv supabase/.temp/linked-project.json.rebuild supabase/.temp/linked-project.json 2>/dev/null || true' EXIT
npx supabase stop 2>&1 | tail -1
powershell -NoProfile -Command "Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:\$false; Start-Sleep 3; wsl --shutdown; Start-Sleep 4"
set -a; eval "$(grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' "$ENVF")"; set +a
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" NEXT_PUBLIC_DB_CORE=v1 NEXT_PUBLIC_SENTRY_DSN=
case "$NEXT_PUBLIC_SUPABASE_URL" in *127.0.0.1*) ;; *) echo RECUSADO; exit 1;; esac
rm -rf .next && npm run build > .gate/build-local.txt 2>&1 && echo "build ok"
powershell -NoProfile -Command "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
npx supabase start -x imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor 2>&1 | grep -v -iE "key|secret|jwt|token" | tail -1
mv supabase/.temp/linked-project.json.rebuild supabase/.temp/linked-project.json 2>/dev/null || true; trap - EXIT
nohup npx next start -p 3010 > .gate/next-start.log 2>&1 &
for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/login)" = "200" ] && { echo "app local pronto"; break; }; sleep 2; done
