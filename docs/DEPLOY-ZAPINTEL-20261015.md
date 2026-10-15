# Publicação — ZapIntel e segurança do CRM (15/10/2026)

Nada abaixo foi executado. Cada passo espera autorização explícita do Lucas.
Ensaio completo (00 → 02 → 01 → 03 → 04, os arquivos exatos) rodado em 15/10
numa transação aberta com `begin;` e abortada no fim — **conferido depois que
nada ficou gravado**.

## Já em produção

| O quê | Estado |
|---|---|
| Código `74139b3` (auditoria + fechamento) | Vercel READY, sem erro de runtime |
| `supabase/funcoes/seguranca_20261015.sql` (backups fora da API, FK, índice, turnos, canal ao vivo, RLS de leads/lead_mensagens, view de órfãos sem anônimo) | aplicado |
| **00 instantâneo** (autorizado 15/10) | aplicado — `backup.politicas_pre_20261015` 136 regras, `backup.permissoes_funcoes_pre_20261015` 53 funções, `backup.funcoes_zapintel_pre_20261015` 3 definições; não exposto na API |
| **02 contratos** (autorizado 15/10) | aplicado — listagem: dono/admin/vendedores JM 61, Imobiliária 0, Preview · Loja 0 (antes 61, conferido pela API real com a sessão dela); exclusão de fundo da JM pela Preview: nada apagado; URL pública 200. Assinaturas das demais regras, permissões e funções idênticas às de antes |

## Backup e recuperação

- **Backup do Supabase:** não verificável daqui (painel → Database → Backups). Tratar como inexistente até conferir.
- **Passo 00** guarda, no schema `backup` (fora da API), todas as políticas de `public` e `storage`, as permissões de EXECUTE de todas as funções e o código das 3 funções que a 01 altera. Só cria tabelas.
- **Cada migração tem `.volta.sql`**, provado em transação desfeita. A 03 guarda as próprias 96 definições em `backup.rls_politicas_20261015`.
- **Código:** Vercel → Deployments → "Promote" no deploy anterior (`74139b3`).

## Ordem e checklist

| # | Operação (exata) | O que altera | Resultado esperado | Se falhar / reverter |
|---|---|---|---|---|
| ~~00~~ ✔ | `supabase/pendentes/00_instantaneo.sql` | cria 3 tabelas em `backup` | 136 políticas, 53 funções, 3 definições guardadas | nada a reverter; não muda o que está em uso |
| ~~02~~ ✔ | `supabase/pendentes/02_contratos_bucket.sql` | 3 políticas de `storage.objects` (bucket contratos) | conta da Preview · Loja: listar `contratos/1` = **0** (hoje 61); dono JM = 61; URL pública do fundo = 200 | `02_contratos_bucket.volta.sql` |
| 01 | `supabase/pendentes/01_sem_resposta_do_cliente.sql` | 3 funções do ZapIntel | rodapé do dashboard: "N sem análise · 55 sem resposta do cliente"; funil com a fatia nova; lista filtrada mostra os 55 | `01_sem_resposta_do_cliente.volta.sql` |
| P | `git -C ".../scratchpad/wt-perfil" push origin entrega-perfil-ia:main` | `components/layout/topbar.tsx` (sino), `app/zapintel/layout.tsx` + `lib/zapintel/ctx.ts` (ZapIntel só dono/admin/superadmin) + docs/SQL/testes | Vercel READY; sino com o total certo (admin JM: 1.109 leads) | Vercel → Promote `74139b3` |
| 03 | `supabase/pendentes/03_rls_uma_vez_por_consulta.sql` | 96 políticas de RLS do CRM | `supabase/testes/zapintel_acesso.sql` "0 falhas"; telas do CRM abrindo normalmente | `03_rls_uma_vez_por_consulta.volta.sql` |
| 04 | `supabase/pendentes/04_funcoes_fora_da_api.sql` | EXECUTE de 10 funções | tarefas, vendas, leads continuam recebendo a loja ao gravar; avisos do linter somem | `04_funcoes_fora_da_api.volta.sql` |
| 05 | `supabase/pendentes/05_zapintel_so_dono_admin.sql` (depois do push) | `zapintel_escopo`: vendedor/técnico recusados (42501) | `zapintel_acesso.sql` 18/18 ok; dono, admin, superadmin e Imobiliária seguem entrando (ensaio 15/10) | `05_zapintel_so_dono_admin.volta.sql` |

