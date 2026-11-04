# Kommo — extração completa (referência para a reconstrução do Nexus)

Coletado em 17/10/2026, na conta de teste "Jm Store" do Lucas (teste grátis já
encerrado: a conta abre só em leitura e sem dados) e na página pública
https://www.kommo.com/br/precos/compare-planos/. Prints em `kommo/`.

> Limite desta coleta: como a conta está vazia e com o teste vencido, o funil
> não tem cards, o modo "Automatize" (gatilhos por etapa) não abre e o card do
> lead não pôde ser aberto. O que está descrito sobre esses três pontos vem da
> página de planos e do conhecimento público do produto, e está marcado assim.

---

## 1. Como o Kommo se organiza (menu real, expandido)

```
Início (painel)
Comunicações ▸  Inbox de chat · Inbox de email · Chats da equipe
Pipelines ▸     Funil de vendas · Todos os leads
Calendário
Segmentos  [Beta]
Listas ▸        Contatos · Empresas · Todos os contatos e empresas · Mídia
Agente de IA
Automações ▸    Bots · Modelos · Transmissão
Insights ▸      Painel · ROI · Ganhos e perdas · Relatório consolidado ·
                Relatório de atividades · Registro de atividades ·
                Relatório de chamadas · Relatório de objetivos
──────────────
Configurações · Ajuda ▸ · Centro de Notificação
[avatar + nome da conta]
```

Configurações tem um **segundo menu próprio** (a barra lateral vira trilho de
ícones e entra uma coluna de seções):

```
Perfil              Configurações de perfil (idioma, senha, chaves de acesso, 2FA, "novo menu")
Área de trabalho    Configurações de trabalho (subdomínio, fuso, país, formato de data/hora,
                    moeda, formato do nome do contato) · Configurações de chat ·
                    Configurações de email · Faturamento · Gestão de usuários
IA                  Configurações de IA · Fontes de conhecimento da IA
Integrações e canais  Central de integrações
```

Observações de estrutura:
- O menu tem **9 entradas de topo**; os grupos abrem e fecham (setinha), e o menu
  inteiro recolhe para um trilho de ícones (botão ao lado do logo).
- Rodapé fixo separado: Configurações, Ajuda, Notificações e a conta.
- Cada grupo tem verbo de negócio: Comunicações, Pipelines, Automações, Insights.

## 2. O visual (o que faz não "parecer IA")

Medido na página (computed style):

