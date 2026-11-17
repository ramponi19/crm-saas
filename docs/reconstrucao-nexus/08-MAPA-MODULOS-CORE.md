# 08 — Mapa do Nexus: módulos, core e o que está solto (17/11/2026)

**Para que serve:** a foto de partida da frente "pronto para vender a qualquer segmento" (regra do Matheus: o core é
genérico; tudo que é de um segmento vive dentro de um módulo e só aparece com ele ligado; nada solto, nada sem dono).
Levantado em produção (só leitura, 17/11 ~07h15, antes da loja abrir) e no código da main `4fb47050`.

Fontes: `core/modulos.ts` (manifesto, 27 módulos), `node scripts/check-modulos.mjs --listar` (242 rotas: 98 core,
58 plataforma, 82 de módulo, 4 fora), catálogo de `pg_class`/`pg_proc`/`pg_trigger`/`pg_policies`/`storage.buckets`,
`empresa_modulos` e `empresa_menu` das 2 empresas (1 = JM Store Importados, pro; 5 = Preview · Loja, starter) e
contagem exata por `empresa_id = 1`.

**Como a empresa "liga" um módulo hoje (importa para tudo abaixo):** `ligadosDaEmpresa` = `empresa_menu.itens.base.habilitados`
(copiado do preset no cadastro) + `itens.superadmin.habilitados` + a Central (`empresa_modulos.ativo`, só chaves do
manifesto) + núcleo. **Nada nessa conta olha `emPreparacao`** — só a Central e o atendimento de pedido olham. Por isso um
preset que traz `/agenda` ou `/cardapio` na base liga a tela de um módulo "em preparação" (ver 3c).

**JM hoje (ligados):** Chat, Fila do dia, Gestão de Leads, Orçamentos (+ Cotação de troca pelo superadmin), Propostas,
PDV, Histórico, Simular parcela, Estoque, Produtos (catálogo), Check IMEI, ZapIntel. Desligados pela Central: Assistência,
Compras, Financeiro, Garantia, Relatórios, Transmissão, Públicos. Linhas fora do manifesto em `empresa_modulos`:
`vendas` e `avaliacao` (herança do corte; ninguém lê).

---

## 1. Módulos do manifesto

Estado: **pronto** = serve a qualquer empresa e está travado no servidor; **incompleto** = funciona, mas tem buraco de
trava, de segmento ou de dono (o que falta está na coluna); **em preparação** = `emPreparacao` no manifesto.
"Sem trava" = rotas da lista de exceções do `check-modulos` (API/tela pública que não confere módulo ligado).

