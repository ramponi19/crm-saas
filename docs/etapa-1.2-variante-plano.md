# Etapa 1.2: variante e preço efetivo (plano de execução)

25/11/2026. **Só plano: nenhum código, nenhuma migração.** A 1.2 começa quando a 1.1 estiver em produção.

Base:
- [unificacao-preco-proposta.md](unificacao-preco-proposta.md) com o adendo de 24/11 (D1–D11 aprovadas);
- [roteiro-reconstrucao.md](roteiro-reconstrucao.md) (ordem, critérios de aceite, veículos fora, PDV aberto);
- [pdv-v2-especificacao.md](pdv-v2-especificacao.md) §B e §B.1 (o que a 1.1 entrega).

Regra de trabalho que vale aqui (memória do projeto, "Excelência sem espera de horário", 25/11):
- etapa liberada por **critério**, nunca por horário;
- **toda migração é compatível com o app no ar**: primeiro adiciona, depois o app passa a usar, por último remove o velho;
- portões obrigatórios: plano revisado; testes, build e conferência visual; smoke na Demonstração; ponto de volta e backup antes de mudar o banco; deploy só sem atividade na JM nos últimos 10 minutos.

---

## 0. O que a 1.1 entrega e a 1.2 usa

| Da 1.1 | Para quê na 1.2 |
|---|---|
| `tem_permissao(p)` e o catálogo de permissões no manifesto | as RPCs de preço conferem `estoque.preco_variante` e `estoque.preco_proprio` dentro do banco |
| permissões `estoque.preco_variante` e `estoque.preco_proprio` (JM: Dono e Admin) | quem edita o preço da variante e quem define ou tira o preço próprio da unidade |
| `estoque.ver_custo` e o custo em `estoque_unidades_custos` | a variante **não tem custo** (D9). A prévia "X unidades mudam de preço" mostra margem só para quem tem `ver_custo`, lendo o satélite |
| `auditar()` e `auditoria_eventos` (só INSERT) | todo o histórico de preço (D11): `entidade = 'variante'\|'unidade'`, `acao = 'preco'`, `origem` manual, herança, precificação, CSV ou migração |
| `empresa_config` definitivo | nada de config nova na 1.2; as chaves de preço (se vierem) usam o motor |
| RLS de escrita substituída por RPC nas tabelas de estoque | a variante já nasce sem escrita direta: só RPC |

**Atenção para o plano da 1.1** (não é escopo desta etapa, mas afeta a ordem): o §B.1 do PDV v2 diz "remoção das colunas antigas [de custo] no **mesmo deploy** do app". Pela regra nova, a 1.1 tem de seguir o padrão em três tempos: (1) satélite criado e preenchido por gatilho, com as colunas antigas mantidas; (2) app lendo do satélite; (3) colunas antigas removidas num deploy separado. Se a 1.1 não puder seguir esse padrão, a justificativa vai no plano dela e espera a decisão do Matheus. **Resolvido em 25/11:** [etapa-1.1-plano.md §4](etapa-1.1-plano.md) usa quatro tempos (entregas 1.1d a 1.1g), com a coluna antiga legível até o app novo estar no ar.

---

## 1. Diagnóstico da JM: leitura direta da produção, 25/11/2026 (só SELECT)

Comparado com o dump de 09/11 usado na proposta.

### 1.1 Volumes

| O quê | Dump 09/11 | Produção 25/11 | Leitura |
|---|---|---|---|
| Empresas com produto, unidade ou tabela de preços | — | **só a JM** (empresa 1) | nenhuma outra empresa tem dado a migrar |
| Produtos | 35 | **35** (todos ativos) | igual |
| Produtos com opções (`armazenamentos`) | — | **32**; 3 sem opção (Apple Watch Ultra 3, iPhone 18 Pro, Cabo USB-C) | — |
| Combinações produto × opção | 104 | **101** (opções em uso: 64GB, 128GB, 256GB, 512GB, 1TB, 2TB) | D7 "sob demanda" continua certa: criar 202 variantes vazias seria ruído |
| Nomes de produto duplicados (normalizados) | — | **0** | o casamento por nome exato é seguro |
| **A** (`estoque_produtos.preco` > 0) | 0 | **0** | nada a migrar para variante única |
| **B** (`estoque_tabela_precos`) | 0 | **0** linhas, em **todas** as empresas | nada a migrar; a contração de B é só remover código |
| Categorias da JM | — | 7: celular (33 produtos), tablet (0), notebook (0), smartwatch (1), outro (0), acessório (1), perfume (0) | o rótulo "Armazenamento" vale para celular, tablet e notebook |
| Unidades | 45 | **57** | +12, todas trocas pendentes criadas desde 09/11 |
| Unidades com placa ou chassi, qualquer empresa | 0 | **0** | veículos: nada a pular hoje (a regra continua, §4.1 do roteiro) |
| Vendas | 99 | **131** (124 concluídas, 7 encomendas abertas) | — |
| Vendas com unidade | 19 | **19** | a JM segue vendendo quase tudo **sem estoque** |
| Vendas com unidade em que `valor_venda + desconto = C` | 19 de 19 | **19 de 19** | confirma: o PDV cobra C |
| Orçamentos | — | **0** | — |
| Pedidos de compra | — | 127 (111 abertos, 58 com mais de 30 dias) | fora da 1.2; vale uma faxina separada |
| Espelho `itens` | — | 92 | o gatilho `estoque_item_sync` segue (só muda na 1.1, sem custo) |

