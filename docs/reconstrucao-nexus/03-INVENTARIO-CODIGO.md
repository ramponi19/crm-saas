# Nexus — Inventário do código para a reconstrução

19/10/2026 · só leitura · base: `main` em `c661a4d` · complementa "Nexus — Inventário para a reconstrução" (banco). Escopo: `app/`, `components/`, `hooks/`, `lib/`, `proxy.ts`, `supabase/` (funções, views, edge functions), `tailwind.config.ts`. Fora: `node_modules/`, `arquivos/` (cópia antiga), `.next/`. Linhas conferidas no código nesta data.

---

## 1. Segmento no código

Chaves de segmento existentes (`lib/segmentos.ts:14-21`): `varejo`, `assistencia`, `servicos`, `imobiliaria`, `saude`, `food`, `concessionaria` (padrão `varejo`). Capacidades: `usaPlaca`, `usaComanda`, `agendaClinica`, `agendaVisitas`, `telasProprias`, `integraPortais`, `comissaoPorNegocio`, `clienteComPipeline`, `captacaoDeImovel`, `automacoesVeiculo`, `matchVeiculo`, `telaInicial`. Colunas de `segmentos_config`: `chave, label, descricao, ordem, ativo, hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout`. Colunas de `empresas`: `segmento, modulos_override, menu_override {hidden, labels, habilitados}, menu_config {hidden, labels, ordem}, wl_menu`.

### 1.1 Leituras de colunas/tabelas de segmento e menu

| # | Arquivo:linha | O que lê/escreve | Uso | Classe |
|---|---|---|---|---|
| 1 | `app/(dashboard)/layout.tsx:43,52,63,76` | SELECT `empresas(segmento, wl_menu, modulos_override, menu_override, menu_config)` (normal e impersonação) + tipo | Fonte de todas as camadas do menu do CRM | (a) |
| 2 | `app/(dashboard)/layout.tsx:108,116,118` | `menu_override.hidden` e `menu_override.habilitados` → `MenuOverridesSuperadmin` | Superadmin esconde/liga href para a empresa | (a) |
| 3 | `app/(dashboard)/layout.tsx:117` | `menu_override.labels` → `overrides.labels` | Renomeia itens do menu | (c) |
| 4 | `app/(dashboard)/layout.tsx:115` | `modulos_override` → `overrides.modulos` | Força liga/desliga módulo de plano (`bi`, `multi_usuario`, `api`, `white_label`) | (a) |
| 5 | `app/(dashboard)/layout.tsx:120` | `menu_config` → `configDono` (hidden/labels/ordem) | Dono oculta itens (labels/ordem consumidos em `lib/menu.ts`) | (a) |
| 6 | `app/(dashboard)/layout.tsx:123-126` | SELECT `segmentos_config(hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout)` WHERE `chave = empresas.segmento ?? 'varejo'` | Camada 1 (segmento) do menu | (a) |
| 7 | `app/(dashboard)/layout.tsx:127-133` | Monta `SegOverride` (hiddenHrefs, labelOverrides, modulosExtra, habilitados, menuLayout) | Entrada do `resolverMenuPlano` na sidebar/topbar mobile | (a) |
| 8 | `app/(dashboard)/layout.tsx:165,177` | `normalizarSegmento(empresa.segmento)` → prop `segmento` de `Sidebar` e `MobileTopbar` | Resolver o menu | (a) |
| 9 | `app/(dashboard)/layout.tsx:166` | `empresas.wl_menu` → `resolveTheme()` | Cores da sidebar (tema, não módulos) | (c) |
| 10 | `app/(dashboard)/layout.tsx:195` | `segOverride.labelOverrides` + `menu_override.labels` + `menu_config.labels` → `RotulosProvider` | Título da barra do topo igual ao rótulo do menu | (c) |
| 11 | `components/layout/sidebar.tsx:10,30,48,54` | Prop `segmento` (padrão `'varejo'`) + `normalizarSegmento` | Passa ao `resolverMenuPlano` | (a) |
| 12 | `components/layout/mobile-topbar.tsx:11,23,36,42` | Prop `segmento` (padrão `'varejo'`) + `normalizarSegmento` | Passa ao `resolverMenuPlano` (gaveta mobile) | (a) |
| 13 | `app/entrar/page.tsx:43-45` | SELECT `empresas(segmento, plano, permissoes, menu_config, menu_override, modulos_override)` | Destino pós-login | (a) |
| 14 | `app/entrar/page.tsx:62-65` | SELECT `segmentos_config(hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados)` por `empresas.segmento` | Resolver o 1º item visível do menu | (a) |
| 15 | `app/entrar/page.tsx:67-85` | `menu_override` (hidden/labels/habilitados), `modulos_override`, `menu_config`, `segOverride` → `resolverMenu` | Redireciona para o 1º item não bloqueado | (a) |
| 16 | `app/admin/meu-menu/page.tsx:21` | SELECT `empresas(segmento, plano, modulos_override, menu_override, menu_config)` | Tela "Meu menu" do dono | (a) |
| 17 | `app/admin/meu-menu/page.tsx:27-33` | `menu_override` (hidden/labels/habilitados) + `modulos_override` → overrides | Lista de itens que a empresa pode ter | (a) |
| 18 | `app/admin/meu-menu/page.tsx:44-54` | SELECT `segmentos_config(hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout)` por segmento → `segOverride` | Mesma base do menu na tela de ajuste | (a) |
| 19 | `app/admin/meu-menu/page.tsx:56-58,64-68,74` | `menu_config` (hidden, labels, ordem) + `normalizarSegmento(emp.segmento)` → `resolverMenuPlano` e estado inicial | Dono oculta/renomeia/reordena | (a) |
| 20 | `app/admin/meu-menu/meu-menu-view.tsx:46-51` | POST `/api/menu-config` {hidden, labels, ordem} | Salvar ajuste do dono | (a) |
| 21 | `app/api/menu-config/route.ts:30-58` | UPDATE `empresas.menu_config = {hidden, labels, ordem}` | Grava config do dono | (a) |
| 22 | `app/superadmin/empresas/[id]/page.tsx:69,228` | SELECT `*` de `empresas` → `segmentoAtual={empresa.segmento}` | Botão "Trocar segmento" | (c) |
| 23 | `app/superadmin/empresas/[id]/page.tsx:236-237` | `empresas.modulos_override`, `empresas.menu_override` → `ControleEmpresa` | Estado inicial do controle de módulos/menu por empresa | (a) |
| 24 | `app/superadmin/empresas/[id]/page.tsx:13,238` | `resolverMenu({ segmento: normalizarSegmento(empresa.segmento) })` | Lista de itens exibida no controle da empresa | (a) |
| 25 | `components/superadmin/controle-empresa.tsx:27-28,42-43,54-61` | Monta e envia `modulos_override` e `menu_override = {hidden, labels}` (sem `habilitados`) | Superadmin liga/desliga módulos e esconde/renomeia itens da empresa | (a) |
| 26 | `app/api/superadmin/empresas/[id]/overrides/route.ts:15-16,22-23` | UPDATE `empresas.modulos_override` / `empresas.menu_override` | Grava override do superadmin | (a) |
| 27 | `app/api/superadmin/empresas/[id]/route.ts:3,15,68-74` | UPDATE `empresas.segmento` (ação `alterar_segmento`, valida `in SEGMENTOS`, log) | Trocar segmento da empresa | (c) |
| 28 | `components/superadmin/acoes-empresa.tsx:6,17,20,24,29,39,87,94,154-156` | Modal "Trocar segmento" lista `SEGMENTOS_LISTA` e envia `alterar_segmento` | Trocar segmento da empresa | (c) |
| 29 | `app/superadmin/segmentos/page.tsx:2,9` | SELECT `*` de `segmentos_config` ORDER BY `ordem` | Editor de segmentos | (c) |
| 30 | `app/superadmin/segmentos/segmentos-view.tsx:8,15-19,35,42-44,47` | Lê `hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout` para o formulário | Editor de segmentos | (c) |
| 31 | `app/superadmin/segmentos/segmentos-view.tsx:100-111` | `resolverMenuPlano({ segmento: normalizarSegmento(form.chave), segOverride })` | Prévia do menu do segmento | (c) |
| 32 | `app/superadmin/segmentos/segmentos-view.tsx:121-129,162` | POST `/api/superadmin/segmentos` (label_overrides, modulos_habilitados, menu_layout); contagem "N módulos ligados · N rótulos" | Salvar segmento | (c) |
| 33 | `app/superadmin/segmentos/segmentos-view.tsx:59,149,164,178,191,229,239,254` | Preview de segmento, "Novo segmento", campo ordem do segmento, editor de ordem (`menu_layout`) | Editor de segmentos | (c) |
| 34 | `app/api/superadmin/segmentos/route.ts:15-19,41-42,52-56,61,64` | SELECT + UPSERT `segmentos_config` (hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout, descricao, ordem, ativo); log `criar_segmento`/`editar_segmento` | API do editor de segmentos | (c) |
| 35 | `app/api/superadmin/segmentos/[chave]/preview/route.ts:25,28-37,44` | SELECT `segmentos_config(chave, label)`; INSERT/UPDATE `empresas.segmento = chave` na empresa `__preview__`; log `preview_segmento` | Preview do CRM de um segmento | (c) |
| 36 | `app/api/superadmin/laboratorio/preview/route.ts:29` | INSERT `empresas.segmento = 'varejo'` (empresa de preview) | Laboratório do superadmin | (c) |
| 37 | `app/superadmin/laboratorio/page.tsx:17-22,32` | SELECT `segmentos_config.modulos_habilitados` (todas as linhas) | Conta em quantos segmentos cada href está ligado | (c) |
| 38 | `app/superadmin/laboratorio/laboratorio-view.tsx:17-18,118-119` | Exibe `N/7 segmentos` / "nenhum segmento" | Laboratório | (c) |
| 39 | `components/superadmin/superadmin-shell.tsx:19` | Item de menu `/superadmin/segmentos` | Navegação do superadmin | (c) |
| 40 | `app/superadmin/metricas/page.tsx:38,88-95,227-232` | SELECT `empresas.segmento` → agregação "Empresas por segmento" | Métrica do superadmin | (c) |
| 41 | `proxy.ts:8-16,271-297` | SELECT `empresas.segmento` + SELECT `segmentos_config.modulos_habilitados` WHERE `chave = segmento ?? 'varejo'`, cache 60 s por empresa | Trava de rota por módulo | (a) |
| 42 | `lib/menu.ts:68-102` | Tipo `MenuOverridesSuperadmin` (modulos, hidden, labels, habilitados) | Camada 3 do menu | (a) |
| 43 | `lib/menu.ts:104-115` | Tipo `MenuOverrideRow` = forma de `empresas.menu_override` | Leitura tipada de `menu_override` | (a) |
| 44 | `lib/menu.ts:137-139` | `temHrefLiberado(menu_override.habilitados, href)` | Libera sub-tela por empresa (`/orcamentos/cotacao`) | (a) |
| 45 | `lib/menu.ts:141-153` | Tipo `MenuConfigDono` = forma de `empresas.menu_config` (hidden, labels, ordem) | Camada 4 do menu | (a) |
| 46 | `lib/menu.ts:164-173,175-184` | Tipo `SegOverride` = forma de `segmentos_config`; `ResolverMenuInput.segmento/segOverride` | Camada 1 do menu | (c) |
| 47 | `lib/troca-acesso.ts:20-24` | SELECT `empresas.menu_override` → `temHrefLiberado(HREF_COTACAO_TROCA)`; usado por `app/(dashboard)/orcamentos/{layout,page,cotacao/page,checklist/page,precos/page}.tsx` e `app/api/troca/{cotacoes,precos,precos/familia,regras}/route.ts` | Libera a cotação de troca | (a) |
| 48 | `components/modules/leads/lead-orcamento-panel.tsx:89,98` | SELECT `empresas.menu_override` → `temHrefLiberado(HREF_COTACAO_TROCA)` | Mostra Upgrade/Downgrade no lead | (a) |
| 49 | `app/admin/aparencia/page.tsx:24,29` | SELECT `empresas.wl_menu` → `AparenciaView` | Tema da sidebar | (c) |
| 50 | `app/admin/aparencia/aparencia-view.tsx:81-83` | POST `/api/aparencia` {wl_menu} | Tema da sidebar | (c) |
| 51 | `app/api/aparencia/route.ts:22-23,39` | UPDATE `empresas.wl_menu` | Tema da sidebar | (c) |
| 52 | `lib/wl-menu.ts:5,11-17,69-86` | Tipo `WlMenu` + `resolveTheme(wl_menu, wl_cor)` | Cores da sidebar | (c) |
| 53 | `app/(dashboard)/agenda/page.tsx:17,79` | SELECT `empresas.segmento`; repassa `segmento` à `AgendaView` | Trava da tela e rótulos da agenda | (a) |
| 54 | `app/(dashboard)/agenda/agenda-view.tsx:5,100-102` | Prop `segmento` | Rótulos/campos da agenda | (b) |
| 55 | `app/(dashboard)/clientes/page.tsx:23` | SELECT `empresas.segmento` | Escolhe tela de clientes (varejo × pipeline) | (b) |
| 56 | `app/(dashboard)/dashboard/page.tsx:127` | SELECT `empresas.segmento` | Escolhe dashboard | (a) |
| 57 | `app/(dashboard)/estoque/page.tsx:3,35,132` | SELECT `empresas.segmento`; repassa `segmento` normalizado | Campos de veículo × aparelho | (b) |
| 58 | `app/(dashboard)/estoque/components/estoque-view.tsx:16,82,158` | Prop `segmento: Segmento` | Campos de veículo × aparelho | (b) |
| 59 | `app/(dashboard)/executivo/page.tsx:43` | SELECT `empresas.segmento` | Trava da tela Executivo | (a) |
| 60 | `app/(dashboard)/financeiro/page.tsx:46` | SELECT `empresas.segmento` | Aba de comissão por negócio | (a) |
| 61 | `app/(dashboard)/gestao-leads/page.tsx:30` | SELECT `empresas(segmento, permissoes)` | Fallback de colunas do funil | (c) |
| 62 | `app/(dashboard)/imoveis/page.tsx:12` | SELECT `empresas(segmento, slug)` | Trava da tela Imóveis | (a) |
| 63 | `app/(dashboard)/leads/page.tsx:88,180` | SELECT `empresas(segmento, permissoes)`; repassa `segmento` normalizado à `LeadsView` | Campos/painéis do lead e fallback de funil | (b) |
| 64 | `components/modules/leads/leads-view.tsx:22,61,376` | Prop `segmento`; repassa ao `LeadModal` | Campos/painéis do lead | (b) |
| 65 | `components/modules/leads/lead-modal.tsx:33,384,1311` | Prop `segmento`; repassa ao `LeadAcoesPanel` | Campos/painéis do lead | (b) |
| 66 | `components/modules/leads/lead-acoes-panel.tsx:22-23` | Prop `segmento` | Painel de visitas no lead | (a) |
| 67 | `app/(dashboard)/orcamentos/page.tsx:3,39,93` | SELECT `empresas.segmento`; repassa `segmento` | Prop sem uso na view | (c) |
| 68 | `app/(dashboard)/orcamentos/orcamentos-view.tsx:34` | Prop `segmento?: string` (não lida) | Nenhum | (c) |
| 69 | `app/(dashboard)/pdv/page.tsx:59,228` | SELECT `empresas.segmento`; repassa `segmento` | Campo comanda no PDV | (b) |
| 70 | `app/(dashboard)/pdv/components/pdv-view.tsx:59,96` | Prop `segmento` | Campo comanda no PDV | (b) |
| 71 | `app/(dashboard)/ranking/page.tsx:28` | SELECT `empresas.segmento` | Acesso do time ao ranking e coluna de captação | (a) |
| 72 | `app/(dashboard)/ranking/page.tsx:38-40` | SELECT `segmentos_config.modulos_extra` WHERE `chave = segmento ?? 'varejo'` | Decide se o ranking é aberto ao time | (a) |
| 73 | `app/(dashboard)/relatorios/page.tsx:22` | SELECT `empresas.segmento` (também servido em `/admin/relatorios`, `app/admin/relatorios/page.tsx:1,11`) | Escolhe relatório | (a) |
| 74 | `app/admin/configuracoes/page.tsx:25,37,50,62` | SELECT `empresas(segmento, slug)`; repassa `segmento` à `ConfiguracoesView` | Abas extra de Configurações | (a) |
| 75 | `components/modules/configuracoes/configuracoes-view.tsx:9,40,91` | Prop `segmento` | Abas extra de Configurações | (a) |
| 76 | `components/modules/configuracoes/automacoes-card.tsx:8,39,65-66` | SELECT `empresas.segmento` (client) → estado | Card de automação de veículo | (a) |
| 77 | `app/admin/integracoes/page.tsx:18,67` | SELECT `empresas(slug, segmento)`; repassa `segmento` | Cards de portais/site/C2S | (a) |
| 78 | `app/admin/integracoes/integracoes-view.tsx:11,39-40` | Prop `segmento` | Cards de portais/site/C2S | (a) |
| 79 | `app/admin/page.tsx:3,30` | SELECT `empresas(..., segmento)` | Texto do card de régua de follow-up | (c) |
| 80 | `app/agendar/[slug]/page.tsx:3,12` | SELECT `empresas(id, nome, wl_logo_url, wl_cor, segmento)` por slug (service) | Trava da página pública de agendamento | (a) |
| 81 | `app/api/agendar/[slug]/route.ts:4,16` | SELECT `empresas(id, segmento)` por slug (service) | Trava do POST público de agendamento | (a) |
| 82 | `app/menu/[slug]/page.tsx:3,16` | SELECT `empresas(..., segmento)` por slug | Trava do cardápio público | (a) |
| 83 | `app/api/menu/[slug]/pedido/route.ts:3,14` | SELECT `empresas(id, segmento)` por slug | Trava do pedido do cardápio público | (a) |
| 84 | `app/api/veiculos/[slug]/route.ts:2,23` | SELECT `empresas(id, nome, segmento)` por slug | Trava do feed público de veículos | (a) |
| 85 | `app/imob/[slug]/page.tsx:4,11` | SELECT `empresas(id, nome, segmento, wl_*...)` por slug | Trava do site público imobiliário | (a) |
| 86 | `app/api/match/lead/[id]/route.ts:2,22` | SELECT `empresas.segmento` | Match do lead com veículo × imóvel | (b) |
| 87 | `app/api/assistente/route.ts:99,117` | SELECT `empresas(nome, segmento)` → `respostaDoChat({segmento})` | Contexto do prompt do assistente com dados | (c) |
| 88 | `app/api/assistente/route.ts:131-132` | SELECT `empresas.segmento` → `systemPrompt(segmento)` | Contexto do prompt do assistente de ajuda | (c) |
| 89 | `lib/assistente/chat-dados.ts:60,103,117` | Parâmetro `segmento` → `instrucoes()` | Contexto do prompt | (c) |
| 90 | `app/api/register/route.ts:3,49,101` | INSERT `empresas.segmento = normalizarSegmento(body.segmento)` | Cadastro de empresa nova | (c) |
| 91 | `app/register/page.tsx:10,50,134,247-253` | Campo `segmento` (padrão `'varejo'`), seletor com `SEGMENTOS_LISTA`, envia no POST | Cadastro de empresa nova | (c) |
| 92 | `lib/zapintel/conversas.ts:130-131,156,160,208,233` | SELECT `empresas(nome, segmento)` → campo `segmento` do retorno | Alimenta `papelDoSegmento` no ZapIntel | (c) |
| 93 | `app/zapintel/api/sugestao/route.ts:71` | Desestrutura `segmento` de `carregarConversas` | Papel de quem atende no prompt | (c) |
| 94 | `supabase/funcoes/zapintel_resumo.sql:42` | `'segmento', (select segmento from empresas where id = v_emp)` no JSON do resumo | Alimenta `papelDoSegmento` no hook | (c) |
| 95 | `hooks/zapintel/useLeads.tsx:54` | Campo `segmento` do resumo (RPC) | Alimenta `sellerName` | (c) |
| 96 | `tests/rotas.test.ts:51` | Fixture `segmento: 'varejo'` | Teste | (c) |
| 97 | `tests/zapintel-rotas-falha.test.ts:50` | Fixture `segmento: 'varejo'` | Teste | (c) |
| 98 | `types/database.ts:1906-1908,1918,1930` | Tipo Row de `empresas`: `menu_config, menu_override, modulos_override, segmento, wl_menu` | Tipos gerados | (c) |
| 99 | `types/database.ts:1952-1954,1964,1976` | Tipo Insert de `empresas` (mesmas colunas) | Tipos gerados | (c) |
| 100 | `types/database.ts:1998-2000,2010,2022` | Tipo Update de `empresas` (mesmas colunas) | Tipos gerados | (c) |
| 101 | `types/database.ts:5280-5317` | Tabela `segmentos_config` (Row/Insert/Update: hidden_hrefs, label_overrides, menu_layout, modulos_extra, modulos_habilitados...) | Tipos gerados | (c) |

### 1.2 Decisões por segmento (if/switch/ternário/mapa)