| Módulo (chave) | Para que serve | O que o compõe | Requer | Estado real | JM usa? |
|---|---|---|---|---|---|
| Chat da equipe (`chat`) | Conversa interna da equipe | tela `/chat`; API `/api/chat/notify`, `/api/chat/upload`; tabelas `mensagens_internas`, `chat_leituras`; funções `chat_marcar_lido`, `chat_nao_lidas_por_conversa`; bucket `chat-midia` (anexos; dividido com a mídia da Comunicação); realtime `mensagens_internas`; badge `chat` no menu | — | incompleto: 2 APIs sem trava | sim — 3 mensagens, 15 leituras |
| Transmissão (`transmissao`) | Modelo aprovado do WhatsApp para uma lista da loja | `/transmissao`; `/api/transmissao`, `/api/transmissao/[id]`; `transmissoes`, `transmissao_envios`; 9 funções `transmissao_*`; gatilho `mensagens_transmissao_resposta`; cron `automacoes-hora` (agendadas) | — | pronto | não (desligado; 0 envios — falta pagamento nas WABAs) |
| Públicos (`publicos`) | Listas salvas por regra para Transmissão/Automatize | `/publicos`; `/api/publicos`; `publicos`, `publicos_membros`; `publicos_previa/recalcular/resolver/rodada`; gatilho `publicos_updated_at`; rodada no `automacoes-hora` | — | pronto | não (desligado; 0) |
| Fila do dia (`fila`) | O que cada vendedor faz hoje | `/fila` (lê `negocios`, cadências, `configuracoes_sistema`) | — | pronto | sim (sem tabela própria) |
| Gestão de Leads (`gestao_leads`) | Lead parado e quem cobrar | `/gestao-leads` (lê `negocios`, `funil_etapas`, cadências e **`imoveis_perfis_busca`**) | — | incompleto: lê tabela do Imóveis | sim (sem tabela própria) |
| Agenda (`agenda`) | Visitas e atendimentos num calendário | `/agenda`; público `/agendar/[slug]` + `/api/agendar/[slug]`; tabela **`visitas`** (sem prefixo); `/configuracoes/agendamento`; `RotulosAgenda` (vocabulário de clínica no preset Saúde) | — | em preparação (mas ligado pela base dos presets Imobiliária e Saúde) | não (0 visitas) |
| Orçamentos (`orcamentos`) | Cotação/orçamento com link de aprovação | `/orcamentos`, `/orcamentos/checklist`, `/orcamentos/cotacao` (troca), `/orcamentos/precos`; público `/orcamento/[token]` + `/api/orcamento/[token]`; `/api/orcamentos`, `/api/troca/*` (5); tabelas **`assistencia_orcamentos`**, **`avaliacao_cotacoes/precos/regras`** (prefixo de outros módulos); função `numerar_cotacao_troca` + gatilho; `/configuracoes/troca`; `lib/troca-*.ts`, `lib/apple-modelos.ts` | — | incompleto: a cotação de troca é de aparelho (iPhone/IMEI/checklist) e mora no módulo genérico; tabelas com prefixo errado; 8 rotas sem trava | ligado, **0 orçamentos e 0 cotações** gravados |
| Propostas (`propostas`) | Proposta formal com itens e validade | `/propostas`; público `/proposta/[token]`; `/api/propostas`; `vendas_propostas` | — | incompleto: 2 rotas sem trava | ligado, 0 propostas |
| PDV (`pdv`) | Venda no balcão com pagamento, troca, encomenda e contrato | `/pdv`; `/api/contrato-documentos`, `/api/contrato-modelo`; `vendas_vendas`, `vendas_pagamentos`, `vendas_termos`, `vendas_alertas`, `vendas_pre_vendas`, `vendas_contratos`, `vendas_contrato_modelos`, `vendas_contrato_documentos`, `vendas_fichas_financiamento`, `vendas_comissoes`; gatilhos `*_preencher_filial`, `zapintel_vendas_ao_vivo`; bucket `contratos`; `/configuracoes/contrato` e `/documentos`; encomendas (`components/modules/pdv`) | estoque | incompleto: texto/campo de celular (IMEI) no PDV e nos contratos; 2 APIs sem trava | **sim — 115 vendas, 52 pagamentos, 118 contratos, 6 modelos** |
| Histórico de vendas (`historico`) | Todas as vendas com 2ª via | `/historico` (lê `vendas_*`) | — (lê do PDV) | pronto (falta `requer: pdv`) | sim (as 115 vendas) |
| Simular parcela (`simular_parcela`) | Parcela com as taxas da maquininha | ferramenta em `/orcamentos/parcela`; lê `financeiro_taxas` | — | pronto | sim (48 taxas) |
| Financiamento (`simular_financiamento`) | Simulação de financiamento | `/simular-financiamento`; `components/modules/simular-financiamento`; painel `financiamento` no card | — | em preparação (ligado pela base Imobiliária e Veículos) | não |
| Avaliação de veículos (`avaliacoes`) | Vistoria do usado na troca | `/avaliacoes`; `/api/avaliacoes`, `/api/veiculos/[slug]`; `avaliacao_usados`; `estoque_veiculo_dados`; `/configuracoes/portais` (veiculos-portais); painéis `interesse-veiculo`, `financiamento`; capacidades `automacoesVeiculo`, `matchVeiculo`; `lib/match-veiculos.ts` | pdv | em preparação (ligado pela base Veículos) | não (0) |
| Consulta FIPE (`consulta_fipe`) | Valor FIPE do veículo | ferramenta `/avaliacoes/fipe`; `/api/fipe/opcoes`, `/api/fipe/valor`; `avaliacao_fipe_consultas`, `avaliacao_fipe_referencia`; `/superadmin/fipe`; **cron `sync-fipe` diário** | — | em preparação | não |
| Estoque (`estoque`) | Unidades da loja com custo | `/estoque`; `/api/estoque/confirmar-chegada`, `/api/estoque/transferir`, `/api/reservas`; `estoque_unidades`, `estoque_movimentacoes`, `estoque_fornecedores`, `estoque_tabela_precos`; função/gatilho `estoque_item_sync` (espelha em `itens`); `lib/estoque-campos.ts` | — | incompleto: **é estoque de celular** (IMEI, armazenamento, cor, bateria fixos na tela); frase do manifesto fala em IMEI; 3 APIs sem trava | **sim — 48 unidades** |
| Produtos (`catalogo`) | Catálogo de modelos e preços | `/catalogo` (redirect `/produtos`); `estoque_produtos`, `estoque_categorias`, `estoque_subcategorias`, `estoque_marcas`; bucket `produtos`; ícone `Smartphone` no menu | — (lê o Estoque) | incompleto: rótulo/ícone de celular; sem `requer: estoque` | sim — 35 produtos, 7 categorias, 12 marcas |
| Compras (`compras`) | Pedido ao fornecedor e entrada no estoque | `/compras`; `/api/compras/receber`; `vendas_pedidos_compra` (prefixo `vendas_`) | — | incompleto: API sem trava; não `requer` estoque | desligado na Central, mas **111 pedidos** (encomendas do PDV gravam aqui) |
| Check IMEI (`check_imei`) | Consulta IMEI | ferramenta `/estoque/imei`; `estoque_imei_consultas`; `lib/imei.ts` | — | pronto como módulo de celular (falta `requer: estoque`) | ligado, 0 consultas |
| Imóveis (`imoveis`) | Carteira de imóveis | `/imoveis`; públicos `/imob/[slug]`, `/imovel/[id]`; `/api/imob/*` (3), `/api/portais/*` (2), `/api/match/lead/[id]`, `/api/admin/importar-imoveis`; `imoveis_imoveis`, `imoveis_chaves`, `imoveis_negocios`, `imoveis_perfis_busca`; funções `imoveis_perfil_espelho`, `marcar_cliente_proprietario`; 4 gatilhos; **bucket `imoveis` (público, sem pasta por empresa)**; `/configuracoes/portais`; 6 campos de contato; painéis `negocio-imovel`, `match-imoveis`; 6 capacidades | — | em preparação (ligado pela base Imobiliária); 9 rotas sem trava | não (0) |
| Cardápio (`cardapio`) | Cardápio e pedido pelo celular | `/cardapio`; público `/menu/[slug]` + `/api/menu/[slug]/pedido`; tabela **`pedidos`** (sem prefixo); `/configuracoes/cardapio`; capacidade `usaComanda` | — | em preparação (ligado pela base Food) | não (0) |
| Cozinha (`kds`) | Tela da cozinha | `/kds`; lê `pedidos` (realtime fora da publicação) | — (devia `requer: cardapio`) | em preparação (ligado pela base Food) | não |
| Garantia (`garantia`) | Prazo de garantia de cada venda | `/garantia`; `/api/garantia/termo`; `assistencia_garantias` (prefixo de outro módulo); badge `garantia` | — | incompleto: termo/garantia de aparelho (IMEI); API sem trava | desligado (0) |
| Assistência (`assistencia`) | Ordem de serviço | `/assistencia`; público `/os/[token]` + `/api/os/[token]`; `assistencia_servicos` | estoque | incompleto: OS de aparelho (IMEI); 2 rotas sem trava | desligado (0) |
| Relatórios (`relatorios`) | Vendas, conversão, equipe | `/relatorios` (+ `relatorios-imob-view`); plano `bi` | — | incompleto: lê `imoveis_imoveis`, `visitas` | desligado |
| Financeiro (`financeiro`) | Contas a pagar/receber | `/financeiro`; `/api/payments/charge`, `/api/payments/config`, webhook `/api/payments/webhook/[provider]`; `financeiro_lancamentos`, `financeiro_cobrancas`, `financeiro_config_pagamento`, `financeiro_webhook_eventos`, `financeiro_taxas` (taxas = core); aba de comissão imob | — | incompleto: lê `imoveis_*`; 2 APIs sem trava | desligado, mas 2 cobranças e 48 taxas |
| Executivo (`executivo`) | Painel do dono | `/executivo` (lê `imoveis_*`, `visitas`) | — | em preparação (ligado pela base Imobiliária) | não |
| ZapIntel (`inteligencia`, addon) | Lê as conversas e diz por que vende/perde | `/zapintel/*` (6 telas, 4 APIs), `/api/zapintel/preview` (superadmin); `zapintel_conversa_cache`, `zapintel_lead_perfil`, `zapintel_venda_lead`, `zapintel_midia_retida`; ~28 funções `zapintel_*`; 3 gatilhos `*_ao_vivo`; cron `zapintel-conversa-aquecer`, `reter-audio`, `ponte-vendas`; `lib/zapintel/*` | — | pronto | **sim — 3.415 fichas, 115 vendas ligadas, 20 mil mídias retidas** |

