# ZapIntel — inventário de qualidade (fase 2 da auditoria)

**Só inventário: nenhum arquivo do código foi alterado, nenhuma ficha gerada, nada gravado.**
Feito em 16/10/2026, das 17:00 às 17:40 (Brasília), na main `45f9b28`, com produção no deploy
`dpl_3aab5U169HRNdgekzn8YZnFeHoGm`. A fase 1 (segurança, dados, confiabilidade e IA) está em
[AUDITORIA-ZAPINTEL-RELATORIO-FINAL-20261016.md](AUDITORIA-ZAPINTEL-RELATORIO-FINAL-20261016.md).
Esta fase cobre:

- **A** — código e arquitetura;
- **B** — fluxos e bugs;
- **E** — performance;
- **F** — interface e acessibilidade;
- **G** — qualidade e manutenção.

**Como foi feito:**

- **Produção:** sessão do dono no Edge; só leitura (nenhum clique em gerar, refazer ou salvar).
- **Banco:** consultas de leitura. Os `EXPLAIN ANALYZE` e as medições de função rodaram
  dentro de blocos que terminam em exceção — nada fica gravado.
- **Ferramentas:** `npx knip`, `npx jscpd`, `eslint`, `node --test --experimental-test-coverage`,
  todas sem tocar no `package.json`.
- **Capturas:** em [capturas/zapintel-20261017/](capturas/zapintel-20261017/), seis telas em
  360, 768, 1024 e 1440 px, mais o estado de erro sem rede. **As capturas estão
  anonimizadas:** depois das medições (feitas na página real), todo texto livre foi trocado
  por "x" do mesmo tamanho e números com 6 ou mais dígitos por "0". Ficaram legíveis botões,
  títulos, rótulos e métricas curtas. Assim o layout pode ser avaliado sem expor nome,
  telefone ou frase de cliente. Na ficha do lead, o título (que é o nome do cliente) também
  foi mascarado.

**Tipo de evidência em cada item:**

- **[medido]** — número tirado em produção ou no banco;
- **[reproduzido]** — passos executados na tela;
- **[lido]** — inspecionado no código, sem execução;
- **[ferramenta]** — apontado por knip, jscpd, eslint ou c8 e conferido por grep.

---

## 0. O que foi conferido e está bem (para não ser refeito)

| Área | Resultado | Evidência |
|---|---|---|
| Código morto | Nenhum arquivo, componente ou função `zapintel_*` sem uso: todas as 20 funções do banco têm chamador (rota, hook, outra função, gatilho ou pg_cron) | [ferramenta] knip + grep no repositório inteiro |
| Realtime | Um canal só (`realtime:zapintel:<empresa>`, broadcast), fechado ao sair do ZapIntel (`phx_leave` visto ao clicar "Voltar ao CRM"). Nenhum `postgres_changes`. Sem polling de rede: as consultas só disparam por aviso do canal, pela volta da aba ou por troca de parâmetro | [medido] protocolo do WebSocket + [lido] `hooks/zapintel/canalZapintel.ts` |
| Ao vivo | O total de mensagens da barra lateral subiu sozinho durante o teste (56.436 → 56.471) | [reproduzido] |
| Paginação e filtros | Filtros combinados (quente + esperando = 5, e o próprio chip mostra "Quente 5"); página 2 + troca de filtro volta à página 1; `?pagina=999` corrige para a última (39); recarregar com filtro na URL recupera o estado; trocar de loja com a lista na página 2 volta à página 1 e recalcula (Morno 206 → 37) | [reproduzido] |
| Contagens entre telas | "Sem análise" igual no funil, nos chips da lista e no robô (20 às 17:26) | [medido] |
| Período inválido | `?periodo=-5` e `?periodo=99999` em Insights e Atendimento caem em "30 dias" | [reproduzido] |
| Teclado | A gaveta do dashboard (`role="dialog"`) recebe o foco, fecha com Esc e devolve o foco ao cartão; o foco visível é um anel de 2 px; a lista abre o lead pelo link do nome | [reproduzido] |
| Rótulos | 0 botão sem nome acessível, 0 campo sem rótulo, 0 imagem sem `alt`, nas 6 telas e 4 larguras | [medido] |
| Lint e tipos | 0 erros e 0 avisos de ESLint no escopo; os 43 avisos do projeto estão todos fora do ZapIntel | [ferramenta] |
| Resto do tema antigo ÁPICE | 0 ocorrências de Fraunces, `#C9A24B`, JetBrains Mono ou navy no escopo | [lido] |
| TODO, `@ts-ignore`, `any` explícito, código comentado, arquivos .bak | 0 de cada | [lido] |

