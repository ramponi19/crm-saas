# Ferramentas de operação

Rodam da raiz do repositório. Nenhuma tem senha, chave ou dado de cliente dentro; o que é local fica fora do git (`.gitignore`).

| Ferramenta | Para quê |
|---|---|
| `bash tools/gate.sh` | Gate antes de todo commit/deploy: `npm run check`, `npm test`, verificador de auditoria e build (com o Supabase LOCAL como URL). Saídas em `.gate/`. |
| `bash tools/api.sh` | Depois de migração/deploy: anon barrado em `planos_config` (42501), `auth/v1/health` e `/api/saude` 200. Só leitura. |
| `bash tools/deploy-edge.sh <commit> [função] [--ensaio]` | Publica uma Edge Function (padrão `webhook-leads`) a partir de uma worktree temporária, que é apagada no fim. Pede "sim". |
| `tools/banco/dump-unico.ps1` | Dump único da produção (public, auth, storage), cifrado com 7z AES-256. O Lucas roda num PowerShell dele: digita a senha do banco e a do arquivo; nenhuma é gravada. Com IOwait abaixo de 10%. |
| `bash tools/banco/montar-local.sh [pasta]` | Supabase LOCAL igual à produção: `supabase db reset` (todas as migrações) + dados do dump único (pede a senha do 7z) + senha só local nos usuários de teste. |
| `bash tools/rebuild-local.sh` | Build do app LOCAL (:3010) sem estourar a memória: para tudo, builda, religa Docker/Supabase e sobe o `next start`. |
| `tools/saude/` | Fotos de saúde da produção pelo Postgres (`LEIA-ME-fotos.md`, `diff-pgss.mjs`) e leitura do IOwait no painel (`iowait-recente.js`, `iowait-dia.js`). Fotos em `tools/saude/fotos/` (fora do git). |

Testes ponta a ponta contra o app e o banco locais: `tests/e2e/` (ver o LEIA-ME de lá).

Regras que valem para todas: produção só com IOwait abaixo de 20% (app) ou 10% (DDL/dump); migração pelo MCP `apply_migration`, nunca `db push`; Supabase local e Docker só com o IDE fechado (pouca memória).