---

## 2. O core (não se instala nem se tira)

| Parte | O que compõe |
|---|---|
| Contatos (Clientes) | `/clientes`, `/api/clientes/*`, `/api/contatos/fundir*`; `contatos`, `contato_identidades`, `contato_fusoes`; `core_contato_match/vinculos`, `core_fundir_contatos`, `core_telefone_e164`, `core_validar_dados`, `core_filial_do_contato`, `core_propagar_filial_do_contato`; gatilhos `contatos_*`; realtime `contatos` |
| Negócios e funis | `/leads` (quadro + card), `/api/leads/*` (11), `/api/funil`, `/api/funis`; Configurações → Etapas, Funis, SLA, Motivos; `negocios`, `negocio_historico`, `funis`, `funil_etapas`, `motivos_perda`, `itens` (produto genérico do lead); `quadro_*`, `core_negocio_*`, `negocio_atribuir`, `core_limite_negocios`, `esperando_resposta*`; esteira/roleta (`lib/esteira.ts`, `lib/roleta.ts`); realtime `negocios` |
| Conversas, mensagens e canais | `/comunicacao`, `/api/comunicacao/*`, `/api/canais/*` (8), `/api/whatsapp/send`, `/api/midia`, `/api/leads/[id]/canais`; Configurações → Canais e integrações; `conversas`, `mensagens`, `canais`, `chamadas`, `diagnostico_canais`, `historico_bruto`, `modelos_mensagem`, `modelos_mensagem_wabas`; `mensagem_registrar`, `webhook_*`, `core_negocio_do_canal`, `core_filial_do_canal`, `canais_empresa_fixa`, `whatsapp_waba_da_loja`, `modelo_aprovado_na_loja`; Edge `webhook-leads`; bucket `chat-midia` (mídia); realtime `conversas`, `mensagens` |
| Tarefas | `/tarefas`; `tarefas`; gatilho `tarefas_preencher_filial` |
| Automações | `/automacoes`, `/cadencias`, `/distribuicao`, `/scoring`, `/modelos`, `/respostas`; `/api/automatize`, `/api/cadencias/*`, `/api/distribuicao`, `/api/scoring`, `/api/modelos/*`, `/api/reativacao`, `/api/leads/pontuar`; `automacoes`, `automacao_execucoes`, `cadencias`, `cadencia_passos`, `cadencia_inscricoes`, `cadencia_execucoes`, `distribuicao_regras`; `automacao_reservar`; cron `automacoes-hora` |
| Etiquetas | Configurações → Etiquetas, `/api/leads/etiquetas*`; `etiquetas`; `etiquetas_aplicar`, `core_contato_etiquetas_*`, `core_etiqueta_apagada` |
| Campos personalizados | `campos_personalizados` (`modulo_dono`); `core/campos.ts`, `lib/campos-padrao.ts` (JM: 7, todos sem dono = do core) |
| Equipe e acesso | `/equipe`, Configurações → Usuários, Permissões; `/api/equipe/*` (4), `/api/permissoes`, `/api/acesso`, `/api/ausencia`; `usuarios`, `empresa_usuarios`, `acessos`; `handle_new_user`, `prevent_privilege_escalation`, `is_empresa_admin`; papéis owner/admin/vendedor/tecnico (`lib/permissoes.ts`) |
| Lojas | Configurações → Lojas, `/api/admin/filiais`, `/api/filial/selecionar`; `filiais`; `filiais_visiveis`, `filial_atual`, `filial_gravacao`, `preencher_filial*` |
| Empresa | Configurações → Minha empresa, Aparência, Menu, Horário, Exportar dados; `/api/empresa*`, `/api/aparencia`, `/api/menu-config`, `/api/exportar`, `/api/push/subscribe`; `empresas`, `empresa_branding`, `empresa_menu`, `empresa_dados_contrato`, `empresa_segredos`, `configuracoes_sistema`, `notificacao_prefs`, `push_subscriptions`; `empresa_fuso`; bucket `lgpd-exportacoes`; cron `lgpd-exportacoes-limpar`, `retencao-diaria` |
| Insights | `/dashboard`, `/visao-geral`, `/conversao`, `/metas`; `metas`, `metas_comissoes`, `eventos`; `core_indicadores`, `core_evento_emitir` |
| Central de módulos | `/modulos`, `/vitrine/[modulo]`, `/api/modulos/*`; `empresa_modulos`, `modulo_pedidos`; `core_modulo_ligado`, `core_modulo_config` |
| Planos e cobrança do SaaS (plataforma) | Configurações → Faturamento, `/api/stripe/*` (4), `/superadmin/planos`; `planos_config`, `stripe_eventos`; cron `expirar-trials`, `sync-stripe` |
| Plataforma | `/login`, `/register`, `/entrar`, `/reset-senha`, landing, `/superadmin/*` (11 telas, 18 APIs); `avisos_plataforma`, `superadmin_logs`, `rate_limit`, `presets_onboarding`; `set_impersonation`, `encerrar_impersonacao`, `hard_delete_empresa`, `rate_limit_bump` |
| Assistente (IA, chat com dados) | widget no layout; `/api/assistente`, `/api/assistente/meu-dia` (**hoje "fora"**); `assistente_config`, `assistente_uso`; `assistente_status_leads`, `assistente_leads_visiveis` |
| Rastreamento de origem | `/i/[codigo]`, `/track.js`, `/api/rastreamento/*` (5); `rastreamento_config/links/visitas/eventos` (dono hoje: plataforma; JM 1 config, 0 links) |