| # | Arquivo:linha | Condição | O que muda | Classe |
|---|---|---|---|---|
| 1 | `lib/segmentos.ts:14-21,167,307-314` | `type Segmento` (7 chaves), `SEGMENTO_PADRAO = 'varejo'`, `SEGMENTOS_LISTA`, `normalizarSegmento(v)` (`v in SEGMENTOS ? v : 'varejo'`) | Domínio e normalização do segmento | (c) |
| 2 | `lib/segmentos.ts:23-157,165` | Contrato `SegmentoConfig` (hiddenHrefs, labelOverrides, modulosExtra, menuLayout, interesseLabel, equipeLabel, paineisDoLead, abasExtraConfiguracoes, capacidades) e `type PainelDoLead` | Forma da config por segmento | (c) |
| 3 | `lib/segmentos.ts:174,185,196,208,267,278,293` | `SEGMENTOS[seg].hiddenHrefs` | Some do menu: servicos `/estoque,/garantia,/assistencia,/simular-parcela,/compras`; imobiliaria e saude `/pdv,/estoque,/catalogo,/produtos,/garantia,/assistencia,/simular-parcela,/compras`; food `/garantia,/assistencia,/simular-parcela`; concessionaria `/pdv,/compras,/simular-parcela` | (c) |
| 4 | `lib/segmentos.ts:236-249,280-282,295-299` | `SEGMENTOS[seg].modulosExtra` | Liga módulos: imobiliaria `/imoveis,/simular-financiamento,/ranking (grupo Gestão)`; food `/cardapio`; concessionaria `/avaliacoes,/consulta-fipe,/simular-financiamento` | (c) |
| 5 | `lib/segmentos.ts:175,186,197,220-234,268,279,294` | `SEGMENTOS[seg].labelOverrides` | servicos `/produtos→Serviços,/catalogo→Catálogo de serviços`; imobiliaria `/leads→Pipeline,/executivo→Dashboard Executivo,/ranking→Metas e Ranking`; saude `/clientes→Pacientes`; concessionaria `/produtos→Veículos,/assistencia→Oficina` | (c) |
| 6 | `lib/segmentos.ts:256` | `SEGMENTOS.imobiliaria.menuLayout` | Ordem `Hoje: /dashboard,/leads,/agenda,/tarefas,/chat` | (c) |
| 7 | `lib/segmentos.ts:176,187,198,257,269,283,300` | `SEGMENTOS[seg].interesseLabel` | Rótulo do campo de interesse do lead (Produto/Aparelho/Serviço/Imóvel/Procedimento/Item do cardápio/Veículo interessado) | (c) |
| 8 | `lib/segmentos.ts:258` | `SEGMENTOS.imobiliaria.equipeLabel = 'Corretor'` | Nome de quem vende | (c) |
| 9 | `lib/segmentos.ts:177,188,199,259,270,284,301` | `SEGMENTOS[seg].paineisDoLead` | imobiliaria `negocio-imovel, match-imoveis`; concessionaria `interesse-veiculo, financiamento`; demais vazio | (c) |
| 10 | `lib/segmentos.ts:178,189,200,260,271,285,302` | `SEGMENTOS[seg].abasExtraConfiguracoes` | imobiliaria `portais`; saude `agendamento`; food `cardapio`; concessionaria `veiculos-portais` | (c) |
| 11 | `lib/segmentos.ts:179,190,201,261,272,286,303` | `SEGMENTOS[seg].capacidades` | imobiliaria `agendaVisitas, telasProprias, integraPortais, comissaoPorNegocio, captacaoDeImovel, clienteComPipeline`; saude `agendaClinica, telaInicial:'/agenda'`; food `usaComanda`; concessionaria `usaPlaca, automacoesVeiculo, matchVeiculo` | (c) |
| 12 | `lib/segmentos.ts:338-341` | `moduloDoSegmento(segmento, href)` = `SEGMENTOS[seg].modulosExtra.some(href)` | Responde "esta tela é do segmento?" (usado pelo ranking) | (a) |
| 13 | `lib/menu.ts:17,176,327-328` | `SEGMENTOS[input.segmento]` | Base estática do menu | (a) |
| 14 | `lib/menu.ts:199-205,225-229` | `habilitadosDerivados(seg)` = `hrefsBase() − seg.hiddenHrefs + seg.modulosExtra` (`NUCLEO` sempre) | Lista de módulos ligados quando o banco não tem `modulos_habilitados` | (a) |
| 15 | `lib/menu.ts:333-334` | `segOverride?.habilitados ?? habilitadosDerivados(seg)` + núcleo | Opt-in do segmento (banco vence código) | (a) |
| 16 | `lib/menu.ts:338` | `overrides.habilitados` (`menu_override.habilitados`) | Liga href só para a empresa | (a) |
| 17 | `lib/menu.ts:340,345-349` | `segOverride?.labelOverrides ?? seg.labelOverrides`, depois `overrides.labels`, depois `configDono.labels` | Rótulo final de cada item | (c) |
| 18 | `lib/menu.ts:343-344,360-362` | `hidden = overrides.hidden + configDono.hidden`; `!habilitados.has(href)`; `hidden.has(href)`; `adminOnly` | Item entra ou não no menu | (a) |
| 19 | `lib/menu.ts:364-366` | `overrides.modulos[item.modulo]` (`modulos_override`) `=== false` / `!== true && !planoTemAcesso` | Remove item ou mostra cadeado | (a) |
| 20 | `lib/menu.ts:393-408` | `segOverride.modulosExtra.length ? segOverride.modulosExtra : seg.modulosExtra` | Injeta itens fora do catálogo no grupo declarado | (a) |
| 21 | `lib/menu.ts:426-445,452-459` | `layout = seg.menuLayout + segOverride.menuLayout + configDono.ordem` (`__grupos`) | Ordem dos itens e dos grupos | (c) |
| 22 | `lib/menu.ts:509-514` | `configDono.ordem.__ordem ?? segOverride.menuLayout.__ordem ?? SEGMENTOS[segmento].menuLayout.__ordem` | Ordem plana do menu | (c) |
| 23 | `components/layout/sidebar.tsx:67` | `resolverMenuPlano({ segmento: seg, overrides, configDono, segOverride })` | Itens da sidebar | (a) |
| 24 | `components/layout/mobile-topbar.tsx:44` | `resolverMenuPlano({ segmento: seg, overrides, configDono, segOverride })` | Itens da gaveta mobile | (a) |
| 25 | `proxy.ts:249-266` | `moduloDaRota(path)` e `!habilitados.has(modulo)` (superadmin passa) | Redireciona para `/dashboard?indisponivel=` | (a) |
| 26 | `components/layout/rotulos-context.tsx:18-21,30-36` | `rotulos[raiz da rota]` (labels de segmento/superadmin/dono) | Rótulo da rota atual | (c) |
| 27 | `components/layout/topbar.tsx:45-46` | `useRotuloDaRota() ?? title` | Título da barra do topo | (c) |
| 28 | `app/(dashboard)/layout.tsx:153-157` | role não é owner/admin/tecnico → `SEGMENTOS[seg].equipeLabel ?? 'Vendedor'` | Cargo exibido no rodapé da sidebar | (c) |
| 29 | `app/entrar/page.tsx:48-49` | `SEGMENTOS[seg].capacidades.telaInicial` | Redireciona saúde para `/agenda` após login | (c) |
| 30 | `app/(dashboard)/agenda/page.tsx:18,27` | `!cap.agendaVisitas && !cap.agendaClinica` | Redireciona para `/dashboard` (tela Agenda indisponível) | (a) |
| 31 | `app/(dashboard)/agenda/agenda-view.tsx:50,60,107-108` | `isSaude = capacidades.agendaClinica` → `TIPOS_SAUDE` × `TIPOS_IMOB` | Tipos de compromisso | (b) |
| 32 | `app/(dashboard)/agenda/agenda-view.tsx:110-115,279,508` | `isSaude ?` | Rótulos: Nova consulta/Novo compromisso, Paciente/Lead, Profissional/Corretor, subtítulo, vazio, toast, placeholder | (b) |
| 33 | `app/(dashboard)/agenda/agenda-view.tsx:334-338` | `isSaude &&` | Bloco "Lista de espera" | (a) |
| 34 | `app/(dashboard)/agenda/agenda-view.tsx:550-555` | `!isSaude &&` | Campo "Imóvel" no compromisso | (b) |
| 35 | `app/(dashboard)/clientes/page.tsx:24-25,36,88-103` | `cap.clienteComPipeline` | Varejo: lista simples; imob: carrega leads/etapas/equipe/score e monta jornada | (b) |
| 36 | `app/(dashboard)/clientes/components/clientes-view.tsx:62,91,138,146,151,241,266,268,280,309,332-333` | prop `imob` | Colunas imob (corretor, tipo de negócio, status de aprovação), filtros, busca por CPF, `ClienteModalImob` × modal padrão | (b) |
| 37 | `app/(dashboard)/clientes/page.tsx:65` | `getKanbanColumns(empresa.segmento)` quando não há `funil_etapas` | Etapas de fallback | (c) |
| 38 | `app/(dashboard)/dashboard/page.tsx:130-131` | `capacidades.telasProprias` | `DashboardImob` × dashboard padrão | (a) |
| 39 | `app/(dashboard)/dashboard/dashboard-imob.tsx:140` | `getKanbanColumns('imobiliaria')` quando não há etapas no banco | Etapas de fallback | (c) |
| 40 | `app/(dashboard)/relatorios/page.tsx:25` | `capacidades.telasProprias` | `RelatoriosImobView` × BI padrão | (a) |
| 41 | `components/modules/relatorios/relatorios-imob-view.tsx:114` | `getKanbanColumns('imobiliaria')` quando não há etapas no banco | Etapas de fallback | (c) |
| 42 | `app/(dashboard)/executivo/page.tsx:44-47` | `!cfgSeg.capacidades.comissaoPorNegocio` | Redireciona para `/dashboard` | (a) |
| 43 | `app/(dashboard)/financeiro/page.tsx:47,52-` | `cfgSeg.capacidades.comissaoPorNegocio` | Consulta `negocios_imobiliarios` + `comissao_imob` e envia à view | (a) |
| 44 | `app/(dashboard)/financeiro/components/financeiro-view.tsx:117-120,411-413` | `comissoesNegocio && taxasComissao` (dados só chegam pela capacidade) | Aba "Comissões" (`ComissoesImob`) | (a) |
| 45 | `app/(dashboard)/gestao-leads/page.tsx:73` | `getKanbanColumns(empresa.segmento)` quando não há etapas | Etapas de fallback | (c) |
| 46 | `app/(dashboard)/imoveis/page.tsx:13` | `normalizarSegmento(segmento) !== 'imobiliaria'` | Redireciona para `/dashboard` | (a) |
| 47 | `app/imob/[slug]/page.tsx:38` | `normalizarSegmento(segmento) !== 'imobiliaria'` | `notFound()` no site público de imóveis | (a) |
| 48 | `components/modules/leads/types.ts:82-125` | `KANBAN_POR_SEGMENTO = { imobiliaria: KANBAN_IMOBILIARIA }`; `getKanbanColumns(seg) = KANBAN_POR_SEGMENTO[seg] \|\| KANBAN_COLUMNS` | Funil padrão por segmento | (c) |
| 49 | `components/modules/leads/leads-view.tsx:123-124` | `getKanbanColumns(segmento)` quando o funil não tem etapas | Colunas de fallback do kanban | (c) |
| 50 | `app/(dashboard)/leads/page.tsx:187` | `SEGMENTOS[seg].equipeLabel ?? 'Vendedor'` | Palavra da equipe na tela de leads | (c) |
| 51 | `components/modules/leads/leads-view.tsx:36-43,305` | `equipeLabel` | aria-label do filtro por responsável | (c) |
| 52 | `components/modules/leads/lead-modal.tsx:392,1285-1289` | `cfgSegmento.paineisDoLead.length > 0 ?` `Input(interesseLabel)` : `ProdutoAutocomplete(interesseLabel)` | Rótulo e tipo do campo "interesse" do lead | (b) |
| 53 | `components/modules/leads/lead-modal.tsx:1320` | `PaineisDaVertical nomes={cfgSegmento.paineisDoLead}` | Painéis de vertical no lead | (b) |
| 54 | `components/modules/leads/paineis-vertical.tsx:3,28-33,42-47` | Mapa `PAINEIS_DO_LEAD['match-imoveis' \| 'negocio-imovel' \| 'interesse-veiculo' \| 'financiamento']` | `LeadMatchPanel`, `LeadNegocioPanel`, `LeadInteressePanel`, `LeadFinanciamentoPanel` | (b) |
| 55 | `components/modules/leads/lead-acoes-panel.tsx:28,48-50,159` | `isImob = capacidades.agendaVisitas` | Carrega visitas do lead e mostra "agendar visita" | (a) |
| 56 | `app/(dashboard)/estoque/components/estoque-view.tsx:161` | `isVeiculo = capacidades.usaPlaca` | Modo veículo do estoque | (b) |
| 57 | `app/(dashboard)/estoque/components/estoque-view.tsx:292,305,318-319,324` | `isVeiculo ?` | Colunas: Placa/chassi × IMEI, Ano·Km × detalhe, Cor × Variante, Veículo × Produto | (b) |
| 58 | `app/(dashboard)/estoque/components/estoque-view.tsx:491,505,537-538,994,999` | `isVeiculo ?` | Rótulos: busca, "Adicionar veículo", títulos do formulário, "Modelo/Produto (catálogo)" | (b) |
| 59 | `app/(dashboard)/estoque/components/estoque-view.tsx:507` | `!isVeiculo &&` | Botão "Entrada de semi-novo" | (b) |
| 60 | `app/(dashboard)/estoque/components/estoque-view.tsx:547,578,661,667` | Repassa `isVeiculo` ao formulário inline e ao `UnidadeModal` | Modo veículo nos formulários | (b) |
| 61 | `app/(dashboard)/estoque/components/estoque-view.tsx:673` | `isVeiculo ? 'usado' : 'novo'`, `isVeiculo ? 'bom' : ...` | Valores padrão de condição/estado | (b) |
| 62 | `app/(dashboard)/estoque/components/estoque-view.tsx:714,727,731,769` | `if (isVeiculo ...) return` | Desliga consulta de IMEI e de número de série | (b) |
| 63 | `app/(dashboard)/estoque/components/estoque-view.tsx:780-781,968` | `isVeiculo ? null : buscarModeloApple()`; `!isVeiculo &&` | Busca/campo de número de modelo Apple | (b) |
| 64 | `app/(dashboard)/estoque/components/estoque-view.tsx:791-792` | `camposDaCategoria(isVeiculo ? 'veiculo' : produtoSel.tipo_formulario)` | Campos de identificação da entrada | (b) |
| 65 | `app/(dashboard)/estoque/components/estoque-view.tsx:832,842` | `if (isVeiculo ...) return null` | Desliga sugestão pela tabela de preços | (b) |
| 66 | `app/(dashboard)/estoque/components/estoque-view.tsx:1005,1028` | `isVeiculo ?` | Opções de condição (0km/Usado) e estado | (b) |
| 67 | `app/(dashboard)/estoque/components/estoque-view.tsx:1008,1051` | `!isVeiculo &&` | Campo "Cliente (quem vendeu o aparelho)" e aviso "Escolha o produto" | (b) |
| 68 | `app/(dashboard)/estoque/components/unidade-modal.tsx:39,53,119` | `if (!isVeiculo) return` | Escrita em `veiculo_dados` (placa, chassi, renavam, km, ano) | (b) |
| 69 | `app/(dashboard)/estoque/components/unidade-modal.tsx:164,193,198` | `isVeiculo ?` | Rótulos: Adicionar/Editar veículo, Modelo × Produto | (b) |
| 70 | `app/(dashboard)/estoque/components/unidade-modal.tsx:222-` | `isVeiculo ? (...) : (...)` | Campos placa/ano/chassi/renavam/km × campos de aparelho | (b) |
| 71 | `app/(dashboard)/pdv/components/pdv-view.tsx:19,99` | `isFood = capacidades.usaComanda` | Modo comanda no PDV | (b) |
| 72 | `app/(dashboard)/pdv/components/pdv-view.tsx:539` | `isFood ? comanda : null` | Grava `comanda` na venda | (b) |
| 73 | `app/(dashboard)/pdv/components/pdv-view.tsx:1146-1150` | `isFood &&` | Campo "Mesa / Comanda" | (b) |
| 74 | `app/(dashboard)/ranking/page.tsx:66-69` | `extrasBanco.length > 0 ? extrasBanco.some(href==='/ranking') : moduloDoSegmento(segmento,'/ranking')`; `!isAdmin && !abertoAoTime` | Redireciona não-admin para `/dashboard` | (a) |
| 75 | `app/(dashboard)/ranking/page.tsx:77-81,127` | `seg.capacidades.captacaoDeImovel` | Consulta imóveis captados e coluna/meta de imóveis (`mostrarImoveis`) | (a) |
| 76 | `app/(dashboard)/ranking/page.tsx:128` | `seg.equipeLabel ?? 'Vendedor'` | Palavra da equipe no ranking | (c) |
| 77 | `app/(dashboard)/ranking/ranking-view.tsx:59,61,69,136,154,178,229,305,308,347` | `equipeLabel` | Cabeçalho, papel ao lado do nome, rótulo do seletor de meta | (c) |
| 78 | `app/(dashboard)/orcamentos/orcamentos-view.tsx:45-48` | (ternário por segmento removido; `tipoPadrao = 'assistencia'`) | Nada | (c) |
| 79 | `components/modules/configuracoes/configuracoes-view.tsx:111-114,470-473` | `SEGMENTOS[seg].abasExtraConfiguracoes` | Abas Portais / Cardápio / Agendamento / Portais (veículos) | (a) |
| 80 | `components/modules/configuracoes/automacoes-card.tsx:164` | `capacidades.automacoesVeiculo &&` | Card "Pós-venda automático" | (a) |
| 81 | `app/admin/integracoes/integracoes-view.tsx:100,121-` | `isImob = capacidades.integraPortais` | Cards C2S, site imobiliário, formulário, portais | (a) |
| 82 | `app/admin/integracoes/integracoes-view.tsx:108` | `isImob ?` | Subtítulo da tela | (c) |
| 83 | `app/admin/page.tsx:96,209` | `isImob = capacidades.integraPortais` → `ReguaFollowupCard isImob` | Texto do card | (c) |
| 84 | `components/admin/regua-followup-card.tsx:8,60` | `isImob ? ' e visita realizada sem proposta em 3 dias' : ''` | Texto do card | (c) |
| 85 | `app/agendar/[slug]/page.tsx:16-17` | `!cap.agendaClinica && !cap.agendaVisitas` | `notFound()` na página pública de agendamento | (a) |
| 86 | `app/api/agendar/[slug]/route.ts:27-28` | `!cap.agendaClinica && !cap.agendaVisitas` | Recusa o POST público | (a) |
| 87 | `app/menu/[slug]/page.tsx:19` | `!capacidades.usaComanda` | `notFound()` no cardápio público | (a) |
| 88 | `app/api/menu/[slug]/pedido/route.ts:20` | `!capacidades.usaComanda` | Recusa pedido público | (a) |
| 89 | `app/api/veiculos/[slug]/route.ts:36` | `!capacidades.usaPlaca` | Feed público de veículos vazio | (a) |
| 90 | `app/api/match/lead/[id]/route.ts:26` | `capacidades.matchVeiculo` | Casa interesse com unidade de veículo × imóvel | (b) |
| 91 | `lib/motivos-perda.ts:1,20-77,79-82` | `MOTIVOS_POR_SEGMENTO[seg] ?? MOTIVOS_POR_SEGMENTO.varejo` (7 listas) | Motivos de perda semeados | (c) |
| 92 | `app/api/register/route.ts:4,155` | `motivosDoSegmento(body.segmento)` | INSERT em `motivos_perda` no cadastro | (c) |
| 93 | `lib/zapintel/papel.ts:11-23` | Mapa `PAPEL[seg]` (Vendedor/Corretor/Atendente/Consultor/Recepcionista) | Nome de quem atende no ZapIntel | (c) |
| 94 | `app/zapintel/api/sugestao/route.ts:8,97` | `papelDoSegmento(segmento)` | Papel no prompt da sugestão | (c) |
| 95 | `hooks/zapintel/useLeads.tsx:3,73` | `papelDoSegmento(resumo.segmento)` | `sellerName` da lista de leads | (c) |
| 96 | `lib/assistente/chat-dados.ts:49-57,72` | Mapa `SEGMENTO[seg] ?? 'pequena empresa'` | Descrição da empresa no prompt | (c) |
| 97 | `app/api/assistente/route.ts:12-24` | Mapa `SEGMENTO_CTX[seg] ?? 'pequeno negócio'` | Descrição da empresa no prompt | (c) |
| 98 | `app/superadmin/metricas/page.tsx:5,12-14,91-95` | `SEG_LABEL[seg]` via `SEGMENTOS_LISTA` | Rótulo da agregação por segmento | (c) |
| 99 | `app/para/[segmento]/page.tsx:9-58,61,64-66,85-87` | Mapa `PARA[segmento]` (lojas, imobiliarias, concessionarias, clinicas, restaurantes, servicos); `generateStaticParams` | Páginas SEO `/para/*` | (c) |
| 100 | `app/landing/data.ts:16,28-119,121` | Mapa `SEGS[key]` (varejo, imob, ... servicos) + `SEG_KEYS` | Conteúdo do palco da landing | (c) |
| 101 | `app/landing/data.ts:127-134` | `SEG_CARDS` (varejo, imob, auto, saude, food, servicos) | Cards de segmento da landing | (c) |
| 102 | `app/landing/sections/ProductStage.tsx:17,26,29,35,124,137` | `SEGS[seg]`, seletor/autoplay por `SEG_KEYS` (inicial `'varejo'`) | Palco animado da landing | (c) |
| 103 | `app/landing/sections/Segments.tsx:10,35-36` | `SEGS[c.key]` por card | Links para `/para/*` | (c) |
| 104 | `app/landing/sections/FinalCta.tsx:11,68` | `SEGS[c.key].para` | Coluna "Segmentos" do rodapé | (c) |
| 105 | `app/landing/Sections.tsx:58,68,167,335`; `app/landing/data.ts:167,189,203`; `app/landing/sections/FinalCta.tsx:29,63`; `app/landing/sections/Hero.tsx:96`; `app/landing/sections/Modules.tsx:59`; `app/landing/sections/ProductStage.tsx:103,121`; `app/landing/sections/Segments.tsx:25`; `app/landing/Landing.tsx:67`; `app/layout.tsx:16`; `app/manifest.ts:8` | Texto/âncora "seu segmento", `#segmentos`, "CRM por segmento" | Copy e metadados | (c) |
| 106 | `scripts/check-nucleo.mjs:3-183 (regex em 47, exceções em 54, dívida em 79-89)` | Regex `segmento ... (===\|!==) '(varejo\|assistencia\|servicos\|imobiliaria\|saude\|food\|concessionaria)'` | Trava de arquitetura contra comparação com nome de segmento | (c) |
| 107 | `scripts/verificar-auditoria.sh:79,313-315,353,360-364,373-374,379-380,384-385,391-393,412,415,436,453-460,486-490,504,518` | Asserções de texto sobre `papelDoSegmento`, capacidades, `menuLayout`, `equipeLabel`, `segmentos_config`, `funil_seed`, `modulos_extra` | Verificação de auditoria | (c) |

### 1.3 Resumo

| Classe | 1.1 | 1.2 | Total |
|---|---|---|---|
| (a) vira leitura de `empresa_modulos` | 49 | 31 | 80 |
| (b) vira campo personalizado | 10 | 27 | 37 |
| (c) morre | 42 | 49 | 91 |
| **Total** | **101** | **107** | **208** |

Contagem por coluna/tabela (linhas cuja coluna "O que lê/escreve" ou "Condição" a cita; uma linha pode contar em mais de uma):

| Coluna/tabela | 1.1 | 1.2 | Total |
|---|---|---|---|
| `empresas.segmento` (direto, por prop ou via `SEGMENTOS[...]`/capacidade/mapa por segmento) | 74 | 95 | 169 |
| `segmentos_config` (qualquer coluna, inclusive tipos `SegOverride`/`segOverride`) | 15 | 8 | 23 |
| `modulos_override` | 10 | 1 | 11 |
| `menu_override` | 17 | 3 | 20 |
| `menu_config` | 10 | 6 | 16 |
| `wl_menu` | 7 | 0 | 7 |
| `modulos_habilitados` / `habilitados` | 16 | 5 | 21 |
| `hidden_hrefs` / `hiddenHrefs` | 7 | 3 | 10 |
| `label_overrides` / `labelOverrides` | 9 | 3 | 12 |
| `modulos_extra` / `modulosExtra` | 8 | 7 | 15 |
| `menu_layout` / `menuLayout` | 14 | 5 | 19 |

Arquivos pedidos sem ocorrência de segmento/menu: `lib/plano.ts`, `lib/planos.ts`, `lib/acesso.ts` (só plano), `lib/empresa-context.tsx` (não lê `segmento` nem colunas de menu), `supabase/functions/webhook-leads`, `supabase/views/*`.

---

## 2. Mapa de rotas

### 2.1 Páginas (94)

#### (dashboard) — CRM (38)

| Rota (URL) | Arquivo | Módulo novo | Tabelas lidas | Tabelas escritas | RPC / APIs chamadas | Client | Dup? |
|---|---|---|---|---|---|---|---|
| /agenda | `app/(dashboard)/agenda/page.tsx` | core | clientes, empresa_usuarios, empresas, imoveis, leads, lista_espera, visitas | lista_espera, visitas | — | usuário | — |
| /assistencia | `app/(dashboard)/assistencia/page.tsx` | assistencia | clientes, configuracoes_sistema, garantias_assistencias, inventario_unidades, produtos, servicos_reparo, vendas | garantias_assistencias, servicos_reparo, tarefas | /api/payments/charge, /api/whatsapp/send | usuário | — |
| /avaliacoes | `app/(dashboard)/avaliacoes/page.tsx` | avaliacao | avaliacoes_usados, leads | — | /api/avaliacoes, /api/fipe/opcoes, /api/fipe/valor | usuário | DUP parcial: /consulta-fipe (mesmo FipePicker embutido) |
| /cardapio | `app/(dashboard)/cardapio/page.tsx` | sem módulo (cardápio de restaurante) | categorias_produtos, empresas, produtos | produtos | — | usuário | — |
| /catalogo | `app/(dashboard)/catalogo/page.tsx` | vendas | categorias_produtos, inventario_unidades, marcas_produtos, produtos, subcategorias_produtos, tabela_precos | categorias_produtos, produtos, tabela_precos, storage:produtos | — | usuário | — |
| /chat | `app/(dashboard)/chat/page.tsx` | core | empresa_usuarios, mensagens_internas | mensagens_internas | rpc chat_marcar_lido, rpc chat_nao_lidas_por_conversa, /api/chat/notify, /api/push/subscribe | usuário | — |
| /check-imei | `app/(dashboard)/check-imei/page.tsx` | avaliacao | imei_consultas | imei_consultas | — | usuário | — |
| /clientes | `app/(dashboard)/clientes/page.tsx` | core | chamadas, clientes, configuracoes_sistema, empresa_usuarios, empresas, funil_etapas, lead_mensagens, lead_perfil_busca, leads, negocios_imobiliarios, visitas | clientes, lead_perfil_busca, leads | /api/clientes/fundir | usuário | — |
| /compras | `app/(dashboard)/compras/page.tsx` | vendas | empresa_usuarios, fornecedores, pedidos_compra, usuarios | fornecedores, pedidos_compra | /api/compras/receber | usuário | — |
| /consulta-fipe | `app/(dashboard)/consulta-fipe/page.tsx` | avaliacao | — | — | /api/fipe/opcoes, /api/fipe/valor | — (só API) | DUP parcial: /avaliacoes (FipePicker da avaliação, isolado) |
| /conversao | `app/(dashboard)/conversao/page.tsx` | inteligencia | chamadas, empresa_usuarios, funil_etapas, leads, usuarios | — | — | usuário | DUP: /admin/conversao (proxy redireciona /conversao → /admin/conversao, que importa esta página) |
| /dashboard | `app/(dashboard)/dashboard/page.tsx` | core | clientes, configuracoes_sistema, empresa_usuarios, empresas, funil_etapas, garantias_assistencias, imoveis, inventario_unidades, leads, produtos, tarefas, usuarios, vendas, visitas | — | /api/dashboard | usuário | DUP parcial: /gestao-leads (bloco "Leads parados" do dashboard imob, mesmas faixas de lib/lead-parado) |
| /design | `app/(dashboard)/design/page.tsx` | sem módulo (vitrine do design system, só superadmin) | — | — | — | usuário (só guarda superadmin) | — |
| /equipe | `app/(dashboard)/equipe/page.tsx` | core | acessos, comissoes, empresa_usuarios, inventario_unidades, metas_comissoes, vendas | comissoes, metas_comissoes | /api/equipe/atualizar-usuario, /api/equipe/criar-usuario, /api/equipe/online, /api/equipe/remover-usuario | usuário | DUP: /admin/equipe (mesmo equipe-view; proxy redireciona /equipe → /admin/equipe) |
| /estoque | `app/(dashboard)/estoque/page.tsx` | estoque | categorias_produtos, clientes, empresas, filiais, fornecedores, imei_consultas, inventario_unidades, marcas_produtos, movimentacao_estoque, produtos, tabela_precos, usuarios | inventario_unidades, veiculo_dados, storage:produtos | /api/estoque/confirmar-chegada, /api/estoque/transferir | usuário | — |
| /executivo | `app/(dashboard)/executivo/page.tsx` | inteligencia | configuracoes_sistema, empresa_usuarios, empresas, funil_etapas, imoveis, leads, negocios_imobiliarios, usuarios, visitas | — | — | usuário | — |
| /fila | `app/(dashboard)/fila/page.tsx` | core | cadencia_inscricoes, cadencia_passos, cadencias, configuracoes_sistema, leads | — | /api/cadencias/acao | usuário | — |
| /financeiro | `app/(dashboard)/financeiro/page.tsx` | financeiro | clientes, cobrancas, configuracoes_sistema, empresa_usuarios, empresas, imoveis, lancamentos_financeiros, leads, negocios_imobiliarios, usuarios, vendas | cobrancas, lancamentos_financeiros | /api/imob/comissao-config, /api/imob/negocios | usuário | DUP: /admin/financeiro (mesmo financeiro-view + comissoes-imob) |
| /garantia | `app/(dashboard)/garantia/page.tsx` | assistencia | clientes, configuracoes_sistema, contrato_documentos, contrato_modelos, contratos_venda, empresas, garantias_assistencias, inventario_unidades, produtos, vendas_pagamentos, vendas_termos | contratos_venda, garantias_assistencias | /api/garantia/termo | usuário | — |
| /gestao-leads | `app/(dashboard)/gestao-leads/page.tsx` | core | cadencia_inscricoes, cadencias, configuracoes_sistema, empresa_usuarios, empresas, funil_etapas, lead_perfil_busca, leads, usuarios | — | /api/reativacao | usuário | DUP parcial: /dashboard (leads-parados.tsx) |
| /historico | `app/(dashboard)/historico/page.tsx` | vendas | clientes, configuracoes_sistema, contrato_documentos, contrato_modelos, contratos_venda, empresa_usuarios, empresas, produtos, usuarios, vendas, vendas_pagamentos | contratos_venda, inventario_unidades, vendas, vendas_pagamentos | — | usuário | — |
| /imoveis | `app/(dashboard)/imoveis/page.tsx` | imoveis | chaves_imoveis, clientes, empresa_usuarios, empresas, imoveis, usuarios | chaves_imoveis, imoveis, storage:imoveis | — | usuário | — |
| /kds | `app/(dashboard)/kds/page.tsx` | sem módulo (KDS de restaurante) | pedidos | pedidos | — | usuário | — |
| /leads | `app/(dashboard)/leads/page.tsx` | core | cadencia_inscricoes, cadencias, chamadas, clientes, configuracoes_sistema, empresa_usuarios, empresas, fichas_financiamento, funil_etapas, funis, imoveis, inventario_unidades, lead_atribuicoes, lead_mensagens, lead_perfil_busca, leads, motivos_perda, negocios_imobiliarios, orcamentos, produtos, tarefas, troca_precos, troca_regras, v_leads_nao_lidas, visitas | chamadas, clientes, fichas_financiamento, lead_mensagens, lead_perfil_busca, leads, tarefas, visitas | /api/cadencias/acao, /api/cadencias/inscrever, /api/chat/upload, /api/filial/selecionar, /api/imob/negocios, /api/leads/atribuir, /api/leads/distribuir, /api/leads/mover, /api/match/lead, /api/modelos, /api/orcamentos, /api/reservas, /api/troca/cotacoes, /api/troca/precos | usuário | — |
| /marketing | `app/(dashboard)/marketing/page.tsx` | core | solicitacoes_marketing | — | /api/marketing | usuário | — |
| /metas | `app/(dashboard)/metas/page.tsx` | core | configuracoes_sistema, empresa_usuarios, funil_etapas, leads, metas_comissoes, usuarios, vendas | — | /api/metas | usuário | DUP: /admin/metas (proxy redireciona /metas → /admin/metas, que importa esta página) |
| /orcamentos/checklist | `app/(dashboard)/orcamentos/checklist/page.tsx` | avaliacao | troca_regras | — | — | usuário | — |
| /orcamentos/cotacao | `app/(dashboard)/orcamentos/cotacao/page.tsx` | avaliacao | clientes, leads, troca_cotacoes, troca_precos, troca_regras | — | /api/orcamentos, /api/troca/cotacoes, /api/troca/precos | usuário | DUP parcial: /orcamentos (troca-modal) e painel de orçamento em /leads — mesma /api/troca/cotacoes |
| /orcamentos | `app/(dashboard)/orcamentos/page.tsx` | assistencia | clientes, empresa_usuarios, empresas, inventario_unidades, leads, orcamentos, tabela_precos, troca_precos, troca_regras, usuarios | — | /api/orcamentos, /api/reservas, /api/troca/cotacoes, /api/troca/precos | usuário | DUP parcial: /orcamentos/cotacao (troca-modal cria cotação de troca) |
| /orcamentos/precos | `app/(dashboard)/orcamentos/precos/page.tsx` | avaliacao | troca_precos, troca_regras | — | /api/troca/precos, /api/troca/precos/familia, /api/troca/regras | usuário | — |
| /pdv | `app/(dashboard)/pdv/page.tsx` | vendas | clientes, configuracoes_sistema, contrato_documentos, contrato_modelos, contratos_venda, empresa_usuarios, empresas, inventario_unidades, produtos, tabela_precos, taxas_pagamento, usuarios, vendas, vendas_pagamentos | clientes, contratos_venda, inventario_unidades, pedidos_compra, troca_cotacoes, vendas, vendas_alertas, vendas_pagamentos, vendas_termos | /api/compras/receber, /api/payments/charge, /api/reservas, /api/troca/cotacoes/buscar, /api/whatsapp/send | usuário | — |
| /produtos | `app/(dashboard)/produtos/page.tsx` | estoque | — | — | — | — | só redirect → /catalogo |
| /propostas | `app/(dashboard)/propostas/page.tsx` | vendas | propostas | — | /api/propostas | usuário | — |
| /ranking | `app/(dashboard)/ranking/page.tsx` | core | empresa_usuarios, empresas, imoveis, inventario_unidades, leads, metas, propostas, segmentos_config, usuarios, vendas, visitas | — | /api/ranking/metas | usuário | DUP parcial: /admin/metas e /admin/equipe (meta individual em `metas`, separada de `metas_comissoes`) |
| /relatorios | `app/(dashboard)/relatorios/page.tsx` | inteligencia | clientes, empresa_usuarios, empresas, funil_etapas, imoveis, inventario_unidades, lancamentos_financeiros, leads, propostas, vendas, visitas | — | /api/exportar | usuário | DUP: /admin/relatorios (importa esta página) |
| /simular-financiamento | `app/(dashboard)/simular-financiamento/page.tsx` | vendas | — | — | — | — (cálculo local) | — |
| /simular-parcela | `app/(dashboard)/simular-parcela/page.tsx` | vendas | — | — | /api/taxas | — (só API) | — |
| /tarefas | `app/(dashboard)/tarefas/page.tsx` | core | empresa_usuarios, leads, tarefas | tarefas | — | usuário | — |

#### /admin (23)

| Rota (URL) | Arquivo | Módulo novo | Tabelas lidas | Tabelas escritas | RPC / APIs chamadas | Client | Dup? |
|---|---|---|---|---|---|---|---|
| /admin/aparencia | `app/admin/aparencia/page.tsx` | core | empresa_usuarios, empresas, usuarios | — | /api/aparencia | usuário | DUP parcial: /admin/empresa (cor/logo white-label lá; cores do menu aqui, ambos em `empresas`) |
| /admin/cadencias | `app/admin/cadencias/page.tsx` | core | cadencia_passos, cadencias, configuracoes_sistema, empresa_usuarios, funil_etapas, usuarios | — | /api/cadencias, /api/reativacao | usuário | — |
| /admin/canais | `app/admin/canais/page.tsx` | core | — | — | — | — | só redirect → /admin/integracoes (preserva ?code da Meta) |
| /admin/configuracoes | `app/admin/configuracoes/page.tsx` | core | automacoes, campanhas_fidelidade, configuracoes_sistema, empresas, funil_etapas, funis, motivos_perda, notificacao_prefs, taxas_pagamento, usuarios | automacoes, campanhas_fidelidade, configuracoes_sistema, motivos_perda, notificacao_prefs, taxas_pagamento | /api/exportar, /api/funis, /api/payments/config | usuário | DUP: /admin/integracoes (aba Integrações + modal "Manual"), /admin/modelos (aba Modelos WhatsApp), /admin/funil (aba Funis), /admin/contrato (aba Contrato, parcial) |
| /admin/contrato/[id] | `app/admin/contrato/[id]/page.tsx` | vendas | configuracoes_sistema, contrato_documentos, contrato_modelos, contratos_venda | storage:contratos | /api/contrato-modelo | usuário | — |
| /admin/contrato | `app/admin/contrato/page.tsx` | vendas | contrato_documentos, contrato_modelos, contratos_venda | — | /api/contrato-documentos | usuário | DUP parcial: aba Contrato de /admin/configuracoes (garantia padrão do contrato) |
| /admin/conversao | `app/admin/conversao/page.tsx` | inteligencia | chamadas, empresa_usuarios, funil_etapas, leads, usuarios | — | — | usuário | DUP: /conversao |
| /admin/distribuicao | `app/admin/distribuicao/page.tsx` | core | distribuicao_regras, empresa_usuarios, leads, usuarios | — | /api/distribuicao, /api/leads/distribuir | usuário | — |
| /admin/empresa | `app/admin/empresa/page.tsx` | core | — | — | /api/empresa | usuário | DUP parcial: /admin/aparencia |
| /admin/equipe | `app/admin/equipe/page.tsx` | core | acessos, comissoes, empresa_usuarios, filiais, inventario_unidades, metas_comissoes, vendas | comissoes, metas_comissoes | /api/equipe/atualizar-usuario, /api/equipe/criar-usuario, /api/equipe/online, /api/equipe/remover-usuario | usuário | DUP: /equipe; DUP parcial: /admin/metas (edita o mesmo metas_comissoes.meta_vendas_valor) |
| /admin/filiais | `app/admin/filiais/page.tsx` | core | empresa_usuarios, filiais, leads | — | /api/admin/filiais | misto (service em: page, filiais-consulta) | — |
| /admin/financeiro | `app/admin/financeiro/page.tsx` | financeiro | cobrancas, lancamentos_financeiros | cobrancas, lancamentos_financeiros | /api/imob/comissao-config, /api/imob/negocios | usuário | DUP: /financeiro |
| /admin/funil | `app/admin/funil/page.tsx` | core | empresa_usuarios, funil_etapas, funis, leads, usuarios | — | /api/funil | usuário | DUP parcial: aba Funis de /admin/configuracoes (funis lá, etapas aqui) |
| /admin/integracoes | `app/admin/integracoes/page.tsx` | core | canais_conectados, configuracoes_sistema, empresas, integracao_eventos | canais_conectados, configuracoes_sistema | /api/admin/c2s, /api/admin/importar-imoveis, /api/canais, /api/canais/diagnostico, /api/canais/instagram/iniciar, /api/canais/meta, /api/canais/whatsapp | misto (service em: page, renovacao, portal-token, c2s) | DUP: aba Integrações de /admin/configuracoes (+ /admin/canais, hoje redirect) |
| /admin/metas | `app/admin/metas/page.tsx` | core | configuracoes_sistema, empresa_usuarios, funil_etapas, leads, metas_comissoes, usuarios, vendas | — | /api/metas | usuário | DUP: /metas; DUP parcial: /admin/equipe (metas_comissoes) e /ranking (`metas`) |
| /admin/meu-menu | `app/admin/meu-menu/page.tsx` | core | empresa_usuarios, empresas, segmentos_config, usuarios | — | /api/menu-config | usuário | — |
| /admin/modelos | `app/admin/modelos/page.tsx` | core | — | — | /api/modelos | — (só API) | DUP: aba Modelos WhatsApp de /admin/configuracoes (templates internos em configuracoes_sistema × modelos Meta via /api/modelos) |
| /admin | `app/admin/page.tsx` | core | clientes, configuracoes_sistema, empresa_usuarios, empresas, filiais, leads, planos_config, produtos, vendas | — | /api/admin/regua-followup | misto (service em: page, filiais-consulta) | — |
| /admin/permissoes | `app/admin/permissoes/page.tsx` | core | empresa_usuarios, empresas, usuarios | — | /api/permissoes | usuário | — |
| /admin/planos | `app/admin/planos/page.tsx` | financeiro | empresas, planos_config | — | /api/stripe/checkout, /api/stripe/portal | usuário | — |
| /admin/planos/sucesso | `app/admin/planos/sucesso/page.tsx` | financeiro | — | — | /api/stripe/verificar-sessao | — (só API) | — |
| /admin/relatorios | `app/admin/relatorios/page.tsx` | inteligencia | clientes, empresa_usuarios, empresas, funil_etapas, imoveis, inventario_unidades, lancamentos_financeiros, leads, propostas, vendas, visitas | — | /api/exportar | usuário | DUP: /relatorios |
| /admin/scoring | `app/admin/scoring/page.tsx` | core | cadencias, configuracoes_sistema, empresa_usuarios, usuarios | — | /api/leads/pontuar, /api/scoring | usuário | — |

