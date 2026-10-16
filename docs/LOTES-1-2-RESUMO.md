# Lotes 1 e 2 da auditoria (16/10/2026) — estacionados fora da main

**Por que esta branch existe.** A auditoria passou a ter escopo EXCLUSIVO no
ZapIntel (e no que ele toca: RLS de `leads`/`lead_mensagens`, sino, contratos,
`lib/zapintel/ctx.ts`). Os lotes 1 e 2 de 16/10 mexeram em rotas do CRM fora
disso. Eles existiam só localmente, na branch `imob-dashboard` (commits
`5d07093` e `abde925`, nunca enviados). Foram estacionados aqui,
`audit/crm-fora-zapintel`, criada a partir de `origin/main` (`6f30cb4`), para
não se perderem e não chegarem à produção sem decisão.

**Nada disto está em produção. Nada foi executado no banco.**

## Commits nesta branch

| Commit aqui | Origem | O que é |
|---|---|---|
| `58d7d3f` | `5d07093` sem `app/api/zapintel/preview/route.ts` | Lote 1 — trancas nas rotas novas desde 18/08 |
| `eaa1460` | `abde925` sem `lib/zapintel/ponte.ts` | Lote 2 — datas, erros engolidos, recharts |
| `abbf5f9` | árvore de trabalho não commitada | Início do lote 3 (fuso) — **NÃO validado** |

O que é do ZapIntel ficou de fora daqui e está no stash
`zapintel-pendente-16-10` (ver "Separado para o ZapIntel" no fim).

As bases batem: a versão de cada arquivo em `origin/main` é exatamente a versão
anterior aos lotes (`git diff origin/main 5d07093^ -- <arquivos>` vazio), então
os patches entraram sem conflito.

## Legenda de validação

- **testado** — há caso em `tests/auditoria-rotas.test.ts` ou
  `tests/datas.test.ts` que roda a rota/função contra um Supabase falso
  (`tests/banco-falso.ts`). No lote 1, 18 dos 22 casos FALHAM no código
  anterior e passam neste (provado com `git stash` na imob-dashboard).
- **inspecionado** — revisão de código; compila (tsc) e o build passou na
  imob-dashboard, mas nenhum teste exercita o caminho.
- **não verificado** — nem teste nem conferência suficiente.

Nenhum item foi testado contra o banco real nem em produção.

Gravidade: ALTA = dado/controle de outra empresa ou perda de dado; MÉDIA =
escalada dentro da empresa, regra de negócio furada, número errado; BAIXA =
robustez, auditoria, erro engolido.

## Lote 1 — `58d7d3f` (origem `5d07093`)

| Arquivo(s) | Problema corrigido | Gravidade | Validação |
|---|---|---|---|
| `app/api/canais/whatsapp/route.ts`, `app/api/canais/meta/route.ts` | Conectar WhatsApp/Página com um id que já pertencia a OUTRA empresa trocava o dono do canal (upsert por tipo+external_id) e as mensagens dos clientes dela passavam a cair aqui. Agora 409, como o Instagram já fazia. | ALTA | testado |
| `app/api/equipe/criar-usuario/route.ts`, `app/api/equipe/atualizar-usuario/route.ts` | Admin criava/readmitia admin e rebaixava outro admin; dono podia deixar a empresa sem dono; e-mail com coringa no `ilike` enumerava contas de outros tenants. | MÉDIA | testado |
| `app/api/exportar/route.ts` | Exportação ignorava "ver de outros" (vendedor exportava a loja toda); CSV com fórmula (`= + - @`) não neutralizada. | MÉDIA | testado |
| `app/api/leads/mover/route.ts` | Perda sem motivo, com motivo de outra empresa ou para etapa inexistente; sair da perda não limpava motivo/data. | MÉDIA | testado |
| `lib/distribuicao.ts` | Distribuição reatribuía lead que já tinha dono (sem claim). | MÉDIA | inspecionado |
| `app/api/orcamentos/route.ts` | Lead de outra empresa aceito; valores negativos; orçamento aprovado editável. | MÉDIA | testado |
| `app/api/orcamento/[token]/route.ts` | Aprovação pública lia o lead sem filtrar a empresa. | MÉDIA | inspecionado |
| `app/api/troca/cotacoes/route.ts`, `app/api/troca/precos/route.ts` | Cotação já usada no PDV editável/apagável; vendedor sobrescrevia valor já preenchido. | MÉDIA | testado |
| `app/api/troca/regras/route.ts`, `app/api/troca/precos/familia/route.ts` | Regras e família editáveis por vendedor (só dono/admin deveria). | MÉDIA | inspecionado |
| `app/api/imob/negocios/route.ts` | Valor não validado antes da comissão manual; corretor/captador fora da equipe; vendedor virava captador do imóvel dos outros; data em UTC. | MÉDIA | inspecionado |
| `app/api/superadmin/empresas/[id]/impersonar/route.ts`, `lib/mesma-origem.ts` (novo) | Impersonação registrava log antes da RPC, sem checagem de origem; DELETE poluía a auditoria. `mesmaOrigem` extraída para `lib/` (era local do preview do ZapIntel). | BAIXA | inspecionado |
| `app/api/funis/route.ts` | Funil padrão podia ficar zerado; exclusão de funil contava só a loja, não a empresa. | BAIXA | inspecionado |
| `app/api/superadmin/empresas/[id]/overrides/route.ts` | Limites inválidos aceitos (0 = ilimitado passava por engano). | BAIXA | inspecionado |
| `app/api/ranking/metas/route.ts` | Meta gravável para usuário fora da equipe. | BAIXA | inspecionado |
| `lib/automacoes.ts` | Automação que não gravava a tarefa engolia o erro (o cron não tentava de novo). | BAIXA | inspecionado |
| `app/api/cron/[job]/route.ts` | "Amanhã" do cron calculado em UTC. | BAIXA | inspecionado |
| `app/api/admin/filiais/route.ts` | Desativar filial não conferia o erro. | BAIXA | inspecionado |
| `tests/auditoria-rotas.test.ts` (novo), `tests/banco-falso.ts` | 22 casos da auditoria; banco falso ajustado. | — | roda |