---

## 3. O que está SOLTO

### 3a. Segmento fora do seu módulo

**Celular (o mais espalhado — herança da JM):**
- **Estoque/Produtos tratam todo item como celular:** colunas fixas IMEI e Bateria na lista (`estoque-view.tsx:302-318`); busca "por IMEI"; botões "Entrada de semi-novo" / "Compra de aparelho usado" (`:518-564`); campo "Número de modelo (Ajustes › Geral › Sobre)" antes de escolher qualquer produto (`:980-1001`); aviso e bloqueio por IMEI não consultado mesmo com Check IMEI desligado (`:723-739`, `:870-876`, `:1143-1162`). `unidade-modal.tsx:249-269` mostra IMEI/Bateria/Armazenamento sempre (ignora `camposDaCategoria`). `produto-modal.tsx:161-171`: seletor "Modelo Apple" por **`slug === 'jm-store'` (empresa escrita no código)** e chips "Armazenamentos". `catalogo-view.tsx`: coluna IMEI, "Armazenamento", "Ex: iPhone 15 Pro Max". Menu "Produtos" com ícone `Smartphone`; frase do manifesto "custo, cor, armazenamento e IMEI".
- **Card do lead (core):** `LeadReservaPanel` (IMEI, bateria, "ex.: iPhone 14 Pro") e `LeadOrcamentoPanel` ("Venda / semi-novo", "Downgrade") renderizados **sempre**, fora de `paineisDoLead` (`lead-modal.tsx:1567-1569`).
- **Busca ⌘K (core):** procura `estoque_unidades` por IMEI sempre; ações fixas "Nova venda no PDV", "Gerar cobrança Pix", "Ir para PDV/Estoque" sem olhar módulo (`command-palette.tsx`).
- **Configurações (core):** "Troca" (card "Troca de aparelho") sempre visível e sem trava; exemplos "iPhone 15 Pro 256GB"/IMEI na prévia do modelo de contrato, "Chegou o aparelho" na assinatura, "novo 90, seminovo 30" no contrato, "João | iPhone 15" em Modelos.
- **Contrato (lib do core usada por PDV/Garantia/Histórico):** coluna "IMEI / Nº série", "Aparelho entregue", "Tabela dos aparelhos entregues na troca" (`lib/contrato-modelo.ts`, `contrato-tipos.ts:67`, `contrato-emitir.ts:76`).
- **PDV/Encomenda/Orçamentos/Garantia/Assistência:** bloco "Aparelho(s) na troca" com checkbox sempre visível; entrada "Aparelho semi-novo" na encomenda; editor de orçamento com "Aparelho", "IMEI / série" sempre; OS com categorias fixas Tela/Bateria/Conector e "Troca de tela iPhone 13"; garantia "Ex: iPhone 11". A cotação de troca inteira (`/orcamentos/cotacao|precos|checklist`, `/api/troca/*`, `lib/troca-*`, `apple-modelos`) é de iPhone e mora no módulo genérico Orçamentos, liberada por um "habilitado" do superadmin.
- **ZapIntel (vendido como genérico):** dicionário `MODELOS` (iPhone/MacBook/AirPods) e regex `iphone` nas funções SQL do painel; exemplos "trocar de iPhone", "como está o aparelho".
- **Equipe/Relatórios/Ranking:** "aguardando aparelho chegar"; CSV com coluna "IMEI".
- **Banco:** `estoque_unidades.imei/imei2/bateria/armazenamento/anatel_resultado`, `estoque_produtos.armazenamentos`, `estoque_tabela_precos.armazenamento`, `assistencia_orcamentos.aparelho/imei`, `assistencia_garantias.imei_serial`, `avaliacao_cotacoes/precos/regras` (troca de celular com o prefixo do módulo de veículos).

