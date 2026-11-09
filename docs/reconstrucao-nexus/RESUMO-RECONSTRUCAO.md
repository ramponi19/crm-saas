# Resumo dos relatórios de etapa (ago–out/2026)

Este arquivo substitui seis relatórios de etapas já encerradas que estavam em `docs/`:
`AUDITORIA-2026-08-18.md`, `DEPLOY-ZAPINTEL-20261015.md`, `ACHADO-CONTRATOS-ESCRITA-20261016.md`,
`DECISAO-BUCKET-CONTRATOS-20261016.md`, `AUDITORIA-ZAPINTEL-RELATORIO-FINAL-20261016.md` e
`ZAPINTEL-INVENTARIO-QUALIDADE-20261017.md`. Os originais saíram do repositório e continuam no
histórico do git (`git log --all -- docs/<nome>.md` acha o commit; `git show <commit>:docs/<nome>.md`
recupera o texto). Resumo escrito em 09/11/2026.

Tudo o que aparece como "aberto em <data>" era o estado na data do relatório. Este resumo não
confere se foi resolvido depois.

---

## 1. Auditoria completa do CRM — 18/08/2026 (`AUDITORIA-2026-08-18.md`)

**Escopo:** módulos nunca revisados (garantia/assistência, orçamentos, financeiro, compras,
relatórios), a rota pública de aprovação, as rotas de escrita da API e os webhooks de pagamento.
Três passadas no mesmo dia: código e banco, rotas abertas (sem login), e teste na tela em produção.

**Achados e o que foi feito:**

1. **Orçamentos fantasma (31 de 31).** `/api/leads/mover` criava orçamento vazio (`rascunho`,
   total 0, sem itens) toda vez que o lead entrava numa etapa `negociacao`. Bloco removido; as 31
   linhas foram para `backup.orcamentos_fantasma_20260818` e apagadas.
2. **Aprovação por link criava venda sem custo, peça nem cliente** (`app/api/orcamento/[token]/route.ts`).
   Como `vendas.valor_custo` tem default 0 e `lucro` é coluna gerada, a venda saía com 100% de margem
   e status `concluida`; sem claim, balcão e link podiam vender a mesma peça duas vezes. Agora lê a
   unidade antes, faz claim atômico (`.in('status', ['disponivel','reservado'])`) e grava peça, custo,
   série, vendedor e cliente; se a peça já saiu, não cria a venda e escreve o motivo no orçamento.
   Migração `orcamentos_guarda_cliente_id` (o orçamento só guardava nome/telefone em texto).
3. **Garantia:** dias restantes eram digitados. Agora a OS busca a venda pelo IMEI, lê
   `garantia_dias` da loja (padrão 90) e pré-preenche só o que não foi tocado.
4. **Financeiro:** nenhuma venda gera `lancamentos_financeiros`, então o "Resultado líquido"
   contradizia o Dashboard. A tela passou a avisar isso e mostrar o faturamento do mês ao lado.
5. **Relatórios:** "Lucro total" = faturamento (100% das vendas sem custo). O card agora avisa
   "N de M sem custo lançado".
6. **Compras/encomenda:** fluxo certo, mas custo zero; entrou aviso não bloqueante no modal.
7. **Webhooks de pagamento** (Asaas, Efí, Mercado Pago, PagSeguro) aceitavam "pago" sem assinatura
   quando o segredo não estava configurado, e o formulário nem tinha campo para o segredo. Agora
   recusa sem assinatura e o formulário tem `webhook_secret`/`webhook_token` (tabelas de pagamento
   estavam vazias, custo zero).
8. **Duas rotas de escrita sem checar papel:** `/api/payments/config` (vendedor podia trocar a conta
   de recebimento) e `/api/funis` (mudava o funil padrão de todo lead novo). Ambas exigem owner/admin.
9. **Cadastro público sem teto** (`/api/register` cria usuário confirmado e empresa, por fora do rate
   limit do Supabase). Migração `rate_limit_para_rotas_publicas` (tabela + `rate_limit_bump`, só
   `service_role`) e `lib/rate-limit.ts`; a chave é HMAC-SHA256 do IP (não guarda o IP). Tetos por
   hora: 5 cadastro, 20 agendamento, 30 pedido; depois 20 em `/api/imob/[slug]/lead` (pedido do dono).
   Se o contador falhar, a chamada passa.
