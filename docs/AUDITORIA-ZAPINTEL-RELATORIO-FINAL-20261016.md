# Auditoria do ZapIntel — relatório final (15 e 16/10/2026)

Escopo: o ZapIntel e o que ele toca — RLS de `leads` e `lead_mensagens`, sino, contratos
(bucket, modelos, `contratos_venda`), `lib/zapintel/ctx.ts`, a ponte venda↔conversa, a IA da
ficha e da sugestão, as migrações de `supabase/pendentes/` e o backup. O resto do CRM ficou
fora por decisão do Lucas em 16/10 (os lotes 1 e 2 estão estacionados; ver seção 8).

Como ler cada afirmação:

- **testado e aprovado** — executado, com o resultado esperado, e registrado aqui;
- **testado** — executado, sem critério de aprovação fechado (medição);
- **inspecionado** — lido no código, no catálogo ou no log, sem execução;
- **não verificado** — não deu para executar; diz por quê.

Horários em Brasília (UTC−3), salvo quando marcados UTC. Documentos de apoio, que este
relatório não repete:

| Documento | Onde está | O que tem |
|---|---|---|
| `docs/DEPLOY-ZAPINTEL-20261015.md` | main | deploy de 15/10, roteiro e validação com as contas reais, #418 do /dashboard |
| `docs/BACKUP-INVENTARIO-20261015.md` | main | o que há no schema `backup` e o destino proposto |
| `docs/DECISAO-BUCKET-CONTRATOS-20261016.md` | main | por que o bucket `contratos` continua público |
| `docs/ACHADO-CONTRATOS-ESCRITA-20261016.md` | main | escrita de modelos de contrato sem checar papel (corrigida pela 06) |
| `docs/BACKUP-RESTAURACAO-20261016.md` | main | o backup de 16/10 restaurado do zero e aprovado |
| `docs/BACKUP-PLANO-20261016.md` | main | os três buracos do backup, opções e decisões pendentes |
| `supabase/pendentes/APLICADAS.md` | main | situação de cada migração pendente, conferida no banco |
| `docs/LOTES-1-2-RESUMO.md` | branch `audit/crm-fora-zapintel` | lotes 1 e 2 (fora do escopo ZapIntel), não aplicados |

---

## 1. Resumo executivo

**15/10, de manhã (antes da auditoria):**

- Cópias de backup de 10/10 (`_backup_*_dup_20261010`) estavam no schema `public`, legíveis
  pela chave anônima: 154 leads expostos a quem tivesse a URL e a chave pública do projeto.
- As rotas `/zapintel/api/*` usavam a chave de serviço e filtravam só por empresa: um
  vendedor via conversas da outra loja, e vendedor tinha acesso ao ZapIntel inteiro.
- Pelo bucket `contratos`, outra empresa listava os 61 fundos de contrato da JM.
- O sino agregava uma view (22 a 2.000 ms) e cortava em 1.000 leads (o admin da JM tem 1.109).
- A IA da ficha apontava para um modelo do Google sem chave em produção (toda ficha = 503), e
  o prompt mandava a conversa inteira sem máscara, com o nome completo e um exemplo fixo
  contendo valor, parcelas, data e frases de uma cliente real.
- `npm test` tinha 48 testes.

**16/10, 16:15 (agora):**

- Produção: main `9dbbefa`, deploy `dpl_3aab5U169HRNdgekzn8YZnFeHoGm` (READY 16:05:28).
- Acesso ao ZapIntel decidido no banco (`zapintel_escopo`, migração 05): só dono, admin e
  superadmin; vendedor recusado (42501) — **testado e aprovado** (18/0).
- Cópias expostas fora da API (schema `backup`); bucket de contratos isolado por empresa (02);
  escrita de modelos de contrato só dono/admin (06) — **testado e aprovado** (13/0 e 28/0).
- Sino lendo o contador do lead (2–3 ms) — **testado e aprovado** (igual lead a lead).
- IA só Anthropic, `claude-haiku-5-5`, com dado pessoal mascarado e só o primeiro nome, tempo
  limitado e erro claro — **testado e aprovado** com leads reais (seção 6).
- Backup lógico restaurado do zero e aprovado; mas o Storage, a cópia externa e a execução sem
  senha continuam pendentes (seção 9).
- `npm test`: 114 testes, todos passando.
- Ficam abertos: as migrações 03 e 04, `contratos_venda` (ALTA, parcialmente mitigada), um
  timeout de banco numa rota do ZapIntel e o resto da seção 8.