### 1.2 Unidades por situação

| Situação | Qtd | Tratamento na 1.2 |
|---|---|---|
| Disponíveis com produto + opção + condição claros | **6** (ids 36, 49, 50, 51, 52, 53) | variante criada pela M2, preço da variante = C da unidade, origem `variante`. **0 mudança de preço** |
| Disponível **inativa** (id 45, "iPhone SE 3ª geração", C 100, custo 20, sem opção) | 1 | ativo = false desde 09/11 (parecia teste). A M2 **pula** unidade inativa |
| Reservada sem produto (id 75, ligada à encomenda 121) | 1 | fica sem variante, `preco_origem = proprio` |
| Trocas pendentes (sem produto, sem opção, sem C; descrição só no texto, ex.: "iPhone 11 — entrada da encomenda de …") | **31** (19 → 31 desde 09/11) | ficam sem variante até alguém classificar a troca na tela da unidade. Na classificação, escolhe produto + opção + condição e ganha a variante |
| Vendidas | 18 (3 com produto + opção, 12 sem opção, 3 sem produto) | `variante_id` só nas **3** com chave clara; nunca mexe em C nem na venda |
| Condição `seminovo` | 4 (2 disponíveis: 49 e 50; 2 vendidas) | D3: viram `usado` na unidade; "seminovo" fica rótulo da empresa |

As 6 variantes que a M2 cria na JM (todas na loja 3, Mogi Guaçu):

| Unidade | Variante (produto / opção / condição) | Preço da variante = C |
|---|---|---|
| 52 | iPhone 12 / 128GB / usado | 1.495 |
| 53 | iPhone 12 Pro / 128GB / usado | 1.995 |
| 49 | iPhone 14 Pro Max / 256GB / usado (era seminovo) | 3.695 |
| 50 | iPhone 16 / 128GB / usado (era seminovo) | 3.995 |
| 51 | iPhone 16 / 128GB / novo | 4.795 |
| 36 | iPhone 17 / 256GB / novo | 5.445 |

### 1.3 Encomendas abertas (7)

54, 92, 31, 37, 43 e 122 têm produto (iPhone 17, 17 Pro, 17 Pro Max, 13 Pro), **sem opção**; a 121 não tem produto. Pela D8, **a encomenda nova** exige variante; as abertas ficam como estão (venda sem variante) e são entregues pelo fluxo de hoje.

### 1.4 Leitura

- A migração de dados da JM é **pequena e toda automática**: 6 variantes, 6 vínculos de unidade disponível, 3 de vendida, 4 condições trocadas, **0 preço efetivo alterado**.
- O peso da etapa está no **código e nas telas** (seção 4), não nos dados.
- O ganho imediato da JM vem da **precificação** (P1) e da **encomenda com variante**, não do PDV, porque 112 das 131 vendas não passam por unidade de estoque.

---

## 2. Decisões aplicadas (D1–D11) e o que ainda falta decidir