**Imobiliária / veículos:**
- **Simulador de financiamento com padrão de imóvel:** R$ 300.000, entrada R$ 60.000, 360 meses, 0,9% a.m., SAC, "sem … TR" (`simular-financiamento-view.tsx:15-19,88`).
- **Sempre visível:** "Corretor:" fixo na Gestão de Leads; tipo **"vistoria"** na Agenda sem Imóveis; "O paciente marca sozinho" no card de Agendamento e "Agendado pelo paciente (online)" gravado no banco (`api/agendar/[slug]:77`); coluna/meta **"Visitas"** e score `visitas×2` no Ranking; modelo de mensagem `confirmacao_visita` sempre na lista.
- **Consulta sem o módulo:** Gestão de Leads lê `imoveis_perfis_busca` sempre; Agenda lê `imoveis_imoveis` sempre; Integrações lê `import_imoveis` sempre; `/api/assistente/meu-dia` lê `visitas` sempre.
- **Sem trava de módulo:** `/api/exportar` tipos `imob_*`; feed `/api/portais/[slug]` (fora do matcher do proxy); feed `/api/veiculos/[slug]` e o estoque de veículo dependem do **campo `placa`**, não do módulo.
- **Executivo** (genérico no manifesto) só serve imobiliária, sem `requer`. **Financeiro** mostra Comissões por `has('/imoveis')` (a capacidade `comissaoPorNegocio` existe e ninguém lê; `integraPortais` idem).
- **Banco:** `visitas` (nome, `imovel_id`, `corretor_id`, CHECK com 'vistoria'), `estoque_unidades.placa/chassi/renavam/km/ano`, `estoque_veiculo_dados`, `vendas_fichas_financiamento`.