---

## 2. Problemas encontrados, por gravidade

| # | Grav. | Problema | Local | Evidência | Impacto | Situação |
|---|---|---|---|---|---|---|
| C1 | **crítica** | Cópias `_backup_*_dup_20261010` em `public`, legíveis pela chave anônima | banco, schema `public` | catálogo + consulta como `anon` (15/10) | 154 leads com dado pessoal abertos pela API pública | **corrigido** 15/10 (`supabase/funcoes/seguranca_20261015.sql`: movidas para `backup`, sem acesso de `anon`/`authenticated`) |
| A1 | alta | Rotas do ZapIntel com chave de serviço filtrando só por empresa | `app/zapintel/api/*`, `lib/zapintel/ctx.ts` | inspecionado + teste por loja com conta real (15/10) | vendedor via conversa de outra loja | **corrigido** 15/10 (`zapintelAcesso` → `zapintel_escopo`) |
| A2 | alta | Vendedor com acesso ao ZapIntel (contra a regra do Lucas) | `zapintel_escopo`, `app/zapintel/layout.tsx` | teste SQL 16/18 antes | dados de toda a loja para quem não deveria ver | **corrigido** 15/10 (migração 05; 18/0) |
| A3 | alta | Bucket `contratos`: outra empresa listava os fundos da JM | políticas de `storage.objects` | `contratos_e_sino.sql` falhava antes | papel timbrado e capas de uma empresa visíveis a outra | **corrigido** 15/10 (02; 13/0). Bucket segue público por decisão: `DECISAO-BUCKET-CONTRATOS` |
| A4 | alta | Escrita de modelos de contrato só checava empresa, não papel | `contrato_documentos`, `contrato_modelos` | `ACHADO-CONTRATOS-ESCRITA`; ensaio 23 ok/5 falhas | vendedor gravava o HTML do modelo direto pela API | **corrigido** 16/10 13:18 (06; 28/0) |
| A5 | alta | `contratos_venda`: vendedor grava HTML e a impressão usa `document.write` sem sandbox | `contratos_venda`, `lib/contrato-tipos.ts` | inspecionado (16/10); 0 conteúdo malicioso nos 63 contratos | script no contrato rodaria na sessão de quem imprime, inclusive superadmin impersonando | **aberto, parcialmente mitigado** (a 06 fecha o modelo; o contrato emitido segue) — seção 8 |
| A6 | alta | Prompt da IA com dado pessoal em claro e gabarito com dados de cliente real | `lib/zapintel/perfil.ts`, `travou.ts`, `montar.ts:184` | medido 16/10: CPF formatado em 37 conversas, palavra CPF em 134, CEP em 291, e-mail em 91; telefone como nome em 109 leads | dado pessoal desnecessário a terceiro (LGPD, art. 6º, III) | **corrigido** 16/10 (`lib/zapintel/mascara.ts`, gabarito inventado) |
| A7 | alta | IA da ficha/sugestão quebrada em produção: modelo do Google sem chave | `lib/zapintel/ia.ts`, `assistente_config` | `iaDisponivel:false`, rotas 503 (16/10) | ficha, sugestão e robô parados | **corrigido** 16/10 (só Anthropic; o Lucas definiu `claude-haiku-5-5`) |
| M1 | média | Sino agregava a view e cortava em 1.000 | `components/layout/topbar.tsx` | 22–2.000 ms; admin com 1.109 leads | sino lento e com total errado | **corrigido** 15/10 (contador `leads.msgs_nao_lidas`, paginado) |
| M2 | média | RLS de `leads`/`lead_mensagens` chamando função por linha | políticas | 480 ms no sino | lentidão sob CPU do plano gratuito | **corrigido** 15/10 (`(select get_empresa_id())`, 30 ms) |
| M3 | média | `zapintel_turnos` chamava `zapintel_horario` por linha | função | 1,3 s | telas de atendimento lentas | **corrigido** 15/10 (0,27 s) |
| M4 | média | Ponte podia gravar por cima de ligação manual; leitura cortada em 1.000 | `lib/zapintel/ponte.ts` | teste com stash falha 2 de 5 | confirmação manual desfeita sem aviso | **corrigido** 16/10 (`faf38a8`); nunca aconteceu (0 manuais) |
| M5 | média | Falha da ponte ficava só no log da Vercel (dura pouco no Hobby) | `ponte.ts`, cron | inspecionado | ponte parada sem ninguém saber | **corrigido** 16/10 (`5d87c73`: log JSON + Sentry); 1ª execução real em 17/10 01:40 |
| M6 | média | SDK com 45 s × 3 tentativas contra `maxDuration` 60 | `ia.ts`, rotas | inspecionado | função morta pela plataforma, sem log do motivo | **corrigido** 16/10 (25 s, 1 repetição, prazo total 50 s, 504 claro) |
| M7 | média | Limite por hora liberava calado quando o contador falhava | `lib/rate-limit.ts` | inspecionado | teto de gasto cego sem aviso | **corrigido** 16/10 (log `zapintel.rate_limit.falha` + Sentry) |
| M8 | média | Robô continuava gerando fichas depois de sair do ZapIntel | `components/zapintel/robo-analises.tsx` | inspecionado 15/10 | gasto de IA sem ninguém olhando | **corrigido** 15/10; **testado e aprovado** 16/10 (1 chamada, cancelada 30 ms depois) |
| M9 | média | Rotas aceitavam lead de funil interno | rotas de perfil/sugestão | inspecionado 15/10 | IA lendo conversa da equipe | **corrigido** 15/10 (422); botão escondido 16/10 |
| M10 | média | Lead sem ficha caía em "sem análise" mesmo sem o cliente ter falado | 3 funções do ZapIntel | rodapé 56 × lista 0 (16/10) | funil e lista com números diferentes | **corrigido** 16/10 13:18 (01; rodapé = funil = lista = 56) |
| M11 | média | `statement timeout` em `/zapintel/api/perfil/pendentes` | rota + RPC `zapintel_analises_pendentes` | grupo de erro da Vercel desde 14/10; 1 ocorrência em 16/10 14:40 | robô sem contagem; CPU do banco | **aberto** — seção 8 |
| M12 | média | 91 políticas do CRM ainda chamam função por linha | RLS de `public` | pré-condição da 03 | lentidão sob carga | **aberto** (03 pendente) |
| M13 | média | Funções internas executáveis pela API | `preencher_filial()` (`authenticated`), `filiais_visiveis()` (`anon`) | catálogo 16/10 | superfície de API desnecessária | **aberto** (04 pendente) |
| B1 | baixa | React #418 (hidratação) no /dashboard | `dashboard-view.tsx` | console 15/10 | erro no console; texto pode piscar | **corrigido** 15/10, com limitação aceita (`DEPLOY-ZAPINTEL`) |
| B2 | baixa | 2.000 timers no quadro de leads (um por cartão) | `components/modules/leads` | medido com 2.000 cartões fictícios | redesenho a cada 30 s | **corrigido** 15/10 (`6f30cb4`) |
| B3 | baixa | Prévia do superadmin por GET | `app/api/zapintel/preview` | inspecionado | CSRF de baixo impacto | **corrigido** 15/10 (POST, mesma origem) |
| B4 | baixa | Ficha oferecia "Gerar análise" em lead de funil interno | `app/zapintel/leads/[id]/page.tsx` | produção 16/10 (lead do funil Time JM) | clique que só devolvia erro | **corrigido** 16/10 (`3337e0f`) |
| B5 | baixa | Pré-condição da 03 e `APLICADAS.md` desatualizados depois da 06 | `supabase/pendentes/03…`, `APLICADAS.md` | banco: 91 políticas, arquivo esperava 96 | a 03 abortaria sem aplicar | **corrigido** 16/10 (`3dc31ca`); falta novo ensaio |
| B6 | baixa | `/api/acesso`: "Refresh Token Not Found" | middleware/rota de acesso | grupo de erro desde 02/09 | sessão expirada vira erro no log | **aberto**, preexistente |
| B7 | baixa | Avisos de chave duplicada no webhook | log do Postgres | todas as horas, desde antes da auditoria | ruído no log | **aberto**, preexistente |