---

## 1. Defeitos comprovados

| # | Local | Descrição | Evidência / reprodução | Grav. | Impacto | Causa-raiz | Correção recomendada |
|---|---|---|---|---|---|---|---|
| D1 | `app/zapintel/api/perfil/pendentes/route.ts:69-73` | Erro da consulta de `leads` ignorado (`ls ?? []`): se ela falha, nenhum lead fica visível e o robô diz "Análises de IA em dia" | [lido] | **alta** | O dono acredita que está tudo analisado | Erro tratado como lista vazia | Checar `error`, log JSON, responder 500 |
| D2 | RPC `zapintel_analises_pendentes` (chamada por `/zapintel/api/perfil/pendentes` e pelo assistente) | `statement timeout` no log da Vercel (grupo desde 14/10; 1 vez em 16/10 14:40). A função **lê todas as mensagens da empresa duas vezes a cada chamada**: agregação + `DISTINCT ON`, 64 mil linhas, ~48 mil buffers | [medido] morna 151–179 ms; a frio **1.042 ms**; o mesmo SQL escrito direto, 221–264 ms (o plano genérico dá o mesmo plano, então não é a causa). Limite: 8 s do papel `authenticator`, que é por onde a chave de serviço entra no PostgREST | média | O robô some ou fica sem contagem (ver D11) | **Hipótese:** custo proporcional a todas as mensagens da empresa, recalculado a cada abertura do chat. Sob a CPU do plano gratuito, que já foi medida saturando (0,15 s → 24 s em 15/10), passa de 8 s | Guardar `mensagens`, `transcritos`, `marca` e última direção por lead (gatilho em `lead_mensagens` ou colunas em `leads`) e comparar só isso; ou índice `(empresa_id, lead_id, created_at desc, id desc)` para o `DISTINCT ON`. Pede SQL persistente |
| D3 | RPC `zapintel_dashboard` e o primeiro carregamento de `/zapintel` | Painel lento a frio: a função lê `lead_mensagens` inteira em toda chamada | [medido] **3.412 ms** a frio, depois 488 e 400 ms; 1 seq scan de 64 mil linhas e ~3.650 buscas por índice por chamada. Primeira resposta da página (TTFB) **3,3 s** na primeira visita e 1,6 s na segunda; as outras telas, 0,46–1,0 s | média | Primeira abertura do dia demora; consome CPU do banco gratuito | Contagens recalculadas sobre a tabela de mensagens | Mesmo caminho de D2 (contadores por lead); medir de novo depois |
| D4 | `painel-ao-vivo.tsx:79`, `leads/page.tsx:223`, `insights/page.tsx:109`, `atendimento/page.tsx:142`, `posvenda/page.tsx:85` | Erro técnico cru na tela | [reproduzido] sem rede, a lista mostra **"TypeError: Failed to fetch (guiuzbcqkvelqcuogxtd.supabase.co)"** (captura `erro-sem-rede-leads-1440.jpeg`). [lido] erro do Postgres em inglês ("canceling statement due to statement timeout") vai direto para a tela | média | Mensagem que não orienta; expõe o identificador do projeto | Repasse do `error.message` | Uma função única de mensagem ("Não consegui carregar agora. Tentando de novo…"), com o detalhe no log |
| D5 | `app/zapintel/leads/[id]/page.tsx:66-67`, `:150` | `r.json()` sem checar `r.ok`: 403, 429 e 500 viram "Lead não encontrado — ou ele não tem conversa." | [lido]; [reproduzido] o texto para id inválido (`/zapintel/leads/abc`, `/99999999`) | média | Falha de acesso ou de servidor aparece como "não existe" | Status ignorado | Mensagem por status (sem acesso / demorou / não existe) |
| D6 | `components/zapintel/rotulos.ts:14-35` e telas | Texto abaixo de 4,5:1 (WCAG AA) | [medido] verde `#16a34a` sobre branco, **3,3:1** (canal WhatsApp na lista: 54 vezes por página; selo "Cliente"); laranja `#ea580c` em selos de 9,5–10 px, **3,29–3,56:1**; urgência na ficha (`span.fc-urg`, `#9199a3`), **2,88:1**; branco sobre o roxo `#7c5cfc` (botões "Resumo do dia" e "Gerar…"), **4,38:1**; cinza `#6b7280` sobre `#f4f6f8` (barra lateral, rótulos de 10 px), **4,46:1**; selo "99+" do robô, 3,56:1. O Lighthouse da lista (acessibilidade 96) só pegou este último caso | média | Leitura difícil para baixa visão e em tela ao sol | `globals.css:13-17` já corrigiu `--green`, `--yellow` e `--orange`, mas `rotulos.ts` usa as cores cruas do Tailwind | Usar as variáveis já corrigidas em `rotulos.ts`; escurecer o roxo de fundo dos botões |
| D7 | Telas no celular | Alvos de toque menores que 40 px | [medido] a 360 px: lista 115 de 117 interativos, pós-venda 91 de 93, insights 42 de 70, ficha 6 de 8, atendimento 9 de 36 (chips, links "abrir conversa no CRM" e selos com cerca de 20–30 px de altura) | média | Toque errado no celular | Tamanhos pensados para mouse | Altura mínima de 40 px (ou área de toque ampliada) nos chips e links das linhas |
| D8 | `/zapintel/leads` a 360 px | O contêiner principal (`main.zi-main`) rola 18 px na horizontal (352 de 370 px) | [medido] | baixa | A tela "escorrega" de lado no celular | Algum filho com largura fixa maior que a tela (a faixa de chips rola à parte e está certa) | Achar o elemento de 370 px e limitar com `min-width: 0`/`max-width: 100%` |
| D9 | `/zapintel/leads` → ficha → Voltar | Voltar preserva filtro e página, mas **perde a rolagem** | [reproduzido] rolagem 900 → 0 | baixa | Quem percorre a lista perde o lugar a cada lead aberto | O scroll é de `main.zi-main`, que o Next não restaura | Guardar e restaurar o `scrollTop` por URL |
| D10 | `/zapintel/leads?classe=…` | Valor inválido na URL vira lista vazia, sem aviso nem chip | [reproduzido] `classe=quente` (o valor certo é `hot`), `classe=nada`, `urgencia=<script>`: "Nenhum lead com esses filtros." `pagina=-3` fica na URL | baixa | Link manual ou antigo parece "sem resultado" | Filtro de texto livre repassado sem validar contra a lista conhecida | Ignorar (e tirar da URL) o valor desconhecido |
| D11 | `components/zapintel/robo-analises.tsx:44-57,161` | Falha na contagem faz o bloco do robô sumir sem aviso | [lido] | média | Ligado a D2: no timeout, o dono nem sabe que há fila | Retorno `null` vira "não renderiza" | Mostrar "não consegui contar" com tentar de novo |
| D12 | `conversa/route.ts:58-63`, `perfil/route.ts:93-98`, `sugestao/route.ts:77-79` | Erro ao ler `zapintel_venda_lead` vira "não comprou", e o prompt recebe isso como **fato do CRM** ("não há venda ligada") | [lido] | média | Ficha de IA errada numa falha momentânea | Erro tratado como ausência | Checar o erro e abortar a geração (ou não afirmar) |
| D13 | `lib/zapintel/ctx.ts:69-71` | Erro ou timeout em `zapintel_escopo` vira "sem acesso" (403), sem log | [lido] | média | Instabilidade do banco parece bloqueio de permissão | Erro tratado como recusa | 503 com log para falha; 403 só para recusa |
| D14 | `lib/zapintel/ia.ts:249-253` | Erro ao gravar `assistente_uso` ignorado | [lido] | média | Consumo de IA some da conta do superadmin | Retorno não checado | Log `zapintel.ia.uso_nao_gravado` |
| D15 | `components/zapintel/painel-ao-vivo.tsx:407-409` | Botão "Abrir conversa" leva à ficha do ZapIntel, que desde 15/10 não mostra a conversa (no resto do módulo, "Abrir conversa no CRM" abre o CRM) | [lido] | média | Rótulo promete outra coisa | Texto não acompanhou a mudança da ficha | "Abrir ficha" |
| D16 | `scripts/calibrar-zapintel.mts:175-186,255,300,362,401` | Script quebrado: usa `lead.classification` e `lead.score`, que saíram do `Lead`; cita arquivos que não existem | [lido] (o `tsc` não pega porque o `tsconfig` não inclui `.mts`) | média | Relatório de calibragem sai com zeros e ordem errada, sem erro | Arquivo `.mts` fora da verificação de tipos | Remover ou reescrever sobre `zapintel_lead_perfil`; incluir `scripts/**/*.mts` no `tsc` |
| D17 | `scripts/perfil-zapintel.mts` (`--todos`, `--salvar`) | O lote **não pula funil interno** (a rota pula, com 422) e lê `zapintel_venda_lead`/`vendas` sem paginar (corte calado em 1.000) | [lido] | média | Com `--salvar`, grava ficha de conversa da equipe e erra a venda em base grande | Regras da rota não reaproveitadas | Usar `leadDeFunilInterno` e `buscarTudo` |
| D18 | `/zapintel/leads?q=…` | Busca pelo número do lead não funciona (`#1120` = 0), embora a busca do topo do CRM aceite "#número" | [reproduzido] | baixa | Atalho que funciona no CRM falha no ZapIntel | `zapintel_leads_lista` não reconhece o prefixo `#` | Tratar `#n` como `lead_id` |
| D19 | `conversa/route.ts:40,53`, `perfil/route.ts:56,66`, `sugestao/route.ts:65,74` | "lead invalido" e "conversa nao encontrada", sem acento, chegam à tela | [lido] | baixa | Texto descuidado | — | Acentuar |
| D20 | Comentários de cabeçalho (17 pontos) | Descrevem o que não existe mais: "painel antigo", "Copiloto" (no presente), `lib/zapintel/insights/followUp.ts`, "motor antigo aparecer", `zapintel_analise`, Gemini no `/api/assistente`, `--modelo` "em outro provedor"; e `zap-sidebar.tsx:141-147` fala de um aviso que nenhuma tela tem | [lido] (lista completa em §5) | baixa | Quem mantém é enganado pelo comentário | Comentários não revistos nas remoções de 15/10 | Revisar os 17 pontos |
| D21 | `scripts/check-nucleo.mjs:57`, `scripts/verificar-auditoria.sh:60`, `types/database.ts:6866` | Referências a coisas que não existem: `lib/zapintel/segments/segments.ts`, `app/zapintel/linguagem/page.tsx`, a função `zapintel_conversas` (apagada em 14/10) | [ferramenta]+grep | baixa | Verificações que checam o vazio | — | Atualizar ou remover |