#### /superadmin (12)

| Rota (URL) | Arquivo | Módulo novo | Tabelas lidas | Tabelas escritas | RPC / APIs chamadas | Client | Dup? |
|---|---|---|---|---|---|---|---|
| /superadmin/admins | `app/superadmin/admins/page.tsx` | superadmin | usuarios | — | /api/superadmin/admins | usuário | — |
| /superadmin/assistente | `app/superadmin/assistente/page.tsx` | superadmin | assistente_config, empresas | — | /api/superadmin/assistente, /api/superadmin/assistente/modelos | misto (service em: page) | — |
| /superadmin/avisos | `app/superadmin/avisos/page.tsx` | superadmin | avisos_plataforma, empresas, planos_config | — | /api/superadmin/avisos | service | — |
| /superadmin/empresas/[id] | `app/superadmin/empresas/[id]/page.tsx` | superadmin | clientes, complementos_empresa, empresa_usuarios, empresas, leads, vendas | — | /api/superadmin/empresas, /api/zapintel/preview | misto (service em: page, db) | — |
| /superadmin/empresas | `app/superadmin/empresas/page.tsx` | superadmin | empresas | — | — | service | — |
| /superadmin/fipe | `app/superadmin/fipe/page.tsx` | superadmin | fipe_consultas, fipe_referencia | — | /api/superadmin/fipe | service | — |
| /superadmin/laboratorio | `app/superadmin/laboratorio/page.tsx` | superadmin | empresas, segmentos_config | — | /api/superadmin/laboratorio/preview | misto (service em: page) | — |
| /superadmin/logs | `app/superadmin/logs/page.tsx` | superadmin | superadmin_logs | — | — | usuário | — |
| /superadmin/metricas | `app/superadmin/metricas/page.tsx` | superadmin | empresa_usuarios, empresas, leads, planos_config | — | — | service | — |
| /superadmin | `app/superadmin/page.tsx` | superadmin | empresas | — | /api/superadmin/sync-stripe | usuário | — |
| /superadmin/planos | `app/superadmin/planos/page.tsx` | superadmin | planos_config | — | /api/superadmin/planos | usuário | — |
| /superadmin/segmentos | `app/superadmin/segmentos/page.tsx` | superadmin | segmentos_config | — | /api/superadmin/segmentos | service | — |

#### /zapintel (6)

| Rota (URL) | Arquivo | Módulo novo | Tabelas lidas | Tabelas escritas | RPC / APIs chamadas | Client | Dup? |
|---|---|---|---|---|---|---|---|
| /zapintel/atendimento | `app/zapintel/atendimento/page.tsx` | inteligencia | — | — | rpc zapintel_atendimento, rpc zapintel_conversa, rpc zapintel_resumo | usuário | — |
| /zapintel/insights | `app/zapintel/insights/page.tsx` | inteligencia | — | — | rpc zapintel_insights, rpc zapintel_resumo | usuário | — |
| /zapintel/leads/[id] | `app/zapintel/leads/[id]/page.tsx` | inteligencia | — | — | rpc zapintel_resumo, /zapintel/api/conversa, /zapintel/api/perfil, /zapintel/api/sugestao | usuário | — |
| /zapintel/leads | `app/zapintel/leads/page.tsx` | inteligencia | — | — | rpc zapintel_leads_lista, rpc zapintel_resumo | usuário | — |
| /zapintel | `app/zapintel/page.tsx` | inteligencia | — | — | rpc zapintel_dashboard, rpc zapintel_dashboard_lista, rpc zapintel_resumo | usuário | — |
| /zapintel/posvenda | `app/zapintel/posvenda/page.tsx` | inteligencia | — | — | rpc zapintel_posvenda, rpc zapintel_resumo | usuário | — |

#### Públicas / auth (15)

| Rota (URL) | Arquivo | Módulo novo | Tabelas lidas | Tabelas escritas | RPC / APIs chamadas | Client | Dup? |
|---|---|---|---|---|---|---|---|
| /login | `app/(auth)/login/page.tsx` | core (auth) | — | — | /api/acesso | usuário (auth) | — |
| /agendar/[slug] | `app/agendar/[slug]/page.tsx` | core (público) | configuracoes_sistema, empresas, visitas | — | /api/agendar | service | — |
| /entrar | `app/entrar/page.tsx` | core (auth) | empresa_usuarios, empresas, segmentos_config, usuarios | — | — | usuário | — |
| /imob/[slug] | `app/imob/[slug]/page.tsx` | imoveis (público) | empresas, imoveis | — | — | service | — |
| /imovel/[id] | `app/imovel/[id]/page.tsx` | imoveis (público) | empresas, imoveis | — | — | service | — |
| /menu/[slug] | `app/menu/[slug]/page.tsx` | sem módulo (cardápio de restaurante) (público) | empresas, produtos | — | /api/menu | service | — |
| /offline | `app/offline/page.tsx` | sem módulo (fallback offline do PWA) | — | — | — | — | — |
| /orcamento/[token] | `app/orcamento/[token]/page.tsx` | assistencia (público) | empresas, orcamentos | — | /api/orcamento | service | — |
| /os/[token] | `app/os/[token]/page.tsx` | assistencia (público) | garantias_assistencias | — | /api/os | service | — |
| / | `app/page.tsx` | sem módulo (landing) (público) | planos_config | — | — | misto (sessão + service p/ planos_config) | — |
| /para/[segmento] | `app/para/[segmento]/page.tsx` | sem módulo (landing por segmento) (público) | planos_config | — | — | service | — |
| /privacy | `app/privacy/page.tsx` | sem módulo (política de privacidade) (público) | — | — | — | — | — |
| /proposta/[token] | `app/proposta/[token]/page.tsx` | vendas (público) | propostas | — | — | service | — |
| /register | `app/register/page.tsx` | core (auth) | — | — | /api/acesso, /api/planos-publicos, /api/register | usuário (auth) | — |
| /reset-senha | `app/reset-senha/page.tsx` | core (auth) | — | — | — | usuário (auth) | — |

#### Resumo

| Módulo novo | Páginas |
|---|---|
| core | 33 |
| vendas | 10 |
| estoque | 2 |
| avaliacao | 6 |
| assistencia | 5 |
| financeiro | 4 |
| rastreamento | 0 |
| imoveis | 3 |
| inteligencia | 11 |
| superadmin | 12 |
| sem módulo | 8 |
| **Total** | **94** |

| Duplicatas | Páginas |
|---|---|
| DUP (mesma função/mesmo componente em duas rotas) | 13 |
| DUP parcial (só parte da função repetida) | 11 |
| **Páginas marcadas com DUP** | **24** |
| Redirects puros (não contados) | 2 (/produtos → /catalogo, /admin/canais → /admin/integracoes) |

Grupos de duplicata confirmados: Relatórios (/relatorios × /admin/relatorios); Financeiro (/financeiro × /admin/financeiro); Integrações (/admin/integracoes × aba Integrações de /admin/configuracoes; /admin/canais é só redirect); Conversão (/conversao × /admin/conversao); Metas (/metas × /admin/metas × /admin/equipe × /ranking); Equipe (/equipe × /admin/equipe); Funil (aba Funis × /admin/funil); Modelos (aba Modelos WhatsApp × /admin/modelos); Contrato (aba Contrato × /admin/contrato); Marca (/admin/empresa × /admin/aparencia); FIPE (/consulta-fipe × /avaliacoes); Cotação de troca (/orcamentos/cotacao × /orcamentos × /leads); Leads parados (/gestao-leads × /dashboard).

Convenções: tabelas seguidas pelo grafo de imports da página (componentes, hooks, lib), sem layout, Topbar/command-palette/seletor-filial (comuns a 52 telas: leem leads, clientes, inventario_unidades, filiais, usuarios; rpc buscar_lead_por_numero; /api/filial/selecionar) e sem leituras de guarda/contexto (lib/owner, lib/superadmin, lib/acesso, lib/troca-acesso, lib/empresa-context, rpc get_empresa_id). Quando a tela chama /api/..., anota-se a rota, não as tabelas dela. Rotas de páginas que só existem por import (/admin/conversao, /admin/metas, /admin/relatorios) herdam as tabelas da página importada. /equipe, /conversao e /metas do grupo (dashboard) estão em LEGADO_ADMIN no proxy.ts: usuário logado é redirecionado para /admin/... antes de a página rodar. ZapIntel: além da RPC da tela, todas usam rpc zapintel_resumo (provider do layout) e o layout lê usuarios/empresas/complementos_empresa (service via lib/rastreamento/db).

### 2.2 Rotas de API (117)

Legenda — escritas: I = insert, U = update, D = delete, S = upsert. Tabelas incluem as tocadas pelas funções de `lib/` chamadas pela rota; leituras de `usuarios`/`empresa_usuarios` feitas só para checar papel/sessão ficam fora (vão na coluna Auth). Client: "service" = todas as operações de dados com a service key (a sessão, quando existe, serve só para autorizar); "misto" = operações de dados pelos dois clients. ⚠ = service key + rota chamável sem sessão.

#### /api/acesso

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/acesso | `app/api/acesso/route.ts` | POST | core | acessos | acessos (IU), usuarios (U) | — | usuário | sessão | — |

#### /api/admin/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/admin/c2s | `app/api/admin/c2s/route.ts` | POST | imoveis | empresas, configuracoes_sistema | configuracoes_sistema (S) | API externa C2S (assinar/cancelar webhook) | service | sessão+papel owner/admin | — |
| /api/admin/filiais | `app/api/admin/filiais/route.ts` | POST | core | filiais | filiais (IU), empresa_usuarios (U), usuarios (U) | — | service | sessão+papel owner/admin | — |
| /api/admin/importar-imoveis | `app/api/admin/importar-imoveis/route.ts` | POST | imoveis | configuracoes_sistema, imoveis | configuracoes_sistema (S), imoveis (IU) | — | service | sessão+papel owner/admin | — |
| /api/admin/regua-followup | `app/api/admin/regua-followup/route.ts` | POST | core | — | configuracoes_sistema (S) | — | usuário | sessão+papel owner/admin | — |

#### /api/agendar · /api/aparencia

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/agendar/[slug] | `app/api/agendar/[slug]/route.ts` | OPTIONS, POST | core | empresas, visitas, distribuicao_regras, configuracoes_sistema, empresa_usuarios, filiais | visitas (I), leads (I), distribuicao_regras (U), configuracoes_sistema (S) | rpc `rate_limit_bump` | service | ⚠ token/slug público — slug da empresa; segmento precisa ter agenda (senão 404); rate limit por IP 20/h (`rate_limit_bump`); CORS `*` | — |
| /api/aparencia | `app/api/aparencia/route.ts` | POST | core | — | empresas (U) | — | service | sessão+papel owner/admin/superadmin | — |

#### /api/assistente/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/assistente/meu-dia | `app/api/assistente/meu-dia/route.ts` | POST | inteligencia | assistente_config, tarefas, leads, cadencia_inscricoes, visitas | assistente_uso (I) | API externa Gemini | misto | sessão | — |
| /api/assistente | `app/api/assistente/route.ts` | POST | inteligencia | assistente_config, assistente_uso, empresas, filiais, usuarios, vendas, produtos, empresa_usuarios, leads, zapintel_lead_perfil, lead_mensagens, zapintel_venda_lead, motivos_perda | assistente_config (U), assistente_uso (IU) | rpc `filiais_visiveis`; rpc `assistente_status_conversas`; rpc `zapintel_analises_pendentes`; API externa Anthropic/Gemini | misto | sessão (dados limitados por `acessoDoUsuario` + `filiais_visiveis`) | não (/api/superadmin/assistente é painel de uso/config, não chat) |

#### /api/ausencia · /api/avaliacoes

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/ausencia | `app/api/ausencia/route.ts` | POST | core | funil_etapas, leads | empresa_usuarios (U), leads (U) | — | usuário | sessão | — |
| /api/avaliacoes | `app/api/avaliacoes/route.ts` | POST, PATCH, DELETE | avaliacao | marcas_produtos, categorias_produtos, produtos, avaliacoes_usados | marcas_produtos (I), categorias_produtos (I), produtos (I), avaliacoes_usados (IUD), inventario_unidades (I) | — | usuário | sessão (via `getEmpresaId`, redireciona sem login) | — |

#### /api/cadencias/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/cadencias/acao | `app/api/cadencias/acao/route.ts` | POST | core | cadencia_inscricoes, cadencia_passos | cadencia_inscricoes (U), cadencia_execucoes (I), chamadas (I), leads (U) | — | usuário | sessão | — |
| /api/cadencias/inscrever | `app/api/cadencias/inscrever/route.ts` | POST | core | leads, cadencia_inscricoes, cadencia_passos | cadencia_inscricoes (I) | — | usuário | sessão | — |
| /api/cadencias | `app/api/cadencias/route.ts` | POST, DELETE | core | — | cadencias (IUD), cadencia_passos (ID), cadencia_inscricoes (U) | — | usuário | sessão+papel owner/admin/superadmin | — |

#### /api/canais/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/canais/[id] | `app/api/canais/[id]/route.ts` | DELETE, PATCH | core | filiais | canais_conectados (UD) | — | service | sessão+papel owner/admin | — |
| /api/canais/diagnostico | `app/api/canais/diagnostico/route.ts` | POST | core | — | diagnostico_canais (I) | — | service | sessão (qualquer papel) | — |
| /api/canais/instagram/iniciar | `app/api/canais/instagram/iniciar/route.ts` | POST | core | — | — | cookie `ig_login_state` (OAuth) | — (sem banco) | sessão+papel owner/admin | — |
| /api/canais/instagram/retorno | `app/api/canais/instagram/retorno/route.ts` | GET | core | canais_conectados | canais_conectados (US) | rpc `filial_gravacao`; Graph API Instagram | misto | sessão+papel owner/admin + `state` OAuth (cookie) | — |
| /api/canais/meta | `app/api/canais/meta/route.ts` | POST | core | canais_conectados | canais_conectados (US) | rpc `filial_atual`; Graph API Meta | misto | sessão+papel owner/admin | — |
| /api/canais | `app/api/canais/route.ts` | GET | core | canais_conectados, filiais | — | — | usuário | sessão+papel owner/admin/vendedor | — |
| /api/canais/whatsapp | `app/api/canais/whatsapp/route.ts` | POST | core | canais_conectados | canais_conectados (US) | rpc `filial_atual`; Graph API WhatsApp | misto | sessão+papel owner/admin | DUP: /api/configuracoes/whatsapp-official (mesma conexão WhatsApp Cloud; esta grava em `canais_conectados`) |

#### /api/chat/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/chat/notify | `app/api/chat/notify/route.ts` | POST | core | usuarios, push_subscriptions | push_subscriptions (D) | Web Push (lib/push via service) | misto | sessão | — |
| /api/chat/upload | `app/api/chat/upload/route.ts` | POST | core | — | — | storage `chat-midia`: upload, getPublicUrl | service | sessão (qualquer papel) | — |

#### /api/clientes · /api/compras · /api/configuracoes · /api/contrato-documentos · /api/contrato-modelo · /api/cron · /api/dashboard · /api/distribuicao

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/clientes/fundir | `app/api/clientes/fundir/route.ts` | POST | core | — | — | rpc `fundir_clientes` | service | sessão+papel owner/admin | — |
| /api/compras/receber | `app/api/compras/receber/route.ts` | POST | vendas | pedidos_compra, vendas | pedidos_compra (U), vendas (U), inventario_unidades (I) | — | usuário | sessão | — |
| /api/configuracoes/whatsapp-official | `app/api/configuracoes/whatsapp-official/route.ts` | POST | core | — | configuracoes_sistema (S) | — | usuário | sessão+papel owner/admin | DUP: /api/canais/whatsapp (legado: JSON `whatsapp_official` em `configuracoes_sistema`, lido por /api/whatsapp/send) |
| /api/contrato-documentos | `app/api/contrato-documentos/route.ts` | GET, POST, DELETE, PATCH | vendas | contrato_documentos, contrato_modelos, contratos_venda | contrato_documentos (IUD) | storage `contratos`: remove | usuário | sessão+papel owner/admin | — |
| /api/contrato-modelo | `app/api/contrato-modelo/route.ts` | GET, POST | vendas | contrato_modelos | contrato_modelos (IU) | — | usuário | sessão+papel owner/admin | — |
| /api/cron/[job]<br><sub>jobs: expirar-trials, arquivar-eventos, sync-stripe, gerar-followups, sync-fipe, renovar-tokens, reter-audio, ponte-vendas</sub> | `app/api/cron/[job]/route.ts` | GET | core | empresas, configuracoes_sistema, leads, funil_etapas, visitas, campanhas_fidelidade, clientes, vendas, automacoes, complementos_empresa, planos_config, empresa_usuarios, chamadas, cadencia_passos, cadencia_inscricoes, canais_conectados, lead_mensagens, zapintel_venda_lead | empresas (U), stripe_eventos (D), followups_gerados (USD), tarefas (I), cadencia_inscricoes (I), fipe_referencia (U), canais_conectados (U), lead_mensagens (U), zapintel_midia_retida (I), zapintel_venda_lead (S) | rpc `zapintel_leads_com_conversa`; storage `chat-midia`: remove; Stripe API; Graph API (renovar-tokens) | service (+ `planos_config` via createClient sem cookie em lib/stripe.getPlanos) | CRON_SECRET (Bearer, `timingSafeEqual`) | DUP: /api/superadmin/sync-stripe (job sync-stripe), /api/superadmin/fipe (job sync-fipe); gatilhos manuais de partes de gerar-followups: /api/leads/pontuar, /api/reativacao |
| /api/dashboard | `app/api/dashboard/route.ts` | GET | core | vendas, clientes, leads, inventario_unidades, garantias_assistencias, empresa_usuarios, metas_comissoes, empresas | — | — | usuário | sessão (escopo por papel via lib/escopo) | — |
| /api/distribuicao | `app/api/distribuicao/route.ts` | POST, DELETE | core | distribuicao_regras | distribuicao_regras (IUD) | — | usuário | sessão+papel owner/admin/superadmin | — |

#### /api/empresa

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/empresa | `app/api/empresa/route.ts` | PATCH | core | empresas | empresas (U) | — | misto | sessão+papel owner/admin | — |

#### /api/equipe/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/equipe/atualizar-usuario | `app/api/equipe/atualizar-usuario/route.ts` | PATCH | core | empresa_usuarios, filiais | empresa_usuarios (U), usuarios (U) | — | service | sessão+papel owner/admin/superadmin + hierarquia de papel | — |
| /api/equipe/criar-usuario | `app/api/equipe/criar-usuario/route.ts` | POST | core | filiais, usuarios, empresa_usuarios, empresas, leads | usuarios (UD), empresa_usuarios (IU) | auth.admin.createUser / deleteUser | misto | sessão+papel owner/admin/superadmin + limite do plano | — |
| /api/equipe/online | `app/api/equipe/online/route.ts` | GET | core | acessos | — | — | usuário | sessão+papel owner/admin | — |
| /api/equipe/remover-usuario | `app/api/equipe/remover-usuario/route.ts` | POST | core | — | empresa_usuarios (U), inventario_unidades (U) | — | service | sessão+papel owner/admin/superadmin + hierarquia de papel | — |

#### /api/estoque/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/estoque/confirmar-chegada | `app/api/estoque/confirmar-chegada/route.ts` | POST | estoque | — | inventario_unidades (U) | — | usuário | sessão | — |
| /api/estoque/transferir | `app/api/estoque/transferir/route.ts` | POST | estoque | filiais, inventario_unidades | inventario_unidades (U), movimentacao_estoque (I) | — | usuário | sessão+papel owner/admin | — |

#### /api/exportar · /api/filial

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/exportar | `app/api/exportar/route.ts` | GET | core | empresas, leads, clientes, vendas, imoveis, negocios_imobiliarios, visitas | — | — | usuário | sessão+permissão `exportar` do papel | — |
| /api/filial/selecionar | `app/api/filial/selecionar/route.ts` | POST | core | filiais | usuarios (U) | — | service | sessão+papel owner/admin | — |

#### /api/fipe/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/fipe/opcoes | `app/api/fipe/opcoes/route.ts` | GET | avaliacao | fipe_referencia | fipe_referencia (U) | API externa FIPE | service (lib/fipe) | sessão | — |
| /api/fipe/valor | `app/api/fipe/valor/route.ts` | POST | avaliacao | fipe_consultas, fipe_referencia | fipe_consultas (S), fipe_referencia (U) | API externa FIPE | service (lib/fipe) | sessão | — |

#### /api/funil · /api/funis · /api/garantia

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/funil | `app/api/funil/route.ts` | POST | core | funis, funil_etapas, leads | funil_etapas (IUD), leads (U) | — | service | sessão+papel owner/admin/superadmin | não (complementar a /api/funis: aqui só as etapas de um funil) |
| /api/funis | `app/api/funis/route.ts` | POST, PATCH, DELETE | core | funis, funil_etapas, leads | funis (IUD), funil_etapas (I) | — | usuário | sessão+papel owner/admin | não (complementar a /api/funil: aqui os funis; POST copia etapas) |
| /api/garantia/termo | `app/api/garantia/termo/route.ts` | POST, GET | assistencia | vendas_termos | vendas_termos (U) | storage `documentos`: upload, remove, createSignedUrl | usuário | sessão | — |

#### /api/imob/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/imob/[slug]/lead | `app/api/imob/[slug]/lead/route.ts` | OPTIONS, POST | imoveis | empresas, imoveis, configuracoes_sistema, distribuicao_regras, empresa_usuarios, filiais | leads (I), lead_mensagens (I), configuracoes_sistema (S), distribuicao_regras (U) | rpc `rate_limit_bump` | service | ⚠ token/slug público — `?token=` comparado (`!==`) ao token de portais em `configuracoes_sistema`; rate limit por IP 20/h; CORS `*` | DUP parcial: /api/portais/[slug]/leads (mesmo fluxo lead+imóvel+roleta+mensagem, payload do site) |
| /api/imob/comissao-config | `app/api/imob/comissao-config/route.ts` | POST | imoveis | — | configuracoes_sistema (S) | — | service | sessão+papel owner/admin | — |
| /api/imob/negocios | `app/api/imob/negocios/route.ts` | POST, PATCH | imoveis | imoveis, configuracoes_sistema, negocios_imobiliarios, empresa_usuarios | imoveis (U), negocios_imobiliarios (IU) | — | service | sessão+papel owner/admin/vendedor (comissão manual e status de comissão: owner/admin) | — |

#### /api/leads/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/leads/atribuir | `app/api/leads/atribuir/route.ts` | POST | core | leads | leads (U), lead_atribuicoes (I) | — | usuário | sessão (transferir: owner/admin; devolver: responsável ou admin) | — |
| /api/leads/distribuir | `app/api/leads/distribuir/route.ts` | POST | core | leads, empresa_usuarios, distribuicao_regras, configuracoes_sistema, filiais | leads (U), lead_atribuicoes (I), distribuicao_regras (U), configuracoes_sistema (S) | — | service | sessão (lote `esteira`: owner/admin/superadmin) | — |
| /api/leads/mover | `app/api/leads/mover/route.ts` | POST | core | funis, funil_etapas, leads, automacoes, configuracoes_sistema, empresa_usuarios, cadencias, cadencia_passos, cadencia_inscricoes | leads (U), tarefas (I), cadencia_inscricoes (I) | — | usuário | sessão | — |
| /api/leads/pontuar | `app/api/leads/pontuar/route.ts` | POST | core | leads, funil_etapas, chamadas, cadencia_passos, cadencia_inscricoes, configuracoes_sistema | cadencia_inscricoes (I) | — | service | sessão+papel owner/admin/superadmin | DUP: /api/cron/[job] (gerar-followups chama o mesmo `reavaliarScores`; gatilho manual) |

#### /api/marketing · /api/match · /api/menu-config · /api/menu · /api/metas

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/marketing | `app/api/marketing/route.ts` | POST, PATCH, DELETE | core | — | solicitacoes_marketing (IUD) | — | usuário | sessão (DELETE: owner/admin ou autor) | — |
| /api/match/lead/[id] | `app/api/match/lead/[id]/route.ts` | GET | imoveis | empresas, leads, inventario_unidades, lead_perfil_busca, imoveis | — | — | usuário | sessão | — |
| /api/menu-config | `app/api/menu-config/route.ts` | POST | core | — | empresas (U) | — | service | sessão+papel owner/admin/superadmin | — |
| /api/menu/[slug]/pedido | `app/api/menu/[slug]/pedido/route.ts` | OPTIONS, POST | sem módulo (pedido público de cardápio/restaurante) | empresas, produtos | pedidos (I) | rpc `rate_limit_bump` | service | ⚠ token/slug público — slug da empresa + segmento com cardápio; rate limit por IP 30/h; CORS | — |
| /api/metas | `app/api/metas/route.ts` | POST | core | metas_comissoes | metas_comissoes (IU) | — | service | sessão+papel owner/admin/superadmin | DUP: /api/ranking/metas (meta mensal por pessoa; aqui em `metas_comissoes`, lá em `metas`) |

#### /api/modelos/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/modelos/[id] | `app/api/modelos/[id]/route.ts` | DELETE | core | modelos_mensagem, canais_conectados | modelos_mensagem (D) | Graph API WhatsApp (apagar modelo) | service | sessão+papel owner/admin | — |
| /api/modelos | `app/api/modelos/route.ts` | GET, POST | core | canais_conectados, modelos_mensagem | modelos_mensagem (S) | Graph API WhatsApp (listar/criar modelo) | misto | GET: sessão (qualquer papel); POST: owner/admin | — |

#### /api/orcamento · /api/orcamentos · /api/os

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/orcamento/[token] | `app/api/orcamento/[token]/route.ts` | OPTIONS, POST | assistencia | orcamentos, leads, inventario_unidades | orcamentos (U), garantias_assistencias (I), inventario_unidades (IU), vendas (I), vendas_pagamentos (I), lancamentos_financeiros (I) | — | service | ⚠ token/slug público — token do orçamento na URL (`orcamentos.token`); claim atômico de status; CORS; sem rate limit | — |
| /api/orcamentos | `app/api/orcamentos/route.ts` | POST, DELETE | assistencia | troca_cotacoes, clientes | orcamentos (IUD) | — | usuário | sessão | — |
| /api/os/[token] | `app/api/os/[token]/route.ts` | POST | assistencia | garantias_assistencias | garantias_assistencias (U), tarefas (I) | — | service | ⚠ token/slug público — token da OS na URL (`garantias_assistencias.token`); claim atômico; sem rate limit | — |

#### /api/payments/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/payments/charge | `app/api/payments/charge/route.ts` | POST | financeiro | tenant_payment_config | cobrancas (I) | API do provedor de pagamento | usuário | sessão | — |
| /api/payments/config | `app/api/payments/config/route.ts` | POST, GET | financeiro | tenant_payment_config | tenant_payment_config (S) | — | usuário | sessão+papel owner/admin | — |
| /api/payments/webhook/[provider] | `app/api/payments/webhook/[provider]/route.ts` | POST | financeiro | payment_webhook_eventos, cobrancas, tenant_payment_config, lancamentos_financeiros | payment_webhook_eventos (I), cobrancas (U), lancamentos_financeiros (I) | — | service | ⚠ assinatura webhook — HMAC por provedor com a credencial do tenant (sem segredo configurado → recusa); idempotência em `payment_webhook_eventos`; leituras de `cobrancas`/`tenant_payment_config` acontecem antes da assinatura | — |

#### /api/permissoes · /api/planos-publicos

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/permissoes | `app/api/permissoes/route.ts` | POST | core | — | empresas (U) | — | service | sessão+papel owner/admin/superadmin | — |
| /api/planos-publicos | `app/api/planos-publicos/route.ts` | GET | financeiro | planos_config | — | — | service | ⚠ nenhuma — só leitura de `planos_config` (planos ativos) | — |

#### /api/portais/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/portais/[slug]/leads | `app/api/portais/[slug]/leads/route.ts` | GET, POST | imoveis | empresas, imoveis, configuracoes_sistema, distribuicao_regras, empresa_usuarios, filiais | leads (I), lead_mensagens (I), configuracoes_sistema (S), distribuicao_regras (U) | — | service | ⚠ token/slug público — GET = health-check sem auth; POST: `?token=` comparado ao token de portais; sem rate limit | DUP parcial: /api/imob/[slug]/lead |
| /api/portais/[slug] | `app/api/portais/[slug]/route.ts` | GET | imoveis | empresas, imoveis | — | — | service | ⚠ nenhuma — só o slug; feed XML de imóveis com `publicar_portais` | — |

#### /api/propostas · /api/push · /api/ranking

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/propostas | `app/api/propostas/route.ts` | POST, PATCH, DELETE | vendas | — | propostas (IUD) | — | usuário | sessão (via `getEmpresaId`, redireciona sem login) | — |
| /api/push/subscribe | `app/api/push/subscribe/route.ts` | POST, DELETE | core | — | push_subscriptions (SD) | — | usuário | sessão | — |
| /api/ranking/metas | `app/api/ranking/metas/route.ts` | POST, DELETE | core | — | metas (ID) | — | usuário | sessão+papel owner/admin/superadmin | DUP: /api/metas |