10. **Feed público `/api/veiculos/[slug]`** expunha `inventario_unidades.observacoes` (nota interna
    com nome de cliente) e o estoque com preços de qualquer empresa. `observacoes` saiu e o feed exige
    a capacidade `usaPlaca`; sem ela, 404 igual a slug inexistente.
11. **Aprovação de OS por link** criava tarefa dupla (checagem antes do UPDATE). Condição foi para
    dentro do UPDATE.
12. **Agendamento e pedido** aceitavam qualquer loja. Rota e página exigem a capacidade do contrato
    de segmento (`agendaClinica`/`agendaVisitas`, `usaComanda`), sem nome de segmento no código.
13. **Contrato sem marcador da loja:** o modelo da JM tinha a vendedora em texto fixo ("SUA EMPRESA
    LTDA", CNPJ fictício). Migração `empresa_dados_para_o_contrato` (e-mail, CEP, endereço, número,
    complemento, bairro, cidade, estado, representante nome/CPF), marcadores no catálogo, campos em
    Minha empresa e bloco da vendedora trocado por marcadores (backup em
    `backup.contrato_modelos_20260818`; nenhuma cláusula tocada). A emissão avisa o que falta na loja.
    A qualificação pessoal de quem assina continua texto fixo no modelo, de propósito.
14. **Encomenda aceitava venda de R$ 0,00.** Agora bloqueia (preço é obrigatório; custo é só aviso).
15. **Coluna `date` voltava um dia** (`new Date('2026-08-18')` é meia-noite UTC). `lib/datas.ts`
    monta data pura no fuso local; aplicado em Compras.
16. **Achados 16–20:** "Converter em cliente" criava cliente sem CPF/endereço (agora avisa o que
    falta); página pública do orçamento de venda não mostrava o item; venda por link sem lead ficava
    sem vendedor; `vendas.unidade_id` só gravado na entrega pendente; modal do PDV mostrava total
    errado com troca; entrada de estoque não gravava o responsável.

**Conferido sem defeito:** integridade venda/unidade/empresa; as cinco funções `SECURITY DEFINER`
checam `is_super_admin` sem `EXECUTE` para PUBLIC; `assistente_config`, `assistente_uso` e
`historico_bruto` (RLS sem policy) são só de service role; tokens de link público são UUID v4.

**Teste na tela (3ª passada):** dado de teste apagado no fim (cópia em
`backup.teste_auditoria_20260818_*`). Passaram registrar chamada, aprovação por link (custo e lucro
certos), PDV com troca, encomenda, garantia pelo IMEI e emissão de contrato com aviso de campos vazios.

**Aberto em 18/08:**
- Preencher os dados da JM em Administração → Minha empresa (endereço, quem assina) e a qualificação
  de quem assina no modelo; três contratos já tinham saído sem identificar a vendedora.
- Lançar o custo das vendas (enquanto for zero, lucro = faturamento).
- Tabela de preços vazia, metas de comissão zeradas, três clientes sem CPF/endereço.
- Termo de garantia e termo de entrega do usado (documentos da loja).
- Adiado de propósito: gerar lançamento financeiro a partir da venda (risco de duplicar); derrubar as
  5 colunas legadas de veículo em `inventario_unidades`.
- Data `date` em `chaves_imoveis.devolucao_prevista` (tela da imobiliária) só reportada.

---

## 2. Publicação do ZapIntel e segurança do CRM — 15/10/2026 (`DEPLOY-ZAPINTEL-20261015.md`)

**Escopo:** roteiro de publicação das migrações de `supabase/pendentes/`, validação com contas reais
e a correção do React #418 no /dashboard. Cada passo com autorização do Lucas; ensaio completo em
transação desfeita.

**Ordem e estado em 15/10:**

| # | Arquivo | Efeito | Estado em 15/10 |
|---|---|---|---|
| — | `supabase/funcoes/seguranca_20261015.sql` | backups fora da API, FK, índice, turnos, canal ao vivo, RLS de `leads`/`lead_mensagens` | aplicado |
| 00 | `00_instantaneo.sql` | guarda em `backup` 136 políticas, 53 permissões de função, 3 definições | aplicado |
| 02 | `02_contratos_bucket.sql` | bucket `contratos` isolado por empresa | aplicado (outra empresa: 61 → 0) |
| 01 | `01_sem_resposta_do_cliente.sql` | classe "sem resposta do cliente" | pendente (aplicada 16/10, ver §5) |
| 03 | `03_rls_uma_vez_por_consulta.sql` | 96 políticas com `(select get_empresa_id())` | pendente |
| 04 | `04_funcoes_fora_da_api.sql` | tira EXECUTE de 10 funções | pendente |
| 05 | `05_zapintel_so_dono_admin.sql` | `zapintel_escopo` recusa vendedor (42501) | aplicado; `zapintel_acesso.sql` 16/18 → 18/18 |

