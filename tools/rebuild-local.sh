#!/usr/bin/env bash
# Rebuild do app LOCAL sem estourar a memória: para o app (:3010) e o Supabase local
# (volume preservado), desliga o WSL, faz o build com as chaves LOCAIS, religa tudo e sobe
# `next start -p 3010` (a :3000 é o projeto Financeiro).
#   bash tools/rebuild-local.sh
# Chaves locais: tests/e2e/status.local.env (fora do git), gerado com
#   npx supabase status -o env > tests/e2e/status.local.env
#
# ISOLAMENTO ENTRE SESSÕES (regra de 24/11/2026, memória "isolamento-sessoes-locais"): o Docker Desktop e o WSL só
# são fechados quando NENHUMA outra pilha está registrada em .claude/sessoes-locais.json e nenhum container de outro
# projeto está de pé (tools/sessoes-locais.mjs). Havendo outra, o script derruba só a pilha DESTE projeto, deixa o
# Docker ligado e faz o build mesmo assim (avisa: com o Docker de pé sobra menos memória para o build).
set -e
cd "$(dirname "$0")/.."
PROJETO=$(sed -n 's/^project_id[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' supabase/config.toml | head -1)
[ -n "$PROJETO" ] || { echo "Não achei o project_id em supabase/config.toml."; exit 1; }
ENVF=tests/e2e/status.local.env
[ -f "$ENVF" ] || { echo "Falta $ENVF (ver o cabeçalho)."; exit 1; }
mkdir -p .gate
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'next.*start -p 3010' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -Confirm:\$false }"
[ -f supabase/.temp/linked-project.json ] && mv supabase/.temp/linked-project.json supabase/.temp/linked-project.json.rebuild
trap 'mv supabase/.temp/linked-project.json.rebuild supabase/.temp/linked-project.json 2>/dev/null || true' EXIT
npx supabase stop 2>&1 | tail -1
# Depois de derrubar a própria pilha: sobrou alguém? (registro + docker ps)
OUTRAS=$(node tools/sessoes-locais.mjs outras "$PROJETO")
FECHOU_DOCKER=0
if [ -z "$OUTRAS" ]; then
  powershell -NoProfile -Command "Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:\$false; Start-Sleep 3; wsl --shutdown; Start-Sleep 4"
  FECHOU_DOCKER=1
else
  echo "Docker e WSL ficam LIGADOS: há outra pilha ou container de pé (regra isolamento-sessoes-locais):"
  printf '  %s\n' "$OUTRAS"
  echo "Derrubei só a pilha $PROJETO. O build segue com o Docker de pé (menos memória livre)."
fi
set -a; eval "$(grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' "$ENVF")"; set +a
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" NEXT_PUBLIC_DB_CORE=v1 NEXT_PUBLIC_SENTRY_DSN=
case "$NEXT_PUBLIC_SUPABASE_URL" in *127.0.0.1*) ;; *) echo RECUSADO; exit 1;; esac
rm -rf .next && npm run build > .gate/build-local.txt 2>&1 && echo "build ok"
if [ "$FECHOU_DOCKER" = "1" ]; then
  powershell -NoProfile -Command "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"
fi
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
npx supabase start -x imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor 2>&1 | grep -v -iE "key|secret|jwt|token" | tail -1
mv supabase/.temp/linked-project.json.rebuild supabase/.temp/linked-project.json 2>/dev/null || true; trap - EXIT
nohup npx next start -p 3010 > .gate/next-start.log 2>&1 &
for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/login)" = "200" ] && { echo "app local pronto"; break; }; sleep 2; done