---

## 2. Riscos potenciais

| # | Local | Descrição | Evidência | Grav. | Impacto | Correção recomendada |
|---|---|---|---|---|---|---|
| R1 | RPC `zapintel_conversa_calc` (via `zapintel_conversa`, chamada pela tela Atendimento com `p_recalcular`, e pelo pg_cron `zapintel-conversa-aquecer`, `0 5 * * *`) | 4,1–4,8 s por cálculo de 30 dias | [medido] 3 execuções: 4.638 / 4.845 / 4.059 ms; 7.220 buscas por índice | média | Perto do teto de 8 s do papel `authenticated`; um recálculo pela tela sob carga estoura | Recalcular só no cron (a tela lê o guardado), ou reduzir o custo |
| R2 | Busca no texto das conversas (`zapintel_leads_lista` com `busca`) | Primeira busca lenta | [medido] "boleto" **3.294 ms**, depois ~250 ms | média | Sob carga pode passar de 8 s | Índice de trigrama (`pg_trgm`) em `conteudo`/`transcricao`, ou buscar só nas fichas |
| R3 | `lib/zapintel/ctx.ts:105-109` | Erro em `leadDeFunilInterno` vira `false`: libera IA paga para conversa da equipe | [lido] | média | Ficha de IA de funcionário ou candidato numa falha | Tratar erro como bloqueio |
| R4 | `lib/zapintel/ia.ts:181-185` | `iaDoCrmLigada` libera quando a leitura de `assistente_config` falha | [lido] | baixa | A tela oferece IA que pode estar desligada | Checar o erro |
| R5 | Layout do ZapIntel (links do menu) | Cada página carregada pede de antemão (prefetch) as 5 telas do menu e o `/dashboard` do CRM | [medido] 11 requisições `?_rsc=` na abertura do dashboard (`/dashboard` 1,9 s; `/zapintel/leads` 0,96 s) | média | Gasto de CPU da Vercel no plano gratuito (o teto de CPU já é apertado) | `prefetch={false}` nos links do menu |
| R6 | `components/zapintel/painel-ao-vivo.tsx:69` e `hooks/zapintel/useLeads.tsx:63-74` | O relógio de 15 s fica no topo do painel e re-renderiza tudo (fila, gaveta de até 120 itens, mapa de 112 células); o valor do contexto do `LeadProvider` é objeto novo a cada render. Cada aviso do Realtime dispara 3+ renders completos | [lido] (o próprio comentário em `:612-613` admite) | média | Painel pesado em máquina fraca | `useMemo` no contexto; o relógio só nos itens que mostram tempo; `React.memo` nos blocos |
| R7 | `lib/zapintel/perfil.ts:582` | O log de "resposta fora do formato" grava até 400 caracteres da resposta da IA | [lido] | baixa | O prompt já vai mascarado, mas a resposta pode trazer primeiro nome ou detalhe da conversa no log | Logar só tamanho e motivo |
| R8 | 19 arquivos sem nenhum teste: as 6 telas, `layout.tsx`, `providers.tsx`, `api/perfil/pendentes/route.ts`, `lib/zapintel/ctx.ts` (sempre mockado), `painel-ao-vivo.tsx`, `robo-analises.tsx`, `zap-sidebar.tsx`, `rotulos.ts`, `preview-banner.tsx`, os 4 hooks | Cobertura medida dos demais: ramos de `conversa/route.ts` em **15,4%**; `montar.ts` com 0% de funções (sempre mockado) | [ferramenta] c8 | média | Regressão nessas telas só aparece em produção | Testes de componente (já há suporte a `.tsx` em `tests/resolver.mjs`) para robô, sidebar e hooks; teste real de `ctx.ts` |
| R9 | `supabase/testes/zapintel_acesso.sql` | Os testes SQL conferem **acesso**, não **conteúdo**; `zapintel_dashboard_lista`, `zapintel_funil_interno`, `zapintel_leads_com_conversa` e os gatilhos ao vivo não aparecem em teste nenhum | [lido] | média | Erro de conta passa despercebido | Testes de conteúdo com dados fixos num banco de ensaio |
| R10 | `scripts/*-zapintel.mts` | Os 5 leem `.env.local` com a chave de serviço; `perfil` (com `--salvar`) e `ponte` (com `--gravar`) gravam em produção; nenhum está no `package.json` nem documentado | [lido] | média | Execução acidental contra produção | Documentar; exigir confirmação para gravar |
| R11 | `lead_mensagens` (índices) | Índices redundantes encarecem cada mensagem gravada | [medido] dois índices únicos idênticos em `external_id` (`lead_mensagens_external_id_key` e `_uidx`); `idx_lead_msgs_empresa_id` coberto por 5 índices compostos; `idx_lead_msgs_lead_id` coberto por `idx_lead_msgs_lead_created` | baixa | Escrita mais lenta e mais disco | Remover os redundantes, com SQL autorizado e conferência de uso (`pg_stat_user_indexes`) |