Toda migração tem `.volta.sql` ensaiado. A 03 usa `lock_timeout = 5s` e pré-condição (contagem
exata de políticas); seu ensaio comparou 70 tabelas × 7 perfis (525 comparações, 0 diferenças).

**Decisão de 15/10 (Lucas): ZapIntel só para dono, admin e superadmin.** Trava em três camadas:
tela (`app/zapintel/layout.tsx`), rotas (`lib/zapintel/ctx.ts`, 403) e banco (migração 05). Push
antes da 05. O assistente do CRM continua disponível ao vendedor. Deploy `3a69d0b` (READY).

**Validação com contas reais (15/10):** dono, vendedor de teste (só Mogi), admin da rede, superadmin
e a conta "Preview · Loja". Conversa de outra loja = 404, funil interno = 422, corpo nulo = 400,
vendedor recusado depois da 05, prévia do superadmin entra e sai, contratos de outra empresa = 0.
Sino conferido com a view; a diferença entre contas segue o seletor de loja (não é defeito). Arquivo
de teste no bucket: subiu, só a dona vê, apagado (URL passa a 400).

**React #418:** commit `cd8d50e` padroniza `America/Sao_Paulo` em
`components/modules/dashboard/dashboard-view.tsx` (servidor em UTC × navegador em SP). Limitação
aceita: se a hora virar 12h/18h/meia-noite entre render e hidratação, o #418 ainda pode ocorrer.

**Aberto em 15/10:**
- Backup do Supabase não verificável pelo painel; tratar como inexistente até conferir.
- Migrações 03 e 04 sem autorização.
- Bucket `contratos` público (leitura por caminho); opção de privado com URL assinada (decidido em §4).
- #418 com causas próprias em `/leads` (quadro sem `id` fixo, "há X min"), `/tarefas`, `/agenda` e no
  gráfico de meses (`area-chart`).
- 75 tabelas do schema `backup` e a view `v_orfaos_chat_midia` esperando decisão
  (`BACKUP-INVENTARIO-20261015.md`).
- Subtítulo "toda a rede" para vendedor que só vê Mogi (texto enganoso, não vazamento).
- Impersonação e emissão de contrato não testadas (gravam dado real).

---

## 3. Achado de escrita nos contratos — 16/10/2026 (`ACHADO-CONTRATOS-ESCRITA-20261016.md`)

**Gravidade ALTA.** Citado por `supabase/pendentes/06_contrato_modelos_escrita_dono_admin.sql`.

**O problema:**
1. As políticas de escrita de `contrato_modelos` (INSERT, UPDATE) e `contrato_documentos` (INSERT,
   UPDATE, DELETE) checam só `empresa_id = get_empresa_id()`, não o papel; em `contratos_venda` (só
   INSERT) checam empresa e loja visível. `authenticated` tem grant de escrita. A regra "só dono e
   admin" existia só nas rotas `app/api/contrato-modelo` e `app/api/contrato-documentos`
   (`requireEmpresaRoleApi(['owner','admin'])`): um vendedor escrevia nessas tabelas pela API do
   Supabase, por fora das rotas.
2. O HTML do modelo (`texto_html`) e o `fundo_url` entram crus no contrato (`renderizarModelo` em
   `lib/contrato-modelo.ts`), impresso com `window.open('')` + `document.write`
   (`imprimirContratoHTML` em `lib/contrato-tipos.ts`), na mesma origem do app, sem CSP, com a sessão
   do Supabase em cookie legível por JavaScript.

Dado do cliente está protegido (todo marcador passa por `esc()`). **Por que ALTA:** sozinho fica
dentro da empresa, mas se o superadmin imprimir um contrato enquanto impersona, um vendedor de
qualquer cliente ganharia a sessão que vale para a plataforma inteira.

