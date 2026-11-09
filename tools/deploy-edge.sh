#!/usr/bin/env bash
# Deploy de uma Edge Function da PRODUÇÃO a partir de um commit, sem worktree fixa no disco.
#
#   bash tools/deploy-edge.sh <commit|branch> [função] [--ensaio]
#   bash tools/deploy-edge.sh origin/main                    # webhook-leads do origin/main
#   bash tools/deploy-edge.sh 1ed9946 webhook-leads --ensaio # tudo menos o deploy
#
# Cria uma worktree temporária (no %TEMP%, destacada no commit), confere o código com o deno e
# publica com `supabase functions deploy --use-api --no-verify-jwt` (sem Docker). A worktree é
# removida no fim, dê certo ou não. Pede "sim" antes de publicar.
# Regras de sempre (05-RUNBOOK): a Edge vai DEPOIS do app quando o app depende dela, e smoke real
# de WhatsApp/Instagram depois. Volta = rodar de novo com o commit anterior.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
REF="${1:?uso: bash tools/deploy-edge.sh <commit|branch> [função] [--ensaio]}"
FN="webhook-leads"; ENSAIO=0
for a in "${@:2}"; do case "$a" in --ensaio) ENSAIO=1;; *) FN="$a";; esac; done
PROJ=guiuzbcqkvelqcuogxtd

cd "$REPO"
git fetch -q origin
SHA=$(git rev-parse --verify "$REF^{commit}")
[ -f "supabase/functions/$FN/index.ts" ] || git cat-file -e "$SHA:supabase/functions/$FN/index.ts" || { echo "Função $FN não existe em $SHA"; exit 1; }

WT="${TEMP:-/tmp}/edge-$FN-$(date +%Y%m%d%H%M%S)"
limpar() { git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; git -C "$REPO" worktree prune; }
trap limpar EXIT
git worktree add -q --detach "$WT" "$SHA"
echo "worktree temporária: $WT @ $(git -C "$WT" log -1 --format='%h %s')"

deno check --no-lock "$WT/supabase/functions/$FN/index.ts"
[ "$ENSAIO" = 1 ] && { echo "ENSAIO: conferido, nada publicado."; exit 0; }

read -r -p "Publicar $FN do commit ${SHA:0:7} na PRODUÇÃO? (digite sim) " ok
[ "$ok" = "sim" ] || { echo "Cancelado."; exit 1; }
CLI="$REPO/node_modules/.bin/supabase"; [ -x "$CLI" ] || CLI="npx supabase"
cd "$WT"
$CLI functions deploy "$FN" --project-ref "$PROJ" --use-api --no-verify-jwt --yes
echo "Publicado: $FN @ ${SHA:0:7}. Faça o smoke (WhatsApp/Instagram reais) e anote a versão no 06."