---

## 3. Causas-raiz dos principais defeitos

1. **Duas regras de acesso para manter de acordo.** As rotas usam a chave de serviço, que
   ignora a RLS, e reescreviam à mão só parte da regra (empresa, não loja nem papel). Conserto
   de raiz: a rota pergunta ao banco (`zapintel_escopo`), uma regra só (A1, A2).
2. **Política escrita por empresa e não por papel.** A RLS de contratos e do bucket foi criada
   com `empresa_id = get_empresa_id()` e o papel ficou só na tela/rota; quem chama a API direto
   passa por fora (A3, A4, A5).
3. **Função estável chamada por linha dentro da RLS.** `get_empresa_id()` sem `(select …)` é
   recalculada em cada linha; no plano gratuito, sob CPU apertada, vira segundos (M2, M3, M12).
4. **Dado de teste e cópias deixados no schema da API.** Tudo em `public` é exposto pelo
   PostgREST (C1).
5. **Prompt montado com o dado bruto.** A conversa ia como estava no banco, e o exemplo fixo
   foi copiado de uma ficha real (A6).
6. **Configuração apontando para um provedor sem chave.** A escolha de provedor pelo nome do
   modelo deixou a produção num caminho que só existia para falhar (A7).
7. **Falha engolida.** Liberar quando o contador cai, cron que devolve 500 sem avisar, erro do
   provedor sem motivo no log (M5, M6, M7).