**Evidência de não uso (16/10):** 63 contratos e 6 versões de modelo, zero `<script>` extra, zero
`on…=`, zero `javascript:`, zero fundo fora do bucket.

**Tratamento imediato — migração 06:** INSERT/UPDATE/DELETE em `contrato_documentos` e INSERT/UPDATE
em `contrato_modelos` exigem a empresa **e** `is_empresa_admin(empresa_id)`. SELECT não muda;
`contrato_modelos` segue sem DELETE. Nenhum fluxo do app escreve nessas tabelas com sessão de
vendedor. Ensaio com `supabase/testes/contratos_escrita.sql`: antes 23 ok/5 falhas (todas do
vendedor), com a 06 28/0. Estava preparada e não aplicada quando o achado foi escrito; foi aplicada
em 16/10 13:18 (migração `p06_p01_20261016`, ver §5).

**O que a 06 não fecha:** `contratos_venda` continua aceitando INSERT de vendedor (é ele quem emite
no PDV) e o HTML arquivado é o que a 2ª via imprime.

**Regra operacional até a fase CRM:** não imprimir contrato (emissão, 2ª via ou prévia do modelo)
enquanto estiver impersonando uma empresa como superadmin.

**Aberto em 16/10 (fase CRM):**
- Sanitizar `texto_html` ao salvar (lista branca de tags/atributos).
- Validar `fundo_url` (só o bucket `contratos`, na pasta da empresa).
- Imprimir em `iframe` com `sandbox` sem `allow-same-origin` (emissão, 2ª via e prévia).
- Contrato arquivado: emitir no servidor ou tratar o HTML arquivado como não confiável.
- Avaliar se o cookie de sessão precisa ser legível por JS e adotar CSP.

---

## 4. Decisão do bucket de contratos — 16/10/2026 (`DECISAO-BUCKET-CONTRATOS-20261016.md`)

Citado por `tests/banco.test.ts`.

**Decisão:** o bucket de Storage `contratos` **continua público**; não vira privado nem passa a URL
assinada. Desde a 02 (15/10) as políticas `contratos_leitura_do_tenant`, `contratos_upload_do_tenant`
e `contratos_delete_do_tenant` só deixam listar, enviar e apagar na pasta da própria empresa, e o
anônimo não lista. "Público" quer dizer só: quem tem o caminho exato (UUID aleatório) baixa o arquivo.

**Por quê (diagnóstico de 16/10, só leitura):**
- 61 arquivos `image/jpeg`, 4,3 MB, todos da JM, enviados entre 31/07 e 03/08: fundos dos modelos
  (capa e papel timbrado).
- Nenhum dado de cliente entra nessas imagens por construção: o importador
  (`lib/contrato-importar-pdf.ts`) remove o texto do PDF antes de gerar o fundo. Os 63 contratos
  emitidos usam as mesmas 11 imagens.
- Fechar custaria caro: o contrato é HTML que usa o fundo por URL, e os 63 contratos em
  `contratos_venda.html` têm a URL pública gravada; com bucket privado a 2ª via sairia sem capa nem
  timbrado. O vendedor imprime no PDV, Encomenda, Termos e Histórico.

**Onde o dado sensível está:** `contratos_venda` (colunas `dados` e `html`), com RLS
(`contrato_tenant_select`/`contrato_tenant_insert` por empresa e `filiais_visiveis()`, sem UPDATE nem
DELETE). Matriz de 16/10 (63 contratos, 32 na loja 3 e 31 na loja 6): admin da rede vê 63, vendedor
só a sua loja, outra empresa 0, superadmin sem impersonar 0, anônimo recusado.

**Condições — reavaliar obrigatoriamente se qualquer uma mudar** (aí o bucket vira privado com URL
assinada):
1. O bucket guarda apenas fundos de modelo (nada de contrato emitido, assinado escaneado ou documento
   de cliente).
2. Nenhum fluxo envia link de contrato ao cliente (hoje só se imprime pelo navegador e assina no papel).

**Teste que trava a decisão:** `contratos: anônimo não lista o bucket…` em `tests/banco.test.ts`
(roda com `BANCO=1`): listar continua bloqueado e a URL pública do fundo continua respondendo 200.

---

## 5. Auditoria do ZapIntel, relatório final — 15 e 16/10/2026 (`AUDITORIA-ZAPINTEL-RELATORIO-FINAL-20261016.md`)