#### /api/rastreamento/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/rastreamento/config | `app/api/rastreamento/config/route.ts` | GET, PATCH | rastreamento | rastreamento_config | rastreamento_config (IS) | — | service (rastrDb) | sessão+papel owner/admin | — |
| /api/rastreamento/lead-origin | `app/api/rastreamento/lead-origin/route.ts` | OPTIONS, POST | rastreamento | rastreamento_config, rastreamento_links, rastreamento_visitas | rastreamento_visitas (IU), rastreamento_eventos (I) | — | service (rastrDb) | ⚠ token/slug público — `company_token` = `rastreamento_config.public_token` (vai embutido no pixel da LP); CORS `*`; sem rate limit | — |
| /api/rastreamento/links/[id] | `app/api/rastreamento/links/[id]/route.ts` | PATCH, DELETE | rastreamento | — | rastreamento_links (UD) | — | service (rastrDb) | sessão+papel owner/admin | — |
| /api/rastreamento/links | `app/api/rastreamento/links/route.ts` | GET, POST | rastreamento | rastreamento_links, rastreamento_visitas | rastreamento_links (I) | — | service (rastrDb) | sessão+papel owner/admin | — |
| /api/rastreamento/purchase | `app/api/rastreamento/purchase/route.ts` | OPTIONS, POST | rastreamento | rastreamento_config, rastreamento_visitas | rastreamento_eventos (IU) | Meta Conversions API | service (rastrDb) | ⚠ token/slug público — `company_token` público (mesmo do pixel); CORS `*`; sem rate limit; dispara Meta CAPI | — |

#### /api/reativacao · /api/register · /api/reservas · /api/scoring

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/reativacao | `app/api/reativacao/route.ts` | POST | core | configuracoes_sistema, cadencia_passos, funil_etapas, leads, cadencia_inscricoes | configuracoes_sistema (S), cadencia_inscricoes (I) | — | service | sessão+papel owner/admin/superadmin | DUP: /api/cron/[job] (`executar` chama o mesmo `reativarFrios` de gerar-followups; gatilho manual) |
| /api/register | `app/api/register/route.ts` | POST | core | planos_config | empresas (ID), empresa_usuarios (ID), usuarios (S), motivos_perda (I) | rpc `rate_limit_bump`; auth.admin.createUser / deleteUser | service | ⚠ nenhuma — cadastro público; rate limit por IP 5/h; cria usuário por `auth.admin.createUser` | — |
| /api/reservas | `app/api/reservas/route.ts` | POST, DELETE | vendas | inventario_unidades, leads | inventario_unidades (U), leads (U) | — | service | sessão (qualquer papel; cancelar: quem reservou ou owner/admin) | — |
| /api/scoring | `app/api/scoring/route.ts` | POST | core | — | configuracoes_sistema (S) | — | service | sessão+papel owner/admin/superadmin | — |

#### /api/stripe/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/stripe/checkout | `app/api/stripe/checkout/route.ts` | POST | financeiro | empresas, planos_config | empresas (U) | Stripe API | usuário (lib/stripe) | sessão+papel owner/admin | — |
| /api/stripe/portal | `app/api/stripe/portal/route.ts` | POST | financeiro | empresas | — | Stripe API | usuário | sessão+papel owner/admin | — |
| /api/stripe/verificar-sessao | `app/api/stripe/verificar-sessao/route.ts` | GET | financeiro | — | — | Stripe API | usuário | sessão (sessão Stripe precisa ser da empresa) | — |
| /api/stripe/webhook | `app/api/stripe/webhook/route.ts` | POST | financeiro | stripe_eventos, planos_config | stripe_eventos (I), empresas (U) | — | service (+ `planos_config` via createClient sem cookie em lib/stripe.getPlanos) | ⚠ assinatura webhook — `stripe.webhooks.constructEvent` com STRIPE_WEBHOOK_SECRET; idempotência em `stripe_eventos` | — |

#### /api/superadmin/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/superadmin/admins | `app/api/superadmin/admins/route.ts` | POST, DELETE | superadmin | usuarios | superadmin_logs (I) | rpc `set_super_admin` | misto | superadmin | — |
| /api/superadmin/assistente/modelos | `app/api/superadmin/assistente/modelos/route.ts` | GET | superadmin | — | — | API Anthropic (lista modelos) | — (sem banco) | superadmin | — |
| /api/superadmin/assistente | `app/api/superadmin/assistente/route.ts` | GET, POST | superadmin | assistente_uso, empresas | assistente_config (S) | — | service | superadmin | não (/api/assistente é o chat) |
| /api/superadmin/avisos | `app/api/superadmin/avisos/route.ts` | POST, PATCH, DELETE | superadmin | — | avisos_plataforma (IUD), superadmin_logs (I) | — | service | superadmin | — |
| /api/superadmin/empresas/[id]/addons | `app/api/superadmin/empresas/[id]/addons/route.ts` | PATCH | superadmin | — | complementos_empresa (S), superadmin_logs (I) | — | service (rastrDb) | superadmin | — |
| /api/superadmin/empresas/[id]/excluir | `app/api/superadmin/empresas/[id]/excluir/route.ts` | DELETE | superadmin | empresas, configuracoes_sistema | superadmin_logs (I) | rpc `hard_delete_empresa` | misto | superadmin | — |
| /api/superadmin/empresas/[id]/exportar | `app/api/superadmin/empresas/[id]/exportar/route.ts` | GET | superadmin | empresas, empresa_usuarios, leads, lead_mensagens, clientes, vendas, produtos, imoveis, proprietarios, visitas, tarefas, cobrancas, lancamentos_financeiros, comissoes | superadmin_logs (I) | — | service | superadmin | — |
| /api/superadmin/empresas/[id]/impersonar | `app/api/superadmin/empresas/[id]/impersonar/route.ts` | POST, DELETE | superadmin | empresas | superadmin_logs (I) | rpc `set_impersonation`; rpc `encerrar_impersonacao`; cookie `impersonating_empresa_id` | misto | superadmin | — |
| /api/superadmin/empresas/[id]/overrides | `app/api/superadmin/empresas/[id]/overrides/route.ts` | PATCH | superadmin | — | empresas (U), superadmin_logs (I) | — | service | superadmin | — |
| /api/superadmin/empresas/[id] | `app/api/superadmin/empresas/[id]/route.ts` | POST | superadmin | — | empresas (U), superadmin_logs (I) | — | misto | superadmin | — |
| /api/superadmin/fipe | `app/api/superadmin/fipe/route.ts` | POST | superadmin | — | fipe_referencia (U), superadmin_logs (I) | API externa FIPE | service (lib/fipe) | superadmin | DUP: /api/cron/[job] (sync-fipe; mesmo `atualizarReferencia`) |
| /api/superadmin/laboratorio/preview | `app/api/superadmin/laboratorio/preview/route.ts` | POST | superadmin | empresas | empresas (I), superadmin_logs (I) | rpc `set_impersonation`; cookie `impersonating_empresa_id` | misto | superadmin | DUP: /api/superadmin/segmentos/[chave]/preview (mesma empresa `__preview__` + `set_impersonation`; só não troca o segmento) |
| /api/superadmin/planos | `app/api/superadmin/planos/route.ts` | GET, PATCH | superadmin | planos_config | planos_config (U) | — | misto | superadmin (`requireSuperAdmin`, redireciona) | — |
| /api/superadmin/segmentos/[chave]/preview | `app/api/superadmin/segmentos/[chave]/preview/route.ts` | POST | superadmin | segmentos_config, empresas | empresas (IU), superadmin_logs (I) | rpc `set_impersonation`; cookie `impersonating_empresa_id` | misto | superadmin | DUP: /api/superadmin/laboratorio/preview |
| /api/superadmin/segmentos | `app/api/superadmin/segmentos/route.ts` | POST | superadmin | segmentos_config | segmentos_config (S), superadmin_logs (I) | — | service | superadmin | — |
| /api/superadmin/sync-stripe | `app/api/superadmin/sync-stripe/route.ts` | POST | superadmin | empresas, planos_config | empresas (U) | Stripe API | service (+ `planos_config` via createClient em lib/stripe.getPlanos) | superadmin | DUP: /api/cron/[job] (sync-stripe; código copiado) |

#### /api/taxas

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/taxas | `app/api/taxas/route.ts` | GET | financeiro | taxas_pagamento | — | — | usuário | sessão | — |

#### /api/troca/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/troca/cotacoes/buscar | `app/api/troca/cotacoes/buscar/route.ts` | GET | avaliacao | troca_cotacoes | — | — | usuário | sessão | — |
| /api/troca/cotacoes | `app/api/troca/cotacoes/route.ts` | POST, DELETE | avaliacao | troca_precos, troca_regras, clientes, leads, empresas | troca_cotacoes (IUD) | — | usuário | sessão + módulo de troca liberado (`cotacaoDeTrocaLiberada`) | — |
| /api/troca/precos/familia | `app/api/troca/precos/familia/route.ts` | POST | avaliacao | troca_precos, empresas | troca_precos (IU) | — | usuário | sessão + módulo de troca liberado | não (lote por família; /api/troca/precos grava uma linha) |
| /api/troca/precos | `app/api/troca/precos/route.ts` | POST | avaliacao | troca_precos, empresas | troca_precos (IU) | — | usuário | sessão + módulo de troca liberado | — |
| /api/troca/regras | `app/api/troca/regras/route.ts` | POST | avaliacao | empresas | troca_regras (S) | — | usuário | sessão + módulo de troca liberado | — |

#### /api/veiculos · /api/webhook · /api/whatsapp · /api/zapintel · /i · /track.js

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /api/veiculos/[slug] | `app/api/veiculos/[slug]/route.ts` | GET | avaliacao | empresas, inventario_unidades, produtos | — | — | service | ⚠ nenhuma — só o slug + segmento com placa; feed XML do estoque | — |
| /api/webhook/c2s/[slug] | `app/api/webhook/c2s/[slug]/route.ts` | GET, POST | imoveis | empresas, leads, usuarios, empresa_usuarios, configuracoes_sistema, distribuicao_regras, filiais | integracao_eventos (I), leads (IU), lead_perfil_busca (I), configuracoes_sistema (S), distribuicao_regras (U) | rpc `rate_limit_bump` | service | ⚠ token/slug público — GET = health-check sem auth; POST: `?token=` comparado (`!==`) a `entrada` da config C2S; rate limit 300/h por empresa; registra em `integracao_eventos` | — |
| /api/whatsapp/send | `app/api/whatsapp/send/route.ts` | POST | core | configuracoes_sistema | — | Graph API WhatsApp (config legada `whatsapp_official`) | usuário | sessão | — |
| /api/zapintel/preview | `app/api/zapintel/preview/route.ts` | GET, POST | inteligencia | empresas | — | cookie `nexus_preview_empresa` | usuário | superadmin + mesma origem (Origin/Sec-Fetch-Site) | — |
| /i/[codigo] | `app/i/[codigo]/route.ts` | GET | rastreamento | rastreamento_links | rastreamento_visitas (IU), rastreamento_eventos (I) | — | service (rastrDb) | ⚠ nenhuma — id numérico do link; link inativo redireciona para `/`; grava visita e evento | — |
| /track.js | `app/track.js/route.ts` | GET | rastreamento | — | — | serve o JS do pixel (estático, 1 h) | — (sem banco) | nenhuma | — |

#### /zapintel/api/*

| Rota | Arquivo | Métodos | Módulo novo | Tabelas lidas | Tabelas escritas | RPC/Storage | Client | Auth | Dup? |
|---|---|---|---|---|---|---|---|---|---|
| /zapintel/api/conversa | `app/zapintel/api/conversa/route.ts` | GET | inteligencia | zapintel_venda_lead, vendas, empresas, leads, motivos_perda, empresa_usuarios, lead_mensagens, zapintel_lead_perfil, assistente_config | — | — | service (rastrDb) | sessão+papel owner/admin/superadmin + ZapIntel ativo + loja visível (`zapintelAcesso`) | — |
| /zapintel/api/perfil/pendentes | `app/zapintel/api/perfil/pendentes/route.ts` | GET | inteligencia | leads, assistente_config | — | rpc `zapintel_analises_pendentes` | service (rastrDb) | sessão+papel owner/admin/superadmin + ZapIntel ativo (`zapintelAcesso`) | — |
| /zapintel/api/perfil | `app/zapintel/api/perfil/route.ts` | POST | inteligencia | zapintel_venda_lead, vendas, empresas, leads, motivos_perda, empresa_usuarios, lead_mensagens, zapintel_lead_perfil, assistente_config | zapintel_lead_perfil (S), assistente_uso (I) | rpc `rate_limit_bump`; API Anthropic | service (rastrDb) | sessão+papel owner/admin/superadmin + ZapIntel ativo + rate limit por usuário 120/h | — |
| /zapintel/api/sugestao | `app/zapintel/api/sugestao/route.ts` | POST | inteligencia | zapintel_venda_lead, empresas, leads, motivos_perda, empresa_usuarios, lead_mensagens, assistente_config | assistente_uso (I) | rpc `rate_limit_bump`; API Anthropic | service (rastrDb) | sessão+papel owner/admin/superadmin + ZapIntel ativo + rate limit por usuário 40/h | — |

#### Resumo

**Rotas por módulo novo**

| Módulo | Rotas |
|---|---|
| core | 48 |
| vendas | 5 |
| estoque | 2 |
| avaliacao | 9 |
| assistencia | 4 |
| financeiro | 9 |
| rastreamento | 7 |
| imoveis | 9 |
| inteligencia | 7 |
| superadmin | 16 |
| sem módulo | 1 |
| **total** | **117** |

**Rotas por tipo de client**

| Client | Rotas |
|---|---|
| usuário | 41 |
| service | 57 |
| misto | 16 |
| sem banco | 3 |
| **total** | **117** |

**⚠ Service key + chamável sem sessão (16)**

| Rota | Tipo | Validação existente |
|---|---|---|
| /api/agendar/[slug] | token/slug público | slug da empresa; segmento precisa ter agenda (senão 404); rate limit por IP 20/h (`rate_limit_bump`); CORS `*` |
| /api/imob/[slug]/lead | token/slug público | `?token=` comparado (`!==`) ao token de portais em `configuracoes_sistema`; rate limit por IP 20/h; CORS `*` |
| /api/menu/[slug]/pedido | token/slug público | slug da empresa + segmento com cardápio; rate limit por IP 30/h; CORS |
| /api/orcamento/[token] | token/slug público | token do orçamento na URL (`orcamentos.token`); claim atômico de status; CORS; sem rate limit |
| /api/os/[token] | token/slug público | token da OS na URL (`garantias_assistencias.token`); claim atômico; sem rate limit |
| /api/payments/webhook/[provider] | assinatura webhook | HMAC por provedor com a credencial do tenant (sem segredo configurado → recusa); idempotência em `payment_webhook_eventos`; leituras de `cobrancas`/`tenant_payment_config` acontecem antes da assinatura |
| /api/planos-publicos | nenhuma | só leitura de `planos_config` (planos ativos) |
| /api/portais/[slug]/leads | token/slug público | GET = health-check sem auth; POST: `?token=` comparado ao token de portais; sem rate limit |
| /api/portais/[slug] | nenhuma | só o slug; feed XML de imóveis com `publicar_portais` |
| /api/rastreamento/lead-origin | token/slug público | `company_token` = `rastreamento_config.public_token` (vai embutido no pixel da LP); CORS `*`; sem rate limit |
| /api/rastreamento/purchase | token/slug público | `company_token` público (mesmo do pixel); CORS `*`; sem rate limit; dispara Meta CAPI |
| /api/register | nenhuma | cadastro público; rate limit por IP 5/h; cria usuário por `auth.admin.createUser` |
| /api/stripe/webhook | assinatura webhook | `stripe.webhooks.constructEvent` com STRIPE_WEBHOOK_SECRET; idempotência em `stripe_eventos` |
| /api/veiculos/[slug] | nenhuma | só o slug + segmento com placa; feed XML do estoque |
| /api/webhook/c2s/[slug] | token/slug público | GET = health-check sem auth; POST: `?token=` comparado (`!==`) a `entrada` da config C2S; rate limit 300/h por empresa; registra em `integracao_eventos` |
| /i/[codigo] | nenhuma | id numérico do link; link inativo redireciona para `/`; grava visita e evento |

**DUP (13 rotas)**

| Rota | Duplica |
|---|---|
| /api/canais/whatsapp | /api/configuracoes/whatsapp-official (mesma conexão WhatsApp Cloud; esta grava em `canais_conectados`) |
| /api/configuracoes/whatsapp-official | /api/canais/whatsapp (legado: JSON `whatsapp_official` em `configuracoes_sistema`, lido por /api/whatsapp/send) |
| /api/cron/[job] | /api/superadmin/sync-stripe (job sync-stripe), /api/superadmin/fipe (job sync-fipe); gatilhos manuais de partes de gerar-followups: /api/leads/pontuar, /api/reativacao |
| /api/imob/[slug]/lead | (parcial) /api/portais/[slug]/leads (mesmo fluxo lead+imóvel+roleta+mensagem, payload do site) |
| /api/leads/pontuar | /api/cron/[job] (gerar-followups chama o mesmo `reavaliarScores`; gatilho manual) |
| /api/metas | /api/ranking/metas (meta mensal por pessoa; aqui em `metas_comissoes`, lá em `metas`) |
| /api/portais/[slug]/leads | (parcial) /api/imob/[slug]/lead |
| /api/ranking/metas | /api/metas |
| /api/reativacao | /api/cron/[job] (`executar` chama o mesmo `reativarFrios` de gerar-followups; gatilho manual) |
| /api/superadmin/fipe | /api/cron/[job] (sync-fipe; mesmo `atualizarReferencia`) |
| /api/superadmin/laboratorio/preview | /api/superadmin/segmentos/[chave]/preview (mesma empresa `__preview__` + `set_impersonation`; só não troca o segmento) |
| /api/superadmin/segmentos/[chave]/preview | /api/superadmin/laboratorio/preview |
| /api/superadmin/sync-stripe | /api/cron/[job] (sync-stripe; código copiado) |

**Pares suspeitos conferidos e descartados (5 rotas)**

| Rota | Motivo |
|---|---|
| /api/assistente | /api/superadmin/assistente é painel de uso/config, não chat |
| /api/funil | complementar a /api/funis: aqui só as etapas de um funil |
| /api/funis | complementar a /api/funil: aqui os funis; POST copia etapas |
| /api/superadmin/assistente | /api/assistente é o chat |
| /api/troca/precos/familia | lote por família; /api/troca/precos grava uma linha |

---

## 3. Acoplamento entre módulos