---

## 3. Oportunidades de melhoria

| # | Local | O que | Evidência | Benefício |
|---|---|---|---|---|
| O1 | Módulo inteiro | O ZapIntel está **fora do design system Precisão**. Ele tem tema próprio em `app/zapintel/globals.css` (accent roxo `#7c5cfc`, `.card` com radius 14) e acumula: 63 hex fora do CSS (16 em `rotulos.ts`); 39 `rgba()`; 222 `font-size` literais de 9 a 34 px, sem escala; 100 `border-radius` literais; 8 `box-shadow`. A regra de ESLint que proíbe hex vale só para `components/ui/**` | [lido] | Visual igual ao CRM; contraste resolvido de uma vez (D6) |
| O2 | Duplicação | 14 clones, 235 linhas (1,94%): busca de venda + `montarFicha` em 3 rotas e no script; cabeçalho das rotas; início das páginas Atendimento/Insights; o `Cartao` local em 3 telas; CTEs repetidas entre `zapintel_dashboard` e `zapintel_dashboard_lista` | [ferramenta] jscpd | Uma regra muda num lugar só |
| O3 | Tipos | `types/database.ts` não tem as funções `zapintel_*` atuais: 12 `as never` e 4 `as unknown as` nas RPCs | [lido] | Erro de parâmetro pego na compilação |
| O4 | Exports | 21 exports que só o próprio arquivo usa (ex.: `ia.ts`: `MODELO_PADRAO_ZAPINTEL`, `ERRO_DEMOROU`, `modeloDoZapintel`; `ponte.ts`: `chaveTelefone`; `ficha.ts`: `falaQueEncerrou`) | [ferramenta] knip + grep (lista completa no histórico desta auditoria) | API menor e mais clara |
| O5 | Nomenclatura | "ficha", "perfil" e "análise" para coisas diferentes (`Ficha` = mecânica da conversa; `PerfilIA` = ficha de IA; a tela diz "Análise de IA"); `storeName`/`nomeDaLoja` = empresa, mas `loja` = filial; `sellerName` = papel no contexto e nome no `Lead`; dois tipos de classe (`Classe` e `Classification`) | [lido] | Menos confusão em manutenção |
| O6 | Textos | Inglês na interface ("Dashboard", "Insights", "score", "Modo preview"); "Pós Venda" × "Pós-venda"; "Conectando…" × "Reconectando…"; "Abrir conversa no CRM" e "Ver na conversa" para a mesma URL na ficha; "Atualizar pelo assistente" só abre o chat; "Nada ainda." | [lido] | Interface coerente |
| O7 | Voltar do navegador | A lista usa `router.replace` para filtros: Voltar não desfaz filtro (sai da tela) | [reproduzido] | Decidir: `push` (Voltar desfaz filtro) ou manter |
| O8 | Pequenos | `key` por índice (7 listas estáticas); 3 `setTimeout` de "Copiado" sem limpeza; 4 `console.error` em texto livre; 3 `eslint-disable`; pasta vazia `app/zapintel/segments/`; `buscar()` sem `void` em `useRpcAoVivo` | [lido] | Higiene |
| O9 | Acoplamento | CRM → ZapIntel: `components/assistente/assistente-widget.tsx:8` (robô), `lib/assistente/ferramentas.ts:3-4`, `app/api/cron/[job]/route.ts:10`. A trava `scripts/check-nucleo.mjs` só verifica comparação de segmento, não imports cruzados | [ferramenta] | Uma regra de import (eslint `no-restricted-imports`) evita crescer |
| O10 | Docs | `DEPLOY-ZAPINTEL-20261015.md:67-68` diz 48 testes / 19 ok e, mais abaixo, 18 ok; o relatório final diz "tsc sem erros" sem notar que `.mts` fica fora | [lido] | Docs coerentes |