**Restaurante / clínica / "segmento":**
- `lib/menu.ts`: grupos `'Imóveis' / 'Veículos' / 'Food'` (GRUPO_DO_LEGADO, código morto) e conflito de grupo do KDS (manifesto 'estoque', menu 'vendas').
- Assistente e ZapIntel descrevem a empresa pelo **preset** ("clínica", "restaurante… KDS", papel "Recepcionista"), não pelos módulos ligados (`lib/assistente/negocio.ts`, `lib/zapintel/papel.ts`).
- `Vocabulario.contato` ("Paciente") gravado pelo preset e nunca lido; exemplo "Clientes → Pacientes" na tela de Menu.
- `check-segmento` não varre `hooks/` nem `proxy.ts`.
- Estacionamento: nada no código.

### 3b. Rota, tabela, função, script sem dono ou fora do lugar
- **Fora do core e de módulo:** `/ranking`, `/api/ranking/metas` (no menu só pelo extra do preset Imobiliária; abrem por URL em qualquer empresa), `/api/assistente`, `/api/assistente/meu-dia`.
- **40 rotas de módulo sem trava no servidor** (`scripts/modulos-excecoes.json`), entre elas todas as telas públicas por token/slug (`/os`, `/orcamento`, `/proposta`, `/imob`, `/imovel`, `/menu`) e as APIs de Imóveis, FIPE, troca, estoque, financeiro, chat, garantia.
- **Seções de Configurações de módulo contadas como core e sem trava por endereço:** Cardápio, Portais, Agendamento, Troca, Contrato, Documentos (o menu esconde; a página abre).
- **Tabelas com prefixo de outro dono:** `assistencia_orcamentos` (Orçamentos), `avaliacao_cotacoes/precos/regras` (troca de celular), `assistencia_garantias` (Garantia), `vendas_pedidos_compra` (Compras), `vendas_fichas_financiamento` (Financiamento); sem prefixo: `visitas` (Agenda), `pedidos` (Cardápio).
- **Requisitos faltando no manifesto:** Histórico → PDV; Produtos, Compras, Check IMEI → Estoque; KDS → Cardápio; Executivo → Imóveis.
- **Página inalcançável:** `/equipe` (o proxy redireciona para Configurações → Usuários); redirecionador `/produtos` (só o card de primeiro acesso aponta para ele).
- **Sem tela:** cadeia de rastreamento (`/api/rastreamento/*`, `/i/[codigo]`, `/track.js`) — nada na UI gera token ou link; quem lê as tabelas é o ZapIntel.
- **Cron de segmento na plataforma:** `sync-fipe` diário no `vercel.json`, para um módulo em preparação.
- **Hrefs mortos nas bases e presets:** `/aparencia`, `/canais`, `/empresa`, `/funil`, `/meu-menu`, `/permissoes`, `/planos`, `/configuracoes`, `/marketing` (404), `/produtos` (rótulos "Serviços"/"Veículos" que nunca aparecem); extras `/imoveis`, `/simular-financiamento`, `/cardapio` (pulados).
- **`empresa_modulos` com chaves fora do manifesto:** `vendas`, `avaliacao` (JM e Preview); presets com `comanda`.
- **Scripts:** `verificar-auditoria.sh` confere arquivos que não existem (passa à toa); `apontar-webhook.mjs` aponta para a Edge `webhook-leads-preview`, que não existe; `checar-numero-whatsapp.mjs`, `diagnostico-webhooks.mjs`, `perfil-manual.mts` sem referência; o 05 cita `scripts/comparar-menu.mts`, que não existe.