## Lote 2 — `eaa1460` (origem `abde925`)

| Arquivo(s) | Problema corrigido | Gravidade | Validação |
|---|---|---|---|
| `lib/datas.ts`, `tests/datas.test.ts` (novo) | `formatarData` dava texto diferente no servidor (UTC) e no navegador (Brasília): timestamp depois das 21h saía com o dia seguinte no servidor (dia errado + erro de hidratação #418). Agora timestamp em SP, data pura em UTC. | MÉDIA | testado (processo em UTC, SP e Tóquio; falha no helper anterior em UTC) |
| `app/api/admin/c2s/route.ts`, `lib/c2s.ts` | Salvar config respondia ok sem gravar quando o banco recusava; remover não apagava o segredo de entrada (webhook seguia aceitando). | MÉDIA | inspecionado |
| `app/api/cron/[job]/route.ts` | sync-stripe contava update recusado como atualizado e o catch vazio escondia o Stripe fora do ar; ponte-vendas abortava o job inteiro na falha de uma empresa (agora isola por empresa). **Arquivo misto**: o job ponte-vendas é do ZapIntel, por isso ficou aqui como fora do escopo. | BAIXA | inspecionado |
| `app/api/reativacao/route.ts` | Aceitava `cadencia_id` de outra empresa. | MÉDIA | inspecionado |
| `package.json`, `package-lock.json` | `recharts` sem nenhum import desde `8483e7a` — removido. | BAIXA | inspecionado (build ok na imob-dashboard, 182 páginas) |

## Início do lote 3 — `abbf5f9` (NÃO validado, não vai para a main assim)

Trabalho interrompido. `lib/datas.ts` ganha `formatarHora`, `formatarDataHora`,
`partesSP`, `diaSP`, `mesSP`, `meiaNoiteSP`, `inicioMesSP`, `inicioAnoSP`;
`tests/datas.test.ts` cobre os helpers; `dashboard-imob.tsx` corrige a hora da
visita (saía 3h adiantada no servidor) e a janela "hoje". Só 1 dos 68 pontos
classificados foi aplicado. Helpers: testado. dashboard-imob: inspecionado.
Build: não verificado.

## Validação desta branch (16/10)

- `npx tsc --noEmit`: sem erros (exit 0).
- `npm test`: 87/87 passaram.
- `npm run build`: **não rodado nesta branch** (rodou ok na imob-dashboard com os
  lotes 1 e 2, 182 páginas).

## Separado para o ZapIntel (stash `zapintel-pendente-16-10`, não commitado)

- `lib/zapintel/ponte.ts` (do lote 2): `gravarPonte` passa a lançar erro se não
  conseguir ler as ligações manuais (`zapintel_venda_lead`, `como = 'manual'`).
  Antes, com a leitura falhando o conjunto vinha vazio e o upsert sobrescrevia
  justamente as ligações confirmadas à mão. Gravidade MÉDIA (perda de dado do
  ZapIntel). Inspecionado.
- `app/api/zapintel/preview/route.ts` (do lote 1): troca a função local
  `mesmaOrigem` pelo import de `lib/mesma-origem.ts`. Sem mudança de
  comportamento. **Depende de `lib/mesma-origem.ts`**, que é fora do escopo e
  está nesta branch — por isso o stash leva uma cópia dele para compilar sozinho.

## Também na imob-dashboard e fora desta branch

`git cherry origin/main imob-dashboard` aponta mais 20 commits antigos cujo
patch não é idêntico a nenhum da main (vários foram entregues por cherry-pick
com ajuste, então o hash e o patch mudam). Não fazem parte dos lotes 1 e 2 e
não foram tocados; continuam preservados na `imob-dashboard`.

## Deploy

`vercel.json` não restringe deploy por branch (`git.deploymentEnabled` ausente).
Pelo histórico do projeto `crm-saas` na Vercel, branches que não são a `main`
geram deploy de **preview** (`target: null`; ex.: os da `imob-dashboard`), e
produção sai só da `main` (alias `crm-saas-git-main`). O push desta branch gera
um preview, não produção. Crons do `vercel.json` só rodam em produção.