8. **Documento de estado não reconferido depois de mudar o banco.** A 06 mudou o conjunto da
   03, e o `APLICADAS.md` continuou com o número antigo (B5) — pego na segunda auditoria.

---

## 4. Correções implementadas

Todas na main e em produção, salvo indicação. Commits da main desde 15/10 (`git log`).

| Data | Commit(s) | O que | Arquivos principais |
|---|---|---|---|
| 15/10 | `f1fcbc1` | acesso por loja nas rotas, teto de IA por pessoa, retenção de mídia segura, telas ao vivo; Next 16.3.8 | `lib/zapintel/ctx.ts`, `lib/rate-limit.ts`, `app/zapintel/api/*` |
| 15/10 | `74139b3` | prévia por POST, 422 no funil interno, robô para ao sair, testes (`npm test`) | `app/api/zapintel/preview`, `robo-analises.tsx`, `tests/` |
| 15/10 | `81a905a` | sino pelo contador, paginado, assinatura só de mensagens recebidas | `components/layout/topbar.tsx` |
| 15/10 | `28b68e8` | ZapIntel só dono, admin e superadmin | `app/zapintel/layout.tsx`, `ctx.ts` |
| 15/10 | `cd8d50e`, `0076abe`, `6f30cb4` | #418 do /dashboard; instante único no quadro; um relógio para o quadro | `dashboard-view.tsx`, `components/modules/leads/*` |
| 15/10 | SQL `seguranca_20261015.sql` (aplicado) | cópias fora da API, FK, índice, turnos, canal ao vivo, RLS de leads/mensagens | `supabase/funcoes/` |
| 15/10 | migrações 00, 02, 05 (aplicadas com autorização) | instantâneo, bucket de contratos, ZapIntel só dono/admin | `supabase/pendentes/` |
| 16/10 | `faf38a8`, `5d87c73` (merge `dc1765e`) | ponte não grava por cima de manual; avisa no Sentry | `lib/zapintel/ponte.ts`, `tests/zapintel-ponte.test.ts` |
| 16/10 | `de86aae`, `22c9600` (merge `6001654`), `46d49fb`, `375f224` | decisão do bucket, achado de contratos, migração 06, teste de restauração, `APLICADAS.md` | `docs/`, `supabase/pendentes/` |
| 16/10 13:18 | migração `p06_p01_20261016` (aplicada com autorização) | 06 escrita de contratos só dono/admin; 01 classe `sem_resposta` | banco |
| 16/10 | `933de28` (merge `92376c5`) | gabarito inventado; máscara de dado pessoal; só primeiro nome; só Anthropic; timeout 25 s/1 repetição/50 s; alerta do limite cego | `lib/zapintel/mascara.ts`, `ia.ts`, `perfil.ts`, `travou.ts`, `lib/rate-limit.ts`, `tests/zapintel-ia.test.ts` |
| 16/10 | `3337e0f`, `3dc31ca` (merge `8448f61`) | ficha sem botão de gerar no funil interno; pré-condição da 03 = 91 | `components/zapintel/analise-de-ia.tsx`, `app/zapintel/api/conversa/route.ts`, `tests/zapintel-tela.test.ts`, `supabase/pendentes/03…`, `APLICADAS.md` |
| 16/10 | `89c4584` (merge `9dbbefa`) | plano do backup (parado na etapa 1) | `docs/BACKUP-PLANO-20261016.md` |

---

## 5. Melhorias

**Segurança**

- Acesso ao ZapIntel decidido no banco, por papel e por loja; vendedor e empresa sem o
  complemento recusados nas funções que as telas chamam direto (42501).
- Bucket de contratos isolado por empresa; escrita de modelos só dono/admin.
- Cópias com dado pessoal fora da API.
- Funções internas do ZapIntel (`zapintel_analises_pendentes`, `zapintel_turnos`,
  `zapintel_conversa_calc`, `rate_limit_bump`) sem execução por `authenticated`/`anon` —
  **testado e aprovado** (parte do 18/0).