### 3c. "Em preparação" aparecendo onde não devia
- O menu e a trava do proxy **não olham `emPreparacao`**: numa empresa nova, Agenda, Imóveis, Financiamento e Executivo (preset Imobiliária), Agenda (Saúde), Cardápio e KDS (Food), Avaliações, FIPE e Financiamento (Veículos) aparecem no menu e abrem por endereço.
- As telas públicas desses módulos (`/agendar/[slug]`, `/menu/[slug]`, `/imob/[slug]`, `/imovel/[id]`) e as APIs abertas (`/api/agendar`, `/api/menu`, `/api/imob`, `/api/portais`, `/api/veiculos`, `/api/fipe`) não conferem nada.
- O cadastro oferece 7 presets; 4 (Imobiliária, Saúde, Food, Veículos) só ligam módulos em preparação, e a landing (`/para/[vertical]`) vende clínica e restaurante.

### 3d. Código e dados sem uso
- Nenhum arquivo de `lib/`, `components/`, `hooks/`, `core/` sem import. Símbolos exportados sem uso: `primeiraDeConfiguracoes`, `paraBanco`, `contarFechamentos`, `FILTROS_VAZIOS`, `StatusEncomenda`, `RastreamentoLink/Evento/Atribuicao`, `KanbanStatus`.
- `GRUPO_DO_LEGADO` em `lib/menu.ts`; comentário do "funil imobiliário" em `leads/types.ts`; comentários de `segmentos_config` (tabela apagada) no `proxy.ts`.
- Dados: JM com Orçamentos ligado e **0 orçamentos / 0 cotações**; Propostas ligado e 0; tabelas de Imóveis, Avaliação, Cardápio, Agenda, Assistência, Garantia, Transmissão, Públicos, Etiquetas, Automações e Cadências **vazias** em produção.