---

## 4. Medições por tela (produção, dono, 1440 px)

O `next build` (Turbopack) não imprime tamanho por rota. Os números abaixo são do navegador
(Resource Timing), na segunda abertura de cada tela.

| Tela | 1ª resposta (TTFB) | Interativo (DOM) | Requisições | JS (comprimido / descomprimido) | Chamadas fetch | Maior arquivo |
|---|---|---|---|---|---|---|
| `/zapintel` (dashboard) | 1.611 ms (3.342 ms na 1ª visita) | 1.633 ms | 51 | 17 arquivos, 389 KB / 1,27 MB | 27 | chunk de 148 KB |
| `/zapintel/leads` | 469 ms | 493 ms | 50 | 16, 384 KB / 1,25 MB | 27 | o mesmo |
| `/zapintel/leads/[id]` | 491 ms | 530 ms | 40 | 16, 384 KB / 1,25 MB | 17 | o mesmo |
| `/zapintel/insights` | 997 ms | 1.017 ms | 39 | 16, 384 KB / 1,25 MB | 16 | o mesmo |
| `/zapintel/atendimento` | 498 ms | 522 ms | 58 | 16, 387 KB / 1,26 MB | 35 | o mesmo |
| `/zapintel/posvenda` | 455 ms | 484 ms | 47 | 16, 382 KB / 1,24 MB | 24 | o mesmo |