- Nenhum segredo no repositório: zero ocorrências de chaves Anthropic/Google, chave privada,
  JWT, tokens do GitHub, Slack ou AWS, ou URL com senha nos arquivos versionados (16/10).

**Performance**

- Sino de 22–2.000 ms para 2–3 ms; RLS de leads/mensagens de 480 para 30 ms; turnos de 1,3 s
  para 0,27 s; quadro de leads com 1 timer em vez de 2.000 (seção 7).
- Assinatura do sino só de mensagens recebidas: ~55% menos recargas em 7 dias.

**Arquitetura**

- Uma porta de IA (`lib/zapintel/ia.ts`), um provedor, uma regra de modelo.
- Um critério de funil interno (`leadDeFunilInterno`) usado pela rota e pela tela.
- Migrações com pré-condição, `lock_timeout`, conferência final e reversão ensaiada.

**Interface**

- Funil, rodapé e lista com o mesmo número de "sem resposta do cliente".
- Erros da IA traduzidos ("A análise demorou demais, tente novamente"; modelo não configurado).
- Ficha sem botão que só devolveria erro.

**LGPD (minimização, art. 6º, III)**

- O que vai à IA sai mascarado: CPF, CNPJ, RG, CNH, CEP, e-mail, telefone, chave Pix, cartão,
  IMEI, número e complemento do endereço; só o primeiro nome; lead sem nome vai como "Cliente".
  Banco e tela não mudam.
- O exemplo fixo do prompt não tem mais dado de cliente real.
- Backup sem sessões, tokens, MFA e auditoria de login (lista do que é permitido).

---

## 6. Testes e comandos executados (resultados reais)

**Automáticos, na main de 16/10 (`9dbbefa`):**

| Comando | Resultado |
|---|---|
| `npm test` | **114 de 114** (15 suítes), 16/10 ~16:00 |
| `npx tsc --noEmit` | sem erros |
| `npm run lint` | 0 erros, 43 avisos (antigos; nenhum em arquivo mexido) |
| `npm run build` | ok, 182 páginas |
| `npm audit --omit=dev` | 7: 5 altas, 2 moderadas, 0 críticas — todas da cadeia do Tailwind 3 |
| Teste de mutação (Parte A) | sem a regra do funil interno, 3 dos 9 testes novos falham |

**SQL no banco de produção, em modo ensaio (cada um termina em exceção e desfaz tudo), 16/10 16:00:**

| Teste | Resultado |
|---|---|
| `supabase/testes/zapintel_acesso.sql` | **18 ok, 0 falhas** (15/10 antes da 05: 16/18) |
| `supabase/testes/contratos_e_sino.sql` | **13 ok, 0 falhas** |
| `supabase/testes/contratos_escrita.sql` | **28 ok, 0 falhas** (antes da 06: 23 ok/5 falhas) |
| Pré-condição da 03 | passa com 91, sem o backup da 03 |
| Contagens de `public` | 53 funções, 124 políticas, 49 gatilhos, 347 índices, 385 restrições, 95 tabelas com RLS, 5 views — iguais ao backup de 16/10 06:17 |
| Linhas com id negativo depois dos testes | 0 |

Não existe teste SQL da ponte; ela é coberta por `tests/zapintel-ponte.test.ts` (5 de 5).

**Em produção, com contas reais:**

- 15/10: dono, vendedor (só Mogi), admin da rede, superadmin e a conta da Preview — matriz
  completa em `DEPLOY-ZAPINTEL-20261015.md` (conversa de outra loja = 404, funil interno = 422,
  vendedor bloqueado depois da 05, sino conferido com a view).
- 16/10 12:16: dono — `/zapintel` com 1.911 conversas, sino, 2ª via de contrato com 11/11
  fundos; vendedor — tela recusa, rotas 403, funções 42501.
- 16/10 13:19 (depois da 01 e 06): dono — rodapé, funil e lista com 56 sem resposta.
- 16/10 14:29: dono — com o modelo ainda Gemini, ficha e sugestão respondem 503 com a frase
  nova, sem chamar provedor.
- 16/10 14:42: chat do assistente (`/api/assistente`) respondeu pela Anthropic (Sonnet 5.5,
  13.982 tokens de entrada; ver seção 8).