### 3e. Isolamento e venda (achados de passagem, viram Parte 3)
- **Bucket `imoveis`:** insert/update/delete só conferem `bucket_id` — qualquer usuário logado grava, troca e apaga na pasta de outra empresa. `contratos` e `produtos` conferem a pasta.
- **Bucket `contratos` é público** (imagens dos modelos de contrato; o caminho começa pela empresa, mas o link abre para qualquer um).
- `empresas_plano_check` aceita só free/starter/pro (Unlimited quebra cadastro e troca de plano); o cron `expirar-trials` grava `stripe_status = 'trial_expired'`, fora do CHECK (500).
- Webhook `/api/stripe/webhook` atrás da sessão (401); `planos_config.stripe_price_id` vazio nos 4 planos; assinatura cancelada vira plano `free` (inativo) e `ativo`.
- Excluir empresa (`hard_delete_empresa`) apaga o vínculo mas não o login (`auth.users` + `usuarios`) nem os arquivos de Storage, e não cancela assinatura.
- Trocar de plano (superadmin e webhook) não atualiza `limite_usuarios/limite_leads`.
- Papel Técnico existe em `lib/permissoes.ts`, mas `criar-usuario` recusa ("Papel inválido").

---

## 4. Bloco 1 (17/11/2026, branch `feat/pronto-vender`, só app, sem migração)

- **Em preparação nunca está ligado:** `HREFS_EM_PREPARACAO` (core/modulos.ts) sai de `hrefsLigados` (menu, Central, `ligadosDaEmpresa`, `exigirModuloLigado`) venha de onde vier (base do preset, superadmin, Central). O proxy barra a tela para a loja mesmo sem lista na base; a vitrine diz "Em preparação" e "ainda não está disponível para instalar". O superadmin continua passando (constrói o módulo); as APIs respondem desligado também para ele.
- **Trava no servidor nas 38 rotas que faltavam** (APIs com `exigirModuloLigado`; páginas e APIs públicas por token/slug com `moduloEstaLigado` → "não encontrado"). Cobrança e meios de pagamento valem com PDV, Assistência ou Financeiro (`algumModuloLigado`). `scripts/modulos-excecoes.json` **vazio**.
- **Seções de Configurações de módulo:** Troca (Orçamentos), Contrato e Documentos (PDV, Garantia), Meios de pagamento (PDV, Assistência, Financeiro) viraram `abasConfiguracoes`; o menu só as mostra com o módulo, e a página dá 404 sem ele (`SecaoConfiguracoes`; Documentos por `exigirAbaDeModulo`). O check-modulos passou a ver essas seções como do módulo, não do core.
- **Órfãos com dono:** `/api/assistente*` → core; `/ranking` + `/api/ranking/metas` → módulo novo **Metas e ranking** (`ranking`, em preparação). `/equipe` (inalcançável) e `/produtos` (redirecionador) apagados; o proxy leva os dois endereços antigos. Grupos de menu com nome de ramo (`Imóveis/Veículos/Food`, `GRUPO_DO_LEGADO`) saíram; Produtos com ícone de livro. Cron `sync-fipe` fora do `vercel.json` (módulo em preparação). Símbolos sem uso apagados.
- **Manifesto:** `requer` que faltava (Histórico→PDV; Produtos, Compras, Check IMEI→Estoque; KDS→Cardápio; Executivo→Imóveis); `tabelas` com o dono das tabelas sem o prefixo do módulo (herança do corte); frase do Estoque genérica.
- **Trava nova (entra no build no Bloco 2):** `scripts/check-segmento-modulo.mjs` — texto de segmento fora dos arquivos do módulo dono e tabela sem dono, sem lista de exceções. Hoje: 0 tabelas sem dono; 85 arquivo×segmento com texto fora (o Bloco 2 zera).