As "chamadas fetch" incluem o prefetch do menu (R5) e o túnel do Sentry (`/monitoring`).

**Banco, como dono (3 execuções, ms):**

| Função | Tempo | Leitura por chamada |
|---|---|---|
| `zapintel_dashboard` | 3.412 / 488 / 400 | seq scan em `lead_mensagens` (64 mil linhas) + 3.653 buscas por índice |
| `zapintel_dashboard_lista` (sem_resposta) | 79 / 75 / 73 | seq scan em `lead_mensagens` |
| `zapintel_leads_lista` (sem filtro) | 103 / 92 / 82 | seq scan em `lead_mensagens` |
| `zapintel_leads_lista` (busca "boleto") | 3.294, depois ~250 | texto das mensagens |
| `zapintel_turnos` (30 dias) | 239 / 243 / 206 | só índice |
| `zapintel_conversa_calc` (30 dias) | 4.638 / 4.845 / 4.059 | 7.220 buscas por índice |
| `zapintel_analises_pendentes` | 1.042 (1ª), depois 151–179 | `lead_mensagens` inteira, duas vezes |

Limites de tempo: `anon` 3 s, `authenticated` 8 s, `authenticator` 8 s (a chave de serviço
entra por ele no PostgREST).

**Responsividade (overflow, conferido em 360/768/1024/1440):** nenhuma tela passa da largura
no corpo da página. As tabelas largas de Atendimento (620 e 760 px), Insights (640 px), do
dashboard (532 px) e a faixa de chips da lista rolam dentro da própria caixa, como esperado.
A exceção é D8.