| # | Arquivo:linha | Módulo de origem | Módulo/tabela acessada | Operação (lê/escreve/import) | Interface que o core precisa oferecer |
|---|---|---|---|---|---|
| 1 | `app/(dashboard)/agenda/agenda-view.tsx:9` | core | saude (fora dos 10)/`components/modules/saude/lista-espera` | import | `saude.ListaEspera (componente) + tipo Espera` |
| 2 | `app/(dashboard)/agenda/agenda-view.tsx:249` | core | imoveis/`imoveis` (embed no retorno do insert de visitas) | lê | `imoveis.resumoImovel(id) — embutido na visita` |
| 3 | `app/(dashboard)/agenda/page.tsx:37` | core | imoveis/`imoveis` (embed) | lê | `imoveis.resumoImovel(id) — embutido na visita` |
| 4 | `app/(dashboard)/agenda/page.tsx:46` | core | imoveis/`imoveis` | lê | `imoveis.listarImoveis(empresa)` |
| 5 | `app/(dashboard)/assistencia/components/os-modal.tsx:129` | assistencia | vendas/`vendas` | lê | `vendas.vendaConcluidaPorSerie(serie)` |
| 6 | `app/(dashboard)/assistencia/components/os-modal.tsx:140` | assistencia | estoque/`inventario_unidades` | lê | `estoque.unidadesPorIdentificador(imei|serie)` |
| 7 | `app/(dashboard)/assistencia/components/os-modal.tsx:147` | assistencia | vendas/`vendas` | lê | `vendas.vendaConcluidaPorUnidades(unidadeIds)` |
| 8 | `app/(dashboard)/assistencia/components/os-modal.tsx:229` | assistencia | estoque/`produtos` | lê | `estoque.listarProdutos(empresa)` |
| 9 | `app/(dashboard)/assistencia/page.tsx:8` | assistencia | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na OS` |
| 10 | `app/(dashboard)/cardapio/cardapio-view.tsx:46` | food (fora dos 10) | estoque/`produtos` | escreve (insert) | `estoque.criarProduto(dados)` |
| 11 | `app/(dashboard)/cardapio/cardapio-view.tsx:47` | food (fora dos 10) | estoque/`produtos` | escreve (update) | `estoque.atualizarProduto(id, dados)` |
| 12 | `app/(dashboard)/cardapio/cardapio-view.tsx:54` | food (fora dos 10) | estoque/`produtos` | escreve (update) | `estoque.alternarDisponibilidade(produtoId)` |
| 13 | `app/(dashboard)/cardapio/cardapio-view.tsx:60` | food (fora dos 10) | estoque/`produtos` | escreve (update) | `estoque.arquivarProduto(produtoId)` |
| 14 | `app/(dashboard)/cardapio/page.tsx:10` | food (fora dos 10) | estoque/`produtos` | lê | `estoque.listarProdutos(empresa)` |
| 15 | `app/(dashboard)/cardapio/page.tsx:11` | food (fora dos 10) | estoque/`categorias_produtos` | lê | `estoque.listarCategorias(empresa)` |
| 16 | `app/(dashboard)/clientes/components/cliente-modal-imob.tsx:156` | core | imoveis/`lead_perfil_busca` | lê | `imoveis.perfilDeBusca(contato)` |
| 17 | `app/(dashboard)/clientes/components/cliente-modal-imob.tsx:176` | core | imoveis/`negocios_imobiliarios` | lê | `imoveis.negociosDoContato(contato)` |
| 18 | `app/(dashboard)/clientes/components/cliente-modal-imob.tsx:471` | core | imoveis/`lead_perfil_busca` | escreve (update) | `imoveis.salvarPerfilDeBusca(contato, perfil)` |
| 19 | `app/(dashboard)/clientes/components/cliente-modal-imob.tsx:472` | core | imoveis/`lead_perfil_busca` | escreve (insert) | `imoveis.salvarPerfilDeBusca(contato, perfil)` |
| 20 | `app/(dashboard)/clientes/components/cliente-modal-imob.tsx:476` | core | imoveis/`lead_perfil_busca` | lê | `imoveis.perfilDeBusca(contato)` |
| 21 | `app/(dashboard)/clientes/components/cliente-modal.tsx:9` | core | vendas/`lib/cliente-contrato` | import | `vendas.camposFaltantesContrato(contato)` |
| 22 | `app/(dashboard)/dashboard/dashboard-imob.tsx:84` | core | imoveis/`imoveis` (embed) | lê | `imoveis.resumoImovel(id) — embutido na visita` |
| 23 | `app/(dashboard)/dashboard/dashboard-imob.tsx:112` | core | imoveis/`imoveis` | lê | `imoveis.contarImoveis(empresa, filtro)` |
| 24 | `app/(dashboard)/dashboard/dashboard-imob.tsx:113` | core | imoveis/`imoveis` | lê | `imoveis.contarImoveis(empresa, filtro)` |
| 25 | `app/(dashboard)/dashboard/dashboard-imob.tsx:125` | core | imoveis/`imoveis` | lê | `imoveis.listarImoveis(empresa, filtro)` |
| 26 | `app/(dashboard)/dashboard/page.tsx:39` | core | vendas/`vendas` | lê | `vendas.listarVendas(empresa, periodo)` |
| 27 | `app/(dashboard)/dashboard/page.tsx:43` | core | estoque/`inventario_unidades` | lê | `estoque.contarUnidades(empresa, status)` |
| 28 | `app/(dashboard)/dashboard/page.tsx:44` | core | assistencia/`garantias_assistencias` | lê | `assistencia.contarOrdensAbertas(empresa)` |
| 29 | `app/(dashboard)/dashboard/page.tsx:45` | core | vendas/`vendas` + estoque/`produtos` (embed) | lê | `vendas.vendasRecentes(empresa, n) + estoque.nomeProduto(id)` |
| 30 | `app/(dashboard)/dashboard/page.tsx:46` | core | vendas/`vendas` + estoque/`produtos` (embed) | lê | `vendas.produtosMaisVendidos(empresa, periodo)` |
| 31 | `app/(dashboard)/design/page.tsx:2` | core | superadmin/`lib/superadmin` | import | `superadmin.exigirSuperAdmin()` |
| 32 | `app/(dashboard)/equipe/components/equipe-view.tsx:370` | core | vendas/`vendas` | lê | `vendas.totalPorVendedor(empresa, mes)` |
| 33 | `app/(dashboard)/equipe/components/equipe-view.tsx:372` | core | vendas/`comissoes` | lê | `vendas.comissoesDoMes(empresa, mes)` |
| 34 | `app/(dashboard)/equipe/components/equipe-view.tsx:380` | core | estoque/`inventario_unidades` | lê | `estoque.gruposComTrocaPendente(empresa)` |
| 35 | `app/(dashboard)/equipe/components/equipe-view.tsx:398` | core | vendas/`comissoes` | escreve (insert) | `vendas.registrarComissaoPaga(usuario, mes, valor, percentual)` |
| 36 | `app/(dashboard)/equipe/page.tsx:28` | core | vendas/`vendas` | lê | `vendas.totalPorVendedor(empresa, mes)` |
| 37 | `app/(dashboard)/equipe/page.tsx:34` | core | vendas/`comissoes` | lê | `vendas.comissoesDoMes(empresa, mes)` |
| 38 | `app/(dashboard)/estoque/components/unidade-modal.tsx:73` | estoque | vendas/`fornecedores` | lê | `vendas.listarFornecedores(empresa)` |
| 39 | `app/(dashboard)/estoque/page.tsx:18` | estoque | vendas/`fornecedores` (embed) | lê | `vendas.nomeFornecedor(id) — embutido na unidade` |
| 40 | `app/(dashboard)/estoque/page.tsx:41` | estoque | vendas/`fornecedores` | lê | `vendas.listarFornecedores(empresa)` |
| 41 | `app/(dashboard)/executivo/page.tsx:58` | core | imoveis/`negocios_imobiliarios` | lê | `imoveis.negociosNoPeriodo(empresa, periodo)` |
| 42 | `app/(dashboard)/executivo/page.tsx:72` | core | imoveis/`negocios_imobiliarios` | lê | `imoveis.contatosComNegocio(empresa)` |
| 43 | `app/(dashboard)/executivo/page.tsx:112` | core | imoveis/`imoveis` | lê | `imoveis.resumoImoveis(ids)` |
| 44 | `app/(dashboard)/financeiro/components/financeiro-view.tsx:7` | financeiro | imoveis/`lib/comissao-imob` | import (tipo) | `imoveis.TaxasComissao (tipo)` |
| 45 | `app/(dashboard)/financeiro/page.tsx:4` | financeiro | imoveis/`lib/comissao-imob` | import | `imoveis.taxasDeComissao(empresa)` |
| 46 | `app/(dashboard)/financeiro/page.tsx:34` | financeiro | vendas/`vendas` | lê | `vendas.receitaNoPeriodo(empresa, periodo)` |
| 47 | `app/(dashboard)/financeiro/page.tsx:54` | financeiro | imoveis/`negocios_imobiliarios` | lê | `imoveis.negociosComComissao(empresa, periodo)` |
| 48 | `app/(dashboard)/financeiro/page.tsx:83` | financeiro | imoveis/`imoveis` | lê | `imoveis.resumoImoveis(ids)` |
| 49 | `app/(dashboard)/garantia/components/garantia-modal.tsx:86` | assistencia | estoque/`produtos` | lê | `estoque.listarProdutos(empresa)` |
| 50 | `app/(dashboard)/garantia/components/garantia-view.tsx:9` | assistencia | vendas/`lib/contrato-emitir` | import (tipo) | `vendas.DocumentoDisponivel (tipo)` |
| 51 | `app/(dashboard)/garantia/components/termos-view.tsx:9` | assistencia | vendas/`lib/contrato-tipos` | import | `vendas.imprimirContrato(html)` |
| 52 | `app/(dashboard)/garantia/components/termos-view.tsx:10` | assistencia | vendas/`lib/contrato-emitir` | import | `vendas.emitirContrato(input)` |
| 53 | `app/(dashboard)/garantia/page.tsx:2` | assistencia | vendas/`lib/contrato-emitir` | import | `vendas.documentosDisponiveis(empresa)` |
| 54 | `app/(dashboard)/garantia/page.tsx:14` | assistencia | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na OS` |
| 55 | `app/(dashboard)/garantia/page.tsx:26` | assistencia | vendas/`vendas_termos` + vendas/`vendas` (embed) + estoque/`produtos` (embed) | lê | `vendas.termosDeGarantia(empresa) (+ venda, + estoque.nomeProduto)` |
| 56 | `app/(dashboard)/garantia/page.tsx:71` | assistencia | estoque/`inventario_unidades` | lê | `estoque.unidadesPorGrupo(grupoPdv[])` |
| 57 | `app/(dashboard)/gestao-leads/page.tsx:108` | core | imoveis/`lead_perfil_busca` | lê | `imoveis.perfisDeBusca(contatoIds)` |
| 58 | `app/(dashboard)/historico/page.tsx:33` | vendas | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na venda` |
| 59 | `app/(dashboard)/layout.tsx:4` | core | superadmin/`components/superadmin/impersonation-banner` | import | `superadmin.BannerDeImpersonacao (componente)` |
| 60 | `app/(dashboard)/layout.tsx:13` | core | inteligencia/`components/assistente/assistente-widget` | import | `inteligencia.WidgetDoAssistente (componente)` |
| 61 | `app/(dashboard)/layout.tsx:86` | core | superadmin/`avisos_plataforma` | lê | `superadmin.avisosAtivos(empresa)` |
| 62 | `app/(dashboard)/layout.tsx:124` | core | superadmin/`segmentos_config` | lê | `superadmin.configDoSegmento(segmento)` |
| 63 | `app/(dashboard)/metas/page.tsx:34` | core | vendas/`vendas` | lê | `vendas.totalPorVendedor(empresa, mes)` |
| 64 | `app/(dashboard)/orcamentos/cotacao/cotacao-view.tsx:8` | avaliacao | assistencia/`app/(dashboard)/orcamentos/cliente-autocomplete` | import | `contatos.SeletorDeContato (componente hoje em assistencia)` |
| 65 | `app/(dashboard)/orcamentos/layout.tsx:2` | assistencia | avaliacao/`lib/troca-acesso` | import | `avaliacao.cotacaoDeTrocaLiberada(empresa)` |
| 66 | `app/(dashboard)/orcamentos/orcamentos-view.tsx:10` | assistencia | avaliacao/`components/modules/orcamentos/troca-modal` | import | `avaliacao.ModalDeTroca (componente)` |
| 67 | `app/(dashboard)/orcamentos/orcamentos-view.tsx:11` | assistencia | avaliacao/`components/modules/orcamentos/avaliar-aparelho` | import (tipo) | `avaliacao.ValoresDoModelo (tipo)` |
| 68 | `app/(dashboard)/orcamentos/page.tsx:5` | assistencia | avaliacao/`lib/troca-acesso` | import | `avaliacao.cotacaoDeTrocaLiberada(empresa)` |
| 69 | `app/(dashboard)/orcamentos/page.tsx:6` | assistencia | avaliacao/`lib/troca-modelos` | import | `avaliacao.chaveLinha(modelo, armazenamento)` |
| 70 | `app/(dashboard)/orcamentos/page.tsx:7` | assistencia | avaliacao/`components/modules/orcamentos/avaliar-aparelho` | import (tipo) | `avaliacao.ValoresDoModelo (tipo)` |
| 71 | `app/(dashboard)/orcamentos/page.tsx:40` | assistencia | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.unidadesDisponiveis(empresa) (+ nomeProduto)` |
| 72 | `app/(dashboard)/orcamentos/page.tsx:43` | assistencia | estoque/`tabela_precos` | lê | `estoque.tabelaDePrecos(empresa)` |
| 73 | `app/(dashboard)/orcamentos/page.tsx:75` | assistencia | avaliacao/`troca_precos` | lê | `avaliacao.matrizDeTroca(empresa)` |
| 74 | `app/(dashboard)/orcamentos/page.tsx:77` | assistencia | avaliacao/`troca_regras` | lê | `avaliacao.regrasDeTroca(empresa)` |
| 75 | `app/(dashboard)/pdv/components/pdv-view.tsx:20` | vendas | estoque/`lib/estoque-campos` | import | `estoque.camposDaCategoria(tipo)` |
| 76 | `app/(dashboard)/pdv/components/pdv-view.tsx:24` | vendas | avaliacao/`lib/troca-referencia` | import | `avaliacao.referenciaDaTroca(texto, tabela) / avaliarTroca(valor, ref, tolerancia)` |
| 77 | `app/(dashboard)/pdv/components/pdv-view.tsx:487` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.baixarSaldoDeLote(unidadeId, qtd, statusEsperado)` |
| 78 | `app/(dashboard)/pdv/components/pdv-view.tsx:502` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.marcarVendida(unidadeId, statusEsperado, cliente)` |
| 79 | `app/(dashboard)/pdv/components/pdv-view.tsx:596` | vendas | estoque/`inventario_unidades` | escreve (insert) | `estoque.registrarEntradaDeTroca(aparelho, grupoPdv, custo) → status pendente` |
| 80 | `app/(dashboard)/pdv/components/pdv-view.tsx:618` | vendas | avaliacao/`troca_cotacoes` | escreve (update) | `avaliacao.marcarCotacaoUsada(cotacaoId, vendaId)` |
| 81 | `app/(dashboard)/pdv/components/pdv-view.tsx:714` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.liberarReserva(unidadeIds)` |
| 82 | `app/(dashboard)/pdv/components/pdv-view.tsx:777` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.desfazerBaixa(unidadeId, statusAnterior, saldoAnterior)` |
| 83 | `app/(dashboard)/pdv/page.tsx:3` | vendas | avaliacao/`lib/troca-referencia` | import | `avaliacao.toleranciaPadrao` |
| 84 | `app/(dashboard)/pdv/page.tsx:19` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.expirarReservasVencidas(empresa)` |
| 85 | `app/(dashboard)/pdv/page.tsx:38` | vendas | estoque/`inventario_unidades` + estoque/`produtos` (embed) + estoque/`marcas_produtos` (embed) + estoque/`categorias_produtos` (embed) | lê | `estoque.unidadesVendaveis(empresa) (+ produto, marca, categoria)` |
| 86 | `app/(dashboard)/pdv/page.tsx:47` | vendas | estoque/`inventario_unidades` + estoque/`produtos` (embed) + estoque/`marcas_produtos` (embed) | lê | `estoque.unidadesReservadas(empresa) (+ produto, marca)` |
| 87 | `app/(dashboard)/pdv/page.tsx:54` | vendas | financeiro/`taxas_pagamento` | lê | `financeiro.taxasAtivas(empresa)` |
| 88 | `app/(dashboard)/pdv/page.tsx:55` | vendas | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na venda` |
| 89 | `app/(dashboard)/pdv/page.tsx:61` | vendas | estoque/`tabela_precos` | lê | `estoque.tabelaDePrecos(empresa)` |
| 90 | `app/(dashboard)/pdv/page.tsx:75` | vendas | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na encomenda` |
| 91 | `app/(dashboard)/pdv/page.tsx:106` | vendas | estoque/`inventario_unidades` | lê | `estoque.trocasPendentes(empresa)` |
| 92 | `app/(dashboard)/ranking/page.tsx:5` | core | imoveis/`lib/captacao-imob` | import | `imoveis.imoveisCaptadosPorPessoa(empresa, periodo)` |
| 93 | `app/(dashboard)/ranking/page.tsx:38` | core | superadmin/`segmentos_config` | lê | `superadmin.configDoSegmento(segmento).modulosExtra` |
| 94 | `app/(dashboard)/relatorios/page.tsx:38` | core | vendas/`vendas` + estoque/`produtos` (embed) | lê | `vendas.listarVendas(empresa, periodo) (+ nomeProduto)` |
| 95 | `app/(dashboard)/relatorios/page.tsx:42` | core | financeiro/`lancamentos_financeiros` | lê | `financeiro.lancamentosNoPeriodo(empresa, periodo)` |
| 96 | `app/(dashboard)/relatorios/page.tsx:52` | core | estoque/`inventario_unidades` | lê | `estoque.gruposComTrocaPendente(empresa)` |
| 97 | `app/admin/configuracoes/page.tsx:21` | core | financeiro/`taxas_pagamento` | lê | `financeiro.taxasAtivas(empresa)` |
| 98 | `app/admin/equipe/page.tsx:38` | core | vendas/`vendas` | lê | `vendas.totalPorVendedor(empresa, mes)` |
| 99 | `app/admin/equipe/page.tsx:44` | core | vendas/`comissoes` | lê | `vendas.comissoesDoMes(empresa, mes)` |
| 100 | `app/admin/integracoes/page.tsx:6` | core | imoveis/`lib/portal-token` | import | `imoveis.tokenDoPortal(empresa)` |
| 101 | `app/admin/layout.tsx:7` | core | rastreamento/`lib/rastreamento/db` | import | `superadmin.complementoAtivo(empresa) (hoje via rastreamento.clienteServico)` |
| 102 | `app/admin/layout.tsx:23` | core | superadmin/`complementos_empresa` | lê | `superadmin.complementoAtivo(empresa, "zapintel")` |
| 103 | `app/admin/meu-menu/page.tsx:45` | core | superadmin/`segmentos_config` | lê | `superadmin.configDoSegmento(segmento)` |
| 104 | `app/admin/page.tsx:33` | core | estoque/`produtos` | lê | `estoque.contarProdutos(empresa)` |
| 105 | `app/admin/page.tsx:35` | core | vendas/`vendas` | lê | `vendas.receitaNoPeriodo(empresa, periodo)` |
| 106 | `app/admin/page.tsx:50` | core | superadmin/`planos_config` | lê | `superadmin.planoPorNome(plano)` |
| 107 | `app/admin/planos/page.tsx:11` | core | superadmin/`planos_config` | lê | `superadmin.listarPlanos()` |
| 108 | `app/api/avaliacoes/route.ts:32` | avaliacao | estoque/`marcas_produtos` | `categorias_produtos` (nome da tabela em variável) | lê | `estoque.acharMarca(nome) / acharCategoria(nome)` |
| 109 | `app/api/avaliacoes/route.ts:34` | avaliacao | estoque/`marcas_produtos` | `categorias_produtos` (nome da tabela em variável) | escreve (insert) | `estoque.criarMarca(nome) / criarCategoria(nome)` |
| 110 | `app/api/avaliacoes/route.ts:46` | avaliacao | estoque/`produtos` | lê | `estoque.acharOuCriarProduto(nome, marcaId, categoriaId)` |
| 111 | `app/api/avaliacoes/route.ts:51` | avaliacao | estoque/`produtos` | escreve (insert) | `estoque.acharOuCriarProduto(nome, marcaId, categoriaId)` |
| 112 | `app/api/avaliacoes/route.ts:106` | avaliacao | estoque/`inventario_unidades` | escreve (insert) | `estoque.registrarEntradaDeVeiculo(avaliacao) → unidade` |
| 113 | `app/api/compras/receber/route.ts:31` | vendas | estoque/`inventario_unidades` | escreve (insert) | `estoque.registrarEntradaDeCompra(pedido, venda)` |
| 114 | `app/api/cron/[job]/route.ts:3` | core | superadmin/`lib/stripe` | import | `superadmin.sincronizarAssinaturas()` |
| 115 | `app/api/cron/[job]/route.ts:7` | core | avaliacao/`lib/fipe` | import | `avaliacao.atualizarReferenciaFipe()` |
| 116 | `app/api/cron/[job]/route.ts:10` | core | inteligencia/`lib/zapintel/ponte` | import | `inteligencia.montarPonte(empresa) / gravarPonte(linhas)` |
| 117 | `app/api/cron/[job]/route.ts:268` | core | vendas/`vendas` | lê | `vendas.vendasNaData(empresa, dia) (+ cliente)` |
| 118 | `app/api/cron/[job]/route.ts:397` | inteligencia | superadmin/`complementos_empresa` | lê | `superadmin.empresasComComplemento("zapintel")` |
| 119 | `app/api/dashboard/route.ts:43` | core | vendas/`vendas` + estoque/`produtos` (embed) | lê | `vendas.listarVendas(empresa, periodo) (+ nomeProduto)` |
| 120 | `app/api/dashboard/route.ts:91` | core | estoque/`inventario_unidades` | lê | `estoque.contarUnidades(empresa, status)` |
| 121 | `app/api/dashboard/route.ts:92` | core | assistencia/`garantias_assistencias` | lê | `assistencia.contarOrdensAbertas(empresa)` |
| 122 | `app/api/empresa/route.ts:4` | core | superadmin/`lib/planos` | import | `superadmin.planoTemAcesso(plano, recurso)` |
| 123 | `app/api/equipe/remover-usuario/route.ts:83` | core | estoque/`inventario_unidades` | escreve (update) | `estoque.liberarReservasDoUsuario(usuario)` |
| 124 | `app/api/exportar/route.ts:61` | core | vendas/`vendas`, imoveis/`imoveis`, imoveis/`negocios_imobiliarios` (tabela via `TABELAS[tipo]`, linhas 9, 23, 27) | lê | `vendas.exportarCsv(empresa) / imoveis.exportarCsv(empresa, tipo)` |
| 125 | `app/api/garantia/termo/route.ts:40` | assistencia | vendas/`vendas_termos` | lê | `vendas.termoDaVenda(termoId)` |
| 126 | `app/api/garantia/termo/route.ts:51` | assistencia | vendas/`vendas_termos` | escreve (update) | `vendas.marcarTermoAssinado(termoId, arquivo, usuario)` |
| 127 | `app/api/garantia/termo/route.ts:83` | assistencia | vendas/`vendas_termos` | lê | `vendas.termoDaVenda(termoId)` |
| 128 | `app/api/match/lead/[id]/route.ts:4` | core | imoveis/`lib/match-imoveis` | import | `imoveis.ranquear(perfil, imoveis)` |
| 129 | `app/api/match/lead/[id]/route.ts:5` | core | estoque/`lib/match-veiculos` | import | `estoque.ranquearVeiculos(interesse, veiculos)` |
| 130 | `app/api/match/lead/[id]/route.ts:32` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) + estoque/`marcas_produtos` (embed) + estoque/`categorias_produtos` (embed) | lê | `estoque.veiculosDisponiveis(empresa) (+ produto, marca, categoria)` |
| 131 | `app/api/match/lead/[id]/route.ts:59` | core | imoveis/`lead_perfil_busca` | lê | `imoveis.perfilDeBusca(contato)` |
| 132 | `app/api/match/lead/[id]/route.ts:67` | core | imoveis/`imoveis` | lê | `imoveis.imoveisDisponiveis(empresa)` |
| 133 | `app/api/menu/[slug]/pedido/route.ts:35` | food (fora dos 10) | estoque/`produtos` | lê | `estoque.produtosPorIds(ids)` |
| 134 | `app/api/orcamento/[token]/route.ts:81` | assistencia | estoque/`inventario_unidades` | escreve (insert) | `estoque.registrarEntradaDeTroca(aparelho, grupoPdv) → status pendente` |
| 135 | `app/api/orcamento/[token]/route.ts:107` | assistencia | vendas/`vendas` | escreve (insert) | `vendas.registrarVenda(dados)` |
| 136 | `app/api/orcamento/[token]/route.ts:125` | assistencia | vendas/`vendas_pagamentos` | escreve (insert) | `vendas.registrarPagamento(vendaId, "troca", valor)` |
| 137 | `app/api/orcamento/[token]/route.ts:138` | assistencia | financeiro/`lancamentos_financeiros` | escreve (insert) | `financeiro.lancarContaAPagar(descricao, valor, vencimento)` |
| 138 | `app/api/orcamento/[token]/route.ts:159` | assistencia | estoque/`inventario_unidades` | lê | `estoque.unidadePorId(id)` |
| 139 | `app/api/orcamento/[token]/route.ts:166` | assistencia | estoque/`inventario_unidades` | escreve (update) | `estoque.marcarVendida(unidadeId, ["disponivel","reservado"])` |
| 140 | `app/api/orcamento/[token]/route.ts:188` | assistencia | vendas/`vendas` | escreve (insert) | `vendas.registrarVenda(dados, unidadeId)` |
| 141 | `app/api/orcamentos/route.ts:44` | assistencia | avaliacao/`troca_cotacoes` | lê | `avaliacao.cotacaoPertenceAEmpresa(cotacaoId, empresa)` |
| 142 | `app/api/register/route.ts:85` | core | superadmin/`planos_config` | lê | `superadmin.planoPorId(plano)` |
| 143 | `app/api/superadmin/assistente/modelos/route.ts:3` | superadmin | inteligencia/`lib/assistente-modelos` | import | `inteligencia.listarModelos()` |
| 144 | `app/api/superadmin/assistente/route.ts:4` | superadmin | inteligencia/`lib/assistente-erros` | import | `inteligencia.modeloPadrao` |
| 145 | `app/api/superadmin/assistente/route.ts:17` | superadmin | inteligencia/`assistente_uso` | lê | `inteligencia.usoDoAssistente(periodo)` |
| 146 | `app/api/superadmin/assistente/route.ts:67` | superadmin | inteligencia/`assistente_config` | escreve (upsert) | `inteligencia.salvarConfigAssistente(patch)` |
| 147 | `app/api/superadmin/empresas/[id]/addons/route.ts:2` | superadmin | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (grava complementos_empresa)` |
| 148 | `app/api/superadmin/empresas/[id]/exportar/route.ts:32` | superadmin | vendas/`vendas`,`comissoes`; estoque/`produtos`; imoveis/`imoveis`,`proprietarios`; financeiro/`cobrancas`,`lancamentos_financeiros` (laço sobre `TABELAS`, linhas 8-12) | lê | `cada módulo.exportarDadosDaEmpresa(empresa)` |
| 149 | `app/api/superadmin/fipe/route.ts:2` | superadmin | avaliacao/`lib/fipe` | import | `avaliacao.atualizarReferenciaFipe()` |
| 150 | `app/api/webhook/c2s/[slug]/route.ts:190` | core | imoveis/`lead_perfil_busca` | escreve (insert) | `imoveis.salvarPerfilDeBusca(contato, perfil)` |
| 151 | `app/entrar/page.tsx:63` | core | superadmin/`segmentos_config` | lê | `superadmin.configDoSegmento(segmento)` |
| 152 | `app/menu/[slug]/page.tsx:22` | food (fora dos 10) | estoque/`produtos` + estoque/`categorias_produtos` (embed) | lê | `estoque.cardapioPublico(empresa) (+ categoria)` |
| 153 | `app/os/[token]/page.tsx:16` | assistencia | estoque/`produtos` (embed) | lê | `estoque.nomeProduto(produtoId) — embutido na OS` |
| 154 | `app/page.tsx:21` | core | superadmin/`planos_config` | lê | `superadmin.planosPublicos()` |
| 155 | `app/para/[segmento]/page.tsx:75` | core | superadmin/`planos_config` | lê | `superadmin.planosPublicos()` |
| 156 | `app/superadmin/assistente/page.tsx:4` | superadmin | inteligencia/`lib/assistente-erros` | import | `inteligencia.modeloPadrao` |
| 157 | `app/superadmin/assistente/page.tsx:13` | superadmin | inteligencia/`assistente_config` | lê | `inteligencia.configAssistente()` |
| 158 | `app/superadmin/empresas/[id]/page.tsx:3` | superadmin | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê complementos_empresa)` |
| 159 | `app/superadmin/empresas/[id]/page.tsx:95` | superadmin | vendas/`vendas` | lê | `vendas.contarVendas(empresa)` |
| 160 | `app/superadmin/fipe/page.tsx:10` | superadmin | avaliacao/`fipe_referencia` | lê | `avaliacao.referenciaFipe()` |
| 161 | `app/superadmin/fipe/page.tsx:11` | superadmin | avaliacao/`fipe_consultas` | lê | `avaliacao.contarConsultasFipe()` |
| 162 | `app/zapintel/api/conversa/route.ts:3` | inteligencia | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê zapintel_*/complementos)` |
| 163 | `app/zapintel/api/conversa/route.ts:68` | inteligencia | vendas/`vendas` | lê | `vendas.valorDaVenda(vendaId)` |
| 164 | `app/zapintel/api/perfil/pendentes/route.ts:5` | inteligencia | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê zapintel_*)` |
| 165 | `app/zapintel/api/perfil/route.ts:4` | inteligencia | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê zapintel_*)` |
| 166 | `app/zapintel/api/perfil/route.ts:114` | inteligencia | vendas/`vendas` | lê | `vendas.valorDaVenda(vendaId)` |
| 167 | `app/zapintel/api/sugestao/route.ts:4` | inteligencia | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê zapintel_*)` |
| 168 | `app/zapintel/layout.tsx:5` | inteligencia | rastreamento/`lib/rastreamento/db` | import | `rastreamento.clienteServico() (lê complementos_empresa)` |
| 169 | `app/zapintel/layout.tsx:28` | inteligencia | superadmin/`complementos_empresa` | lê | `superadmin.complementoAtivo(empresa, "zapintel")` |
| 170 | `lib/assistente/ferramentas.ts:284` | inteligencia | vendas/`vendas` | lê | `vendas.consultarVendas(filtro: periodo, loja, vendedor)` |
| 171 | `lib/assistente/ferramentas.ts:298` | inteligencia | estoque/`produtos` | lê | `estoque.nomesDeProdutos(ids)` |
| 172 | `lib/c2s.ts:2` | core | financeiro/`lib/payments/crypto` | import | `financeiro.cifrarCredenciais(obj) / decifrarCredenciais(txt)` |
| 173 | `lib/empresa-context.tsx:9` | core | superadmin/`lib/planos` | import | `superadmin.planoTemAcesso(plano, recurso)` |
| 174 | `lib/encomendas.ts:186` | vendas | estoque/`inventario_unidades` (embed) | lê | `estoque.identificacaoDaUnidade(unidadeId) — embutido na venda` |
| 175 | `lib/encomendas.ts:241` | vendas | estoque/`inventario_unidades` | escreve (update) | `estoque.marcarVendida(unidadeId)` |
| 176 | `lib/ranking.ts:69` | core | vendas/`vendas` | lê | `vendas.vendasNoPeriodo(empresa, periodo)` |
| 177 | `lib/ranking.ts:72` | core | vendas/`propostas` | lê | `vendas.propostasNoPeriodo(empresa, periodo)` |
| 178 | `lib/ranking.ts:80` | core | estoque/`inventario_unidades` | lê | `estoque.gruposComTrocaPendente(empresa)` |
| 179 | `lib/storage/retencao.ts:285` | core | inteligencia/`zapintel_midia_retida` | escreve (insert) | `inteligencia.registrarMidiaRetida(alvos)` |
| 180 | `lib/supabase/server.ts:67` | core | superadmin/`encerrar_impersonacao` | escreve (rpc) | `superadmin.encerrarImpersonacaoVencida()` |
| 181 | `lib/troca-modelos.ts:26` | avaliacao | estoque/`lib/apple-modelos` | import | `estoque.modelosApple()` |
| 182 | `lib/zapintel/ponte.ts:152` | inteligencia | vendas/`vendas` | lê | `vendas.listarVendas(empresa) paginado` |
| 183 | `components/admin/admin-shell.tsx:9` | core | superadmin/`components/superadmin/impersonation-banner` | import | `superadmin.BannerDeImpersonacao (componente)` |
| 184 | `components/layout/command-palette.tsx:114` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.buscarUnidadePorIdentificador(texto) (+ nomeProduto)` |
| 185 | `components/layout/command-palette.tsx:115` | core | estoque/`produtos` | lê | `estoque.buscarProdutos(texto)` |
| 186 | `components/layout/command-palette.tsx:125` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.buscarUnidadePorIdentificador(texto) (+ nomeProduto)` |
| 187 | `components/modules/configuracoes/configuracoes-view.tsx:11` | core | financeiro/`components/modules/configuracoes/meios-pagamento-card` | import | `financeiro.CartaoMeiosDePagamento (componente)` |
| 188 | `components/modules/configuracoes/configuracoes-view.tsx:14` | core | vendas/`components/modules/configuracoes/devolucao-card` | import | `vendas.CartaoDevolucao (componente)` |
| 189 | `components/modules/configuracoes/configuracoes-view.tsx:21` | core | imoveis/`components/modules/configuracoes/portais-card` | import | `imoveis.CartaoPortais (componente)` |
| 190 | `components/modules/configuracoes/configuracoes-view.tsx:22` | core | food (fora dos 10)/`components/modules/configuracoes/cardapio-card` | import | `food.CartaoCardapio (componente)` |
| 191 | `components/modules/configuracoes/configuracoes-view.tsx:24` | core | estoque/`components/modules/configuracoes/veiculos-portal-card` | import | `estoque.CartaoPortalVeiculos (componente)` |
| 192 | `components/modules/configuracoes/configuracoes-view.tsx:26` | core | vendas/`components/modules/configuracoes/contrato-card` | import | `vendas.CartaoContrato (componente)` |
| 193 | `components/modules/configuracoes/configuracoes-view.tsx:27` | core | avaliacao/`components/modules/configuracoes/troca-card` | import | `avaliacao.CartaoTroca (componente)` |
| 194 | `components/modules/configuracoes/configuracoes-view.tsx:192` | core | financeiro/`taxas_pagamento` | lê | `financeiro.taxasAtivas(empresa)` |
| 195 | `components/modules/configuracoes/configuracoes-view.tsx:195` | core | financeiro/`taxas_pagamento` | escreve (delete) | `financeiro.substituirTaxas(empresa, linhas)` |
| 196 | `components/modules/configuracoes/configuracoes-view.tsx:198` | core | financeiro/`taxas_pagamento` | escreve (insert) | `financeiro.substituirTaxas(empresa, linhas)` |
| 197 | `components/modules/configuracoes/configuracoes-view.tsx:200` | core | financeiro/`taxas_pagamento` | escreve (insert) | `financeiro.substituirTaxas(empresa, linhas) — restauração` |
| 198 | `components/modules/dashboard/onboarding-card.tsx:25` | core | estoque/`produtos` | lê | `estoque.contarProdutos(empresa)` |
| 199 | `components/modules/dashboard/onboarding-card.tsx:28` | core | vendas/`vendas` | lê | `vendas.contarVendas(empresa)` |
| 200 | `components/modules/financeiro/comissoes-imob.tsx:6` | financeiro | imoveis/`lib/comissao-imob` | import | `imoveis.calcularComissaoPorPercentual(...) / cashbackCabe(...)` |
| 201 | `components/modules/historico/historico-view.tsx:119` | vendas | estoque/`produtos` | lê | `estoque.garantiaDoProduto(produtoId)` |
| 202 | `components/modules/leads/lead-financiamento-panel.tsx:38` | core | vendas/`fichas_financiamento` | lê | `vendas.fichasDeFinanciamento(contato)` |
| 203 | `components/modules/leads/lead-financiamento-panel.tsx:52` | core | vendas/`fichas_financiamento` | escreve (insert) | `vendas.criarFichaDeFinanciamento(contato, dados)` |
| 204 | `components/modules/leads/lead-financiamento-panel.tsx:65` | core | vendas/`fichas_financiamento` | escreve (update) | `vendas.atualizarStatusDaFicha(fichaId, status)` |
| 205 | `components/modules/leads/lead-financiamento-panel.tsx:73` | core | vendas/`fichas_financiamento` | escreve (delete) | `vendas.excluirFicha(fichaId)` |
| 206 | `components/modules/leads/lead-interesse-panel.tsx:7` | core | estoque/`lib/match-veiculos` | import (tipo) | `estoque.MatchVeiculo (tipo)` |
| 207 | `components/modules/leads/lead-match-panel.tsx:8` | core | imoveis/`lib/match-imoveis` | import (tipo) | `imoveis.MatchResultado (tipo)` |
| 208 | `components/modules/leads/lead-match-panel.tsx:42` | core | imoveis/`lead_perfil_busca` | lê | `imoveis.perfilDeBusca(contato)` |
| 209 | `components/modules/leads/lead-match-panel.tsx:71` | core | imoveis/`lead_perfil_busca` | escreve (upsert) | `imoveis.salvarPerfilDeBusca(contato, perfil)` |
| 210 | `components/modules/leads/lead-modal.tsx:8` | core | vendas/`lib/cliente-contrato` | import | `vendas.camposFaltantesContrato(contato)` |
| 211 | `components/modules/leads/lead-negocio-panel.tsx:76` | core | imoveis/`negocios_imobiliarios` + imoveis/`imoveis` (embed) | lê | `imoveis.negociosDoContato(contato) (+ imovel)` |
| 212 | `components/modules/leads/lead-negocio-panel.tsx:92` | core | imoveis/`imoveis` | lê | `imoveis.listarImoveis(empresa)` |
| 213 | `components/modules/leads/lead-orcamento-panel.tsx:10` | core | assistencia/`components/modules/orcamentos/orcamento-editor-modal` | import | `assistencia.EditorDeOrcamento (componente) + orcamentoVazio()` |
| 214 | `components/modules/leads/lead-orcamento-panel.tsx:11` | core | avaliacao/`components/modules/orcamentos/troca-modal` | import | `avaliacao.ModalDeTroca (componente)` |
| 215 | `components/modules/leads/lead-orcamento-panel.tsx:12` | core | avaliacao/`components/modules/orcamentos/avaliar-aparelho` | import (tipo) | `avaliacao.ValoresDoModelo (tipo)` |
| 216 | `components/modules/leads/lead-orcamento-panel.tsx:14` | core | avaliacao/`lib/troca-modelos` | import | `avaliacao.chaveLinha(modelo, armazenamento)` |
| 217 | `components/modules/leads/lead-orcamento-panel.tsx:78` | core | assistencia/`orcamentos` + avaliacao/`troca_cotacoes` (embed) | lê | `assistencia.orcamentosDoContato(contato) (+ avaliacao.cotacao)` |
| 218 | `components/modules/leads/lead-orcamento-panel.tsx:127` | core | avaliacao/`troca_precos` | lê | `avaliacao.matrizDeTroca(empresa)` |
| 219 | `components/modules/leads/lead-orcamento-panel.tsx:128` | core | avaliacao/`troca_regras` | lê | `avaliacao.regrasDeTroca(empresa)` |
| 220 | `components/modules/leads/lead-orcamento-panel.tsx:129` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.unidadesDisponiveis(empresa) (+ nomeProduto)` |
| 221 | `components/modules/leads/lead-reserva-panel.tsx:62` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.reservasDoContato(contato) (+ nomeProduto)` |
| 222 | `components/modules/leads/lead-reserva-panel.tsx:78` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) + estoque/`marcas_produtos` (embed) | lê | `estoque.unidadesReservaveis(empresa) (+ produto, marca)` |
| 223 | `components/modules/leads/produto-autocomplete.tsx:35` | core | estoque/`produtos` | lê | `estoque.buscarProdutos(texto)` |
| 224 | `components/modules/orcamentos/troca-modal.tsx:6` | avaliacao | assistencia/`app/(dashboard)/orcamentos/cliente-autocomplete` | import | `contatos.SeletorDeContato (componente hoje em assistencia)` |
| 225 | `components/modules/pdv/encomenda-form.tsx:360` | vendas | estoque/`inventario_unidades` | escreve (insert) | `estoque.registrarEntradaDeTroca(aparelhos, grupoPdv, cliente) → status pendente` |
| 226 | `components/modules/pdv/encomenda-itens.tsx:87` | vendas | estoque/`produtos` | lê | `estoque.variantesDoProduto(produtoId)` |
| 227 | `components/modules/relatorios/relatorios-imob-view.tsx:78` | core | imoveis/`imoveis` | lê | `imoveis.resumoCarteira(empresa)` |
| 228 | `components/modules/relatorios/relatorios-imob-view.tsx:82` | core | vendas/`propostas` | lê | `vendas.propostasDaEmpresa(empresa)` |
| 229 | `components/modules/relatorios/relatorios-view.tsx:131` | core | estoque/`inventario_unidades` + estoque/`produtos` (embed) | lê | `estoque.inventario(empresa) (+ nomeProduto)` |
| 230 | `proxy.ts:285` | core | superadmin/`segmentos_config` | lê | `superadmin.configDoSegmento(segmento).modulosHabilitados` |
| 231 | `supabase/funcoes/zapintel_ao_vivo.sql:116` | inteligencia | vendas/`vendas` (trigger `zapintel_vendas_ao_vivo` after insert) | SQL trigger | `vendas.aoRegistrarVenda(evento) → inteligencia.avisar(empresa, "vendas")` |
| 232 | `supabase/funcoes/zapintel_conversa.sql:238` | inteligencia | vendas/`vendas` (join com `zapintel_venda_lead`) | SQL lê | `vendas.existe(vendaIds)` |
| 233 | `supabase/funcoes/zapintel_conversa.sql:475` | inteligencia | superadmin/`complementos_empresa` (pg_cron de aquecimento) | SQL lê | `superadmin.empresasComComplemento("zapintel")` |
| 234 | `supabase/funcoes/zapintel_dashboard.sql:53` | inteligencia | superadmin/`complementos_empresa` | SQL lê | `superadmin.complementoAtivo(empresa, "zapintel")` |
| 235 | `supabase/funcoes/zapintel_dashboard.sql:196` | inteligencia | vendas/`vendas` | SQL lê | `vendas.vendasNoPeriodo(empresa, loja, periodo)` |
| 236 | `supabase/funcoes/zapintel_insights.sql:115` | inteligencia | vendas/`vendas` | SQL lê | `vendas.contagemEValorNoPeriodo(empresa, periodo) (agrupa por grupo_pdv)` |
| 237 | `supabase/funcoes/zapintel_insights.sql:175` | inteligencia | vendas/`vendas` | SQL lê | `vendas.contagemEValorNoPeriodo(empresa, periodo)` |
| 238 | `supabase/funcoes/zapintel_insights.sql:179` | inteligencia | vendas/`vendas` | SQL lê | `vendas.contagemEValorNoPeriodo(empresa, periodo)` |
| 239 | `supabase/funcoes/zapintel_posvenda.sql:45` | inteligencia | vendas/`vendas` (join com `zapintel_venda_lead`) | SQL lê | `vendas.vendasPorIds(ids)` |
| 240 | `supabase/funcoes/zapintel_posvenda.sql:46` | inteligencia | estoque/`produtos` (left join via `vendas.produto_id`) | SQL lê | `estoque.nomeProduto(produtoId)` |

### Matriz-resumo (linhas = origem, colunas = destino; contagem de itens da tabela acima — um item que toca dois destinos conta em ambos)

| origem \ destino | vendas | estoque | avaliacao | assistencia | financeiro | rastreamento | imoveis | inteligencia | superadmin | food (fora dos 10) | saude (fora dos 10) | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **core** | 28 | 24 | 8 | 4 | 8 | 1 | 30 | 3 | 19 | 1 | 1 | 127 |
| **vendas** | · | 20 | 3 | · | 1 | · | · | · | · | · | · | 24 |
| **estoque** | 3 | · | · | · | · | · | · | · | · | · | · | 3 |
| **avaliacao** | · | 6 | · | 2 | · | · | · | · | · | · | · | 8 |
| **assistencia** | 13 | 13 | 9 | · | 1 | · | · | · | · | · | · | 36 |
| **financeiro** | 1 | · | · | · | · | · | 5 | · | · | · | · | 6 |
| **inteligencia** | 11 | 2 | · | · | · | 5 | · | · | 4 | · | · | 22 |
| **superadmin** | 2 | 1 | 3 | · | 1 | 2 | 1 | 6 | · | · | · | 16 |
| **food (fora dos 10)** | · | 8 | · | · | · | · | · | · | · | · | · | 8 |
| **total** | 58 | 74 | 23 | 6 | 11 | 8 | 36 | 9 | 23 | 1 | 1 | 250 |

### Contagem por operação

| Operação | Itens |
|---|---:|
| import | 61 |
| lê | 130 |
| escreve | 39 |
| SQL | 10 |
| **total** | 240 |

### Mapa tabela → módulo usado na classificação

| Módulo | Tabelas |
|---|---|
| core | leads, clientes, empresas, empresa_usuarios, usuarios, filiais, configuracoes_sistema, funis, funil_etapas, lead_mensagens, canais_conectados, tarefas, visitas, cadencias, cadencia_passos, cadencia_inscricoes, cadencia_execucoes, followups_gerados, distribuicao_regras, lead_atribuicoes, motivos_perda, modelos_mensagem, automacoes, chamadas, metas, metas_comissoes, campanhas_fidelidade, solicitacoes_marketing, mensagens_internas, push_subscriptions, notificacao_prefs, acessos |
| vendas | vendas, vendas_pagamentos, vendas_termos, vendas_alertas, propostas, contratos_venda, contrato_modelos, contrato_documentos, pedidos_compra, fornecedores, comissoes, fichas_financiamento |
| estoque | produtos, inventario_unidades, movimentacao_estoque, categorias_produtos, subcategorias_produtos, marcas_produtos, tabela_precos, imei_consultas, veiculo_dados |
| avaliacao | troca_precos, troca_regras, troca_cotacoes, avaliacoes_usados, fipe_referencia, fipe_consultas |
| assistencia | orcamentos, garantias_assistencias, servicos_reparo |
| financeiro | lancamentos_financeiros, taxas_pagamento, cobrancas, tenant_payment_config, payment_webhook_eventos |
| rastreamento | rastreamento_visitas, rastreamento_links, rastreamento_config, rastreamento_eventos |
| imoveis | imoveis, negocios_imobiliarios, lead_perfil_busca, chaves_imoveis, proprietarios |
| inteligencia | zapintel_venda_lead, zapintel_lead_perfil, zapintel_midia_retida, assistente_config, assistente_uso, RPCs zapintel_* e assistente_status_conversas |
| superadmin | planos_config, segmentos_config, avisos_plataforma, superadmin_logs, stripe_eventos, complementos_empresa, RPCs set_impersonation/encerrar_impersonacao/hard_delete_empresa |
| food (fora dos 10) | pedidos (rotas /cardapio, /kds, /menu) |
| saude (fora dos 10) | lista_espera |

Origem por caminho: `app/(dashboard)/<rota>`, `app/api/<rota>` e `components/modules/<pasta>` pela rota; `/historico` = vendas; `/orcamentos/cotacao|checklist|precos`, `components/modules/orcamentos/troca-modal|avaliar-aparelho` e `components/modules/veiculos/fipe-picker` = avaliacao; `/orcamentos` (resto) = assistencia; `/catalogo`, `/check-imei`, `/produtos`, `/api/reservas`, `/api/veiculos`, `lib/match-veiculos` = estoque; `app/api/cron/[job]` por faixa de `case` (sync-fipe = avaliacao, ponte-vendas = inteligencia, expirar-trials/sync-stripe = superadmin, demais = core); `lib/rastreamento/*`, `app/i`, `app/track.js` = rastreamento; `lib/zapintel/*`, `lib/assistente*`, `hooks/zapintel`, `app/zapintel` = inteligencia; `components/modules/leads/*`, dashboard, relatórios, equipe, ranking, metas, agenda, clientes = core.

---

## 4. Segredos e credenciais

Escopo lido: `app/`, `lib/`, `components/`, `hooks/`, `proxy.ts`, `supabase/functions/`, `supabase/funcoes|pendentes`, `scripts/`, `tests/`, `types/database.ts`, `.env.example` (só nomes). Fora: `node_modules/`, `arquivos/`, `.next/`. O repositório NÃO tem a migração de criação de `configuracoes_sistema` (nem das políticas de RLS dela); o que se diz sobre leitura por vendedor vem do uso no código, não do SQL.

Cifras existentes (as duas são AES-256-GCM, IV aleatório de 12 bytes, formato `base64(iv).base64(tag).base64(ct)`, chave de 32 bytes hex/base64, falha alto sem a env):
- **Cofre de canal** — `lib/canais/crypto.ts:16-63`, chave `CHANNEL_ENCRYPTION_KEY` (lida em `lib/canais/crypto.ts:17`; decifra também em Deno: `supabase/functions/webhook-leads/index.ts:46,69-98`).
- **Cofre de pagamento** — `lib/payments/crypto.ts:9-58`, chave `PAYMENT_ENCRYPTION_KEY` (lida em `lib/payments/crypto.ts:10`). Reaproveitado pelo C2S (`lib/c2s.ts:2,82,88-90`).

### 4.1 Onde ficam as credenciais

| # | Credencial | Onde fica (tabela.coluna / env) | Cifrado? (como) | Lido em | Escrito em |
|---|---|---|---|---|---|
| 1 | Token WhatsApp Cloud API (fluxo atual, Embedded Signup) | `canais_conectados.access_token_enc` (tipo whatsapp) | Sim — AES-256-GCM, `CHANNEL_ENCRYPTION_KEY` | `app/api/modelos/route.ts:13-19`; `app/api/modelos/[id]/route.ts:28-36`; `supabase/functions/webhook-leads/index.ts:200,231,282,289` (decifra em `:69`) | `app/api/canais/whatsapp/route.ts:127` |
| 2 | Page token Messenger / token Instagram via Facebook Login | `canais_conectados.access_token_enc` (tipo instagram/messenger) | Sim — AES-256-GCM, `CHANNEL_ENCRYPTION_KEY` | `supabase/functions/webhook-leads/index.ts:231,282,289` (uso em `:1535,1555` na query string) | `app/api/canais/meta/route.ts:76,95` |
| 3 | Token Instagram Login (graph.instagram.com, longa duração) | `canais_conectados.access_token_enc` | Sim — AES-256-GCM, `CHANNEL_ENCRYPTION_KEY` (via `lib/canais/instagram-login.ts:212`) | `lib/canais/renovacao.ts:60,90`; edge `webhook-leads/index.ts:231` | `app/api/canais/instagram/retorno/route.ts:105`; `lib/canais/renovacao.ts:116` |
| 4 | Token WhatsApp oficial — config LEGADA (`OfficialConfig.access_token`) | `configuracoes_sistema.valor` (chave `whatsapp_official`, JSON) | **Não — texto puro no JSON** | `lib/whatsapp/index.ts:5-17` (cliente de sessão, chamado por `/api/whatsapp/send`, aberto a qualquer logado — `app/api/whatsapp/send/route.ts:8,19`); `app/admin/configuracoes/page.tsx:15-28` → passa o objeto inteiro ao client `components/modules/configuracoes/configuracoes-view.tsx:251` (pré-preenche o input) | `components/modules/configuracoes/configuracoes-view.tsx:274-289` (upsert direto do navegador com a chave anon); `app/api/configuracoes/whatsapp-official/route.ts:11-15` (rota sem chamador no código) |
| 5 | Verify token do webhook — config LEGADA (`OfficialConfig.webhook_verify_token`) | `configuracoes_sistema.valor` (chave `whatsapp_official`) | **Não — texto puro**; não é usado para verificar nada (o edge usa a env do item 9) | `app/admin/configuracoes/page.tsx:28` → `configuracoes-view.tsx:252` | `configuracoes-view.tsx:285` |
| 6 | Page token Instagram/Messenger — config LEGADA | `configuracoes_sistema.valor` (chaves `meta_instagram`, `meta_messenger`, campo `access_token`) | **Não — texto puro** | `app/admin/configuracoes/page.tsx:29-30` → `configuracoes-view.tsx:258` | `configuracoes-view.tsx:291-293` |
| 7 | Meta App Secret (WhatsApp/Messenger) | env `META_APP_SECRET` (+ `META_APP_ID`) | Env (fora do banco) | `lib/canais/meta.ts:10-11` (usado em `:39`, `:57-58`, `:301` — em `:58` e `:301` vai como `access_token=APP_ID|APP_SECRET` na query string); `supabase/functions/webhook-leads/index.ts:33,134` | — |
| 8 | Instagram App Secret | env `INSTAGRAM_APP_SECRET` (+ `INSTAGRAM_APP_ID`) | Env | `lib/canais/instagram-login.ts:51-52` (usado em `:95,126`); `supabase/functions/webhook-leads/index.ts:44,135` | — |
| 9 | Verify token do webhook Meta | env `WEBHOOK_VERIFY_TOKEN` (secret da Edge Function) | Env | `supabase/functions/webhook-leads/index.ts:45,1632` (comparação `===`, não tempo constante) | — |
| 10 | Token CAPI (Conversions API / pixel) | `rastreamento_config.capi_token_enc` | Sim — AES-256-GCM, `CHANNEL_ENCRYPTION_KEY` | `lib/rastreamento/capi.ts:60` (uso em `:93`, na query string) | `app/api/rastreamento/config/route.ts:54-58` |
| 11 | Token público do pixel | `rastreamento_config.public_token` | Não (público por desenho, vai no script da LP) | `app/api/rastreamento/lead-origin/route.ts:42`; `app/api/rastreamento/purchase/route.ts:49` | `app/api/rastreamento/config/route.ts:21` (criação) |
| 12 | Token da API do C2S (deles) | `configuracoes_sistema.valor` (chave `contact2sale`, campo `token`) | Sim — AES-256-GCM, **`PAYMENT_ENCRYPTION_KEY`** (cofre de pagamento) | `lib/c2s.ts:79-86`; `app/api/admin/c2s/route.ts:54,62` | `app/api/admin/c2s/route.ts:49` (via `lib/c2s.ts:88-90`) |
| 13 | Token de entrada do webhook C2S (nosso) | `configuracoes_sistema.valor` (chave `contact2sale`, campo `entrada`) | **Não — texto puro** | `app/api/webhook/c2s/[slug]/route.ts:57` (comparação `!==`) | `lib/c2s.ts:70-75` |
| 14 | Token do webhook dos portais imobiliários / form do site imob | `configuracoes_sistema.valor` (chave `portal_leads`, campo `token`) | **Não — texto puro** | `lib/portal-token.ts:30-37`; `app/api/portais/[slug]/leads/route.ts:38`; `app/api/imob/[slug]/lead/route.ts:54` (comparações `!==`) | `lib/portal-token.ts:10-27` |
| 15 | Credenciais dos gateways do tenant (Mercado Pago, Asaas, Efí, PagSeguro) | `tenant_payment_config.credenciais_cipher` | Sim — AES-256-GCM, `PAYMENT_ENCRYPTION_KEY` | `lib/payments/index.ts:22-35`; `app/api/payments/webhook/[provider]/route.ts:66-76` | `app/api/payments/config/route.ts:43-56` (GET devolve só `configurado: bool`, `:63-80`) |
| 16 | Stripe secret | env `STRIPE_SECRET_KEY` | Env | `lib/stripe.ts:8-11`; checagens de presença em `app/api/cron/[job]/route.ts:82`, `app/api/superadmin/sync-stripe/route.ts:12` | — |
| 17 | Stripe webhook secret | env `STRIPE_WEBHOOK_SECRET` | Env | `app/api/stripe/webhook/route.ts:10,16` | — |
| 18 | Stripe publishable | env `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Pública | `app/admin/planos/planos-view.tsx:35` | — |
| 19 | Anthropic | env `ANTHROPIC_API_KEY` | Env | `lib/assistente/chat-dados.ts:110`; `lib/zapintel/ia.ts:183,210`; `app/api/assistente/route.ts:68`; `tests/zapintel-ia.test.ts:58` | — |
| 20 | Gemini | env `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | Env | `app/api/assistente/route.ts:65`; `app/api/assistente/meu-dia/route.ts:13`; `app/api/superadmin/assistente/modelos/route.ts:19`; `app/superadmin/assistente/page.tsx:28` (só booleano) | — |
| 21 | VAPID privada | env `VAPID_PRIVATE_KEY` (+ `VAPID_SUBJECT`) | Env | `lib/push.ts:5-6,12` | — |
| 22 | VAPID pública | env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` com valor literal de fallback no código | Pública (literal em `lib/vapid.ts:3-4`) | `lib/vapid.ts:2-4`; `lib/push.ts:3,12` | — |
| 23 | Assinaturas de push do navegador | `push_subscriptions` (endpoint/chaves do browser) | Não (dado do navegador, não segredo do sistema) | `lib/push.ts:34-52` | `app/api/push/subscribe/route.ts:17` |
| 24 | Resend | env `RESEND_API_KEY` (+ `EMAIL_FROM`) | Env | `lib/email.ts:16-17` | — |
| 25 | FIPE | sem credencial (API pública `veiculos.fipe.org.br`, `lib/fipe.ts:13`) | n/a | — | — |
| 26 | WhatsApp não oficial | não existe (Evolution aposentada em 31/07/2026 — `lib/whatsapp/types.ts:1-5`; restos só em comentários `supabase/functions/webhook-leads/index.ts:1436,1708`) | n/a | — | — |
| 27 | Cron | env `CRON_SECRET` | Env | `app/api/cron/[job]/route.ts:25-31` (`timingSafeEqual`); `lib/rate-limit.ts:34` (sal de HMAC) | — |
| 28 | Chaves de cifra | env `CHANNEL_ENCRYPTION_KEY`, `PAYMENT_ENCRYPTION_KEY` | Env | ver topo; `PAYMENT_ENCRYPTION_KEY` também vira sal de HMAC em `lib/rate-limit.ts:33` | — |
| 29 | Supabase service role | env `SUPABASE_SERVICE_ROLE_KEY` | Env | `lib/supabase/service.ts:7`; `lib/rastreamento/db.ts:17`; `lib/rate-limit.ts:35` (sal de HMAC); `supabase/functions/webhook-leads/index.ts:30`; scripts/testes (ver 4.2) | — |
| 30 | Sentry | env `NEXT_PUBLIC_SENTRY_DSN` (público), `SENTRY_AUTH_TOKEN` (só build, só em `.env.example`) | Env | `lib/sentry-comum.ts:22` | — |

### 4.2 Uso da service key

107 arquivos criam o admin client (`createServiceClient()` de `lib/supabase/service.ts`, `rastrDb()` de `lib/rastreamento/db.ts`, `createClient(... SUPABASE_SERVICE_ROLE_KEY)`) ou leem a env. **Nenhum** é `"use client"`, nenhum está em `components/` ou `hooks/`, e nenhum client component importa lib que use a service key (único import de client nessas libs: `import type { OfficialConfig }` em `components/modules/configuracoes/configuracoes-view.tsx:28`, só tipo).

**Rotas e páginas públicas (sem sessão)**

| # | Arquivo:linha | Contexto | Validação de acesso |
|---|---|---|---|
| 1 | `app/api/agendar/[slug]/route.ts:14` | rota pública (POST) | slug → empresa; segmento precisa ter agenda (`:26-29`); rate limit 20/IP (`:34`); valida data/horário e conflito |
| 2 | `app/agendar/[slug]/page.tsx:10` | página pública | slug + capacidade de agenda do segmento (`:16-17`) |
| 3 | `app/api/imob/[slug]/lead/route.ts:29` | rota pública (form do site imob) | rate limit 20/IP antes do token (`:46`); `?token=` == `portal_leads.token` (`:54`, `!==`, não tempo constante) |
| 4 | `app/api/portais/[slug]/leads/route.ts:32` | webhook público (portais) | `?token=` == `portal_leads.token` (`:38`, `!==`); sem rate limit |
| 5 | `app/api/portais/[slug]/route.ts:43` | feed XML público | só slug; filtra `publicar_portais=true` e `status='disponivel'` (`:55-57`) |
| 6 | `app/api/veiculos/[slug]/route.ts:20` | feed XML público | slug + segmento de veículo (`:26-35`) |
| 7 | `app/api/menu/[slug]/pedido/route.ts:12` | rota pública (POST pedido) | slug + capacidade `usaComanda` (`:18-21`); rate limit 30/IP (`:26`); preço lido do banco |
| 8 | `app/menu/[slug]/page.tsx:13` | página pública | slug + `usaComanda` (`:19`) |
| 9 | `app/api/orcamento/[token]/route.ts:10` | rota pública (aprovar/recusar) | `token` do orçamento (`:14`); só se ainda não respondido (`:24,35`); sem rate limit |
| 10 | `app/orcamento/[token]/page.tsx:9` | página pública | `token` (`:13`) |
| 11 | `app/api/os/[token]/route.ts:15` | rota pública (aprovar/recusar OS) | `token` (`:19`); só se não respondido (`:22,38`) |
| 12 | `app/os/[token]/page.tsx:14` | página pública | `token` (`:18`) |
| 13 | `app/proposta/[token]/page.tsx:16` | página pública | `token` (`:20`) |
| 14 | `app/imob/[slug]/page.tsx:8` | página pública | slug + segmento imobiliária (`:37`); imóveis `status='disponivel'` (`:20`) |
| 15 | `app/imovel/[id]/page.tsx:11` | página pública | **só o id numérico sequencial** (`:16`, `select('*')`), sem filtro de status/publicação/segmento |
| 16 | `app/i/[codigo]/route.ts:21` | redirect público (link rastreável) | id numérico do link + `ativo` (`:23-29`); grava visita sem rate limit |
| 17 | `app/api/rastreamento/lead-origin/route.ts:40` | rota pública (pixel) | `company_token` == `rastreamento_config.public_token` + `ativo` (`:37-43`) — token público por desenho |
| 18 | `app/api/rastreamento/purchase/route.ts:46` | rota pública (pixel) | idem (`:39-50`); dispara CAPI com o token decifrado |
| 19 | `app/api/register/route.ts:28` | rota pública (cadastro) | rate limit 5/IP (`:39`); validação de campos (`:54-65`) |
| 20 | `app/api/planos-publicos/route.ts:11` | rota pública (GET) | nenhuma; lê só `planos.ativo=true` (`:15`) |
| 21 | `app/page.tsx:19` | landing pública | nenhuma; lê planos ativos (`:22-23`) |
| 22 | `app/para/[segmento]/page.tsx:73` | página SEO pública | nenhuma; lê planos ativos (`:76-77`) |
| 23 | `app/api/payments/webhook/[provider]/route.ts:22` | webhook público | provedor na lista (`:15`); localiza cobrança por `provider_ref` com service key ANTES de validar assinatura (`:31-56`); assinatura/consulta pelo adapter com credencial decifrada (`:76-79`) |
| 24 | `app/api/stripe/webhook/route.ts:22` | webhook público | `stripe.webhooks.constructEvent` com `STRIPE_WEBHOOK_SECRET` (`:16`) antes do client |
| 25 | `app/api/webhook/c2s/[slug]/route.ts:51` | webhook público | `?token=` == `contact2sale.entrada` (`:57`, `!==`); rate limit 300/min por empresa DEPOIS do token (`:69`) |
| 26 | `app/api/cron/[job]/route.ts:43` | cron (Vercel) | `Authorization: Bearer CRON_SECRET` com `timingSafeEqual` (`:25-31,39`) |
| 27 | `supabase/functions/webhook-leads/index.ts:30` | Edge Function pública (Meta + envio do CRM) | GET: `hub.verify_token` == `WEBHOOK_VERIFY_TOKEN` (`:1628-1632`, `===`); POST Meta: HMAC-SHA256 `x-hub-signature-256` com `META_APP_SECRET`/`INSTAGRAM_APP_SECRET` em tempo constante (`:101-135`); envio pelo CRM: JWT do usuário via `auth.getUser()` (`:312-314`) |
| 28 | `app/api/canais/instagram/retorno/route.ts:75` | callback OAuth | `state` == cookie (`:36-42`) + `requireEmpresaRole(['owner','admin'])` (`:52`) |

`app/track.js/route.ts` é público mas **não** usa service key (só gera JS).

**Rotas autenticadas (sessão)**

| # | Arquivo:linha | Contexto | Validação de acesso |
|---|---|---|---|
| 29 | `app/api/admin/c2s/route.ts:29` | rota | `requireEmpresaRoleApi` (owner/admin) |
| 30 | `app/api/admin/filiais/route.ts:36` | rota | `requireEmpresaRoleApi` |
| 31 | `app/api/admin/importar-imoveis/route.ts:27` | rota | `requireOwnerOrAdminApi` |
| 32 | `app/api/aparencia/route.ts:38` | rota | `getUser` + `getEmpresaId` + papel admin (401/403) |
| 33 | `app/api/assistente/route.ts:77` | rota | `getUser` + `getEmpresaId` (qualquer membro) |
| 34 | `app/api/assistente/meu-dia/route.ts:14` | rota | `getUser` + `getEmpresaId` (qualquer membro) |
| 35 | `app/api/canais/[id]/route.ts:20` | rota | `requireOwnerOrAdminApi` |
| 36 | `app/api/canais/diagnostico/route.ts:25` | rota | `requireEmpresaRoleApi` |
| 37 | `app/api/canais/meta/route.ts:75` | rota | `requireOwnerOrAdminApi` |
| 38 | `app/api/canais/whatsapp/route.ts:99` | rota | `requireOwnerOrAdminApi` |
| 39 | `app/api/chat/upload/route.ts:39` | rota | `requireEmpresaRoleApi` |
| 40 | `app/api/clientes/fundir/route.ts:35` | rota | `requireEmpresaRoleApi` |
| 41 | `app/api/empresa/route.ts:69` | rota | `requireEmpresaRoleApi` |
| 42 | `app/api/equipe/atualizar-usuario/route.ts:75` | rota | `getUser` + `getEmpresaId` + papel owner/admin |
| 43 | `app/api/equipe/criar-usuario/route.ts:58` | rota | idem |
| 44 | `app/api/equipe/remover-usuario/route.ts:72` | rota | idem |
| 45 | `app/api/filial/selecionar/route.ts:27` | rota | `requireEmpresaRoleApi` |
| 46 | `app/api/funil/route.ts:63` | rota | `getUser` + papel admin |
| 47 | `app/api/imob/comissao-config/route.ts:36` | rota | `requireEmpresaRoleApi` |
| 48 | `app/api/imob/negocios/route.ts:78` | rota | `requireEmpresaRoleApi` |
| 49 | `app/api/leads/distribuir/route.ts:18` | rota | `getUser` + papel admin |
| 50 | `app/api/leads/pontuar/route.ts:20` | rota | `getUser` + papel admin |
| 51 | `app/api/menu-config/route.ts:57` | rota | `getUser` + papel admin |
| 52 | `app/api/metas/route.ts:22` | rota | `getUser` + papel admin |
| 53 | `app/api/modelos/route.ts:10` | rota | `requireEmpresaRoleApi` / `requireOwnerOrAdminApi` |
| 54 | `app/api/modelos/[id]/route.ts:19` | rota | `requireOwnerOrAdminApi` |
| 55 | `app/api/permissoes/route.ts:34` | rota | `getUser` + papel admin |
| 56 | `app/api/rastreamento/config/route.ts:14` | rota | `requireOwnerOrAdminApi` |
| 57 | `app/api/rastreamento/links/route.ts:18` | rota | `requireOwnerOrAdminApi` |
| 58 | `app/api/rastreamento/links/[id]/route.ts:20` | rota | `requireOwnerOrAdminApi` |
| 59 | `app/api/reativacao/route.ts:24` | rota | `getUser` + `exigirAdmin` |
| 60 | `app/api/reservas/route.ts:29` | rota | `requireEmpresaRoleApi` |
| 61 | `app/api/scoring/route.ts:21` | rota | `getUser` + papel admin |
| 62 | `app/zapintel/api/conversa/route.ts:44` | rota | `zapintelAcesso()` (403) + `lojaVisivel` |
| 63 | `app/zapintel/api/perfil/route.ts:59` | rota | idem |
| 64 | `app/zapintel/api/perfil/pendentes/route.ts:90` | rota | idem |
| 65 | `app/zapintel/api/sugestao/route.ts:68` | rota | idem |
| 66 | `app/zapintel/layout.tsx:27` | server (layout) | `getUser` (`:21`) + `zapintelPapelPermitido` |
| 67 | `app/admin/layout.tsx:23` | server (layout) | `requireEmpresaRole` |
| 68 | `app/admin/page.tsx:62` | server (página) | layout admin + `getEmpresaId` |
| 69 | `app/admin/filiais/page.tsx:21` | server (página) | `requireEmpresaRole` |
| 70 | `app/admin/integracoes/page.tsx:15` | server (página) | layout admin + `getEmpresaId` |

**Superadmin**

| # | Arquivo:linha | Contexto | Validação de acesso |
|---|---|---|---|
| 71 | `app/api/superadmin/assistente/route.ts:10` (e `:56`) | rota | `requireSuperAdminApi` |
| 72 | `app/api/superadmin/avisos/route.ts:32` | rota | `requireSuperAdminApi` |
| 73 | `app/api/superadmin/empresas/[id]/addons/route.ts:29` | rota | `requireSuperAdminApi` |
| 74 | `app/api/superadmin/empresas/[id]/excluir/route.ts:18` | rota | `requireSuperAdminApi` |
| 75 | `app/api/superadmin/empresas/[id]/exportar/route.ts:22` | rota | `requireSuperAdminApi` |
| 76 | `app/api/superadmin/empresas/[id]/overrides/route.ts:28` | rota | `requireSuperAdminApi` |
| 77 | `app/api/superadmin/laboratorio/preview/route.ts:24` | rota | `requireSuperAdminApi` |
| 78 | `app/api/superadmin/planos/route.ts:69` | rota | `requireSuperAdmin` |
| 79 | `app/api/superadmin/segmentos/route.ts:26` | rota | `requireSuperAdminApi` |
| 80 | `app/api/superadmin/segmentos/[chave]/preview/route.ts:22` | rota | `requireSuperAdminApi` |
| 81 | `app/api/superadmin/sync-stripe/route.ts:16` | rota | `requireSuperAdminApi` |
| 82 | `app/superadmin/assistente/page.tsx:10` | server | `requireSuperAdmin` + layout |
| 83 | `app/superadmin/laboratorio/page.tsx:13` | server | `requireSuperAdmin` + layout |
| 84 | `app/superadmin/avisos/page.tsx:9` | server | só o layout (`app/superadmin/layout.tsx:11`, `requireSuperAdmin`) |
| 85 | `app/superadmin/empresas/page.tsx:63` | server | só o layout |
| 86 | `app/superadmin/empresas/[id]/page.tsx:65` | server | só o layout |
| 87 | `app/superadmin/fipe/page.tsx:8` | server | só o layout |
| 88 | `app/superadmin/metricas/page.tsx:33` | server | só o layout |
| 89 | `app/superadmin/segmentos/page.tsx:8` | server | só o layout |

**Libs (server, herdam a validação de quem chama)**

| # | Arquivo:linha | Contexto | Validação de acesso |
|---|---|---|---|
| 90 | `lib/supabase/service.ts:7` | fábrica do admin client | — |
| 91 | `lib/rastreamento/db.ts:17` | fábrica do admin client sem tipos | — (comentário `:7-12` assume filtro manual por `empresa_id`) |
| 92 | `lib/rate-limit.ts:35` | lê a env como sal de HMAC (não cria client) | — |
| 93 | `lib/c2s.ts:1` | recebe `svc` | do chamador |
| 94 | `lib/canais/renovacao.ts:1` | recebe `svc` | do chamador (cron / `app/admin/integracoes/page.tsx:46`) |
| 95 | `lib/filiais-consulta.ts:1` | recebe `svc` | do chamador |
| 96 | `lib/portal-token.ts:1` | recebe `svc` | do chamador |
| 97 | `lib/roleta.ts:1` | recebe `svc` | do chamador |
| 98 | `lib/fipe.ts:53` (`:63`, `:93` default) | cria se não receber | do chamador |
| 99 | `lib/limites.ts:43` | cria | do chamador |
| 100 | `lib/push.ts:34` | cria | do chamador |
| 101 | `lib/superadmin.ts:66` | cria (log de ação) | do chamador |
| 102 | `lib/zapintel/ia.ts:156` (e `:181`) | cria | do chamador |

**Scripts locais e testes (não vão para o bundle)**

| # | Arquivo:linha | Contexto | Validação de acesso |
|---|---|---|---|
| 103 | `scripts/diagnostico-meta.mjs:31` | script local (`.env.local`) | n/a |
| 104 | `scripts/limpar-orfaos-chat-midia.mjs:42` | script local | n/a |
| 105 | `scripts/teste-status-entrega.mjs:17` | script local (service key em header) | n/a |
| 106 | `tests/banco.test.ts:25` | teste | n/a |
| 107 | `tests/zapintel-ia.test.ts` | teste (importa `lib/zapintel/ia.ts`) | n/a |

### 4.3 Outros achados

| # | Achado | Onde |
|---|---|---|
| 1 | Env sem `NEXT_PUBLIC_` em client component: **nenhuma**. Todas as leituras de `process.env` em `"use client"` são `NEXT_PUBLIC_*` (`components/modules/canais/canais-view.tsx:103-104,187,270-271`; `components/modules/leads/lead-modal.tsx:62,80`; `app/admin/planos/planos-view.tsx:35`). | — |
| 2 | Segredo com prefixo `NEXT_PUBLIC_`: **nenhum**. Os `NEXT_PUBLIC_*` usados são públicos por natureza (URL/anon do Supabase, `META_APP_ID`, `META_CONFIG_ID_WA/IGMSG`, VAPID pública, Stripe publishable, Sentry DSN, `APP_URL`). | `.env.example`, `.env.local` (só nomes conferidos) |
| 3 | Token de canal em texto puro chega ao navegador: a página server lê `whatsapp_official`/`meta_instagram`/`meta_messenger` e passa o objeto inteiro (com `access_token`/`webhook_verify_token`) ao client, que pré-preenche os inputs. | `app/admin/configuracoes/page.tsx:15-36,55-58`; `components/modules/configuracoes/configuracoes-view.tsx:248-258` |
| 4 | Gravação de token direto do navegador em `configuracoes_sistema` com a chave anon (depende só do RLS de escrita). | `components/modules/configuracoes/configuracoes-view.tsx:274-293` |
| 5 | `whatsapp_official` lido com cliente de sessão por rota aberta a qualquer logado (`/api/whatsapp/send`) — indica que o RLS de SELECT de `configuracoes_sistema` deixa vendedor ler o JSON com o token em claro (política não está no repo). Vendedor também lê a tabela pelo navegador. | `lib/whatsapp/index.ts:6-12`; `app/api/whatsapp/send/route.ts:8,19`; `app/(dashboard)/assistencia/components/os-modal.tsx:163` |
| 6 | Rota sem chamador que grava `whatsapp_official` com o corpo cru da requisição. | `app/api/configuracoes/whatsapp-official/route.ts:9-15` |
| 7 | Token de terceiro na query string (`access_token=`), inclusive `APP_ID|APP_SECRET`; o `beforeSend` do Sentry limpa corpo/cabeçalhos da requisição mas não há `beforeBreadcrumb` para URLs de fetch. | `lib/canais/meta.ts:58,96,120,165,196,227,301,343`; `lib/canais/instagram-login.ts:179`; `lib/rastreamento/capi.ts:93`; `supabase/functions/webhook-leads/index.ts:861,1535,1555`; `lib/sentry-comum.ts:53-63` |
| 8 | Comparação de segredo sem tempo constante (`!==`/`===`). | `app/api/portais/[slug]/leads/route.ts:38`; `app/api/imob/[slug]/lead/route.ts:54`; `app/api/webhook/c2s/[slug]/route.ts:57`; `supabase/functions/webhook-leads/index.ts:1632` |
| 9 | Segredos reaproveitados como sal de HMAC do rate limit (`PAYMENT_ENCRYPTION_KEY` → `CRON_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` → literal `'nexus'`). | `lib/rate-limit.ts:32-36` |
| 10 | Token do C2S cifrado com a chave de PAGAMENTO, contrariando a separação de chaves declarada em `lib/canais/crypto.ts:8-11`. | `lib/c2s.ts:2,88-90` |
| 11 | Webhook de pagamento consulta o banco com service key antes de validar assinatura. | `app/api/payments/webhook/[provider]/route.ts:22-56` vs `:79` |
| 12 | Página pública de imóvel lê `imoveis.*` por id sequencial, sem filtro de status/publicação. | `app/imovel/[id]/page.tsx:16` |
| 13 | Segredo logado: nenhum `console.*` imprime token/segredo; os logs de erro mostram só mensagem (`lib/payments/index.ts:37`, `supabase/functions/webhook-leads/index.ts:96,127`). | — |
| 14 | `.env.example` (versionado) só com placeholders; faltam nele `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `NEXT_PUBLIC_META_APP_ID`. `.env.local` e `.playwright-mcp/` estão no `.gitignore` (`.gitignore:36-37`); os logs do `.playwright-mcp/` (10 arquivos) contêm JWT — os decodificáveis são `role: anon`. | `.env.example`; `.gitignore:36-37` |
| 15 | Chave pública VAPID com valor literal de fallback no código (pública, não é segredo). | `lib/vapid.ts:2-4` |

---

## 5. Lógica que precisa sobreviver

| # | Regra | Arquivo:linha (função) | Entrada | Saída | Depende de segmento? | Onde é chamada |
|---|---|---|---|---|---|---|
| 1 | Taxa de cartão por linha de pagamento: só `credito` e `link` têm taxa; `credito` procura em `taxas_pagamento` a forma `maquininha` com a mesma bandeira (`visa_master` ou `outros`, padrão `visa_master`) e o mesmo nº de parcelas (padrão 1); `link` casa só pelas parcelas. Valor cobrado = valor × (1 + taxa%/100): acréscimo simples sobre o total, repassado ao cliente, sem juros compostos e sem arredondar | `lib/pdv-pagamentos.ts:36` (`taxaDaLinha`), `:52` (`valorComJuros`) | `LinhaPagamento {forma, valor, bandeira?, parcelas?}` + `Taxa[] {forma_pagamento, bandeira, parcelas, percentual_taxa}` | `number`: % da taxa ou valor cobrado com acréscimo | não | `app/(dashboard)/pdv/components/pdv-view.tsx`, `components/modules/pdv/encomenda-form.tsx`, `components/modules/pdv/encomenda-fechar.tsx` |
| 2 | Pagamento dividido fecha o total: coberto = Σ valores; cobrado = Σ valores com acréscimo; falta = total − coberto; juros = cobrado − coberto; fecha quando \|falta\| < R$ 0,01 | `lib/pdv-pagamentos.ts:70` (`resumirPagamentos`) | `LinhaPagamento[]`, `total: number`, `Taxa[]` | `ResumoPagamento {coberto, cobrado, falta, juros, fechado}` | não | `app/(dashboard)/pdv/components/pdv-view.tsx:372` |
| 3 | O que vai para a venda: 0 linhas grava `dinheiro`, 1 linha grava a própria forma, 2 ou mais gravam `multiplo` (o detalhe fica em `vendas_pagamentos`); parcelas só são gravadas com uma única linha parcelável | `lib/pdv-pagamentos.ts:90` (`formaResumida`), `:97` (`parcelasResumidas`) | `LinhaPagamento[]` | `string` (forma) / `number \| null` (parcelas) | não | `pdv-view.tsx`, `encomenda-form.tsx`, `encomenda-fechar.tsx` |
| 4 | Opções de parcelamento: as parcelas cadastradas em `taxas_pagamento` para a forma (maquininha ou link) e, no crédito, para a bandeira, em ordem crescente | `lib/pdv-pagamentos.ts:146` (`parcelasDisponiveis`) | `LinhaPagamento`, `Taxa[]` | `number[]` | não | `pdv-view.tsx`, `encomenda-form.tsx`, `encomenda-fechar.tsx` |
| 5 | Texto do pagamento para leitura e contrato: as linhas reais viram "Crédito 3x + Dinheiro"; sem linhas, usa a forma única da venda + "Nx" quando parcelas > 1 | `lib/pdv-pagamentos.ts:126` (`descreverPagamentos`) | `PagamentoGravado[] {forma_pagamento, valor_pago, parcelas}`, forma única, parcelas únicas | `string` | não | `components/modules/historico/historico-view.tsx`, `lib/contrato-modelo.ts:161` |
| 6 | Simular parcela: filtra as taxas ativas por tipo (maquininha/link) e, na maquininha, pela bandeira; total = valor × (1 + taxa/100); parcela = total ÷ n; 1x aparece como "sem juros" | `components/modules/simular-parcela/simular-parcela-view.tsx:49-62` (`SimularParcelaView`); taxas vêm de `app/api/taxas/route.ts:4` (`GET`, só `ativo = true`) | valor digitado (string com vírgula), tipo, bandeira, `taxas[]` | `SimRow[] {parcelas, taxa, valorParcela, total}` | não | `app/(dashboard)/simular-parcela/page.tsx` |
| 7 | Simular financiamento: valor financiado = valor − entrada; Price: PMT = PV·i ÷ (1 − (1+i)^−n); SAC: amortização = PV/n, 1ª parcela = amort + PV·i, última = amort·(1+i), juros = i·(n·PV − amort·n(n−1)/2); taxa padrão 0,9% a.m. | `components/modules/simular-financiamento/simular-financiamento-view.tsx:21-38` (`useMemo` em `SimularFinanciamentoView`) | valor, entrada, prazo (meses), taxa % a.m., sistema `price \| sac` | `{pv, primeira, ultima, total, juros, amort}` | não (item opcional de menu, `lib/menu.ts:281`) | `app/(dashboard)/simular-financiamento` |
| 8 | Rateio do desconto no PDV: um fechamento gera uma venda por item do carrinho; o desconto é dividido na proporção do preço cheio de cada item e arredondado a centavos; a sobra do arredondamento fica na última linha, para a soma bater com o valor cobrado | `app/(dashboard)/pdv/components/pdv-view.tsx:454-471` (`finalizarVenda`, `:409`) | carrinho `{item.preco_venda, qtd}[]`, desconto | `desconto_valor` e `valor_venda` por venda | não | botão de finalizar do PDV |
| 9 | Troca é pagamento, não desconto: valor da venda = max(0, subtotal − desconto); o aparelho recebido não abate o valor da venda; desconto + troca acima do subtotal bloqueia; desconto negativo bloqueia | `app/(dashboard)/pdv/components/pdv-view.tsx:351-359`, `:412-413` | subtotal, desconto, valores de troca | `totais {valorVenda, total}` ou aviso de bloqueio | não | PDV |
| 10 | Troca acima da referência exige aceite: a referência é o `preco_sugerido` da `tabela_precos` para o modelo mais específico que casa com o texto digitado (comparação normalizada por inclusão), dando prioridade à condição `usado`, depois `seminovo`, depois qualquer uma, e refinando pelo armazenamento citado; exige aceite quando o excedente > 0 e o excedente% > tolerância (padrão 10%, configurável em `configuracoes_sistema.troca.tolerancia_percentual`); o texto do aceite fica registrado | `lib/troca-referencia.ts:31` (`referenciaDaTroca`), `:68` (`avaliarTroca`), `:82` (`textoDoAceite`); uso em `pdv-view.tsx:341-347`, `:417` | texto do aparelho, `PrecoRef[] {modelo, armazenamento, condicao, preco_sugerido}`, valor dado, tolerância % | `number \| null` (referência); `AvaliacaoTroca {referencia, valor, excedente, percentual, exigeAceite}` | não | `pdv-view.tsx`; tolerância lida em `app/(dashboard)/pdv/page.tsx:230` |
| 11 | Estado da venda e da unidade no fechamento: `grupo_pdv` (UUID) amarra as vendas do fechamento; entrega pendente grava a venda como `pendente_entrega` e a unidade como `reservado`, senão `concluida`/`vendido`; a unidade só é reivindicada se ainda estiver `reservado` (item de reserva) ou `disponivel`; lote baixa saldo em vez de status; em falha, desfaz unidades e vendas gravadas na tentativa | `app/(dashboard)/pdv/components/pdv-view.tsx:436-441`, `:477`, `:487`, `:777` | carrinho, flag de entrega pendente | linhas em `vendas`, `vendas_pagamentos`; `inventario_unidades` atualizadas | sim — `pdv-view.tsx:99`: `SEGMENTOS[...].capacidades.usaComanda` liga o fluxo de comanda (food) | PDV |
| 12 | Aparelho recebido em troca entra no estoque como unidade `usado`, tipo `troca`, status `pendente`, com `preco_custo` = valor dado e o mesmo `grupo_pdv`; a cotação de troca usada é marcada com `usada_em` e `venda_id` | `app/(dashboard)/pdv/components/pdv-view.tsx:596`, `:618` | trocas válidas `{aparelho, imei, num, cotacaoId?}` | linha em `inventario_unidades`; `troca_cotacoes` atualizada | não | PDV |
| 13 | Valor da cotação de troca: total = max(0, base `na_troca` − soma dos descontos das avarias marcadas + bônus se `leva_seminovo` marcado); desconto ausente vale 0. O servidor refaz a conta a partir de `troca_precos`/`troca_regras` (não aceita o total do navegador), descarta chaves de avaria desconhecidas, recusa sem base cadastrada, guarda só os itens do checklist marcados (1..TOTAL_ITENS) e congela base/descontos/bônus/valor final na cotação | `lib/troca-avarias.ts:97` (`calcularTroca`); `app/api/troca/cotacoes/route.ts:41` (`POST`), `:55`, `:71`, `:78`, `:90` | `base: number`, `descontos: Record<chave, valor>`, `marcadas: string[]`, `bonus: number` | `ContaTroca {base, descontos, bonus, total}`; linha em `troca_cotacoes` com `numero` | não | `app/(dashboard)/orcamentos/cotacao/cotacao-view.tsx`, `components/modules/orcamentos/avaliar-aparelho.tsx`, `app/api/troca/cotacoes/route.ts` |
| 14 | Matriz de troca: grava uma linha (modelo + armazenamento) por vez; valor vazio vira `null` ("não avalio"), diferente de 0; descontos são mesclados no jsonb existente e chave de avaria desconhecida é descartada; a rota de família aplica um valor a uma coluna em todos os modelos da família | `app/api/troca/precos/route.ts:40` (`POST`); `app/api/troca/precos/familia/route.ts:38` (`POST`); `lib/troca-modelos.ts:72` (`familiasDeTroca`) | `{modelo, armazenamento, na_troca?, descontos?}` / `{familia, coluna, valor}` | linhas em `troca_precos` | não — liberado por empresa (`lib/troca-acesso.ts:20`); catálogo fixo de iPhone (`lib/troca-modelos.ts:26` importa `lib/apple-modelos.ts`) | `app/(dashboard)/orcamentos/precos/matriz-precos-view.tsx` |
| 15 | Regras da loja para troca: `bonus_seminovo` ≥ 0; `corte_bateria` entre 0 e 100 (padrão 80 quando não configurado) | `app/api/troca/regras/route.ts:19` (`POST`), `:28-37`; padrão em `components/modules/leads/lead-orcamento-panel.tsx:156` | `{bonus_seminovo?, corte_bateria?}` | linha em `troca_regras` | não | `app/(dashboard)/orcamentos/checklist`, `components/modules/configuracoes/troca-card.tsx` |
| 16 | Busca de cotação por código no PDV: aceita "42", "#42" e "TR-42"; cotação já usada volta com aviso `ja_usada` e a venda, não como erro | `app/api/troca/cotacoes/buscar/route.ts:28` (`GET`), `:34-62` | `numero` (string) | `{modelo, armazenamento, imei, valor_final, ..., ja_usada, venda_id}` | não | PDV, seção "Aparelho(s) na troca" |
| 17 | Cotação de troca liberada por empresa: só quando `empresas.menu_override` libera o href da cotação | `lib/troca-acesso.ts:20` (`cotacaoDeTrocaLiberada`) | sessão (empresa atual) | `boolean` | não (por empresa) | 4 telas de `app/(dashboard)/orcamentos/*` e as 4 rotas de `app/api/troca/*` |
| 18 | Validação de IMEI: considera só os dígitos; menos de 15 dá "Faltam N dígitos", mais de 15 é inválido; com 15, aplica Luhn (dobra as posições ímpares a partir de 0 e subtrai 9 quando passa de 9); a soma tem de ser múltipla de 10; máscara de leitura 2-6-6-1 | `lib/imei.ts:44` (`validarImei`), `:72` (`formatarImei`) | `bruto: string` | `ValidacaoImei {digitos, valido, motivo}` / `string` | não (menu opcional, `lib/menu.ts:275`) | `app/(dashboard)/check-imei/check-imei-view.tsx:53` |
| 19 | Campos de identificação da unidade decididos pela categoria do produto (`categorias_produtos.tipo_formulario`: celular, tablet, notebook, smartwatch, veiculo, acessorio, perfume, outro); tipo desconhecido cai no genérico (série + cor) | `lib/estoque-campos.ts:71` (`camposDaCategoria`) | `tipo: string \| null` | `CamposIdentificacao` (quais campos mostrar) | não (explícito em `lib/estoque-campos.ts:5`) | `app/(dashboard)/estoque/components/estoque-view.tsx`, `pdv-view.tsx` |
| 20 | Garantia padrão da loja: `configuracoes_sistema` chave `contrato`.`garantia_dias`, arredondada, se > 0; senão 90 dias; no contrato, a garantia é congelada item a item | `lib/contrato-emitir.ts:30` (`garantiaPadraoLoja`), `:255` | `empresaId` | `number` (dias) | não | `lib/contrato-emitir.ts:182` |
| 21 | Emissão de contrato: sem modelo ativo do documento não emite; com pagamento `multiplo`, busca `vendas_pagamentos` para descrever as partes; bloqueia quando a loja não está identificada nos marcadores que o modelo usa; renderiza, arquiva em `contratos_venda` com o nome do documento congelado e devolve o que falta no cadastro do comprador e da loja | `lib/contrato-emitir.ts:182` (`emitirContrato`), `:152` (`lojaIdentificada`), `:161` (`camposFaltantesLoja`) | `EmitirContratoInput {empresaId, clienteId, documentoId, vendaIds, itens, total, desconto, forma_pagamento, parcelas, vendedor, data, trocas}` | `ContratoEmitido {html, salvo, semModelo, bloqueado?, faltando, faltandoLoja}` | não | `pdv-view.tsx`, `components/modules/historico/historico-view.tsx`, `app/(dashboard)/garantia/components/termos-view.tsx`, `components/modules/pdv/encomenda-fechar.tsx` |
| 22 | Mescla do modelo: marcadores `{{chave}}` sem diferenciar maiúsculas; marcador inexistente vira vazio; valores escapados; pagamento detalhado prevalece sobre a forma única; páginas A4 (794×1123 px) com blocos posicionados em % e fundo que imprime | `lib/contrato-modelo.ts:157` (`marcadores`), `:306` (`mesclar`), `:349` (`renderizarModelo`) | `ModeloContrato {paginas}`, `DadosMescla {loja, comprador, itens, total, ...}` | `string` (HTML) | não | `lib/contrato-emitir.ts`, `app/admin/contrato/[id]/contrato-modelo-view.tsx` |
| 23 | Valor por extenso no contrato: reais e centavos, com milhar e milhão; o conector "e" do último bloco segue a regra do português | `lib/contrato-extenso.ts:54` (`valorPorExtenso`) | `valor: number` | `string` ("cinco mil reais") | não | `lib/contrato-modelo.ts` |
| 24 | Cadastro do comprador completo para contrato: 11 campos obrigatórios (nome, CPF/CNPJ, telefone, estado civil, profissão, CEP, endereço, número, bairro, cidade, UF); e-mail e complemento ficam de fora | `lib/cliente-contrato.ts:44` (`camposFaltantesContrato`) | `ClienteParaContrato` | `string[]` (rótulos faltantes) | não | `app/(dashboard)/clientes/components/cliente-modal.tsx`, `components/modules/leads/lead-modal.tsx`, `lib/contrato-emitir.ts` |
| 25 | Importar PDF como modelo de contrato: extrai os blocos de texto por página e sugere marcadores pelo rótulo ao lado do campo e pela seção (comprador ou vendedora) | `lib/contrato-importar-pdf.ts:312` (`importarContratoPDF`); `lib/contrato-molde-campos.ts:72` (`detectarSecao`), `:87` (`sugerirCampo`) | arquivo PDF | `ResultadoImportacao` (páginas com blocos e marcadores sugeridos) | não | `app/admin/contrato/[id]/contrato-modelo-view.tsx` |
| 26 | Limite de leads: conta os leads ativos da empresa e bloqueia o cadastro quando `empresas.limite_leads` > 0 e total ≥ limite. Só existe no navegador, no modal de novo lead. A mesma coluna `limite_leads` limita **clientes** ativos no modal de cliente. `lib/limites.ts:17` (`verificarLimite`) aceita `'leads'`, mas só é chamada com `'usuarios'`. `enforce_lead_limit` não aparece em nenhum arquivo do repo, `supabase/` incluído. As rotas que criam lead no servidor (webhook C2S, portais, site imob, agendar) não consultam o limite | `components/modules/leads/new-lead-modal.tsx:63-71`; `app/(dashboard)/clientes/components/cliente-modal.tsx:153-163`; `lib/limites.ts:17` | `empresaId`, contagem de `leads`/`clientes` ativos | aviso e interrupção do insert | não | modal de novo lead; modal de cliente; `verificarLimite` em `app/api/equipe/criar-usuario/route.ts:66` |
| 27 | Inscrição em cadência ao entrar na etapa: para cada cadência ativa com gatilho `entrou_etapa` e etapa igual (ou sem etapa), inscreve no 1º passo se não houver inscrição ativa; próxima ação = agora + `dia_offset` dias | `lib/cadencia.ts:32` (`inscreverPorEtapa`), `:19` (`dataDaAcao`) | `empresaId`, `lead {id, responsavel_id}`, `etapaSlug` | linhas em `cadencia_inscricoes` | não | `app/api/leads/mover/route.ts:79` |
| 28 | Executar passo da cadência: `adiar` leva a próxima ação para amanhã; `sair` muda para `saiu`; `executar` grava `cadencia_execucoes`, grava em `chamadas` quando o canal é ligação (atendeu e converteu → atendida, sem resposta → não atendida, caixa postal), atualiza `leads.ultima_tratativa` e avança para o próximo passo (menor ordem maior que a atual), com data = data da inscrição + `dia_offset`; `converteu` ou último passo conclui | `app/api/cadencias/acao/route.ts:21` (`POST`); `lib/cadencia.ts:26` (`proximoPasso`) | `{inscricaoId, tipo, resultado?, observacao?, canal?}` | inscrição atualizada; `{ok, concluida}` | não | `app/(dashboard)/fila/fila-view.tsx` |
| 29 | Fila do dia: inscrições ativas com `proxima_acao_em` ≤ 23:59:59 de hoje (relógio do servidor), do usuário ou sem responsável, ordenadas por vencimento, no máximo 200 | `app/(dashboard)/fila/page.tsx:15-23` | usuário, empresa | lista de `ItemFila` | não | rota `/fila` |
| 30 | Régua de follow-up, mecanismo: cada tarefa automática é marcada antes em `followups_gerados` por `chave` única (upsert com `ignoreDuplicates`); cria a tarefa `ligacao` vencendo agora; se a tarefa falha, apaga a marca para tentar de novo. Desligada por empresa com `configuracoes_sistema` `regua_followup` = `{ativo:false}`, chave gravada pela rota admin | `app/api/cron/[job]/route.ts:129` (`gerar`), `:121-125`; `app/api/admin/regua-followup/route.ts:6` (`POST`) | `{empresaId, leadId, responsavelId, regra, chave, titulo}` | `0 \| 1`; linhas em `followups_gerados` e `tarefas` | não | cron `gerar-followups` (`route.ts:105`); `components/admin/regua-followup-card.tsx` |
| 31 | Régua, regra 1 (primeiro contato): lead ativo ainda em `kanban_status = 'novo'`, criado há mais de 24 h e menos de 7 dias, gera "Fazer primeiro contato", chave `primeiro_contato:lead:<id>` | `app/api/cron/[job]/route.ts:151-162` | `leads` (até 500) | tarefa + marca | não | cron `gerar-followups` |
| 32 | Régua, regra 2 (pós-visita): visita `realizada` entre 14 e 3 dias atrás cujo lead ativo não chegou à primeira etapa de tipo `negociacao`/`ganho`/`perdido` do funil da empresa (sem funil, usa os slugs `proposta`, `credito`, `fechamento`, `perdido`) gera "Retomar … após a visita", chave `pos_visita:lead:<id>` | `app/api/cron/[job]/route.ts:166-212` | `funil_etapas`, `visitas` + lead embutido | tarefa + marca | não (sem visitas, não gera nada) | cron `gerar-followups` |
| 33 | Régua, regra 3 (confirmação D-1): visita/consulta de amanhã (dia local do servidor) que não está realizada nem cancelada gera "Confirmar … agendamento amanhã", chave `confirmacao_d1:visita:<id>` | `app/api/cron/[job]/route.ts:214-234` | `visitas` de amanhã | tarefa + marca | não | cron `gerar-followups` |
| 34 | Campanhas de fidelidade: `aniversario_cliente` (dia e mês UTC de `data_nascimento`, chave por ano), `aniversario_compra` (vendas com `data_venda` há `dias` dias, tarefa para o vendedor), `retorno_consulta` (visitas realizadas há `dias` dias); título com `{{nome}}` | `app/api/cron/[job]/route.ts:236-281` (`gerarCampanha`) | `campanhas_fidelidade {gatilho, dias, titulo}`, `clientes`, `vendas`, `visitas` | tarefas + marcas `camp:<id>:...` | não (o gatilho `retorno_consulta` usa vocabulário de saúde, mas não há ramificação por segmento) | cron `gerar-followups` |
| 35 | Automação "parado X horas": lead ativo com `data_transferencia_funil` mais antiga que agora − `horas` (padrão 48), opcionalmente numa etapa; dispara uma vez por automação + lead + instante de entrada na etapa | `app/api/cron/[job]/route.ts:283-315` | `automacoes {etapa_slug, horas, acao, config}` | ação executada + marca `auto:<id>:lead:<id>:<instante>` | não | cron `gerar-followups` |
| 36 | Ações de automação nunca enviam mensagem: `enviar_whatsapp_template` cria tarefa com o texto do template; `notificar_gestor` cria tarefa para o 1º owner/admin ativo; o padrão `criar_tarefa` aceita `prazo_dias`; ao entrar na etapa, roda as automações `entrou_na_etapa` daquela etapa (ou sem etapa) | `lib/automacoes.ts:35` (`executarAcao`), `:70` (`executarEntradaEtapa`) | `empresaId`, `LeadMin`, `acao`, `config` | linhas em `tarefas` | não | `app/api/leads/mover/route.ts:73`; cron `route.ts:307` |
| 37 | Distribuição por regras: regras ativas em ordem; critério `qualquer`, `origem` (lista, sem diferenciar maiúsculas) ou `faixa_valor` (min..max; max 0 = sem teto); destinatários cruzados com quem pode receber naquela loja; rodízio pelo ponteiro `rodizio_ptr` (gravado +1); regra sem destinatário cai na roleta; sem regras, roleta. Lead existente: não troca quem já tem dono, pula responsável ausente, grava `responsavel_desde` e `lead_atribuicoes` | `lib/distribuicao.ts:39` (`escolherResponsavel`), `:22` (`criterioBate`), `:77` (`distribuirExistente`) | `empresaId`, `LeadLike {origem, valor_estimado, filial_id}` | `usuario_id \| null` | não | `app/api/agendar/[slug]/route.ts`, `app/api/imob/[slug]/lead/route.ts`, `app/api/portais/[slug]/leads/route.ts`, `app/api/webhook/c2s/[slug]/route.ts`, `app/api/leads/distribuir/route.ts:12` |
| 38 | Roleta: membros ativos e não ausentes; com 2 ou mais filiais, só os da loja do lead (filial nula = matriz); round-robin a partir do último atendido gravado em `configuracoes_sistema` `roleta_leads` ou `roleta_leads:<loja>` | `lib/roleta.ts:23` (`membrosElegiveis`), `:72` (`proximoResponsavel`) | `empresaId`, `filialId?` | `usuario_id \| null` | não | `lib/distribuicao.ts` |
| 39 | Lead score 0–100: recência (35/26/16/8 pts até 1/3/7/14 dias da última mensagem, tratativa ou criação), origem (indicação 20, whatsapp 18, instagram e messenger 15, site 10, manual e demais 8), valor estimado (≥ 5000: 25; ≥ 1000: 16; ≥ 1: 8), alcance (telefone 8, instagram 4), engajamento (respondeu 10 + 5 por contato, máx. 25); quente ≥ 65, morno ≥ 35; configurável por empresa, mesclada sobre o padrão | `lib/lead-score.ts:68` (`calcularScore`), `:49` (`mergeScoreConfig`), `:37` (`DEFAULT_SCORE_CONFIG`) | `LeadScoreInput {ultima_mensagem_at, ultima_tratativa, created_at, origem, valor_estimado, telefone, instagram, msgs_nao_lidas, primeira_msg, contatos}`, `ScoreConfig` | `LeadScore {score, tier}` | não | `app/(dashboard)/clientes/page.tsx`, `app/(dashboard)/dashboard/termometro-leads.tsx`, `app/(dashboard)/executivo/page.tsx`, `app/admin/scoring/scoring-view.tsx`, `components/modules/leads/lead-card.tsx`, `lib/scoring-server.ts` |
| 40 | Gatilho por score: reavalia até 1000 leads ativos (contatos = nº de `chamadas`); com o gatilho ligado, score ≥ `score_min` (padrão 70), fora das etapas ganho/perdido e sem inscrição ativa, inscreve no 1º passo da cadência-gatilho | `lib/scoring-server.ts:19` (`reavaliarScores`) | `empresaId` | `{avaliados, enfileirados}` | não | cron `gerar-followups` (`route.ts:317`); `app/api/leads/pontuar/route.ts:8` |
| 41 | Lead parado: dias = floor((agora − o mais recente entre última mensagem, última tratativa e criação) / 1 dia); gravidade crítico ≥ 30, alto ≥ 15, moderado ≥ 7, atenção ≥ 3; o dashboard mostra a partir de 7 (`DIAS_PARADO`); prioridade alta/média/baixa derivada | `lib/lead-parado.ts:64` (`diasParado`), `:51` (`gravidadeDoAtraso`), `:44` (`prioridadeDoFollowUp`) | `{ultima_mensagem_at, ultima_tratativa, created_at}`, `dias` | `number`; `{id, label, tone}` | não (faixas combinadas com o dono da imobiliária, `lib/lead-parado.ts:14`, sem ramificação) | `app/(dashboard)/dashboard/dashboard-imob.tsx`, `app/(dashboard)/gestao-leads/page.tsx`, `app/(dashboard)/gestao-leads/gestao-leads-view.tsx`, `app/(dashboard)/dashboard/leads-parados.tsx` |
| 42 | Reativação (win-back): config `reativacao {cadencia_id, dias_frio = 30, incluir_perdidos}`; ignora leads inativos e ganhos; perdido (`perdido_em` ou etapa de tipo perdido) só entra se `incluir_perdidos`; frio = última atividade antes do corte; inscreve no 1º passo da cadência se não houver inscrição ativa; lê até 3000 leads | `lib/reativacao.ts:19` (`reativarFrios`) | `empresaId` | `{reativados}` | não | cron `gerar-followups` (`route.ts:328`); `app/api/reativacao/route.ts:15` |
| 43 | Esteira de devolução: config `devolucao_esteira` (padrão ativo, 30 min) e `horario` da loja; lead ativo com dono, fora das etapas ganho/perdido; o prazo conta da última mensagem recebida sem resposta (ou da posse, se for mais recente) ou da posse quando não há mensagens; vencido em minutos úteis, o lead fica sem dono, com `devolvido_em` e `devolucoes` + 1 (update condicionado ao mesmo dono); no máximo 1 varredura por minuto por empresa (memória do processo) | `lib/esteira.ts:30` (`devolverLeadsSemResposta`), `:130` (`marcoDeCobranca`), `:114` (`aguardandoResposta`) | `empresaId`, `{forcar?}` | `{devolvidos, avaliados}` | não | `app/(dashboard)/leads/page.tsx:139`; `aguardandoResposta` em `components/modules/leads/lead-card.tsx:87` |
| 44 | Minutos úteis: conta só os minutos dentro de [início, fim] nos dias da semana configurados, no fuso fixo America/Sao_Paulo; padrão 09:00–18:00 de segunda a sexta; configuração sem sentido devolve o tempo corrido | `lib/horario-util.ts:57` (`minutosUteis`), `:21` (`minutosDoDia`) | `de: Date`, `ate: Date`, `HorarioLoja {inicio, fim, dias}` | `number` (minutos) | não | `lib/esteira.ts` |
| 45 | Encomenda (criação): cria `pedidos_compra` `aberto` e uma venda `encomenda` por item, com o mesmo `grupo_pdv`; entrada paga em aparelho vira unidade `usado`/`troca`/`pendente`; falha desfaz o pedido | `components/modules/pdv/encomenda-form.tsx:254`, `:276-280`, `:299`, `:360` | cliente, itens, previsão, forma de entrada | `pedidos_compra`, `vendas`, `inventario_unidades` | não | aba Encomenda do PDV |
| 46 | Situação da encomenda: compara por dia local (não por instante); "chegou" se o pedido está recebido ou há unidade (vale mais que o prazo); senão sem prazo, atrasada (dias > 0), vence hoje ou no prazo; etapa lançada → solicitada → chegou → entregue; ordenação atrasada, vence hoje, chegou, sem prazo, no prazo | `lib/encomendas.ts:93` (`diagnosticar`), `:57` (`etapaAtual`), `:135` (`ordenarPorUrgencia`), `:121` (`agruparPorEncomenda`) | `EncomendaAberta {status, status_pedido, unidade_id, previsao_entrega, solicitado_em}` | `Diagnostico {situacao, dias, rotulo, tom}` | não | `pdv-view.tsx:115`, `components/modules/pdv/encomendas-abertas.tsx` |
| 47 | Entrega da encomenda: venda passa a `concluida` com `data_venda` = agora; copia IMEI/série da unidade para a venda se estiver vazia; com saldo > R$ 0,005, grava forma/parcelas na venda e uma linha em `vendas_pagamentos`; a unidade vai para `vendido` | `lib/encomendas.ts:181` (`finalizarEncomenda`) | `vendaId`, `PagamentoNaEntrega? {forma, valor, parcelas, empresaId}` | `ResultadoFinalizar {ok, baixouEstoque, copiouSerie, registrouPagamento}` | não | `components/modules/historico/historico-view.tsx`, `components/modules/pdv/encomenda-fechar.tsx` |
| 48 | Reserva de unidade para lead: 48 h; antes de reservar, expira as reservas vencidas (também no carregamento do PDV); só reserva o que ainda está `disponivel`; o lead tem de ser da empresa; só quem reservou ou um admin cancela | `app/api/reservas/route.ts:8` (`RESERVA_HORAS`), `:10` (`expirarReservas`), `:20` (`POST`), `:69` (`DELETE`); `app/(dashboard)/pdv/page.tsx:19` | `{unidadeId, leadId}` | `{ok, descricao, expiraEm}` / 409 | não | `components/modules/leads/lead-reserva-panel.tsx`; PDV, aba Reservas |
| 49 | Troca pendente retém venda e comissão: vendas cujo `grupo_pdv` tem unidade `pendente` ativa contam como retidas, fora do score e do faturamento, até alguém confirmar a chegada (só sai de `pendente`; idempotente) | `lib/ranking.ts:80-112` (`calcularRanking`); `app/api/estoque/confirmar-chegada/route.ts:12` (`POST`) | vendas do período + unidades pendentes | `vendasRetidas`, `faturamentoRetido` por pessoa | não | `app/(dashboard)/ranking/page.tsx`; mesmo filtro em `app/(dashboard)/equipe/components/equipe-view.tsx:380` e `app/(dashboard)/relatorios/page.tsx:52` |
| 50 | Transferência entre lojas: a unidade sai da origem e chega `pendente` no destino, até a confirmação física; o rastro fica em duas linhas de `movimentacao_estoque` (saída na origem, entrada no destino); só move o que a RLS deixa ver | `app/api/estoque/transferir/route.ts:27` (`POST`) | `{ids, filialDestino, observacoes?}` | unidades atualizadas + 2 movimentações por unidade | não | `app/(dashboard)/estoque` |
| 51 | Orçamento aprovado pelo link público: marca a aprovação antes de tudo, de forma atômica (`aprovado_em IS NULL`); assistência abre OS; downgrade dá entrada do usado como `pendente` e cria a venda (vendedor = responsável do lead ou, sem lead, quem fez o orçamento), registra só o pagamento `troca` até o valor da venda e lança o saldo a favor do cliente (dinheiro/crédito) como despesa no Financeiro; venda de unidade do estoque baixa `disponivel\|reservado` → `vendido` de forma atômica, com o custo da unidade, e, se a peça já saiu, deixa o orçamento aprovado sem venda e anota o motivo | `app/api/orcamento/[token]/route.ts:8` (`POST`), `:31`, `:39`, `:57-150`, `:153-200` | `token`, `{acao: aprovar\|recusar}` | `orcamentos`, `garantias_assistencias`, `inventario_unidades`, `vendas`, `vendas_pagamentos`, `lancamentos_financeiros` | não | `app/orcamento/[token]` (página pública) |
| 52 | Comissão imobiliária: total = valor × % (venda 6%, locação 100% por padrão, ou % informado à mão); captador e vendedor recebem parte% do total (padrão 25/25) só se o papel existe no negócio; casa = max(0, total − captador − vendedor − cashback); arredonda a 2 casas; taxas da loja mescladas sobre o padrão campo a campo | `lib/comissao-imob.ts:103` (`calcularComissaoPorPercentual`), `:84` (`calcularComissao`), `:52` (`mesclarTaxas`), `:129` (`cashbackCabe`) | `tipo`, `valor`, `TaxasComissao`, `cashback`, `papeis {captador?, vendedor?}` | `ComissaoCalculada {percentual, total, captador, vendedor, casa}` | não (sem checagem; usada por rotas e telas de imóveis e pelo Financeiro) | `app/api/imob/negocios/route.ts:108-113`, `:214`; `components/modules/financeiro/comissoes-imob.tsx`; `app/(dashboard)/financeiro/page.tsx` |
| 53 | Match de imóveis: só `disponivel`; tipo (eliminatório) +25; bairro exato +30 ou cidade +18 (eliminatório); preço pela finalidade, entre o mínimo e o máximo com 10% de tolerância, +25 (+5 se ≤ máximo); quartos e vagas mínimos (eliminatórios) +10/+8; sem critério nenhum = 40; teto 100; ordena por score | `lib/match-imoveis.ts:45` (`pontuar`), `:88` (`ranquear`) | `PerfilBusca`, `ImovelMatchInput[]` | `MatchResultado[] {imovel, score}` | sim — `app/api/match/lead/[id]/route.ts:26`: `capacidades.matchVeiculo` desvia para veículos; imóvel é o caminho padrão | `app/api/match/lead/[id]/route.ts` |
| 54 | Match de veículos: só disponíveis; categoria +22, marca +26, modelo por inclusão +24 (eliminatórios); ano na faixa +12; preço ≤ teto × 1,1 +12 (+4 se ≤ teto); km ≤ máximo +8; sem critério = 40; teto 100 | `lib/match-veiculos.ts:45` (`pontuarVeiculo`), `:93` (`ranquearVeiculos`) | `InteresseVeiculo` (de `leads.interesse`), `VeiculoMatchInput[]` | `MatchVeiculo[] {veiculo, score}` | sim — `app/api/match/lead/[id]/route.ts:26` (`capacidades.matchVeiculo`) | `app/api/match/lead/[id]/route.ts` |
| 55 | Motivos de perda: semente de motivos por segmento (varejo é o padrão), gravada no cadastro da empresa; mover para etapa de tipo `perdido` exige escolher um motivo (justificativa livre opcional) | `lib/motivos-perda.ts:80` (`motivosDoSegmento`), `:20` (`MOTIVOS_POR_SEGMENTO`); `components/modules/leads/motivo-perda-modal.tsx:33` | `segmento` | `string[]`; `motivo_perda_id` + `perdido_em` no lead | sim — `lib/motivos-perda.ts:20`: lista por chave de segmento | `app/api/register/route.ts:155`; `components/modules/leads/kanban-board.tsx:123`; `components/modules/leads/lead-modal.tsx:1035`; grava em `app/api/leads/mover/route.ts:61-62` |
| 56 | Ranking: janela do mês em hora local; vendas `concluida` por `vendedor_id` (menos as retidas); captações = leads criados por responsável; visitas realizadas por corretor; propostas atribuídas ao responsável do lead; conversão = vendas ÷ captações; score = captações×1 + imóveis captados×1 + visitas×2 + propostas×3 + vendas×5; ordena por score e depois por faturamento; progresso de meta por métrica | `lib/ranking.ts:52` (`calcularRanking`), `:47` (`janelaDoPeriodo`), `:132`, `:139` (`valorMetrica`) | `empresaId`, `periodo 'YYYY-MM'`, `imoveisCaptados?` | `LinhaRanking[]` | sim — `app/(dashboard)/ranking/page.tsx:77-80`: só injeta imóveis captados se `capacidades.captacaoDeImovel` | `app/(dashboard)/ranking/page.tsx` |
| 57 | Captação de imóveis por pessoa: conta `imoveis.captado_por` com `captado_em` na janela (comparando só a data); falha devolve mapa vazio | `lib/captacao-imob.ts:15` (`imoveisCaptadosPorPessoa`) | `empresaId`, `ini`, `fim` (ISO) | `Map<usuario_id, number>` | sim — chamada só quando `captacaoDeImovel` (`app/(dashboard)/ranking/page.tsx:78`) | `app/(dashboard)/ranking/page.tsx` |
| 58 | Conversão do funil: etapas ativas menos as de tipo perdido, sem slug repetido; "alcançaram a etapa i" = soma de quem está em i ou além; taxa = alcançaram[i] ÷ alcançaram[i−1]; gargalo = menor taxa; tempo até o 1º contato = 1ª chamada − criação, nos leads dos últimos 90 dias, por vendedor e por canal | `lib/conversao.ts:27` (`calcularConversao`) | `empresaId` | `Conversao {funil, gargaloSlug, vendedores, canais, semContatoTotal, tempoMedioGeralH, totalCohort}` | não | `app/(dashboard)/conversao/page.tsx` |
| 59 | FIPE: o mês de referência é revalidado 1 vez por dia e mantém o último conhecido se a fonte cair; o valor sai do cache `fipe_consultas` por (tipo, marca, modelo, ano, referência) ou é buscado e gravado; "R$ 68.533,00" → 68533 | `lib/fipe.ts:91` (`consultarValor`), `:63` (`getReferenciaAtual`), `:53` (`atualizarReferencia`), `:45` (`parseValor`), `:14` (`REF_TTL_MS`) | `{tipo, marca, modelo, ano, ...nomes}` | `ValorFipe {valor, codigoFipe, mesReferencia, marca, modelo, anoModelo}` | não (menu opcional de veículos, `lib/menu.ts:294`) | `app/api/fipe/valor/route.ts:6`; cron `sync-fipe` (`route.ts:342`); `app/api/superadmin/fipe/route.ts` |
| 60 | Chave do imóvel: atrasada quando está emprestada e a devolução prevista é anterior a hoje (dia local); o estado do imóvel é o pior entre as chaves (atrasada > emprestada > na imobiliária > sem chave) | `lib/chave-imovel.ts:42` (`chaveAtrasada`), `:56` (`estadoDaChave`), `:64` (`comQuemEsta`) | `ChaveMin[] {status, devolucao_prevista, com_quem}` | `EstadoChave`, `boolean`, `string \| null` | não | `app/(dashboard)/imoveis/imoveis-view.tsx:488` |
| 61 | Ponte venda ↔ conversa: liga cada venda a um lead pelos 8 últimos dígitos do telefone do cliente, considerando só leads com conversa; desempate pela conversa iniciada antes da venda, depois pela última mensagem mais próxima da data da venda, depois por mais mensagens | `lib/zapintel/ponte.ts:150` (`montarPonte`), `:56` (`chaveTelefone`), `:136` (`escolher`), `:253` (`gravarPonte`) | `empresaId` | `LinhaPonte[]` → `zapintel_venda_lead` | não | cron `ponte-vendas` (`app/api/cron/[job]/route.ts:383`) |
| 62 | Acesso por plano: `bi` e `multi_usuario` liberados para starter e pro; `api` e `white_label` só para pro; plano vazio não tem acesso (a matriz existe em dois arquivos) | `lib/plano.ts:11` (`planoTemAcesso`); `lib/planos.ts:22` (`temAcesso`) | `plano`, `modulo` | `boolean` | não | `lib/menu.ts`, `lib/acesso.ts`, `app/admin/empresa/empresa-config-view.tsx` (`planoTemAcesso`); `app/api/empresa/route.ts`, `lib/empresa-context.tsx` (`temAcesso`) |

---

## 6. Dívida visual

Escopo de todas as contagens: `app/`, `components/`, `hooks/`, `lib/` (`.ts`, `.tsx` e, onde dito, `.css`), sem `node_modules/`, `.next/`, `arquivos/`. `tailwind.config.ts` fica fora (está na raiz). Tailwind 3.4 (`package.json`), então `rounded` = 4px, `rounded-md` = 6px, `rounded-lg` = 8px; `rounded-xl` = 16px por override (`tailwind.config.ts:48`). Contagem feita por script Node com as regex abaixo; valores comparados em minúsculas.

### 6.1 Números da Fase 1

| Métrica | Fase 1 | Recontagem | Método | Status (confirma/diverge) |
|---|---|---|---|---|
| Cores hex hardcoded | 71 | **71** distintos (305 ocorrências, 88 arquivos) no critério que reproduz a Fase 1; **92** distintos / **424** ocorrências / 97 arquivos no critério amplo | Fase 1 reproduzida: só `#RRGGBB` (6 dígitos), só `.tsx`, valores distintos. Amplo: `(?<![\w&])#([0-9a-f]{8}\|[0-9a-f]{6}\|[0-9a-f]{4}\|[0-9a-f]{3})(?![\w-])` em `.ts`+`.tsx`, `app/globals.css` fora, descontando 12 falsos positivos numéricos (`#418`, `#5836`, `#1284`, `#334`–`#341` em `app/landing/data.ts`). Com os `.css` (sem `globals.css`) sobe para 115 distintos / 470 ocorrências. Sem `app/landing/`: 84 distintos (6 díg.) / 92 (3–8 díg., antes do desconto) | Confirma no critério dela (71); critério amplo dá 92 |
| Tamanhos de fonte distintos | 32 | **49** valores distintos (2.035 ocorrências); só `text-[Npx]` = **33** (1.746 ocorrências); sem `app/landing/` = 37 | União de: classes `text-xs..text-6xl` (7 valores, 29 ocorr., convertidas para px), `text-[…]` arbitrário em px/em/clamp (42 valores, 1.764 ocorr.), `fontSize:` inline em JSX (16 valores, 43 ocorr.), `font-size:` em CSS — `.css` e CSS embutido em `<style>` dentro de `.tsx/.ts` (27 valores, 199 ocorr.). Distinto = valor normalizado (`14` inline = `14px` = `text-sm`). Inclui 8 `clamp()`, `0.92em`, `1.1em`, `1.679cqw` e valores em `pt` (contratos/e-mail) | Diverge (nenhum critério plausível dá 32; o mais próximo é 33) |
| Border-radius distintos | 12 | **26** valores distintos (1.027 ocorrências); sem `app/landing/` = 17 | União de: `rounded`/`rounded-{t,b,l,r,tl,tr,bl,br}-*` nomeados (8 valores: DEFAULT, md, lg, xl, full, control, card, modal — 809 ocorr.), `rounded-[…]` arbitrário (22 valores, 106 ocorr.), `borderRadius:` inline (5 valores, 15 ocorr.), `border-radius:` em `.css` e CSS embutido (15 valores, 97 ocorr.), normalizados em px (`control`=`lg`=8px, `card`=`modal`=12px). Os 12 da Fase 1 só reaparecem como "valores `rounded-[…]` arbitrários fora de `app/landing/`" (1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16px) | Diverge (12 só no critério estreito) |
| Modais feitos à mão | 25 | **10** sobreposições próprias (7 com `fixed inset-0` em Tailwind + 3 em CSS embutido `position: fixed; inset: 0`), das quais **4** são diálogos de fato; 48 arquivos usam `Modal`/`Drawer`/`ConfirmDialog` de `components/ui` | `fixed inset-0` / `inset-0` com fundo `bg-ink/…`/`bg-black/…` / `role="dialog"` / `aria-modal` / `createPortal` / `position: fixed; inset: 0` fora de `components/ui/`. Primitivos existentes: `components/ui/modal.tsx:28`, `components/ui/drawer.tsx:20`, `components/ui/confirm-dialog.tsx:19` (+ ganchos `components/ui/overlay.ts`). Os 12 arquivos `*-modal.tsx` usam todos `<Modal>` (só `lead-modal.tsx` monta o próprio fundo). Sem mudança em `fixed inset-0` no git desde 01/09 | Diverge (10, não 25) |

### 6.2 Modais à mão

| # | Arquivo:linha | Tipo | Usa components/ui? |
|---|---|---|---|
| 1 | `components/modules/leads/lead-modal.tsx:1217-1219` | Diálogo (ficha do lead) com `createPortal` + fundo `bg-ink/30` próprio | Não (importa outros itens de `components/ui`, mas não o `Modal`) |
| 2 | `components/layout/command-palette.tsx:189-191` | Diálogo (busca Cmd+K) com `createPortal` + fundo `bg-ink/30` | Não |
| 3 | `app/menu/[slug]/menu-view.tsx:135` | Diálogo/sheet "Finalizar pedido" (cardápio público) | Não |
| 4 | `components/zapintel/painel-ao-vivo.tsx:632-633` (CSS em `:803`) | Gaveta lateral `role="dialog"` com fundo `.pv-gaveta-fundo` | Não |
| 5 | `components/admin/admin-shell.tsx:148-150` | Drawer do menu mobile (fundo `bg-ink/40` + painel) | Não |
| 6 | `components/superadmin/superadmin-shell.tsx:87-89` | Drawer do menu mobile (cópia do anterior) | Não |
| 7 | `components/layout/mobile-topbar.tsx:73-75` | Drawer do menu mobile (CRM) | Não |
| 8 | `components/zapintel/zap-sidebar.tsx:69,72` | Sidebar off-canvas `.zi-side` + fundo `.zi-side-fundo` (CSS embutido) | Não |
| 9 | `components/layout/seletor-filial.tsx:117` | Camada invisível de clique-fora do dropdown de filial | Não |
Total: 9 arquivos / 10 sobreposições (o #8 tem duas: painel e fundo). Diálogos de fato: #1–#4.

### 6.3 Restos do tema ÁPICE

| Arquivo:linha | Resto |
|---|---|
| `app/globals.css:1` | Comentário "TEMP ÁPICE Fraunces/JetBrains" — Fraunces já não é carregada (`app/layout.tsx:2,8-9` só Geist e JetBrains Mono) |
| `app/globals.css:9-30` | Variáveis HSL shadcn do ÁPICE: fundo "azul acinzentado" (`--background` `:10`), `--primary` navy (`:17`), `--ring` dourado #C9A24B (`:29`), `--radius: 0.75rem` (`:30`); bloco marcado "ÁPICE: navy = primária, dourado = accent" (`:16`) |
| `app/globals.css:32-39` | "Tokens ÁPICE": `--navy`, `--navy-soft`, `--gold`, `--gold-deep`, `--danger`, `--ink-2`, `--ink-3` — nenhum é usado em `.ts/.tsx` |
| `app/globals.css:47,50-51` | `* { border-color: hsl(var(--border)) }` e `body` com `hsl(var(--background))`/`hsl(var(--foreground))` — base global ainda vem das variáveis ÁPICE |
| `app/globals.css:71,79` | Scrollbar em `rgba(22,32,46,…)` (navy #16212E) |
| `app/globals.css:126-129` | `@keyframes unreadPulse` com glow dourado `rgba(201,162,75,…)` — sem uso no código |
| `app/globals.css:132-140` | `.jm-field` autofill com `#F2F2F4`/`#16212E` — classe sem uso |
| `tailwind.config.ts:47-50` | Raios "TEMP ÁPICE": `xl` 1rem, `2xl` 1.25rem, `3xl` 1.5rem (override) |
| `tailwind.config.ts:52-59` | `backgroundImage` "TEMP ÁPICE — remover ao fim da Fase 2": `hero-gradient` (navy + glow dourado), `sidebar-gradient`, `sidebar-navy` (navy + glow dourado) — nenhum usado |
| `lib/wl-menu.ts:36-42` | Preset `ESCURA` do menu: fundo `linear-gradient(#16212E,#111A24)` e item ativo com gradiente dourado `rgba(201,162,75,.22→.04)` — ativo para quem escolhe "Escura" em `app/admin/aparencia/aparencia-view.tsx:46` |
| `app/admin/aparencia/aparencia-view.tsx:10` | `CUSTOM_DEFAULT` navy (`#111A24`, `#93A2B5`, `#1E2A3A`) |
| `app/(dashboard)/error.tsx:11,18` | Navy ÁPICE `#16212E`/`#22303F` no texto e botão da tela de erro |
| `components/layout/limite-banner.tsx:67,69,81` | Navy `#16212E` no texto do banner de limite crítico |
| `app/(dashboard)/orcamentos/checklist/checklist-view.tsx:103` | `accent-[var(--accent)]` lê a variável HSL do ÁPICE (`app/globals.css:23`, valor `214 32% 84%`, cor inválida sem `hsl()`) |
| `app/(dashboard)/orcamentos/cotacao/cotacao-view.tsx:306` | idem |
| `components/modules/orcamentos/avaliar-aparelho.tsx:250` | idem |
| `components/modules/orcamentos/troca-modal.tsx:217` | idem |
| `app/(dashboard)/*/loading.tsx` — 38 pontos em 33 arquivos (ex.: `agenda/loading.tsx:17`, `dashboard/loading.tsx:6,10,11,13`, `pdv/loading.tsx:8,14,15`, `leads/loading.tsx:8`, `clientes/loading.tsx:10`; demais na `:17`) | Esqueletos com `rounded-xl`/`rounded-2xl`, que dependem do raio TEMP ÁPICE |
| `app/admin/integracoes/integracoes-view.tsx:80,89` | Snippet de formulário para o cliente com `id="apice-lead"` |
| `app/api/admin/importar-imoveis/route.ts:50` | `User-Agent: ApiceCRM/1.0` na importação de feed |
| Menus do admin (`components/admin/admin-shell.tsx`, `components/superadmin/superadmin-shell.tsx`, `components/layout/sidebar.tsx`) | Sem glow dourado: a única sombra é a neutra do drawer mobile `shadow-[0_0_40px_rgba(0,0,0,0.2)]` (`admin-shell.tsx:150`, `superadmin-shell.tsx:89`, `mobile-topbar.tsx:75`). Nenhum `#d4af37`/`#c9a227`/`#f5c518` nem `amber-*` em sombra fora da landing |