**Escopo:** o ZapIntel e o que ele toca (RLS de `leads`/`lead_mensagens`, sino, contratos,
`lib/zapintel/ctx.ts`, ponte venda↔conversa, IA da ficha e da sugestão, migrações pendentes, backup).
O resto do CRM ficou fora por decisão do Lucas em 16/10 (lotes 1 e 2 estacionados na branch
`audit/crm-fora-zapintel`). Produção ao fim: main `9dbbefa`, deploy READY 16/10 16:05.

**Problemas e situação (16/10):**

| # | Grav. | Problema | Situação em 16/10 |
|---|---|---|---|
| C1 | crítica | cópias `_backup_*_dup_20261010` em `public`, legíveis pela chave anônima (154 leads) | corrigido 15/10 (movidas para `backup`) |
| A1 | alta | rotas `/zapintel/api/*` com chave de serviço filtrando só por empresa | corrigido (`zapintelAcesso` → `zapintel_escopo`) |
| A2 | alta | vendedor com acesso ao ZapIntel | corrigido (05; 18/0) |
| A3 | alta | outra empresa listava os fundos de contrato da JM | corrigido (02; 13/0); bucket público por decisão (§4) |
| A4 | alta | escrita de modelos de contrato sem checar papel | corrigido 16/10 13:18 (06; 28/0) |
| A5 | alta | `contratos_venda`: vendedor grava HTML e a impressão usa `document.write` | aberto, parcialmente mitigado (§3) |
| A6 | alta | prompt da IA com dado pessoal em claro e gabarito copiado de cliente real (CPF em 37 conversas, CEP em 291, e-mail em 91) | corrigido (`lib/zapintel/mascara.ts`, gabarito inventado) |
| A7 | alta | IA da ficha apontando para modelo do Google sem chave (toda ficha = 503) | corrigido: só Anthropic, `claude-haiku-5-5` (escolha do Lucas) |
| M1–M3 | média | sino lento e cortado em 1.000; RLS chamando função por linha; `zapintel_turnos` por linha | corrigidos 15/10 |
| M4–M5 | média | ponte gravava por cima de ligação manual; falha só no log | corrigidos (`faf38a8`, `5d87c73`) |
| M6–M7 | média | IA 45 s × 3 contra `maxDuration` 60; limite por hora liberava calado | corrigidos (25 s, 1 repetição, prazo 50 s; log + Sentry) |
| M8–M10 | média | robô gerava fichas depois de sair; funil interno aceito; "sem análise" divergente | corrigidos (01 aplicada: rodapé = funil = lista = 56) |
| M11 | média | `statement timeout` em `/zapintel/api/perfil/pendentes` (desde 14/10) | aberto |
| M12 | média | 91 políticas ainda chamando função por linha | aberto (03) |
| M13 | média | `preencher_filial()` e `filiais_visiveis()` executáveis pela API | aberto (04) |
| B1–B7 | baixa | #418, 2.000 timers no quadro, prévia por GET, botão em funil interno, pré-condição da 03 desatualizada (96 → 91), "Refresh Token Not Found", chave duplicada no webhook | B1–B5 corrigidos; B6 e B7 abertos, preexistentes |

**Causas-raiz:** rota com chave de serviço reescrevendo a regra da RLS; política por empresa e não
por papel; função chamada por linha na RLS; cópias em `public`; prompt com dado bruto; falha engolida.

**Métricas antes → depois:** sino 22–2.000 ms → 2–3 ms; RLS no sino 480 → 30 ms; `zapintel_turnos`
1,3 → 0,27 s; quadro de leads 2.000 timers (~92 ms) → 1 timer (9–13 ms); `npm test` 48 → 114;
`zapintel_acesso.sql` 16/18 → 18/18; `contratos_escrita.sql` 23/5 → 28/0; ficha por IA 503 → 16–20 s
na tela, 3.551–9.167 tokens de entrada e 1.418–3.483 de saída, ~US$ 0,0011–0,0027 por ficha.

**Testes:** `npm test` 114/114, `tsc` sem erro, lint 0 erros (43 avisos antigos), build ok (182
páginas), `npm audit` 7 vulnerabilidades (cadeia do Tailwind 3); SQL em modo ensaio:
`zapintel_acesso.sql` 18/0, `contratos_e_sino.sql` 13/0, `contratos_escrita.sql` 28/0; teste
controlado com Haiku em leads reais (com autorização do Lucas): prompt sem CPF/e-mail/CEP em claro.
Backup de 16/10 restaurado do zero num PostgreSQL 17.6 isolado e aprovado
(`BACKUP-RESTAURACAO-20261016.md`).