**Estados das telas:** carregando, vazio, erro e sucesso conferidos na lista ([reproduzido]:
esqueleto, "Nenhum lead com esses filtros.", erro sem rede e tabela). Nas outras telas, os
estados vêm dos campos `carregando` e `erro` de `useRpcAoVivo` ([lido]); o erro mostrado é o
texto cru (D4).

**Não verificado nesta etapa:** perfil de CPU no navegador (trace de Performance); celular de
verdade (só emulação); sessão de vendedor; o sino com mensagem chegando no exato momento do
teste (o ao vivo foi observado indiretamente, pelo contador de mensagens).

---

## 5. Detalhes que sustentam os itens

**Comentários desatualizados (D20)** — todos [lido]:

- `zap-sidebar.tsx:141-147`: aviso "nas telas que leem o painel antigo", que não existe mais.
- `conversa/route.ts:13-28`: painel e copiloto.
- `perfil/route.ts:16-19`: "o Copiloto monta o prompt", no presente.
- `sugestao/route.ts:24-27`: `lib/zapintel/insights/followUp.ts`, que não existe.
- `perfil.ts:9-10, 94, 510-511`: Copiloto, `Badge`, "motor antigo aparecer".
- `ia.ts:44-46`: o chat do assistente "continua no Gemini" — só o `/meu-dia` continua.
- `ficha.ts:18-29`: `zapintel_analise` e o `insight`.
- `conversas.ts:6,16,20,125,138`: motor e painel.
- `ponte.ts:51`: "o painel mostra".
- `scripts/perfil-zapintel.mts:52-56,171,264-273`: `--modelo` "em outro provedor"; Gemini.
- `scripts/ponte-zapintel.mts:4-12,64-69`: "TICKET_MEDIO 5200" e números de uma tela que não existe.
- `scripts/calibrar-zapintel.mts:6,255`: arquivos inexistentes.
- `preview-banner.tsx:5-6`: "Estilo / Estilo".
- `types/zapintel/index.ts:33-36,95`: `merge/matchEngine.ts` e uma seção vazia.

**Inventário de arquivos (A1):**

- **Tamanho:** 35 arquivos de código no escopo, 9.366 linhas, mais 5 scripts (1.002), 4 testes
  (774) e 13 arquivos SQL (2.289).