Aplicação: um arquivo por vez (pelo Claude com `apply_migration`, que é
transacional, ou no SQL Editor do Supabase). Conferir o resultado esperado antes
do próximo.

## 03 — riscos, pré-checagens e critério de parada

- **Risco:** maior alcance (CRM inteiro). A semântica é idêntica — as funções são
  `STABLE` e o teste de 15/10 comparou o conteúdo visível de 70 tabelas para 7
  perfis (525 comparações, 0 diferenças) e a gravação entre empresas.
- **Risco operacional:** `ALTER POLICY` trava cada tabela por instantes. O arquivo
  usa `lock_timeout = 5s`: se alguma estiver ocupada, falha **inteira** e nada muda.
- **Pré-checagens embutidas:** para sem mudar nada se não houver exatamente 96
  políticas no padrão antigo ou se o backup já existir.
- **Antes de rodar:** nenhuma consulta longa (`select count(*) from pg_stat_activity
  where state='active' and now()-query_start > interval '5 seconds'` = 0) e horário calmo.
- **Parar e rodar a volta se:** `zapintel_acesso.sql` acusar falha, qualquer tela do
  CRM mostrar erro de permissão ou vazio inesperado, ou erro novo no Sentry/Vercel.

## 04 — riscos, pré-checagens e critério de parada

- **Gatilhos:** sem EXECUTE, o gatilho continua disparando (provado: `tarefas`
  gravada por logado recebeu a loja 3).
- **Funções de loja ao anônimo:** todos os usos no código são com sessão; as 3
  políticas abertas ao anônimo que citam `filiais_visiveis` (`canais_conectados`,
  `cobrancas`) já recusam o anônimo antes (erro em `get_empresa_id`) — testado
  antes/depois: mesmo resultado.
- **Parar e rodar a volta se:** alguma gravação perder a loja, agendamento/cardápio
  público der erro novo, ou o Sentry mostrar "permission denied for function".

## Testes pós-deploy

Automáticos (depois de cada passo): `npm test` (48), `BANCO=1 npm test` (53),
`supabase/testes/zapintel_acesso.sql` (19 ok), `supabase/testes/contratos_e_sino.sql`
(12/12 depois da 02), `bash scripts/verificar-auditoria.sh`.

Com login — `tests/producao/conferir.js`, rodado na janela logada (só lê):

| Conta | Papel do script | Esperado |
|---|---|---|
| Lucas (dono JM) | `dono` | 615 e 1706 = 200, 1204 = 404; funil interno = 422; corpo nulo = 400; contratos/1 = 61 |
| `reviewer.meta@jmstore.app` | `vendedor` | depois do push: tela "O ZapIntel é usado pelo dono e pelos administradores" e **403 em todas as rotas** (até 15/10 via só Mogi) |
| superadmin | `superadmin` | 615/1706 = 200; e na tela /superadmin: "Prever" abre o ZapIntel da empresa, "Sair do preview" volta |
| "Meta" (Preview · Loja) | `sem-zapintel` | 403 nas rotas; contratos/1 = **0** depois da 02 (61 em 15/10, antes) |

Na tela: sino do /dashboard com o total certo; editor de modelo de contrato
sobe imagem; contrato emitido mostra os fundos; excluir um modelo de teste apaga
os fundos dele. IA (análise, sugestão, robô, "Parar") só com a ANTHROPIC_API_KEY.