| # | Aprovado | Como aparece neste plano |
|---|---|---|
| D1 | herança **materializada** (`preco_venda` continua sendo o preço efetivo, mais `preco_origem`) | M1 + gatilhos |
| D2 | um eixo "opção" (texto, pode ser composto: "16GB / 512GB"), rótulo pela categoria | `opcao`, `opcao_norm`, `estoque_categorias.opcao_rotulo` |
| D3 | `novo`/`usado`; seminovo é rótulo; nota de estado vira preço próprio | M1 aceita os dois valores; M2 converte; M4 restringe |
| D4 | preço por empresa; exceção por loja **reservada** | `preco_variante(variante, loja)` lida por todos desde o início |
| D5 | propagação só em **disponíveis** que herdam | gatilho de propagação |
| D6 | `estoque.preco_variante` e `estoque.preco_proprio` (JM: Dono e Admin) | RPCs conferem no banco |
| D7 | criação **sob demanda** | sem variante vazia em massa |
| D8 | encomenda nova exige variante; criação rápida para quem tem `preco_variante` | entrega 1.2d |
| D9 | custo fora da variante (fica no satélite da 1.1) | variante sem coluna de custo |
| D10 | SKU e EAN na variante; IMEI e série na unidade | colunas na variante |
| D11 | histórico na `auditoria_eventos` | gatilhos e RPCs chamam `auditar()` |

**Respondidas pelo Lucas em 25/11:**

1. **Unidade 45** (inativa, C 100, custo 20): **fica como está.** A M2 pula unidade inativa.
2. **Trocas pendentes**: **ficam sem classificar até a revisão** de cada aparelho (o texto não traz opção nem condição; um palpite errado viraria preço errado). Entra na 1.2 a lista **"Trocas a classificar"** e o **aviso de troca parada** no painel do dono (§2.1, entrega 1.2g).
3. **Nome da aba:** **"Preços"**, dentro de Produtos (troca a "Tabela de preços").

### 2.1 Trocas a classificar e aviso de troca parada

**O que a produção mostra (25/11, só leitura):** as 30 trocas pendentes ativas da JM **ainda não chegaram à loja** (nenhuma tem `recebido_em`): são aparelhos aceitos em troca, à espera de o cliente entregar. Todas têm `grupo_pdv` (a venda que as trouxe). Idade pela data do aceite: 22 com mais de 7 dias, 18 com mais de 15, **10 com mais de 30** (a mais antiga é de 02/10). Mogi Guaçu 12, Jaguariúna 18. Trocas que já chegaram e continuam sem produto: 0 hoje.

**A lista "Trocas a classificar"** (Estoque → aba própria):
- **Quem vê:** quem tem `estoque.preco_proprio` (classificar dá a variante e, com ela, o preço). Na JM, Dono e Admin. Respeita a loja visível (`filiais_visiveis()`).
- **O que entra:** toda unidade de troca **ativa** que ainda não tem produto + opção + condição, em duas situações:
  - **aguardando chegada** (`status = 'pendente'`): idade contada do aceite (`created_at`);
  - **chegou, sem classificação** (recebida e ainda sem variante): idade contada da chegada (`recebido_em`).
- **Colunas:** aparelho (descrição digitada no aceite), loja, situação, **idade em dias**, venda de origem (link para o Histórico pelo `grupo_pdv`), valor oferecido na troca (visível ao vendedor por decisão de 24/11; o custo da unidade só com `estoque.ver_custo`).
- **Topo:** a **quantidade** total e por situação, e o filtro "paradas há mais de X dias".
- **Ação "Classificar":** abre a edição da unidade (1.2b) com produto, opção e condição; ao salvar, vincula a variante pela `estoque_unidade_vincular` (audita). A troca aguardando chegada pode ser classificada antes de chegar; a chegada continua pelo fluxo de hoje (Estoque → confirmar chegada).
- **Ordem padrão:** a mais antiga primeiro.

**O aviso de troca parada** (painel do dono):
- **Configuração:** chave `estoque.troca_parada_dias` no `empresa_config` da 1.1 (por empresa, com exceção por loja se o motor permitir). **Padrão: 7 dias.** Editável em Configurações → Estoque por quem tem `equipe.cargos`/Dono.
- **Quem vê:** no painel (dashboard), o Dono e quem tem `estoque.preco_proprio`, só para as lojas que enxerga.
- **Regra:** aparece quando houver pelo menos uma troca, nas duas situações acima, com idade **maior que X dias**. Mostra a quantidade e a mais antiga ("4 trocas paradas há mais de 7 dias; a mais antiga há 54 dias") e leva à lista já filtrada.
- **Some sozinho** quando todas forem classificadas ou recebidas e classificadas. Não grava nada: é leitura (sem notificação nem e-mail nesta etapa).
- **Na JM hoje, com X = 7:** apareceria com **22** trocas.