- **Maiores:** `components/zapintel/painel-ao-vivo.tsx` (838), `lib/zapintel/perfil.ts` (679),
  `app/zapintel/atendimento/page.tsx` (664).
- **Importadores:** todo arquivo que não é ponto de entrada (página, layout, rota, script ou
  teste) tem pelo menos um.
- **Fora das pastas, só o ZapIntel usa:** `types/zapintel/index.ts` e `tests/banco-falso.ts`.

**Cobertura (G16, c8 nos 114 testes), em % de linhas / ramos / funções:**

- `preview` 100 / 89,5 / 75; `conversa` 90,3 / **15,4** / 100; `perfil` (rota) 88,7 / 80 / 100;
  `sugestao` 96,5 / 85,7 / 100;
- `analise-de-ia` 61,5 / 75 / 50;
- `conversas` 62,2 / 75 / 40; `ficha` 92,4 / 61 / 97,1; `ia` 95,8 / 65,1 / 100; `mascara` 100 / 79,5 / 88,5;
  `montar` 51,6 / 100 / **0**; `papel` 100 / 66,7 / 100; `perfil` (lib) 67,2 / 40 / 40;
  `ponte` 71,2 / 87,5 / 55,6; `quem-usa` 100 / 100 / 100; `travou` 66 / 25 / 71,4.

O V8 conta comentário como linha coberta. Por isso o `montar` aparece com 51% de linhas e 0%
de funções.

**Scripts (G19):**

| Script | Funciona? | Grava em produção? |
|---|---|---|
| `calibrar` | não (D16) | não |
| `ficha` | sim | não |
| `travou` | sim | não |
| `perfil` | sim, com D17 | com `--salvar`/`--todos` |
| `ponte` | sim | com `--gravar` |

Nenhum deles está no `package.json` nem documentado.

---

## 6. Proposta de lotes de correção

Na ordem do prompt original. Cada lote pede o "pode" antes; nenhum foi começado.

| Lote | O que entra | Risco | Precisa de decisão do Lucas |
|---|---|---|---|
| **1 — Bugs funcionais** | D1 (robô dizendo "em dia"), D5 (erro da ficha por status), D4 (mensagem de erro orientada), D11 (robô some na falha), D15 (rótulo "Abrir ficha"), D19 (acentos), D10 (filtro inválido), D18 (`#número` na busca), D9 (rolagem ao voltar) | **baixo**: só código de tela e rota, com testes de componente | Os textos novos das mensagens de erro |
| **2 — Integridade** | D12 (venda ignorada vira fato no prompt), D13 (escopo × falha), R3 (funil interno na falha), D14 (uso de IA não gravado), R4 (IA ligada na falha), D17 (lote sem funil interno e sem paginação), R7 (log da resposta da IA) | baixo a médio: muda o comportamento em falha | Na falha da verificação de funil interno: **bloquear** (recomendado) ou liberar |
| **3 — Arquitetura que causa defeito** | D2 e D3 (contadores por lead em vez de reler `lead_mensagens`), R1 (recálculo da conversa só no cron), R2 (índice de busca), D16 (script quebrado + `.mts` no `tsc`), R9 (testes SQL de conteúdo) | **médio**: SQL persistente em produção (gatilho/colunas/índice), com ensaio no backup restaurado e reversão | Autorizar o SQL; remover ou reescrever o `calibrar` |
| **4 — Performance e UX** | R5 (prefetch do menu), R6 (renders do painel), D6 (contraste), D7 (toque no celular), D8 (overflow a 360 px), O1 (tokens Precisão), O6/O7 (textos e Voltar), R11 (índices redundantes) | médio: mexe no visual das 6 telas | **Adotar a paleta Precisão no ZapIntel ou manter o roxo próprio**; nomes em português ("Painel", "Insights"?); Voltar desfaz filtro?; SQL dos índices |
| **5 — Limpeza** | D20/D21 (comentários e referências mortas), O2 (duplicação), O3 (tipos das RPCs), O4 (exports), O5 (nomes), O8 (pequenos), O9 (regra de import), O10 (docs), R8 (testes das telas e hooks), R10 (documentar scripts) | baixo | Nenhuma além do "pode" |