Fora da lista: "glow" em `app/landing/` (`landing.css:57`, `Hero.tsx:92`, `FinalCta.tsx:4,26`, `Plans.tsx:5`, `ProductStage.tsx:104`) é glow cobalto da landing nova; "Dourado" em `lib/apple-modelos.ts` é nome de cor de iPhone.

### 6.4 Roxo do ZapIntel

| Arquivo | Linhas | Valor | Ocorrências |
|---|---|---|---|
| `app/zapintel/globals.css` | 13, 14 | `--purple: #7c5cfc`, `--purple-l: #6d28d9` (definição) | 2 |
| `app/zapintel/layout.tsx` | 40, 43, 52, 55 | `#7c5cfc` | 4 |
| `app/zapintel/layout.tsx` | 40, 52 | `#4f46e5` (par do gradiente) | 2 |
| `app/zapintel/leads/page.tsx` | 345 | `rgba(124,92,252,…)` | 1 |
| `app/zapintel/leads/page.tsx` | 329, 334, 339, 345, 364, 381 / 296, 322, 334, 345, 346, 358 | `var(--purple)` / `var(--purple-l)` | 6 / 6 |
| `app/zapintel/leads/[id]/page.tsx` | 412 | `rgba(124,92,252,…)` | 2 |
| `app/zapintel/leads/[id]/page.tsx` | 381, 384, 419, 454 / 307, 385, 410, 424 | `var(--purple)` / `var(--purple-l)` | 4 / 4 |
| `app/zapintel/atendimento/page.tsx` | 558, 588, 653 / 553, 570, 611, 645 | `var(--purple)` / `var(--purple-l)` | 3 / 4 |
| `app/zapintel/insights/page.tsx` | 364, 419, 426, 432 / 359, 376, 389, 396, 398 | `var(--purple)` / `var(--purple-l)` | 4 / 5 |
| `app/zapintel/posvenda/page.tsx` | 212, 217 / 198, 208 | `var(--purple)` / `var(--purple-l)` | 2 / 2 |
| `components/zapintel/painel-ao-vivo.tsx` | 552, 724, 728 | `rgba(124,92,252,…)` | 4 |
| `components/zapintel/painel-ao-vivo.tsx` | 182, 698, 717, 719, 722, 751, 816, 821 / 226, 343, 716, 719, 721, 734, 742, 812 | `var(--purple)` / `var(--purple-l)` | 8 / 8 |
| `components/zapintel/zap-sidebar.tsx` | 87 | `#7c5cfc` + `#4f46e5` (gradiente do logo) | 2 |
| `components/zapintel/zap-sidebar.tsx` | 104 | `rgba(124,92,252,…)` | 1 |
| `components/zapintel/zap-sidebar.tsx` | 130, 131 / 105 | `var(--purple)` / `var(--purple-l)` | 2 / 1 |
| `components/zapintel/robo-analises.tsx` | 221 / 85, 231, 307 | `var(--purple)` / `var(--purple-l)` | 1 / 3 |
| `components/zapintel/rotulos.ts` | 18 | `#7c5cfc` (rótulo "Parado") | 1 |
| `components/assistente/assistente-widget.tsx` | 70, 138, 379 | `#6d28d9` | 3 |
| `components/assistente/assistente-widget.tsx` | 137, 138, 365 | `#7c5cfc` | 3 |
| `components/admin/admin-shell.tsx` | 94 | `#6d28d9` + `rgba(124,92,252,0.10)` (atalho ZapIntel no menu do admin) | 2 |
| `components/superadmin/addons-empresa.tsx` | 48 / 9, 72 | `#7c5cfc` / `#6d28d9` | 1 / 3 |
| `components/superadmin/superadmin-shell.tsx` | 14, 61 | `#6D28D9` (`ADMIN_COR`, cor do superadmin) | 2 |
| `components/superadmin/controle-empresa.tsx` | 9, 82, 86, 134 | `#6D28D9` | 7 |
| `components/superadmin/impersonation-banner.tsx` | 45, 51 | `#6D28D9` | 5 |
| `components/superadmin/acoes-empresa.tsx` | 10 | `#6D28D9` | 1 |
| `components/superadmin/avisos-manager.tsx` | 8 | `#6D28D9` | 1 |
| `components/superadmin/gestao-super-admins.tsx` | 8 | `#6D28D9` | 1 |
| `app/superadmin/page.tsx` | 7 | `#6D28D9` (`ROXO`) | 1 |
| `app/superadmin/metricas/page.tsx` | 7 | `#6D28D9` | 1 |
| `app/superadmin/empresas/page.tsx` | 7, 21, 115, 143 | `#6D28D9` | 6 |
| `app/superadmin/empresas/[id]/page.tsx` | 16, 30 | `#6D28D9` | 3 |
| `app/superadmin/planos/planos-admin-view.tsx` | 23 | `#6D28D9` | 1 |
| `app/superadmin/segmentos/segmentos-view.tsx` | 149, 179, 203, 256 | `#6D28D9` | 6 |
| `components/modules/leads/types.ts` | 110 / 112 | `#A78BFA` (violet-400) / `#6366F1` (indigo-500) — cor de etapa do funil imobiliário, não tema ZapIntel | 1 / 1 |