**Banco (vai na M1, só adiciona):**
- função `estoque_trocas_a_classificar(p_filial bigint default null) STABLE SECURITY INVOKER`: devolve as linhas da lista com a idade calculada no fuso da loja; a RLS da unidade já limita empresa e loja, e a função recusa sem `estoque.preco_proprio`;
- função `estoque_trocas_paradas_resumo() STABLE`: quantidade e idade máxima acima do `estoque.troca_parada_dias` (lido pela `config_valor`), para o painel;
- índice parcial `estoque_unidades (empresa_id, filial_id, created_at) where tipo = 'troca' and variante_id is null and ativo` (a lista e o aviso não varrem a tabela).

**Critério de aceite próprio:** com X = 7, o painel do dono mostra exatamente as trocas com mais de 7 dias (prova SQL comparando a função com a contagem direta); Vendedor e Consulta não veem a lista nem o aviso; classificar pela lista grava a variante e a auditoria; mudar X na configuração muda o aviso sem deploy.

---

## 3. Migrações (todas compatíveis com o app no ar)

Números reservados no `.claude/sessoes-locais.json` só no momento em que cada arquivo for criado (regra de colisão). Cada migração vem com o `teste-*.sql` e o `esperado/*.json` dela, no mesmo commit (ritual §8.6.1), e com o arquivo de volta.

### M1 — estrutura (só adiciona; o app atual não percebe nada)

**Tabelas e colunas novas:**

| Objeto | Detalhe |
|---|---|
| `estoque_variantes` (nova; módulo `catalogo`) | `id`, `empresa_id`, `produto_id` (FK `on delete restrict`, mesma empresa), `opcao text` (vazio na variante única), `opcao_norm` (gerada: minúsculo, sem acento, sem espaço; "256 GB" = "256GB"), `condicao` (`novo`\|`usado`), `preco numeric` (nulo = sem preço), `sku text`, `ean text[]`, `ativo`, `travado` (a precificação automática não mexe), `created_at`, `updated_at`, `atualizado_por`. Únicos: `(empresa_id, produto_id, opcao_norm, condicao)` e `(empresa_id, sku)` parcial. Índices `(empresa_id, produto_id)`, `(empresa_id, ativo)` e GIN em `ean` |
| `estoque_unidades` | `+ variante_id` (FK, nulo permitido), `+ preco_origem` (`variante`\|`proprio`, **padrão `proprio`**, não nulo). Nada muda: nenhuma unidade herda até a M2 |
| `estoque_categorias` | `+ opcao_rotulo text` (vazio = sem eixo), `+ unidade_unica boolean default false` ("cada unidade é única": veículo e afins) |
| `estoque_variantes_precos_loja` | **não criada** (D4 só reserva o nome). A função abaixo já existe para todo leitor usar |

**Funções:**

| Função | O que faz |
|---|---|
| `preco_variante(p_variante, p_filial) STABLE` | hoje devolve `estoque_variantes.preco`; amanhã, a exceção por loja |
| `estoque_variante_salvar(...)` RPC `SECURITY DEFINER` | cria ou altera variante e preço; confere `tem_permissao('estoque.preco_variante')` e `modulo_ligado`; recusa ligar variante a categoria `unidade_unica`; audita (`origem` vem do parâmetro: manual, csv, precificação) |
| `estoque_variante_previa(p_variante, p_preco_novo) STABLE` | "X unidades disponíveis passam de R$ A para R$ B" (e a margem, só com `ver_custo`) |
| `estoque_unidade_preco(p_unidade, p_preco \| null)` RPC | `p_preco` = define preço próprio; `null` = volta ao preço da variante. Confere `estoque.preco_proprio`; audita |
| `estoque_unidade_vincular(p_unidade, p_variante)` RPC | liga ou troca a variante (classificação da troca, entrada); recusa `unidade_unica` |
| `pdv_conferir_precos(p_itens jsonb) STABLE` | roteiro §4.4: recebe unidade + preço mostrado e devolve as diferenças contra o preço efetivo atual |

**Gatilhos (valem para qualquer caminho de escrita):**

