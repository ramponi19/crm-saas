# Nexus × Kommo — comparação e plano da reconstrução

19/10/2026. Base: `01-KOMMO-EXTRACAO.md` (Kommo, prints em `kommo/`), 17 telas
do Nexus em produção (prints em `nexus/`, fora do git porque têm dado de
cliente) e o mapa do código (94 páginas, 111 rotas de API).

Nada foi alterado no Nexus. Este documento é a base para decidir o que fazer.

---

## 1. Diagnóstico em cinco linhas

1. **O Nexus tem mais produto que o Kommo** em operação de loja: PDV, estoque,
   orçamento com link público, OS, garantia, contrato, financeiro, segmentos
   verticais e a análise de conversa ligada à venda real (ZapIntel). O Kommo é só
   comunicação + funil.
2. **O Kommo tem mais produto na parte de comunicação**: inbox própria, disparo,
   bots, segmentos, IA dentro do card e uma central com cerca de 267 integrações.
3. **O Kommo parece robusto por causa de densidade, hierarquia e honestidade dos
   números.** Não é por causa das cores.
4. **O Nexus parece "feito por IA" por um conjunto de vícios identificáveis**
   (seção 2). São todos corrigíveis, e nenhum depende de reescrever o motor.
5. **A peça que mais muda a percepção do cliente é a Central de Módulos.** O
   mecanismo por trás dela já existe no Nexus: o liga/desliga por segmento e por
   empresa. Falta só a tela do cliente.

---

## 2. Por que o Nexus "tem cara de IA" — causa por causa

Cada item tem a prova no print correspondente.