Totais: literais `#6d28d9` = 43 ocorrências em 16 arquivos (13 deles do superadmin, que usa o mesmo valor como cor própria); `#7c5cfc` = 11 em 6 arquivos; `#4f46e5` = 3; `rgba(124,92,252,…)` = 9 em 5 arquivos; `var(--purple)` = 30 e `var(--purple-l)` = 33 em 8 arquivos. Nenhuma classe `violet-*`, `purple-*`, `indigo-*` ou `fuchsia-*` do Tailwind; nenhum `#7c3aed`.

---

## Contagem por lista

| Lista | Itens | Detalhe |
|---|---:|---|
| 1. Segmento no código | 208 | 101 leituras de coluna/tabela + 107 decisões por segmento · (a) empresa_modulos 80 · (b) campo personalizado 37 · (c) morre 91 |
| 2. Mapa de rotas | 211 | 94 páginas + 117 rotas (111 em `app/api` + `/i/[codigo]`, `/track.js`, 4 em `/zapintel/api`) · DUP: 24 páginas, 13 rotas · ⚠ service key sem sessão: 16 |
| 3. Acoplamento entre módulos | 240 | 130 leituras · 39 escritas · 61 imports · 10 SQL em `supabase/funcoes` |
| 4. Segredos e credenciais | 152 | 30 credenciais · 107 arquivos com service key (28 em rota/página pública, 0 em client component) · 15 outros achados |
| 5. Lógica que precisa sobreviver | 62 | 7 dependem de segmento · `enforce_lead_limit` ausente do repo (limite só no navegador) |
| 6. Dívida visual | 67 | 4 métricas (hex 71 confirma; fontes 49, radius 26, modais 10 divergem) · 9 arquivos de modal à mão · 21 restos ÁPICE · 33 linhas de roxo ZapIntel |
| **Total** | **940** | |