- 16/10 15:07–15:12, teste controlado com `claude-haiku-5-5` (leads escolhidos por mim com
  autorização do Lucas):

| Passo | Resultado | Veredito |
|---|---|---|
| Ficha do lead 1120 (13 mensagens) | 16,2 s; 3.656/2.413 tokens; tela = banco (hash de 5 campos) | testado e aprovado |
| Ficha do lead 946 (126 mensagens, com CPF, e-mail e CEP reais) | 18,1 s; 9.167/3.483 tokens; ficha do 1120 intacta | testado e aprovado |
| Lead 4235 do funil interno | 422 pela tela | testado e aprovado |
| Contador por hora | +2, não +3 | testado e aprovado |
| Sair do ZapIntel com o robô rodando | 1 chamada, cancelada 30 ms depois; nenhuma outra em 100 s | testado e aprovado |
| Prompt do 946 montado localmente com a conversa real | 0 CPF, 0 e-mail, 0 CEP em claro; 5 marcadores | testado e aprovado |

- 16/10 15:5x, segunda auditoria (dono): dashboard 1.916 conversas e console limpo; fatia "Sem
  resposta do cliente" 56 = painel com 56; título da aba (857) = 857 leads de Mogi com não
  lidas no banco; ficha nova no lead 5915 (20,1 s; 3.830/1.997 tokens); sem sessão,
  `/zapintel` → `/login`. Vendedor não testado nesta rodada (sem a senha).
- 16/10 16:06, depois do deploy final: lead 4235 (interno, sem ficha) sem botão e com a frase
  do funil interno; lead 3607 (interno, com ficha) mostra a ficha sem "Refazer"; lead 1120
  (normal) mantém "Refazer análise".
- Logs desde o primeiro deploy de 16/10 (`46d49fb`, READY 11:55:48) até 16:18: na Vercel,
  3 erros esperados (os testes de 14:29, `modelo_nao_claude`) e 3 preexistentes, em dois grupos:
  - "Refresh Token Not Found" (2), grupo que existe desde 02/09;
  - `statement timeout` em `/zapintel/api/perfil/pendentes` (1), grupo que existe desde 14/10.

  Nenhum novo. Nos 10 minutos depois do deploy final (16:05–16:18): zero erros na Vercel e
  zero issues no Sentry.

**Backup:** restauração completa do backup de 16/10 06:17 num PostgreSQL 17.6 isolado —
**testado e aprovado** (`BACKUP-RESTAURACAO-20261016.md`).

---

## 7. Métricas antes e depois

| Métrica | Antes | Depois | Como foi medido |
|---|---|---|---|
| Sino (leitura) | 22–2.000 ms, corte em 1.000 leads | 2–3 ms, paginado | 15/10, 6 perfis, resultado igual lead a lead |
| RLS de leads/mensagens no sino | 480 ms | 30 ms | 15/10, 5 perfis com hash |
| `zapintel_turnos` | 1,3 s | 0,27 s | 15/10 |
| Quadro de leads | 2.000 timers; tique sem mudança redesenha 2.000 cartões, ~92 ms | 1 timer; 0–4 cartões, 9–13 ms | 15/10, 2.000 cartões fictícios, ambiente isolado |
| Tokens por ficha | estimado 2.400 entrada / 1.500 saída | real: 3.551–9.167 / 1.418–3.483 (4 fichas) | 16/10, tabela `assistente_uso` |
| Custo por ficha (Haiku 5.5, US$ 0,10 e 0,50 por milhão) | estimado ~US$ 0,001 | ~US$ 0,0011–0,0027 | 16/10; o uso grava cache e entrada normal somados, então é aproximado |
| Tempo da ficha | 503 (IA fora do ar) | 16,2–20,1 s na tela; 7,7–17,0 s de IA | 16/10, 4 fichas |
| Teto de tempo da IA | 45 s × 3 tentativas, sem prazo total | 25 s × 2, prazo total 50 s | código |
| Testes (`npm test`) | 48 (15/10) | 114 (16/10) | 48 → 57 → 105 → 114 |
| `zapintel_acesso.sql` | 16 de 18 | 18 de 18 | 15/10 → 16/10 |
| `contratos_escrita.sql` | 23 ok / 5 falhas | 28 / 0 | 16/10, antes e depois da 06 |
| Ensaio da 03 (não aplicada) | `integracao_eventos` 15,2 s | 8,1 s | 15/10, transação desfeita, com 96 políticas |

---

## 8. Problemas abertos e por que não foram resolvidos