| Elemento | Valor |
|---|---|
| Fonte | **PT Sans**, 15px, peso 400 (uma família só, humanista, nada "geométrica de template") |
| Texto principal | #363B44 (cinza-chumbo, não preto) |
| Texto secundário | #6B6D72 |
| Fundo do app | #F5F5F5 (cinza neutro, quente-zero) |
| Barra lateral | branca, item ativo em azul claro com texto azul, raio 4px |
| Botão primário | azul (~#4C8BF7), cantos 3–4px, rótulo em CAIXA ALTA pequena |
| Cabeçalho das etapas do funil | CAIXA ALTA 13px com espaçamento, "N leads: R$ X" embaixo, **sublinhado colorido por etapa** |
| Painel (Início) | fundo azul-petróleo em degradê com **cards escuros**, número enorme colorido (verde = bom, roxo = neutro), período em pílulas (Hoje · Ontem · Semana · Mês · Período) |

O que dá a sensação de "produto robusto":
1. **Densidade**: muita informação por tela, pouco espaço vazio decorativo; o funil
   usa a tela inteira, sem cards de enfeite em volta.
2. **Raio pequeno (3–4px)** e sombra quase zero. Nada de cantos de 16–24px nem
   brilho.
3. **Cor só com função**: azul = ação; cor da etapa = etapa; verde/vermelho = número.
4. **Tipografia de trabalho** (PT Sans) e rótulos em caixa alta pequena nos
   cabeçalhos — o jeito de software corporativo antigo e confiável.
5. **Personalidade fora do trabalho**: mascotes 3D (o sino, o raio) aparecem só nos
   estados vazios, avisos e vitrines de recurso — nunca no meio da operação.
6. **Faixa diagonal "PRO" / "AVANÇADO" / "ASSINE"** no canto dos cards de recurso
   bloqueado: o plano aparece no próprio lugar onde o recurso mora.

## 3. Central de integrações (o "instalar" interativo)

Tela: `/settings/widgets/` (print `kommo/01-central-integracoes.png`).

- **Carrossel de destaque** no topo (ChatGPT via Zapier, Cal.com, TikTok), cada um
  com ilustração própria e botão "Conectar ›" / "Começar ›".
- **Abas de filtro**: Todos · Cx. Entrada · Soluções de IA · Automações · Fonte do
  lead · ✓ Instalado. Mais "Ordenar" e busca no topo.
- **Botões no topo**: "WEB HOOKS" e "+ CRIAR INTEGRAÇÃO" (para quem desenvolve).
- **Grade de tiles** com logo grande colorido, nome e botão "+ Instalar". Clicar no
  tile abre um modal com descrição, prints e o botão de instalar/configurar.
- **~267 integrações** em 20 categorias:

| Categoria | Qtde | Exemplos |
|---|---:|---|
| Mensageiros | 9 | WhatsApp Business, TikTok, Instagram, Apple Messages, Viber, Facebook, Telegram, WeChat, WhatsApp Lite |
| Provedores de WhatsApp | 10 | Wazzup, ChatArchitect, Youmessages, Chatter (WA+ChatGPT) |
| Bate-papo ao vivo e outros | 11 | Intercom, Slack, Telegram Group Chats |
| Formulários | 20 | TikTok Ads, LinkedIn, Typeform, Jotform, RD Station, Contact Form 7, WooCommerce |
| E-commerce | 11 | Shopify, **Mercado Livre**, **Nuvemshop**, WooCommerce, Hotmart, Kiwify, Eduzz |
| Soluções para o setor | 8 | **Conta Azul**, **Bling**, **Busca CNPJ (Receita Federal)**, Imóveis por Crescer |
| Chatbots | 12 | Meta Business Agent, agentes GPT de terceiros |
| Chamadas | 19 | API4Com, Twilio, Zoom, Zenvia, GoTo, Asterisk |
| Marketing e divulgação | 14 | Mailchimp, ActiveCampaign, SMS, disparo em massa |
| Pagamentos e faturamento | 8 | Stripe, PayPal, **Mercado Pago**, **Asaas**, **InfinitePay** |
| Serviços de integração | 4 | Zapier, Pluga, Make |
| Fluxo de trabalho | 15 | Google Agenda, Cal.com, Calendly, Zendesk |
| Análise e gestão de dados | 19 | Reportei, Google Sheets, exportar CSV, LTV |
| Gestão de documentos | 9 | Gerador de documentos, Google Docs/Drive, **Clicksign**, Assinafy |
| Personalização de leads | 18 | distribuição de leads, cópia, colorir leads inativos |
| Produtividade | 26 | auto-tarefas, scripts de venda, checklists, distribuição inteligente |
| Personalização de campos | 20 | fórmulas, campos dinâmicos, padronizar telefone |
| Gestão de duplicatas | 8 | anti-duplicata, auto-desduplicação |
| Personalização de CRM | 26 | multi-empresas, botões rápidos, objetos |

Leitura: **metade do catálogo são "mini-módulos" de terceiros** que resolvem uma
dor pontual (colorir lead parado, padronizar telefone, distribuir leads). Para o
cliente, cada tile é uma solução com nome. É isso que faz parecer vivo.

## 4. Telas vistas na conta

| Print | Tela | O que observar |
|---|---|---|
| 03-painel | Início | cards escuros sobre degradê, filtro de período em pílulas, "Mensagens recebidas", "Conversas em andamento", "Não respondidas", "Tempo de resposta", "Mais tempo esperando", "Fontes de lead", "Leads ganhos", "Leads ativos", "Tarefas"; botão "Configurações" do painel (cards escolhidos pelo usuário) |
| 04-menu-expandido | Menu | grupos abertos |
| 05-funil | Funil | 9 etapas (Em contato → Follow-up 1..6 → Negociação → Entrega), cabeçalho com contagem e soma, alternância quadro/lista, busca+filtro como etiqueta ("Leads ativos"), "AUTOMATIZE" e "NOVO LEAD" |
| 07-inbox-chat | Inbox de chat | vazio |
| 08-calendario | Calendário | **vitrine de recurso** (Agendamento com IA: título, prova em números, botão "Testar agora") no lugar da tela vazia |
| 09-lista-contatos | Contatos | lista com seletor de colunas (Cargo, Criado em, Criado por, Leads, Próxima tarefa, Responsável…) |
| 12-relatorio | Análise de vendas | funil em barras por etapa com tempo em cada etapa; card de upgrade com faixa diagonal |
| 14-config-trabalho | Configurações de trabalho | fuso, moeda, formatos |
| 16-config-chat | Configurações de chat | NPS ao fechar conversa (bloqueado no plano), regra "onde abrir conversa nova" (3 opções), "Registrar respostas lentas" |
| 17-config-ia | Configurações de IA | Copilot, Resposta sugerida, Sugestões de tarefas — cada um um card com descrição e botão; faixa "PRO"/"ASSINE" |
| 18-segmentos | Segmentos | vitrine em 3 passos: Crie um público → Envie a transmissão / Rode sua campanha → Gere mais vendas |

Padrão que se repete: **estado vazio = vitrine do recurso**, com explicação,
números e um botão. O cliente nunca vê "Nenhum dado".

## 5. Planos (tabela completa da página de comparação)

Preço por usuário/mês (assinatura mínima de 6 meses): Básico US$ 25 · Avançado
US$ 35 · Pro US$ 45 · Empresarial sob medida. Limites: leads ativos por licença
2.500 / 5.000 / 10.000; créditos de IA 750 / 1.250 / 2.250 por usuário/mês;
WhatsApp/Instagram 1 / 3 / ilimitado (+1 por usuário extra).

Recursos, item a item (cada linha é uma "solução" vendável):

**Gerar e capturar leads** — apps de mensagens · chat ao vivo no site · e-mail
bidirecional · construtor de formulários web · botão de chat do site · botão de
chat avançado (reage ao visitante) · SMS e VoIP · sincronização com Planilhas
Google · análise de e-mail (cria lead a partir de e-mail) · leitor de cartão de
visita · anúncios com formulário (Meta, TikTok, LinkedIn).

**Canais** — WhatsApp API oficial · vários números · modelos (templates) ·
fluxos do WhatsApp (formulários dentro do chat) · carrossel · catálogo · mensagens
de lista · botões · Instagram (várias contas) · checar se segue · comentário →
DM automática · seguir → DM · resposta de story → DM · inícios de conversa ·
gatilhos por palavra-chave · coleta de dados na DM · Facebook · TikTok · Telegram.

**Ampliar a comunicação** — caixa de entrada omnicanal · transmissão (disparo) ·
modelos de chat e e-mail · registro e gravação de chamadas · roteamento de
chamadas · chat da equipe e menções.

**Organizar o fluxo de trabalho** — tarefas no perfil · calendário e lembretes ·
gerador de documentos · app Android/iOS · armazenamento de mídia · listas
personalizadas · faturas via Bling.

**Agendar consultas** — calendários de agendamento · usuário por tipo de
agendamento · tipos ilimitados · reunião criada no card do lead · automação de
confirmação/lembrete · página pública de agendamento · agente de agendamento com
IA · perfis de calendário (10 grátis).

**Bots e automação** — Salesbots · construtor visual sem código · NPS · SMS e
e-mail por gatilho · gatilhos extras (tag, campo) · automação de fluxo (regras).

**Kommo IA** — créditos mensais · resumos · assistência de escrita · respostas
sugeridas (a partir de fontes de conhecimento) · tarefas sugeridas · sugestão de
valor de campo (a partir de chat, e-mail, nota e **áudio**) · perguntas não
respondidas · analista de IA · agentes de IA (3 / 50) com respostas, gatilhos,
**mensagem de voz** e agendamento.

**Gerenciar leads** — até 50 funis (100 no Empresarial) · etapas personalizadas ·
status de leitura · rastreio de clique em link · busca dentro do perfil ·
campos personalizados (100/200/400) · **campos obrigatórios por etapa** · pacote
"super campos" (moeda, catálogo global, fórmula, visibilidade).

**Criar e ativar públicos** — segmentos manuais · segmentos automáticos (E/OU,
negação, ação ao entrar/sair) · sincronizar com Facebook Ads e Google Ads.

**Medir e otimizar** — UTM (Click-to-WhatsApp, Instagram, formulários, botão) ·
desempenho por fonte de chat · Google Analytics · **API de Conversões da Meta** ·
API de eventos do TikTok.

**Análises** — painel personalizável · análise de vendas (ganho/perda) ·
relatórios avançados (chamadas, metas, previsão) · pontuação de leads · ROI de
campanha · analista de IA.

**Suporte e personalização** — suporte · rede de parceiros · 100+ integrações ·
API REST · WebSDK (widgets) · webhooks · suporte prioritário · gerente de conta.

**Segurança e acesso** — SSL · permissões por usuário · equipes · bloqueio por IP ·
permissão por campo · limites de atividade (quantos cards um usuário pode ver) ·
backup diário · backup periódico/agendado · histórico de eventos da área de
trabalho (ilimitado) · SSO · segurança empresarial · SLA.

## 6. O que ainda dá para coletar (se a conta for reativada ou com dados)

- Modo "Automatize" do funil (gatilhos embaixo de cada etapa).
- Card do lead (painel de campos à esquerda + linha do tempo com chat, notas e
  tarefas à direita, e a caixa de envio que alterna chat/nota/tarefa).
- Construtor de Salesbot e o fluxo de "Instalar" de uma integração até o fim.