**Adendo de 16–17/10:** fase 2 (inventário de qualidade, §6), lote de estabilidade e quarentena
estão resumidos na §6. Capturas anonimizadas em [`../capturas/zapintel-20261017/`](../capturas/zapintel-20261017/).
O canal Vercel → Sentry, antes "nunca confirmado", foi confirmado em 16/10 21:04 UTC (NEXUS-CRM-7).

**Riscos residuais em 16/10:** CPU do Supabase gratuito satura com várias telas (0,15 s → 24 s em
15/10); egress já em ~2,4 GB de 5 GB no ciclo; backup sem Storage (~257 MB), sem cópia externa,
manual com 5 senhas e dependente desta máquina; restauração não cobre sessões, MFA, vault e as chaves
`CHANNEL_ENCRYPTION_KEY`/`PAYMENT_ENCRYPTION_KEY`; trocar Haiku por Sonnet/Opus pode estourar 25 s em
conversa longa.

**Aberto em 16/10:**
- Migração 03 (precisa de novo ensaio com 91 políticas) e 04, sem autorização.
- `statement timeout` em `/zapintel/api/perfil/pendentes` (RPC `zapintel_analises_pendentes` e CPU).
- Schema `backup` com 77 tabelas esperando decisão.
- Tailwind 4 (as 7 vulnerabilidades só saem com a versão maior).
- `contratos_venda` (ALTA, §3).
- #418 em /tarefas, /agenda e gráfico de meses (lote 3 de fuso, não aplicado).
- Emissão de contrato, impersonação e 2ª via pelo vendedor não testadas de ponta a ponta.
- Corrida ler-depois-gravar na ponte (pede `ON CONFLICT … WHERE como <> 'manual'` no banco).
- `BANCO=1 npm test` grava em produção (não há banco de teste).
- Resumo do dia (`/api/assistente/meu-dia`) só fala com Gemini e falha; chat do assistente manda
  ~14 mil tokens sem a máscara da ficha; painel `/superadmin/assistente` depende da chave do Google
  (prompt 12).
- Histórico do git ainda contém o gabarito original do prompt (apagar exige reescrever a main).
- Branch `imob-dashboard` com 22 commits sem equivalente na main.
- Decisões do Lucas: plano Supabase (gratuito × Pro), cópia externa do backup (Backblaze B2
  recomendado), Haiku × Sonnet nas fichas, liberar o lote de 127 fichas pendentes, conferir a 1ª
  execução da ponte (17/10 01:40; prova no banco: `zapintel_venda_lead`).

---

## 6. Inventário de qualidade do ZapIntel e lote de estabilidade — 16–17/10/2026 (`ZAPINTEL-INVENTARIO-QUALIDADE-20261017.md`)

Citado por `tests/zapintel-estabilidade.test.ts`. Fase 2 da auditoria do ZapIntel (a fase 1 é a §5).
Inventário feito em 16/10, 17:00–17:40, só leitura (main `45f9b28`), cobrindo código e arquitetura,
fluxos e bugs, performance, interface e acessibilidade, e manutenção. Capturas de seis telas em 360,
768, 1024 e 1440 px, mais o erro sem rede, **anonimizadas** (texto livre trocado por "x"), em
[`../capturas/zapintel-20261017/`](../capturas/zapintel-20261017/).

**Resultado:** 21 defeitos (D1–D21), 11 riscos (R1–R11), 10 oportunidades (O1–O10). Código morto:
nenhum (as 20 funções `zapintel_*` têm chamador).

**Conferido e bem:** um canal Realtime só, sem polling; filtros na URL; contagens iguais entre
telas; teclado e foco; 0 botão sem nome; 0 aviso de lint no escopo.

**Defeitos principais:**
- **D1 (alta):** `pendentes/route.ts` tratava erro da leitura de `leads` como lista vazia → robô dizia
  "Análises de IA em dia".
