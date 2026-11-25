# Mídia do WhatsApp sem arquivo: resgate e correção (plano curto)

25/11/2026. Aprovado pelo Lucas (itens a–f). Branch `fix/midia-resgate`. Regra: migração compatível com o app no ar; portões de sempre; **parar antes do deploy**.

## O que aconteceu

- Mensagem **363153** (áudio que a loja de Mogi mandou pelo celular, canal 15, 25/11 11:31:59 BRT): o upload para o Storage deu **520**; a Edge não tentou de novo e gravou o texto "[audio]" sem arquivo.
- O pedido original ficou no cofre (`historico_bruto` id 7963, tipo `midia_sem_arquivo`), mas **ninguém lê o cofre**. A retenção do cofre é de **7 dias** (job de retenção de 21/10) — igual ao prazo da Meta para baixar mídia recebida por webhook. Prazo do resgate: **02/12/2026 11:31 BRT**.
- No cofre (desde 18/11) há 10 itens: só este é falha real; 9 foram **acima do limite de 20 MB** (decisão do item 3, depois).
- ~2.560 mensagens "[midia]" em 30 dias (Aletrini 2.425, JM 138) são tipos que a Edge não reconhece. Não se sabe o que eram (item f).

## Ordem de entrega

| # | O quê | Onde | Muda o que o usuário vê |
|---|---|---|---|
| **a** | Resgatar a 363153 a partir do cofre (script único: Graph → download → confere o sha256 do pedido → Storage → atualiza a mensagem). Backup da linha antes; volta = repor a linha e apagar o arquivo | script em `scripts/midia/resgatar-uma.mjs`, rodado agora | sim: a bolha vira o áudio |
| **M** | Migração aditiva em `mensagens`: `midia_status` (`pendente`\|`indisponivel`, nulo = normal), `midia_ref` (id da mídia na Meta), `midia_expira_em`, `midia_tentativas`; índice parcial das pendentes; job `resgatar-midias` no pg_cron a cada 15 min, **só quando houver pendente** (chama `/api/cron/resgatar-midias` com o `cron_secret` do Vault) | `supabase/migrations/<n>_mensagens_midia_pendente.sql` + teste SQL + volta | não (nenhuma linha nasce pendente até a Edge nova) |
| **App** | (c) bolhas: "Áudio — arquivo sendo recuperado" (pendente) e "Áudio — arquivo indisponível" (indisponível) no chat do lead e no painel de Comunicação; (d) rotina `lib/midia/resgate.ts` + `case 'resgatar-midias'` na rota de cron: busca de novo na Meta pelo `midia_ref`, grava no mesmo caminho determinístico (`<empresa>/m/wa-<id>.<ext>`), atualiza a mensagem; vencido o prazo ou a Meta respondendo que a mídia não existe → `indisponivel` | `lib/midia/resgate.ts`, `app/api/cron/[job]/route.ts`, `components/modules/leads/lead-modal.tsx`, `components/modules/comunicacao/conversa-painel.tsx` | sim |
| **Edge** | (b) até **2 novas tentativas** (0,5 s e 1,5 s) em 5xx, 429 ou tempo esgotado — na consulta à Meta, no download e no upload; o upload repete com o arquivo já na memória, **sem baixar de novo**; (c) falha transitória depois das tentativas → a mensagem nasce com o **tipo certo** (ex.: `audio`), sem arquivo, `midia_status = 'pendente'`, `midia_ref` e `midia_expira_em` (data da mensagem + 7 dias). Acima do limite de 20 MB continua como hoje (item 3); (e) comentário "30 dias" → 7 dias; (f) tipo desconhecido ("[midia]") passa a guardar o pedido original no cofre (`tipo = 'midia_desconhecida'`), **todas** (≈85/dia), com a retenção de **7 dias** que o cofre já tem — sem mudar como aparecem | `supabase/functions/webhook-leads/midia.ts` (novo, puro, com teste Deno) + `index.ts` | só para as mídias que falharem |

**Ordem de produção:** a (agora) → M → App (deploy da Vercel) → Edge. Edge antes do app faria o chat antigo mostrar a mídia pendente como "indisponível para o CRM" até o resgate; com o app primeiro, a tela já sabe mostrar "sendo recuperado".

## Portões

- Testes: Deno (`midia.test.ts`: repete em 520/429/tempo esgotado, não repete em 4xx, não baixa de novo no upload), `npm test` (rotina de resgate com Meta e Storage falsos: sucesso, mídia expirada, Meta 404, canal sem token), teste SQL da M no ritual local.
- Build no checkout principal; conferência visual do chat (lead e Comunicação) no app local com mensagens pendente e indisponível.
- Antes da M: backup não se aplica (só acrescenta colunas), volta escrita; IOwait; fora dos minutos 05–15.
- Deploy: **parar antes** e pedir o ok (app, depois Edge com `verify_jwt` desligado, como sempre; volta da Edge = `tools/deploy-edge.sh 6e089244 webhook-leads`, a v87 de hoje).