| Problema | Por que está aberto |
|---|---|
| **Migração 03** (91 políticas por linha) | Precisa de autorização e de **novo ensaio**: o de 15/10 (525 comparações, 0 diferenças) foi feito com 96. |
| **Migração 04** (funções internas na API) | Precisa de autorização. |
| **`statement timeout` em `/zapintel/api/perfil/pendentes`** | Rota nossa estourando o tempo do banco: grupo de erro da Vercel desde 14/10, uma ocorrência em 16/10 14:40 (17:40 UTC). Preexistente, mas é problema de performance do ZapIntel: quando acontece, o robô fica sem a contagem. Não investigado nesta auditoria; candidatos: o custo da RPC `zapintel_analises_pendentes` e a CPU do plano gratuito. |
| **Schema `backup`: 77 tabelas (5 criadas em 15/10)** | O destino de cada grupo está proposto em `BACKUP-INVENTARIO-20261015.md` e espera a decisão do Lucas. Nada é apagado sem ela. |
| **Tailwind 4** | As 7 vulnerabilidades do `npm audit` saem só com a versão maior; migração de CSS do projeto inteiro, fora do escopo. |
| **`contratos_venda`** — vendedor grava HTML e a impressão usa `document.write` sem sandbox (ALTA) | Parcialmente mitigado pela 06 (o modelo), mas o contrato emitido continua aceitando HTML de vendedor, e é ele quem emite no PDV. Conserto pede mudar a emissão e a impressão (fase CRM). Detalhe em `ACHADO-CONTRATOS-ESCRITA-20261016.md`. |
| **React #418 em /tarefas, /agenda e no gráfico de meses** | Classificado no lote 3 (fuso nas telas), não aplicado; não reverificado hoje. |
| **Emissão de contrato e impersonação** | Não testadas de ponta a ponta: emitir grava contrato real, e a regra é não imprimir contrato impersonando como superadmin. |
| **Corrida ler-depois-gravar na ponte** | Precisa de `ON CONFLICT … WHERE como <> 'manual'` numa função do banco (SQL persistente, sem autorização). Hoje há 0 ligações manuais. |
| **`BANCO=1 npm test` grava em produção** | Grava e apaga linhas de `rate_limit`; não há banco de teste separado. Não foi rodado nesta auditoria. |
| **Avisos de chave duplicada no webhook** | Ruído preexistente no log do Postgres; fora do ZapIntel. |
| **`/api/acesso`: "Refresh Token Not Found"** | Preexistente desde 02/09: sessão expirada tratada como erro no log. Fora do escopo. |
| **Assistente e resumo do dia** | O chat (`/api/assistente`) já responde pela Anthropic; o resumo do dia (`/api/assistente/meu-dia`) só fala com o Gemini e falha por falta de chave. Fora do escopo ZapIntel. |
| **Chat do assistente sem máscara** | Uma pergunta enviou ~14 mil tokens (13.982, 16/10 14:42) com os dados que as ferramentas consultam, sem a máscara da ficha. |
| **Histórico do git com o gabarito original** | Os commits antigos ainda contêm o texto. Apagar exige reescrever o histórico e forçar push na main. |
| **Branch `imob-dashboard`** | 22 commits sem equivalente na main (`git cherry`; 20 + os lotes 1 e 2), e a cópia local está 91 commits à frente da do GitHub. |
| **Lotes 1 e 2** | Estacionados em `audit/crm-fora-zapintel` (5 commits), fora do escopo ZapIntel; resumo em `LOTES-1-2-RESUMO.md` nessa branch. |
| **2ª via de contrato pelo vendedor** | Não testada (o vendedor de teste não emite contrato na conta usada). |
| **Tokens de saída altos na ficha** | 1.418–3.483 tokens de saída, acima da estimativa de 1.500; o pensamento do modelo conta como saída. Custo ainda irrisório. |
| **Tempo em conversa longa** | 126 mensagens levaram 17 s de IA, contra 25 s por tentativa; conversas acima de ~300 mensagens podem chegar perto. |
| **Painel `/superadmin/assistente`** | A lista de modelos depende da chave do Google; precisa ser reconstruído (prompt 12). |

---

## 9. Riscos residuais e limitações

- **Plano gratuito do Supabase:** a CPU satura com várias telas do ZapIntel ao mesmo tempo
  (medido em 15/10: uma consulta de 0,15 s chegou a 24 s); egress de 5 GB/mês já estava em
  ~2,4 GB no ciclo até 03/11, e um dump diário completo sozinho passaria do limite
  (`BACKUP-PLANO-20261016.md`).