1. **Propagação:** `AFTER UPDATE OF preco ON estoque_variantes` → atualiza `preco_venda` das unidades com `preco_origem = 'variante'` **e** `status = 'disponivel'` (D5); marca a transação com `nexus.preco_origem = 'heranca'` e audita uma linha por unidade.
2. **Preço próprio automático:** `BEFORE UPDATE OF preco_venda ON estoque_unidades` fora da propagação → `preco_origem = 'proprio'` e audita. **Compatibilidade:** é isto que deixa o app antigo seguro: a tela de hoje, que grava `preco_venda` direto, continua funcionando e a unidade vira "própria", sem perder o valor.
3. **Vínculo:** troca de `variante_id` numa unidade com origem `variante` → recebe o preço da variante; variante sem preço = mantém C, como próprio.
4. **"A partir de":** recalcula `estoque_produtos.preco` = menor preço das variantes ativas, **só quando o produto tem variante**. Produto sem variante mantém o A de hoje (o cardápio, que grava A, continua funcionando até a M3).
5. **Ponte do cardápio (temporária, sai na M4):** se o app antigo gravar `estoque_produtos.preco` num produto que tem **variante única**, o valor vai para a variante única. Sem dado hoje (A = 0 em todas as empresas), mas evita divergência durante a transição.

**Condição (expansão):** a checagem de `estoque_unidades.condicao` passa a aceitar `novo`, `usado` **e** `seminovo` (o app antigo grava `seminovo`). A variante só aceita `novo`/`usado`; ao vincular, `seminovo` lê como `usado`.

**RLS:** `estoque_variantes` com SELECT por empresa (preço de venda não é segredo na loja) e **sem grant de escrita** para `authenticated` (só RPC). Uma política por comando, sem `for all`.

**Teste SQL da M1** (transação desfeita, duas empresas): isolamento; propagação só em disponível que herda (reservada e vendida intactas); preço próprio automático; vínculo; "a partir de"; recusa sem permissão; recusa em `unidade_unica`; auditoria gravada em cada caso; invariante "disponível com origem `variante` e C ≠ preço da variante = 0".

**Volta da M1:** enquanto nenhuma variante existir (antes da 1.2b), `drop` das funções, gatilhos, colunas novas e da tabela. Depois que a 1.2b permite criar variante pela tela, a volta passa a ser **só do app** (promover o deploy anterior): a estrutura fica, os gatilhos continuam protegendo o preço e nenhum dado é apagado.

### M1b — conferência de preço no fechamento (depois do app da 1.2b)

`concluir_venda_pdv` passa a conferir, dentro da transação, que `valor_venda + desconto_valor` de cada linha = preço efetivo da unidade; se não bater, recusa com `PRECO_MUDOU` (roteiro §4.4, passo 3).

- **Por que separada:** o app novo chama `pdv_conferir_precos` antes de gravar e mostra "o preço mudou, atualizar?". Se a trava entrasse antes do app, o PDV de hoje receberia um erro seco no meio da venda. Ordem: M1 (função de conferência) → app 1.2b (usa a conferência) → M1b (trava).
- Volta: a versão anterior de `concluir_venda_pdv` (arquivo de volta com o corpo atual).

### M2 — dados (script com simulação; nada muda de preço)

Rodado primeiro no local com uma **cópia do dia** e depois na produção, com prévia em CSV e o ok do Lucas:

| Passo | O que faz | Na JM (25/11) |
|---|---|---|
| 1 | `estoque_categorias.opcao_rotulo`: celular, tablet, notebook = "Armazenamento"; demais vazio. `unidade_unica` nas categorias de veículo | 3 categorias com rótulo; 0 de veículo |
| 2 | Unidades **ativas** não vendidas com produto + opção + condição → usa a variante que já existir (pode ter sido criada pela tela da 1.2b) ou cria (preço = C da unidade; com mais de um C no grupo, o mais comum e o resto vira próprio) e vincula | 6 variantes, 6 vínculos |
| 3 | Origem `variante` **só** onde C = preço da variante, centavo a centavo; o resto fica `proprio` | 6 com origem `variante` |
| 4 | Condição `seminovo` → `usado` na unidade (D3) | 4 unidades |
| 5 | Vendidas: `variante_id` só com chave clara; nunca toca C nem venda | 3 vínculos |
| 6 | **Trava:** contagem e soma de `preco_venda` por empresa **antes = depois**, e "unidades com preço efetivo diferente" = 0. Se não bater, a transação desfaz tudo | 0 |
| 7 | Relatório do que ficou de fora | 31 trocas pendentes, 1 reservada sem produto, 1 inativa |

- Backup antes: `_backup_variante_unidades_<data>` (id, produto, opção, condição, C, status) com RLS ligada e sem grant, + dump externo das tabelas tocadas (como no hotfix).
- Auditoria: cada vínculo e cada variante criada vão para `auditoria_eventos` com `origem = 'migracao'`.
- Volta: `update` a partir do backup (variante_id nulo, origem `proprio`, condição antiga) e `delete` das variantes criadas.