| # | Vício | Onde (print) | O Kommo faz assim |
|---|---|---|---|
| 1 | **Saudação no topo**: "Bom dia, JM." + data + frase. É o primeiro padrão que todo painel gerado por IA repete. | nexus/01-dashboard | O topo é o nome da empresa, filtros de período e de usuário, e "Configurações" do painel. |
| 2 | **Conteúdo espremido no centro**: em tela de 1920px sobram cerca de 220px vazios de cada lado; tarefas e configurações ficam numa coluna estreita. | 01, 05, 12, 13 | O funil e as listas usam a largura toda. |
| 3 | **Fonte Geist + botão preto + azul cobalto + cards de canto 12px.** É a estética padrão de template Vercel/Linear de 2025–26, exatamente a que as ferramentas de IA produzem. | todos | PT Sans 15px, cantos de 3–4px, azul só em ação. |
| 4 | **Número que não confere.** É o que mais denuncia "protótipo". | 01: "Lucro bruto R$ 106.467 · margem de 100%" (não há custo lançado); "423 aguardam primeira resposta" ao lado de "1697 leads ativos". 05: "Atrasadas (1000)", todas "Fazer primeiro contato" de 02/09 03:56, criadas em massa. | O painel mostra 0 quando não há dado e diz "Dados insuficientes para exibir". |
| 5 | **Menu plano de 11 itens, sem grupos.** Leads fica no mesmo nível de "Simular parcela" e "Check IMEI", que são ferramentas e não áreas. | 01 | 9 entradas com verbo de negócio (Comunicações, Pipelines, Automações, Insights), grupos que abrem e fecham, menu que recolhe. |
| 6 | **Dois lugares para a mesma coisa.** Relatórios e Financeiro aparecem no menu do CRM e no /admin. As abas de Configurações repetem Integrações, Funis e Modelos, que também têm página própria. Integrações e Configurações→Integrações mostram os canais duas vezes, de jeitos diferentes. | 10, 12 | Um único Configurações, com segundo menu de seções. |
| 7 | **Módulo desligado some em silêncio**: /agenda, /executivo e /gestao-leads voltam para o dashboard com `?indisponivel=`. | 04, 08, 17 | Recurso não contratado vira **vitrine**: explicação, números, botão "Testar agora", faixa "PRO". |
| 8 | **Robô flutuante azul** no canto de todas as telas. | 01, 05 | A IA mora dentro do card do lead e nas configurações, não flutuando. |
| 9 | **Área ZapIntel com identidade própria** (roxo #6d28d9 fixo no código, menu próprio): parece outro produto colado. | código | Um produto, um visual. |
| 10 | Restos do tema antigo: glow dourado e gradientes ainda no CSS global; sombra "glow" nos menus do admin. | código | — |

**O que NÃO é problema (a manter):** o kanban de leads (é o que você achou melhor
que o do Kommo, e eu concordo: a interação é mais direta), a busca ⌘K, o seletor
de loja, a régua de funil com "Exigir para entrar" por etapa (o Kommo cobra esse
recurso à parte) e a sobriedade geral. O Nexus não é feio. Ele é **genérico**.

---

## 3. Lado a lado, grupo por grupo (a tabela de planos do Kommo como régua)

Legenda: ✅ temos · ◐ temos pela metade · ✗ não temos.
Decisão: **manter** · **refazer** (existe, mas o cliente não enxerga como solução) ·
**criar** · **não fazer**.

### Gerar e capturar leads
| Kommo | Nexus | Decisão |
|---|---|---|
| Apps de mensagens (WA/IG/FB) | ✅ API oficial, os três conectados | manter |
| Chat ao vivo no site / botão de chat | ✗ (há formulário embed) | criar (botão que abre WhatsApp com UTM já resolve 80%) |
| Formulários web | ◐ formulário embed | refazer como "construtor" na Central |
| E-mail bidirecional | ✗ | não fazer agora |
| Anúncios com formulário (Meta Lead Ads) | ✗ | criar (alto valor para loja) |
| Planilhas Google | ✗ | depois |

### Canais
| Kommo | Nexus | Decisão |
|---|---|---|
| WhatsApp oficial, vários números | ✅ (vários números por loja) | manter |
| Templates do WhatsApp | ✅ modelos | manter, levar para a Central |
| Botões, listas, catálogo e carrossel no WhatsApp | ✗ | criar aos poucos (catálogo do estoque no WhatsApp é forte para a JM) |
| Instagram: comentário → DM, story → DM, palavra-chave | ✗ | criar (cuidado com a App Review da Meta, ver memória) |
| TikTok / Telegram | ✗ | não fazer agora |

### Ampliar a comunicação
| Kommo | Nexus | Decisão |
|---|---|---|
| **Caixa de entrada omnicanal** | ◐ a conversa só existe dentro do modal do lead | **criar** (maior lacuna funcional) |
| Transmissão (disparo) | ✗ | criar com template oficial (Meta-safe) |
| Modelos de chat/e-mail | ✅ | manter |
| Registro de chamadas | ✅ | manter |
| Chat da equipe e menções | ✅ chat / ✗ menções | adicionar @menção no card do lead |

### Organizar o trabalho
| Kommo | Nexus | Decisão |
|---|---|---|
| Tarefas | ✅ (mas com 1.000 atrasadas automáticas) | refazer a regra de criação |
| Calendário e lembretes | ✅ agenda / ◐ lembrete | manter |
| Gerador de documentos | ✅ contratos | manter, levar para a Central |
| App móvel | ◐ PWA | manter PWA; loja depois |
| Listas personalizadas | ◐ catálogos fixos por segmento | depois |
| Faturas (Bling) | ✗ | criar integração Bling/NF-e (pedido comum no varejo) |

### Agendar
| Kommo | Nexus | Decisão |
|---|---|---|
| Página pública de agendamento | ✅ /agendar/[slug] | manter, dar vitrine |
| Lembrete/confirmação automática | ◐ D-1 no cron | refazer como automação visível |
| Agente de IA que agenda | ✗ | não fazer agora (a IA do Nexus não envia mensagem) |

### Bots e automação
| Kommo | Nexus | Decisão |
|---|---|---|
| Salesbot / construtor sem código | ✗ | criar depois do inbox, em versão simples |
| NPS | ✗ | criar (barato, aparece muito) |
| Automação por etapa | ◐ só cria tarefa; cadências + fila do dia | **refazer como "Automatize" no próprio funil** |

### IA
| Kommo | Nexus | Decisão |
|---|---|---|
| Resumo da conversa | ✅ no ZapIntel | levar para dentro do card do lead |
| Escrita assistida | ✗ | criar |
| Resposta sugerida | ◐ só no ZapIntel | levar para o compositor do card |
| Tarefa sugerida / valor de campo sugerido | ◐ (a ficha do ZapIntel já extrai) | levar para o card como "sugestões" aceitáveis com 1 clique |
| Perguntas sem resposta | ✅ sem IA | dar destaque |
| Analista de IA | ✅ assistente com dados | manter (tirar o robô flutuante) |
| Agente que responde cliente | ✗ (por decisão) | não fazer agora |
| Créditos de IA por plano | ◐ limite por empresa | refazer como créditos visíveis por plano |

### Gerenciar leads
| Kommo | Nexus | Decisão |
|---|---|---|
| Vários funis e etapas | ✅ | manter |
| Status de leitura / clique em link | ✅ | manter, mostrar no card |
| Busca dentro do perfil | ✗ | criar |
| **Campos personalizados** | ✗ | **criar** (o Kommo cobra por quantidade; é base para vários segmentos) |
| Campos obrigatórios por etapa | ✅ fixo (telefone, valor, responsável, produto) | estender para campos personalizados |

### Públicos, medição e análise
| Kommo | Nexus | Decisão |
|---|---|---|
| Segmentos (públicos dinâmicos) | ✗ | criar junto com a transmissão |
| Sincronizar com Meta/Google Ads | ✗ | depois |
| UTM | ✅ | manter |
| API de Conversões da Meta | ✅ | manter, levar para a Central |
| Painel personalizável | ✗ (fixo por segmento) | criar (cards escolhidos pelo usuário) |
| Ganho/perda, metas, ranking | ✅ | manter |
| Pontuação de lead | ✅ | manter |
| **ROI de campanha** | ✗ (temos UTM + venda real) | **criar** (temos os dois lados; o Kommo cobra no Pro) |

### Plataforma e segurança
| Kommo | Nexus | Decisão |
|---|---|---|
| API REST / webhooks de saída / SDK | ✗ (só webhook de entrada) | criar API key + webhooks de saída |
| Permissões customizáveis / equipes | ◐ 4 papéis fixos + 6 chaves | refazer como perfis com matriz (o House Brokers pediu) |
| Permissão por campo / bloqueio por IP / limite de atividade | ✗ | depois |
| **2FA** | ✗ | **criar** (barato e vende segurança) |
| Histórico de eventos para o cliente | ◐ só no superadmin | criar |
| Backup | ◐ manual | já é pendência aberta |
| SSO | ✗ | não fazer agora |

---

## 4. O que o Nexus tem e o Kommo não tem (o argumento de venda)

O Kommo vive de integração de terceiro para tudo o que é operação. O Nexus já
faz dentro:

- **Balcão**: PDV, estoque com IMEI, compras, encomenda, simulação de parcela,
  financiamento.
- **Pós-venda**: garantia, assistência com OS e aprovação por link, orçamento
  com link público, cotação de troca.
- **Documento e dinheiro**: contrato gerado, financeiro com DRE, cobrança por
  gateway (Asaas, Mercado Pago, Efí, PagSeguro).
- **Segmentos**: imobiliária (imóveis, chaves, portais ZAP/VivaReal/OLX, site
  público), veículos (avaliação, FIPE), food (cardápio, KDS), saúde.
- **Inteligência medida contra venda real** (ZapIntel): o Kommo resume a
  conversa; o Nexus diz se aquilo vira venda.
- **Multi-loja e cadências com fila do dia.**

**Posicionamento proposto:** *"o Kommo do balcão"* — a comunicação de um CRM de
mensagens, com a operação da loja junto, por segmento. A Central de Módulos é
onde isso fica visível.

---

## 5. A Central de Módulos (a peça que você mais gostou)

### O que o Kommo faz
Grade de tiles com logo grande, filtro por categoria, aba "Instalado" e botão
"+ Instalar". O tile abre um modal com explicação e imagens. Os recursos de plano
superior aparecem com a faixa diagonal ("PRO", "ASSINE").

### O que já existe no Nexus e serve de motor
- O módulo liga e desliga por segmento (`segmentos_config.modulos_habilitados`).
- Também por empresa (`empresas.menu_override.habilitados`, `modulos_override`).
- O add-on pago já tem tabela própria (`complementos_empresa`).
- O menu já sabe esconder ou mostrar por plano, papel e maturidade (beta), em
  `lib/menu.ts`.
- **Hoje só o superadmin consegue ligar.** O dono da loja só esconde e renomeia
  (`/admin/meu-menu`).

### Proposta
Uma tela única **Configurações → Central de módulos**, para o dono da empresa:

1. **Abas**: Todos · Canais · Vendas · Operação · Do seu segmento · Inteligência ·
   Equipe · Documentos e pagamentos · ✓ Instalados.
2. **Tiles** com ilustração própria (não emoji, não ícone genérico) para cada
   módulo que já temos: Orçamentos, Propostas, PDV, Estoque, Check IMEI, Garantia,
   Assistência, Compras, Simular parcela, Financiamento, Agenda, Página de
   agendamento, Chat da equipe, Metas e Ranking, Distribuição, Cadências, Lead
   scoring, Contratos, Financeiro, Imóveis, Chaves, Portais, Avaliação de
   veículos, FIPE, Cardápio, KDS, ZapIntel, Assistente, Meta CAPI, cada gateway
   de pagamento, cada canal. **Já são mais de 30 tiles sem escrever nenhum
   módulo novo.**
3. **"Instalar"** abre um modal com o que faz, para quem é, 2–3 imagens e o plano
   necessário. Ao confirmar, liga o módulo para a empresa e abre um **passo a passo
   curto de configuração** (ex.: Orçamentos → "defina sua validade padrão e o
   texto de rodapé").
4. **Plano**: módulo fora do plano aparece com faixa "PRO" e botão "Fazer
   upgrade", sem sumir do catálogo.
5. **Segurança**: só dono ou admin instala; a trava de plano fica no servidor; a
   ação vai para o histórico de eventos.

A mesma ideia vale para as **vitrines**: toda rota de módulo desligado
(/agenda, /executivo, /gestao-leads…) para de redirecionar e passa a mostrar a
vitrine do módulo com o botão "Instalar".

---

## 6. Passos da reconstrução (ordem proposta)

Cada etapa sai com algo que **aparece** para o dono da loja; nenhuma etapa
entrega só fundação.

| Etapa | O que muda | O que o cliente vê | Tamanho |
|---|---|---|---|
| **0. Tirar o que denuncia** | Números honestos (sem custo → "custo não lançado", nunca "margem 100%"); acabar com as tarefas criadas em massa e limpar as 1.000 atrasadas; tirar a saudação e o robô flutuante; módulo desligado mostra vitrine em vez de redirecionar; fim das telas e abas duplicadas | Painel que bate com a loja; tarefas que fazem sentido | pequeno |
| **1. Nova linguagem visual (piloto em 3 telas)** | Fonte humanista no lugar da Geist, cantos de 4–6px, largura total, densidade maior, cabeçalho de seção em caixa alta pequena, cor só com função, ilustração só em estado vazio. Piloto: Dashboard, Leads e Configurações. **Você aprova antes de espalhar.** | Outro produto, sem perder o funil | médio |
| **2. Navegação nova** | Menu em grupos com verbo (Início · Comunicações · Vendas · Operação · Agenda · Insights · Automações), recolhível em trilho; **Configurações única** com segundo menu, juntando /admin e as abas de configurações | Acha tudo em 2 cliques; acabam os dois menus | médio |
| **3. Central de módulos + vitrines** | A seção 5 inteira | "Instalar" de verdade; o produto parece maior do que é hoje | médio |
| **4. Inbox omnicanal** | Tela de conversas (WA/IG/Messenger) com fila, filtros "não respondidas" e "mais tempo esperando", resposta rápida e template | O vendedor trabalha da inbox, não abrindo lead por lead | grande |
| **5. Card do lead novo** | Painel de campos à esquerda + linha do tempo única (mensagens, notas, tarefas, mudanças de etapa) + caixa de envio que alterna chat/nota/tarefa; **campos personalizados**; busca dentro do perfil; @menção | O centro do CRM fica no nível do Kommo | grande |
| **6. "Automatize" no funil** | Gatilhos visíveis embaixo de cada etapa (criar tarefa, mandar template, mudar responsável, NPS ao ganhar) | Automação que o dono entende olhando o funil | médio |
| **7. IA dentro do fluxo** | Resumo, resposta sugerida, escrita assistida e sugestão de campo **dentro do card**, aceitas com 1 clique; créditos por plano visíveis; o motor do ZapIntel alimenta | A IA aparece onde o vendedor trabalha | médio |
| **8. Plataforma** | 2FA; histórico de eventos para o cliente; perfis de permissão em matriz; API key + webhooks de saída | Argumento de segurança na venda | médio |
| **9. Crescimento** | Transmissão + segmentos; Lead Ads da Meta; ROI de campanha (UTM + venda real); painel personalizável; integração Bling/NF-e | Funções do plano "Pro" do Kommo | grande |

**O que proponho retirar ou rebaixar** (não é apagar código, é tirar do menu):
- **Simular parcela, Check IMEI e Consulta FIPE** viram ferramentas dentro de
  Orçamento/PDV/Estoque e da ⌘K, não itens de menu.
- **Telas duplicadas**: Relatórios e Financeiro ficam em um lugar só; as abas
  repetidas de Configurações saem.
- **/design** fica só no superadmin, como já é.
- **ZapIntel** perde o visual roxo próprio e entra no produto como módulo
  "Inteligência de conversas".

---

## 7. Minha opinião sincera

- **Não copiaria o painel escuro do Kommo.** Ele impressiona na primeira vez e
  cansa no uso. O que vale copiar é a **hierarquia**: pílulas de período, número
  grande, rótulo curto e "dados insuficientes" quando não há dado.
- **O seu funil é melhor de usar, e deve ficar.** O que falta nele é a cabeça da
  coluna do Kommo (quantidade e soma em R$ por etapa, com o sublinhado na cor da
  etapa) e o modo "Automatize".
- **O que mais rende por esforço é a etapa 0 + a etapa 3.** Número honesto e
  Central de Módulos mudam a percepção sem tocar no motor. A inbox (etapa 4) é o
  maior ganho funcional, mas é a mais cara.
- **Cuidado com a Meta**: transmissão, Instagram comentário→DM e qualquer bot
  mexem nas permissões aprovadas. Tudo passa por template oficial e pela regra de
  que a IA do Nexus não envia mensagem sozinha.

---

## 8. Decisões que preciso de você para começar

1. **Linguagem visual**: posso montar 2 ou 3 direções em uma página de prévia
   (sem tocar no CRM) para você escolher a fonte e o tom antes do piloto?
2. **Central de módulos**: os módulos que hoje dependem do segmento passam a
   poder ser instalados pelo dono de qualquer segmento? E algum deles vira pago
   à parte, como o ZapIntel?
3. **Ordem**: etapas 0 → 1 → 2 → 3 como acima, ou a inbox (4) antes da parte
   visual?
4. **Retiradas**: concorda com tirar Simular parcela, Check IMEI e FIPE do menu?

---

### Arquivos desta pasta
- `01-KOMMO-EXTRACAO.md` — tudo o que foi extraído do Kommo, item a item.
- `02-COMPARACAO-E-PLANO.md` — este documento.
- `kommo/` — 13 prints do Kommo (**fora do git**, como os do Nexus).
- `nexus/` — 17 prints do Nexus em produção (**não vão para o git**: têm dado de
  cliente).