- **Canal Vercel → Sentry nunca confirmado:** em 90 dias o Sentry tem 1 evento de Node, da
  máquina local. Os alertas novos (ponte, limite cego) dependem dele.
- **Backup:** sem cópia dos arquivos do Storage (~257 MB), sem cópia externa, execução manual
  com 5 senhas digitadas, e dependente desta máquina estar ligada (`BACKUP-PLANO-20261016.md`).
- **O que a restauração não cobre:** sessões e tokens (todos entram de novo), MFA, auditoria de
  login, vault, segredos gerenciados pelo Supabase e as chaves do app
  (`CHANNEL_ENCRYPTION_KEY`, `PAYMENT_ENCRYPTION_KEY`).
- **Ficha por IA:** Haiku é o padrão. Se o modelo for trocado para Sonnet ou Opus, o tempo por
  tentativa (25 s) pode estourar em conversa longa.

---

## 10. Pendências que dependem do Lucas

(As contas e decisões do projeto são do Lucas; o login do Claude é outra conta.)

1. Plano do Supabase: ficar no gratuito ou ir para o **Pro** (`BACKUP-PLANO-20261016.md`).
2. Destino da cópia externa do backup (Backblaze B2 recomendado).
3. Autorizar as migrações **03** (depois do novo ensaio com 91) e **04**.
4. Destino do schema `backup` (77 tabelas).
5. Avaliar a qualidade das fichas: Haiku 5.5 em produção × Sonnet.
6. Liberar o lote de fichas pendentes do robô (127 na contagem de 16/10 16:06).
7. Conferir a ponte de 17/10 (cron às 04:40 UTC = 01:40 de Brasília). Quando dá certo, ela
   **não escreve nada no log**, só responde 200. Em falha aparece `[cron/ponte-vendas]` com
   500, ou o JSON `zapintel.ponte.gravacao_pulada` mais um evento no Sentry com
   `modulo=zapintel` e `job=ponte`. Prova durável no banco: `zapintel_venda_lead` tinha 66
   linhas da JM, 0 manuais, última gravação 16/10 04:53:18 UTC. Só grava linha quando há venda
   nova.
8. Prompt 12: reconstruir o painel `/superadmin/assistente`.

---

## 11. Checklist por área

| Área | Classificação | Base |
|---|---|---|
| Acesso e isolamento | **aprovada** | `zapintel_acesso.sql` 18/0; contas reais em 15 e 16/10; sem sessão → /login |
| RLS de leads e mensagens | **aprovada** | mesmo resultado para 5 perfis (hash, 15/10); sino igual lead a lead (13/0) |
| Sino | **aprovada** | 13/0; título (857) = banco (857), 16/10 |
| Contratos — bucket | **aprovada** | 13/0; outra empresa 0, anônimo 0 |
| Contratos — modelos | **aprovada** | 28/0 depois da 06 |
| Contratos — `contratos_venda` | **reprovada** | HTML de vendedor e impressão sem sandbox (aberto, ALTA) |
| Ponte | **parcialmente verificada** | 5/5 no teste; leitura do banco ok; 1ª execução com alerta só em 17/10 |
| IA — chamada real | **aprovada** | 4 fichas reais com Haiku 5.5, tela = banco |
| IA — minimização | **aprovada** | prompt real sem CPF/e-mail/CEP; fichas sem dado pessoal; só primeiro nome |
| IA — limites | **aprovada** | contador +2 nos passos certos; 422 não conta; alerta de contador cego testado |
| IA — tempo | **parcialmente verificada** | 16–20 s observados; o caminho de timeout só foi testado com SDK simulado |
| Migrações aplicadas | **aprovada** | 00/02/05/06/01 conferidas no banco; `APLICADAS.md` = banco (16/10 16:00) |
| Backup e restauração | **parcialmente verificada** | restauração aprovada; Storage, cópia externa e agendamento pendentes |
| Hidratação #418 | **parcialmente verificada** | /dashboard corrigido com limitação; /tarefas, /agenda e gráfico abertos |
| Testes, build e deploy | **aprovada** | 114/114, tsc, lint 0 erros, build; deploy READY 16:05:28 |
| Dependências | **parcialmente verificada** | 7 vulnerabilidades conhecidas (Tailwind 3), nada novo desde 15/10 |
| Observabilidade (logs, Sentry) | **parcialmente verificada** | logs da Vercel lidos e classificados; envio Vercel → Sentry nunca confirmado |