### M3 — sem migração (é o app; ver §5)

### M4 — contração (deploy separado, depois de o app novo estar no ar e sem leitor antigo)

- Condição da unidade volta a aceitar só `novo`/`usado`.
- Sai o gatilho-ponte do cardápio (o cardápio já grava na variante única).
- `estoque_tabela_precos` → renomeada `estoque_tabela_precos_legado` (vazia em todas as empresas); a tela e o CSV antigos já foram removidos no app.
- Condição para rodar: busca no código sem nenhum leitor de B nem gravador de `seminovo`; e o critério de 10 minutos sem atividade.

---

## 4. Arquivos e telas

### 4.1 Banco e scripts

| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/<n>_variante_estrutura.sql` | M1 |
| `supabase/migrations/<n>_pdv_preco_mudou.sql` | M1b |
| `supabase/migrations/<n>_variante_contracao.sql` | M4 |
| `supabase/scripts/testes/teste-variante.sql` + `esperado/teste-variante.json` | prova da M1 |
| `supabase/scripts/testes/teste-pdv-preco-mudou.sql` + esperado | prova da M1b |
| `supabase/scripts/ops/variante-migrar.sql` + `variante-simular.mjs` | M2 com prévia |
| `supabase/scripts/volta/volta-variante-*.sql` | voltas de M1, M1b, M2, M4 |
| `tests/integracao/variante-local.test.ts` | RPCs com sessão real (Dono, Admin, Vendedor, Consulta) |
| `types/database.gerado.ts` | regenerado |

### 4.2 App: o que muda (leitores e gravadores de preço, código de 25/11)

| Área | Arquivos | Mudança |
|---|---|---|
| **Produtos → Preços** (nova aba, troca a "Tabela de preços") | `app/(dashboard)/catalogo/page.tsx`, `catalogo/components/catalogo-view.tsx`, `lib/tabela-precos-csv.ts` → `lib/variantes-csv.ts` | uma linha por variante (produto, opção, condição, preço, quantas herdam, quantas próprias, travado); edição em lote com prévia "X unidades mudam"; CSV com `produto_id`, opção e condição; colunas Novo/Usado do produto saem das variantes |
| **Cadastro de produto** | `estoque/components/produto-modal.tsx` | seção "Variantes e preços" (lista, criar, desativar, preço, SKU/EAN); some qualquer campo de preço do produto |
| **Categoria** | tela de categorias do estoque | "Eixo de opção" (rótulo) e "Cada unidade é única" |
| **Entrada de unidade** | `estoque/components/estoque-view.tsx`, `estoque/page.tsx` | produto → opção (rótulo da categoria) → condição → mostra a variante e o preço; "deixar" = herda, "outro valor" = próprio (com aviso). Acaba o casamento por substring com B |
| **Edição da unidade** | `estoque/components/unidade-modal.tsx` | selo "Herdado da variante" / "Preço próprio", ação "Voltar ao preço da variante"; classificar troca pendente (produto + opção + condição) |
| **PDV** | `pdv/page.tsx`, `pdv/components/pdv-view.tsx` | selo "preço próprio" no item; antes de gravar, `pdv_conferir_precos` e o aviso "o preço mudou"; o aviso "abaixo do catálogo" compara com o preço da variante (`lib/valor-abaixo-do-catalogo.ts`) |
| **Encomenda** | `components/modules/pdv/encomenda-form.tsx`, `encomenda-itens.tsx`, `encomendas-abertas.tsx`, `app/api/compras/receber/route.ts` | item escolhe a variante (com criação rápida para quem tem `preco_variante`); preço vem dela; na chegada a unidade nasce com a variante (preço vendido diferente = próprio) |
| **Troca no PDV e orçamento** | `lib/troca-referencia.ts`, `orcamentos/page.tsx`, `orcamentos/tipos.ts`, `components/modules/orcamentos/orcamento-editor-modal.tsx`, `components/modules/celulares/card-orcamento-troca.tsx` | referência pelas variantes `usado` do produto, não por texto em B |
| **Cardápio** | `app/(dashboard)/cardapio/cardapio-view.tsx`, `cardapio/page.tsx` | grava na variante única; o público (`app/menu/[slug]`, `/api/menu/[slug]/pedido`) segue lendo A, que é igual |
| **Autocomplete de produto** | `components/modules/leads/produto-autocomplete.tsx`, `new-lead-modal.tsx` | mostra o "a partir de" (A derivado); sem mudança de código além do texto |
| **Trocas a classificar e aviso** (1.2g) | `app/(dashboard)/estoque/page.tsx` (aba), `components/modules/estoque/trocas-a-classificar.tsx` (novo), `lib/painel/metricas.ts` + `components/modules/dashboard/dashboard-view.tsx` (aviso), tela de configuração do estoque (chave `estoque.troca_parada_dias`) | lista com quantidade e idade; aviso no painel; X configurável |
| **Sem mudança** (leem C, que continua sendo o preço efetivo) | reserva (`/api/reservas`, `lead-reserva-panel`), veículos (`/api/veiculos/[slug]`, `lib/match-veiculos.ts`, `/api/match/lead/[id]`, `lead-interesse-panel`), relatórios, contrato | — |

### 4.3 Telas novas ou alteradas (conferência visual obrigatória em cada uma)

1. Produtos → Preços (lista, edição em lote, prévia, CSV).
2. Produto → Variantes e preços.
3. Categoria → eixo de opção e unidade única.
4. Estoque → entrada (com variante) e edição da unidade (selo, voltar, classificar troca).
5. PDV → aviso "o preço mudou" e selo de preço próprio.
6. Encomenda → item com variante e criação rápida.
7. Auditoria (da 1.1) → filtro "preço" mostrando antes → depois por variante e unidade.
8. Estoque → **Trocas a classificar** (quantidade, idade, situação, classificar).
9. Painel → **aviso de troca parada** (Dono e quem tem `estoque.preco_proprio`).
10. Configurações → Estoque → "Avisar troca parada há mais de X dias".

---

## 5. Entregas menores (cada uma com os portões completos)

| Entrega | Conteúdo | Banco | Visível | Pode subir quando |
|---|---|---|---|---|
| **1.2a** | M1 (estrutura, funções, gatilhos, RLS) + testes | sim | não (nenhuma unidade herda; app igual) | prova SQL verde no ritual; backup conferido; ponto de volta anotado; 10 min sem atividade na JM; IOwait < 10% |
| **1.2b** | App: Produtos → Preços, variantes no produto, categoria, entrada e edição de unidade, conferência de preço no PDV | não | sim, só para quem tem as permissões | 1.2a em produção; testes, build, conferência visual de cada tela da §4.3 no local; smoke na Demonstração |
| **1.2c** | M2 (dados da JM) | sim | sim (6 variantes aparecem) | 1.2b em produção; simulação local com cópia do dia e prévia aprovada pelo Lucas; trava "0 preço efetivo diferente" |
| **1.2d** | Encomenda com variante + `/api/compras/receber` + troca e orçamento pela variante + cardápio na variante única | não | sim | 1.2c em produção |
| **1.2e** | M1b (`PRECO_MUDOU` no fechamento) | sim | só quando o preço muda com o carrinho aberto | 1.2b em produção; smoke da conferência verde na Demonstração; nenhum aviso falso de "preço mudou" nos logs desde a 1.2b |
| **1.2f** | M4 (contração) | sim | não | 1.2d em produção; nenhum leitor antigo no código |
| **1.2g** | Trocas a classificar (lista) + aviso de troca parada no painel do dono + chave `estoque.troca_parada_dias` (§2.1). As funções e o índice já vêm na M1 | não (só a chave de configuração, gravada pelo motor da 1.1) | sim, para quem tem `estoque.preco_proprio` | 1.2b em produção (a ação "Classificar" usa a edição da unidade da 1.2b); conferência visual da lista e do aviso; smoke na Demonstração com uma troca de 10 dias e X = 7 |

Cada deploy de app: ponto de volta na Vercel anotado; 10 minutos sem venda, pagamento ou conclusão na JM; push; deploy pronto; smoke na Demonstração com o cenário da entrega; logs da Vercel e do Supabase sem erro novo por 15 minutos. Cada migração: backup + digital antes, `apply_migration` pelo MCP fora dos minutos 05–15, conferência depois. Volta: app primeiro (promover o deploy anterior), banco depois.

**Smoke na Demonstração por entrega** (empresa 5, Laboratório, tudo limpo no fim):
- 1.2a: nada visível; conferir no banco que nenhuma unidade da JM mudou (contagem e soma de C).
- 1.2b: criar produto + variante com preço; entrar unidade herdando; mudar o preço da variante e ver a unidade acompanhar; definir preço próprio e voltar; reservar e ver que a reservada não muda; PDV com o preço alterado no meio da venda e o aviso.
- 1.2c: na JM, conferir as 6 variantes e as 6 unidades com origem `variante` (só leitura).
- 1.2d: encomenda nova com variante, chegada criando a unidade com a variante; troca pelo preço `usado`.
- 1.2e: venda com preço alterado por fora no meio do fechamento → `PRECO_MUDOU`.

---

## 6. Critérios de aceite da 1.2

1. Diagnóstico refeito na produção **no dia da M2** (os números da §1 atualizados).
2. **0 unidades com preço efetivo diferente** antes e depois da M2 (contagem e soma de `preco_venda` por empresa iguais).
3. Propagação só em disponíveis que herdam: reservadas, vendidas e próprias intactas (prova SQL e smoke).
4. Veículos e categorias `unidade_unica`: sem variante, sem mudança; empresa 10 (Aletrini) com contagens iguais antes e depois (critério fixo do roteiro §4.1).
5. Encomenda **nova** exige variante; as 7 abertas continuam entregáveis pelo fluxo de hoje.
6. Histórico de preço visível na Auditoria, com origem (manual, herança, CSV, migração).
7. Nenhuma venda, encomenda ou orçamento antigo alterado (contagem e soma de `valor_venda`, `valor_custo` e `data_venda` iguais).
8. Sem a permissão: Vendedor e Consulta não editam preço de variante nem definem preço próprio (teste de integração com sessão real e tentativa direta pela API, recusada no banco).
9. PDV: preço alterado com o carrinho aberto gera o aviso (1.2b) e, depois da 1.2e, a recusa `PRECO_MUDOU` no fechamento.
10. O app antigo continua funcionando com a M1 aplicada (teste: rodar o e2e atual do PDV e do estoque contra o banco com a M1).
11. Trocas a classificar e aviso de troca parada: o critério próprio da §2.1.

---

## 7. Como a precificação por fornecedores (P1) se encaixa depois

- **Começa** quando a 1.2c estiver em produção (as variantes existem e têm preço).
- **Destino único:** `estoque_variantes.preco`, gravado **só** pela `estoque_variante_salvar` com `origem = 'precificacao'` (a sugestão e a regra vão em `depois` da auditoria). As unidades disponíveis acompanham pela herança; nada da precificação toca unidade.
- **Vínculo:** item da fonte ↔ `estoque_variantes.id` (FK), casando produto pelo nome exato normalizado (0 duplicados na JM) + `opcao_norm` + condição da fonte.
- **Travado:** variante com `travado = true` nunca recebe sugestão automática; unidade com preço próprio nunca é tocada.
- **Custo de fornecedor** fica nas tabelas `precificacao_*`, legíveis só com `estoque.ver_custo` (satélite e permissão da 1.1).
- **Tela:** a P1 acrescenta colunas e ações à aba Produtos → Preços que a 1.2b cria (sugestão, fonte, aprovar em lote); não cria outra lista de preços.
- **Permissões:** aplicar ou aprovar exige `estoque.preco_variante`.
- **Amostra:** `lista-24-11.xlsx` (150 linhas, 38 chaves) contra as variantes da JM; as que não casarem viram "criar variante?" para quem tem a permissão (D7 sob demanda).

---

## 8. Riscos e como cada um é coberto

| Risco | Cobertura |
|---|---|
| Alguém grava `preco_venda` por fora (script, restore) e a unidade vira "própria" sem querer | gatilho de preço próprio + invariante no teste + conferência no smoke |
| Erro de digitação no preço da variante se espalha nas disponíveis | prévia "X unidades mudam", só com permissão, auditoria com volta, e na P1 a variação máxima sem aprovação |
| Carrinho aberto com preço antigo | `pdv_conferir_precos` (1.2b) e `PRECO_MUDOU` (1.2e) |
| App antigo e banco novo ao mesmo tempo durante o deploy | M1 só adiciona; gatilho de preço próprio mantém o app antigo seguro; trava e contração em entregas separadas |
| Condição com dois vocabulários na transição | M1 aceita os três valores; M2 converte; M4 restringe |
| Troca pendente crescendo sem classificação (19 → 31 em 16 dias; 10 com mais de 30 dias, todas ainda sem chegar) | lista "Trocas a classificar" e aviso no painel do dono acima de X dias (1.2g); nada automático |