**Produção só é "validada" depois desses testes com as contas reais.**

## Fora desta publicação

As 75 tabelas do schema `backup` e a view `v_orfaos_chat_midia` ficam intactas
até decisão separada (`docs/BACKUP-INVENTARIO-20261015.md`).

## Observação sobre o bucket de contratos (15/10, depois da 02)

O bucket continua PÚBLICO de propósito (o contrato emitido usa os fundos por URL).
Num bucket público, o Storage entrega o arquivo a quem souber o caminho — tanto em
`/object/public/` quanto em `/object/contratos/` (conferido: 200 para a conta da
Preview · Loja). Isso não é exposição nova: o caminho é um UUID aleatório e, depois
da 02, ninguém de fora consegue mais LISTAR os nomes. Para fechar até a leitura por
caminho, o bucket teria de virar privado e a emissão do contrato passaria a usar
URL assinada (mudança de código em lib/contrato-modelo.ts) — fica como opção.
Exclusão dentro da própria empresa (liberada pela 02) não foi testada com arquivo
real, para não apagar fundo em uso; conferir excluindo um modelo de teste.

## Validação com contas reais — registro

| Data | Conta | Resultado |
|---|---|---|
| 15/10 | "Meta" (Preview · Loja, sem ZapIntel) | tela "não habilitado"; 403 em todas as rotas; contratos da JM: 61 antes da 02 → **0** depois; exclusão de fundo da JM: nada apagado |
| 15/10 | JM Store Importados (dono) | conversa 615 e 1706 = 200, 1204 (Imobiliária) = 404, lead inválido = 400, corpo nulo = 400, funil interno = 422 sem IA; fila do robô 45 + 33; contratos/1 = 61; URL pública = 200; sino: 865 leads com não lidas (view e contador iguais), 10.053 mensagens; telas Dashboard, Leads (`?pagina=999` → 38), ficha 615, Atendimento, Insights e Pós-venda abrindo, "Ao vivo"; 0 erro de runtime na Vercel (2 h) |
| 15/10 | vendedor (`reviewer.meta@jmstore.app`, só Mogi) | conversa 615 = 200, **1706 (Jaguariúna) = 404**, 1204 = 404; análise e sugestão para o 1706 = 404 sem IA; corpo nulo = 400; robô só com leads de Mogi (36 + 16); leads pela API só da loja 3; dashboard 1.573 conversas (dono: 1.796); lista 1.640 sem nenhum de Jaguariúna; ficha do 1706 "não encontrado"; contratos/1 = 61 (mesma empresa); sino 867 leads; 0 erro de runtime. Observação: o subtítulo diz "toda a rede" para quem só vê Mogi — texto enganoso, não é vazamento |
| 15/10 | superadmin (única conta, sem vínculo com empresa) | /superadmin abre; "Prever" (formulário) na Imobiliária → /zapintel com a faixa "Modo preview", dados da Imobiliária (0 conversas), lead 615 da JM = 404 dentro da prévia, corpo nulo = 400, fila do robô = 200; "Sair do preview" → volta a /superadmin/empresas e o ZapIntel cai na JM sem faixa (615 e 1706 = 200); link GET antigo `?empresa=3` NÃO religa a prévia (conferido após recarregar); 0 erro de runtime. Impersonação não testada (grava na conta e no log — só com autorização) |
| — | contratos (subir/emitir/excluir modelo de teste) | **pendente** — grava/apaga arquivo: só com modelo de teste e autorização |

## Decisão de 15/10: ZapIntel só para dono, admin e superadmin

Pedido do Lucas: *"vendedor deve ser bloqueado, só dono, admin e superadmin"*.
Antes, o link ficava no /admin (dono/admin), mas o vendedor que digitasse
`/zapintel` entrava e via a própria loja (conferido em produção com
`reviewer.meta@jmstore.app`). Trava em três camadas:

| Camada | Onde | Estado |
|---|---|---|
| Tela | `app/zapintel/layout.tsx` — mensagem e "Voltar ao CRM" | no próximo push |
| Rotas de API | `lib/zapintel/ctx.ts` (`zapintelAcesso` → 403) | no próximo push |
| Banco (telas chamam direto) | `supabase/pendentes/05_zapintel_so_dono_admin.sql` | pendente — ensaio: dono/admin/superadmin/Imobiliária entram, os 2 vendedores recusados, volta idêntica |

Ordem: push primeiro, depois a 05 (com a 05 antes, o vendedor veria a tela de
erro do painel em vez da mensagem). Fora do escopo: o assistente do CRM (robô do
/dashboard), que não é o ZapIntel, continua disponível ao vendedor.

## Push autorizado — deploy `3a69d0b` (15/10)

- Push `74139b3..3a69d0b` (7 commits, autor Lucas Ramponi); Vercel **READY**; 0 erro de runtime na última hora.
- Vendedor `reviewer.meta@jmstore.app`, depois do deploy: tela do ZapIntel = "O ZapIntel é usado pelo dono e pelos administradores…", sem painel; rotas conversa 615/1706/1204 = **403**; análise e sugestão para o 615 (loja dele) = **403** antes de qualquer IA; fila do robô = 403.
- **Ainda aberto até a 05:** a função do banco `zapintel_resumo`, chamada direto pela API com a sessão do vendedor, devolve dados (200).
- Sino (sessão do vendedor, /dashboard): título "(869)" = contador 869 = view 869.
- Console: React #418 (hidratação) no /dashboard — **anterior a este deploy**: `saudacao()` em components/modules/dashboard/dashboard-view.tsx (sem mudança desde 01/09) usa a hora do servidor (UTC) na renderização e a do navegador (SP) na hidratação. Gravidade baixa; correção proposta, não feita.

## Migração 05 aplicada (autorizada, 15/10)

- Pré-condição conferida (ramo antigo presente, não aplicada, 0 consultas longas). Hash de `zapintel_escopo`: antes `2b2e4fd4…`, depois `c31499c7…`; só essa função mudou.
- `supabase/testes/zapintel_acesso.sql`: **18 ok, 0 falhas** (antes 16/18).
- Vendedor `reviewer.meta@jmstore.app`, chamada direta pela API do banco: `zapintel_resumo`, `zapintel_dashboard` e `zapintel_leads_lista` = **403** "ZapIntel restrito ao dono e aos administradores" (antes 200).
- Dono e admin da JM (contas reais, sessão simulada no banco): escopo, resumo, dashboard, lista, insights, atendimento, pós-venda, "como a loja conversa" e listas do dashboard — todos ok.
- Vercel: 0 erro de runtime (1 h). Sentry: nenhum problema novo ou reaparecido (2 h).
- Rollback: **não foi necessário** (`05_zapintel_so_dono_admin.volta.sql` segue pronto).
- Arquivo × banco: `zapintel_escopo` em supabase/funcoes/zapintel_dashboard.sql atualizado para o estado aplicado (só no repositório; nada executado no banco). Conferido por hash: o corpo do arquivo é idêntico ao `prosrc` do banco (md5 `abe1f0d4…`, 1.367 caracteres) quando se descontam 2 linhas de comentário sobre a prévia do superadmin que já existiam no repositório e nunca foram gravadas no banco — não mudam o comportamento.

### Releitura com o dono depois da 05 (navegador, conta dona da JM)

Só leitura. Conversa 615 e 1706 = 200, 1204 (Imobiliária) = 404, lead inválido = 400, corpo nulo = 400, funil interno = 422 sem IA; fila do robô 48 + 35; funções do banco chamadas com a sessão do dono = 200; contratos/1 = 61; sino 869. Telas Dashboard, Leads (1.886), ficha 1706, Atendimento, Insights e Pós-venda (254) abrindo, "Ao vivo"; console sem erro; Vercel e Sentry sem nada novo.