- **D2/D3:** `zapintel_analises_pendentes` lê `lead_mensagens` da empresa duas vezes (64 mil linhas;
  1.042 ms a frio) e `zapintel_dashboard` 3.412 ms a frio (TTFB de `/zapintel` 3,3 s). Limite: 8 s
  (`authenticated`/`authenticator`). Correção proposta: contadores por lead (gatilho ou colunas) —
  pede SQL.
- **D4/D5/D11:** erro técnico cru na tela (TypeError com a URL do projeto, texto do Postgres); ficha
  dizendo "não encontrado" para 403/429/500; robô sumindo na falha.
- **D6/D7:** contraste abaixo de 4,5:1 (verde 3,3:1, laranja 3,29–3,56:1, roxo 4,38:1) porque
  `rotulos.ts` usa cores cruas; alvos de toque menores que 40 px no celular.
- **D12/D13/D14:** erro ao ler venda vira "não comprou" no prompt; erro em `zapintel_escopo` vira 403
  sem log; erro ao gravar `assistente_uso` ignorado.
- **D16/D17:** `calibrar-zapintel.mts` quebrado (`.mts` fora do `tsc`); `perfil-zapintel.mts` não pula
  funil interno e não pagina.
- Menores: D8 overflow a 360 px, D9 rolagem perdida ao voltar, D10 filtro inválido na URL, D15 rótulo
  "Abrir conversa", D18 `#número` na busca, D19 acentos, D20 17 comentários desatualizados, D21
  referências a arquivos/funções inexistentes.

**Riscos:** R1 `zapintel_conversa_calc` 4,1–4,8 s (perto de 8 s); R2 primeira busca de texto 3,3 s;
R3 falha em `leadDeFunilInterno` libera IA paga; R4 `iaDoCrmLigada` libera na falha; R5 prefetch do
menu (11 requisições `?_rsc=`); R6 renders do painel; R7 log com 400 caracteres da resposta da IA;
R8 19 arquivos sem teste; R9 testes SQL só de acesso; R10 scripts que gravam em produção sem
documentação; R11 índices redundantes em `lead_mensagens`.

**Oportunidades:** O1 ZapIntel fora do design system Precisão (roxo `#7c5cfc`, 63 hex, 222
`font-size` literais); O2 14 clones (235 linhas); O3 tipos das RPCs (`as never`); O4 21 exports
internos; O5 nomes ("ficha", "perfil", "análise"); O6 textos em inglês; O7 Voltar × filtro; O8
higiene; O9 imports cruzados CRM → ZapIntel; O10 docs.

**Lote de estabilidade (merge `82ab84e`, deploy READY 16/10 18:03, sem SQL):**
1. Contagem do robô: falha → 200 `indisponivel` + log `zapintel.pendentes.falha` + Sentry; o robô diz
   "Não foi possível verificar…" com "Tentar de novo", nunca "em dia". Cache de 60 s
   (`lib/zapintel/cache-pendentes.ts`). Visto em produção: timeout real → NEXUS-CRM-7.
2. Dado do CRM que falha na leitura entra no prompt como "informação indisponível"; a sugestão
   responde 503 se não dá para saber se comprou.
3. Checagem de funil interno que falha → 503 (`lib/zapintel/funil-interno.ts`).
4. Toda chamada à Anthropic grava em `assistente_uso`; erro ao gravar vai para o log.
5. `perfil-zapintel.mts` pula funil interno; `tsconfig.scripts.json` + `tests/scripts-compilam.test.ts`
   compilam os `.mts` no `npm test`. `calibrar-zapintel.mts` e `travou-zapintel.mts` não compilam e
   foram marcados QUEBRADOS.
6. Telas nunca mostram TypeError, URL do Supabase ou texto do Postgres (`lib/zapintel/mensagem-erro.ts`,
   `components/zapintel/erro-de-tela.tsx`).
7. Menu com `prefetch={false}`: 24 → 0 requisições do menu na abertura (restam 13 dos links de lead).

`npm test` 114 → 151; mutação confirma que cada correção tem teste que falha sem ela.

**Quarentena:** tag `zapintel-quarentena-2026-10-17`. Regra: nenhum commit em arquivos do ZapIntel
(`app/zapintel/**`, `app/api/zapintel/**`, `lib/zapintel/**`, `components/zapintel/**`,
`hooks/zapintel/**`, `scripts/*zapintel*`, `tests/*zapintel*`, `supabase/funcoes/zapintel_*`,
`supabase/testes/zapintel_*`) até a reconstrução, salvo incidente (defeito em produção que afeta dado,
acesso ou custo; correção mínima, com teste). A reconstrução parte dessa tag.

**Aberto em 17/10 (ficou para a reconstrução):**
- Lote 1 restante: D8, D9, D10, D15, D18, D19.
- Lote 2 restante: D13, R4, R7, D17 (paginação).
- Lote 3 inteiro (SQL): D2/D3 contadores por lead, R1, R2, D16, R9.
- Lote 4 inteiro: R5 (links de lead), R6, D6, D7, O1, O6/O7, R11 — com decisão do Lucas sobre adotar
  a paleta Precisão ou manter o roxo.
- Lote 5 inteiro (limpeza): D20/D21, O2, O3, O4, O5, O8, O9, O10, R8, R10.
- Postgres com 11 cancelamentos por tempo logo após o deploy, com banco frio (D2/D3).

---

## Pendências que estavam abertas

Cada item com o relatório de origem e a data em que estava aberto.

**Contratos**
- `contratos_venda` aceita HTML de vendedor e a impressão roda na origem do app (ALTA): sanitizar
  `texto_html`, validar `fundo_url`, imprimir em `iframe` sandbox, emitir no servidor, rever cookie/CSP — §3 e §5, aberto em 16/10.
- Não imprimir contrato impersonando como superadmin (regra operacional até a fase CRM) — §3, 16/10.
- Reavaliar o bucket `contratos` se ele passar a guardar outra coisa que não fundos ou se surgir link
  de contrato ao cliente — §4, 16/10.
- Dados da JM em Minha empresa e qualificação de quem assina no modelo; três contratos sem a
  vendedora identificada — §1, aberto em 18/08.
- Emissão, 2ª via pelo vendedor e impersonação não testadas de ponta a ponta — §2 e §5, 15–16/10.

**Banco e segurança**
- Migração 03 (91 políticas, novo ensaio) e 04 (funções internas na API) sem autorização — §2 e §5, 16/10.
- Schema `backup` (75 → 77 tabelas) e view `v_orfaos_chat_midia` esperando decisão — §2 e §5, 16/10.
- Backup: sem Storage, sem cópia externa, manual; plano gratuito × Pro; destino externo — §2 e §5, 16/10.
- Corrida ler-depois-gravar na ponte (SQL com `ON CONFLICT`) — §5, 16/10.
- `BANCO=1 npm test` grava em produção (falta banco de teste) — §5, 16/10.
- Tailwind 4 para zerar as 7 vulnerabilidades do `npm audit` — §5, 16/10.
- Gabarito original do prompt ainda no histórico do git — §5, 16/10.
- Branch `imob-dashboard` com 22 commits fora da main; lotes 1 e 2 do CRM em `audit/crm-fora-zapintel` — §5, 16/10.
- Ruídos preexistentes: "Refresh Token Not Found" em `/api/acesso`; chave duplicada no webhook — §5, 16/10.

**ZapIntel e IA**
- `statement timeout` em `/zapintel/api/perfil/pendentes` e painel lento a frio (D2/D3, contadores por lead, SQL) — §5 e §6, 17/10.
- Lotes 1–5 restantes do inventário (lista na §6), sob quarentena da tag `zapintel-quarentena-2026-10-17` — §6, 17/10.
- Resumo do dia só com Gemini (falha); chat do assistente sem máscara (~14 mil tokens); painel `/superadmin/assistente` (prompt 12) — §5, 16/10.
- Haiku × Sonnet nas fichas; lote de 127 fichas pendentes; conferir a 1ª execução da ponte — §5, 16/10.

**Telas e fuso**
- React #418 em `/leads`, `/tarefas`, `/agenda` e no gráfico de meses (lote 3 de fuso) — §2 e §5, 16/10.
- Subtítulo "toda a rede" para vendedor de uma loja só — §2, 15/10.
- `chaves_imoveis.devolucao_prevista` (data `date` voltando um dia, tela da imobiliária) — §1, 18/08.

**Operação da loja e produto**
- Lançar custo das vendas; tabela de preços vazia; metas de comissão zeradas; clientes sem CPF/endereço — §1, 18/08.
- Termo de garantia e termo de entrega do usado — §1, 18/08.
- Adiado de propósito: lançamento financeiro a partir da venda; remover as 5 colunas legadas de veículo — §1, 18/08.
