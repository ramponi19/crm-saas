# Unificação do preço no estoque: análise e proposta (fase 0)

24/11/2026. Só análise: nenhuma migração, nenhum código.

> **Adendo de 24/11 (decisões D1–D11 aprovadas).** Onde este texto e o adendo divergirem, vale o adendo. Ordem e etapa em [roteiro-reconstrucao.md](roteiro-reconstrucao.md).
>
> **Mudanças em relação à proposta:**
> - **D2:** o valor da opção pode ser **composto**, ex.: "16GB / 512GB" num MacBook. A opção continua sendo um texto só, normalizado para a chave única, e a categoria dá o rótulo ("Memória / Armazenamento").
> - **D4:** o preço é por empresa. O modelo **reserva** a exceção por loja sem implementá-la: a tabela futura `estoque_variantes_precos_loja (variante_id, filial_id, preco)` só é lida por uma função `preco_variante(variante, loja)`, que hoje devolve o da empresa. Todo leitor usa a função desde o início, para a exceção entrar depois sem trocar leitores.
> - **D5:** a propagação atinge só unidades **disponíveis** que herdam. As reservadas guardam o preço combinado.
> - **D6:** duas permissões por cargo:
>   - `estoque.preco_variante`, para editar o preço da variante;
>   - `estoque.preco_proprio`, para definir ou tirar o preço próprio da unidade.
>
>   Na JM, as duas ficam com Dono e Admin. A trava fica no banco: a escrita passa por RPC, que confere a permissão.
> - **D8:** a encomenda exige a variante, com criação rápida na tela para quem tem `estoque.preco_variante`.
> - **D9:** o custo sai para uma tabela própria na etapa 1.1 (`estoque_unidades_custos`, ver PDV v2 §B.1). Por isso:
>   - a variante **não** tem `custo_referencia`;
>   - o custo de mercado da precificação fica nas tabelas do módulo de precificação, só para quem tem `estoque.ver_custo`.
> - **D10:** SKU e código de barras ficam na variante; IMEI e série, na unidade. A venda guarda variante, unidade (quando houver) e preço e custo congelados (PDV v2 §C).
> - **D11, histórico:** **não há `estoque_precos_historico`.** Toda mudança de preço (variante, unidade, propagação) é gravada pela `auditar()` da etapa 1.1, em `auditoria_eventos`:
>   - `entidade = 'variante'` ou `'unidade'`;
>   - `acao = 'preco'`;
>   - `antes` e `depois`;
>   - `origem`: manual, herança, precificação, CSV ou migração.
>
>   O gatilho de propagação chama a `auditar()` dentro da mesma transação.
> - **Veículos:** ficam **fora da variante e da herança**, como explicado no roteiro, §4.1.
> - **Dump novo:** o diagnóstico da §2 é refeito com um dump do dia, imediatamente antes da M2.

- **Código:** `origin/main` (4ee9da3e).
- **Dados:** dump único de **09/11/2026**, restaurado num Postgres local isolado e apagado no fim. Os números da seção 2 são daquela data. Antes de migrar, rodar o mesmo diagnóstico num dump novo (o roteiro está na 2.5).

Legenda usada no texto:

| Sigla | Coluna | Papel hoje |
|---|---|---|
| **A** | `estoque_produtos.preco` | um preço por modelo |
| **B** | `estoque_tabela_precos.preco_sugerido` | casa `modelo` (texto) + `armazenamento` + `condicao` |
| **C** | `estoque_unidades.preco_venda` | o que o PDV cobra |

---

## 1. Quem lê e quem grava cada preço

### 1.1 Resumo

| Preço | Quem grava | Quem lê |
|---|---|---|
| **A** | **Só o Cardápio** (`cardapio-view.tsx:41-48`; o módulo está `emPreparacao`). Nem o /catalogo nem o `produto-modal` gravam ou mostram A | Cardápio público (`app/menu/[slug]`, preço recalculado no servidor do pedido); PDV e encomenda como **referência do aviso "abaixo do catálogo"** (`lib/valor-abaixo-do-catalogo.ts`); encomenda pré-preenche o preço do item (`encomenda-itens.tsx:89`); autocomplete de produto mostra (`produto-autocomplete.tsx:68`); espelho `itens.preco` (gatilho `estoque_item_sync`) |
| **B** | /catalogo: CRUD pelo navegador (`catalogo-view.tsx:298-330`) e CSV (`lib/tabela-precos-csv.ts`, que aceita `novo`/`seminovo`/`usado`) | Entrada de unidade no /estoque **preenche sozinho** o C (`estoque-view.tsx:867-885`); orçamento (downgrade) sugere (`orcamento-editor-modal.tsx:72-80`); PDV usa como referência da troca (`lib/troca-referencia.ts`, `pdv-troca.tsx`) |
| **C** | Entrada no /estoque (obrigatório, `estoque-view.tsx:904`); edição da unidade (`unidade-modal.tsx`); chegada da encomenda (`/api/compras/receber`: C = valor da venda) | PDV (o valor cobrado, `pdv-view.tsx:285,410`); valor do estoque (`estoque-view.tsx:310`); /catalogo mostra o **mínimo de C** por produto, separado em Novo e Usado (`catalogo/page.tsx:111-126`); orçamentos e troca (`orcamentos/page.tsx:56-61`, `card-orcamento-troca.tsx`, `troca-modal.tsx`); reserva grava `negocios.valor_estimado` (`/api/reservas`); painel de reserva no lead; veículos (feed XML dos portais, match com o teto do lead); contrato do PDV (C cheio); relatório CSV do estoque; espelho `itens.preco` |

### 1.2 Por área (arquivo:linha)

**PDV** (`pdv/page.tsx`, `pdv-view.tsx`):
- Carrega as unidades `disponivel` e `reservado` com C, custo e `produtos(preco)`.
- **Cobra C × quantidade.** Não há edição de preço por item no carrinho: só um **desconto único em R$**, rateado entre as linhas (`:409-417`).
- Grava **uma linha de `vendas_vendas` por item**, com:
  - `valor_venda` = líquido do desconto;
  - `desconto_valor`;
  - `valor_custo` = custo × quantidade;
  - `unidade_id` e `produto_id`.
- **O preço vendido fica congelado na venda.** Mudar C depois não altera venda nenhuma.
- A permissão `descontoMax` existe, mas o PDV não a lê.

**Encomenda:**
- O preço do item é **digitado**, com A pré-preenchido.
- A venda nasce **sem unidade**.
- Na chegada, `/api/compras/receber` cria a unidade com C = valor vendido e custo = `compras_pedidos.valor_total`, que costuma ser 0.

**Catálogo (/catalogo):**
- A tela não lê A.
- A coluna de preço do produto é derivada de C (mínimo por condição).
- A aba "Tabela de preços" é o CRUD e o CSV de B.

**Estoque (/estoque):**
- Entrada com custo e C obrigatórios. C é sugerido por B. O casamento é:
  - `lower+trim` do modelo, aceitando **substring nos dois sentidos**;
  - cai para qualquer condição se a pedida não existir;
  - se o armazenamento não bater, pega a **primeira linha sem ordem**.
- Itens sem série (acessório, perfume, outro) entram como **uma linha com `quantidade = N`**, preço por peça.

**Orçamentos e troca:**
- Usam C (unidades disponíveis) e B (sugestão).
- `celulares_troca_precos` é uma **quarta tabela**, o preço de **compra** do usado na troca. Fica fora desta unificação.

**Relatórios e dashboards:**
- O CSV do estoque tem custo e C (só dono/admin).
- Lucro e margem vêm das **vendas** (`valor_custo`), não do estoque.

**Etiquetas:** **não existe etiqueta de preço** de produto ou unidade. "Etiqueta" no código é de contato.

**Veículos:** cada veículo tem o seu C. Feed dos portais, match e PDV leem C.

**IA e ZapIntel:** nenhuma ferramenta lê preço de estoque (só o nome do produto e o valor das vendas).

**SQL:**
- O único consumidor no banco é o gatilho `estoque_item_sync` (A → `itens.preco`; C e custo → `itens.preco`/`itens.custo`).
- Não há RPC de venda na `origin/main`.
- A `concluir_venda_pdv` da branch `fix/entregar-sem-pagamento` não lê A, B nem C.

### 1.3 O custo hoje (contradiz a premissa "só dono e admin")

**Não existe restrição de custo por papel.** Qualquer membro da empresa vê o custo em:
- /estoque: coluna Custo, campos da entrada, "custo do lote", `unidade-modal`;
- /catalogo: "Custo total";
- PDV: o custo chega ao navegador para calcular o lucro;
- encomendas abertas: o custo é editável ali;
- termo de garantia.

No banco:
- `authenticated` tem select, insert, update e delete em `estoque_unidades`;
- `itens.custo` é legível pela empresa toda.

A única trava real é o /relatorios (dono/admin) e o `verFinanceiro` do menu e do assistente.

**Consequência:** "o custo segue as regras de visibilidade já definidas" não se sustenta, porque essas regras ainda não existem. Esconder o custo é trabalho próprio (risco 6 e decisão D9).

### 1.4 RLS das três tabelas

| Tabela | Policy | Observação |
|---|---|---|
| `estoque_produtos` | `ALL` por empresa | sem papel |
| `estoque_tabela_precos` | `ALL` por empresa | sem loja |
| `estoque_unidades` | `ALL` por empresa + `filiais_visiveis()` | sem papel |

**Qualquer membro grava qualquer preço.**

---

## 2. Diagnóstico dos dados (JM, dump de 09/11)

### 2.1 Volumes

| O quê | Número |
|---|---|
| Produtos | 35: 33 iPhones, 1 cabo, 1 Apple Watch; todos com listas de cores e capacidades, exceto os 3 últimos criados |
| A preenchido | **0** |
| Linhas de B (tabela de preços) | **0**: a JM não usa a tabela |
| Unidades | 45: 16 vendidas, 7 disponíveis, 1 reservada, **19 trocas pendentes** (+ 2 vendidas sem produto) |
| Vendas (`vendas_vendas`) | 92 concluídas + 7 encomendas. **Só 19 têm unidade:** a maior parte das vendas da JM não passa pelo estoque |

### 2.2 Duplicatas na tabela de preços

Nenhuma: a tabela está vazia. O risco continua para outras empresas e para o futuro: não há chave única, e o casamento por substring faz "iPhone 16" casar com "iPhone 16 Pro Max".

### 2.3 Linhas que não casam com produto

Nenhuma, pelo mesmo motivo.

### 2.4 Unidades × variante

Chave usada: produto + capacidade + condição.

| Situação | Qtd | Status | Tratamento |
|---|---|---|---|
| Casam com clareza | 6 | disponíveis | automático (lista abaixo) |
| Produto sem capacidade, custo 20, venda 100 (iPhone SE 3ª, id 45) | 1 | disponível | **revisão manual** (parece dado de teste) |
| Sem produto (encomenda que chegou, id 75) | 1 | reservada | fica sem variante, com o preço como próprio |
| Trocas sem produto e sem preço de venda | 19 | pendentes | ficam sem variante até alguém classificar a troca no `unidade-modal` (aí escolhem produto e capacidade) |
| Vendidas sem capacidade (vindas de encomenda, custo 0) | 16 | vendidas | **nada a fazer:** o preço vendido está na venda; variante opcional |
| Vendidas sem produto | 2 | vendidas | nada a fazer |

As 6 disponíveis que casam com clareza:

| Unidade | Variante | C |
|---|---|---|
| 52 | iPhone 12 / 128GB / usado | 1.495 |
| 53 | iPhone 12 Pro / 128GB / usado | 1.995 |
| 49 | iPhone 14 Pro Max / 256GB / seminovo | 3.695 |
| 51 | iPhone 16 / 128GB / novo | 4.795 |
| 50 | iPhone 16 / 128GB / seminovo | 3.995 |
| 36 | iPhone 17 / 256GB / novo | 5.445 |

**Divergências entre C e a tabela:** nenhuma comparação possível (B vazio).
- Entre unidades da mesma variante: nenhuma. Cada variante disponível tem uma unidade só.
- Nas 19 vendas com unidade, `valor_venda` = C da unidade em todas, sem desconto. Isso confirma que o PDV cobra C.

**Condições em uso:** `novo` 20, `seminovo` 4, `usado` 21. A venda já trocou `seminovo` por `usado` (migração 2000); o estoque ainda não.

**Leitura para a JM:** a migração de dados é pequena e quase toda automática. O peso da mudança está no **código** (seção 4), não nos dados. Outras empresas, ou a JM de hoje, podem ter mais dados.

### 2.5 Roteiro do diagnóstico (para o dump novo)

Para cada empresa:
1. **Duplicatas em B:** mesma chave normalizada (modelo sem acento, minúsculo, espaços colapsados + capacidade + condição) com preços diferentes.
2. **Linhas de B sem produto:** modelo normalizado ≠ nome normalizado de todo produto. Contar também as que só casariam por substring.
3. **Unidades não vendidas:**
   - por status: sem produto, sem capacidade (em categoria que usa capacidade), sem C;
   - com a chave da variante: grupos com mais de um C diferente;
   - C ≠ B da mesma chave.
4. **Produtos com A preenchido:** quantos têm unidades e quantos não (cardápio).
5. **Vendas com unidade:** `valor_venda + desconto_valor` = C (confere que o PDV cobra C).

---

## 3. Modelo de dados e migração

### 3.1 O modelo alvo: o que valido e o que contesto

| Ponto do alvo | Posição |
|---|---|
| Variante = produto + capacidade + condição, com cor agregada | **Valido, generalizando "capacidade".** Perfume não tem capacidade, tem volume; roupa, tamanho. O eixo vira **"opção"**, com o rótulo definido pela categoria: "Armazenamento" no celular, "Volume" no perfume, "Tamanho" na roupa. O valor da JM continua sendo o mesmo texto `256GB`. Um eixo só por enquanto (decisão D2). |
| Condição na variante | **Valido, com vocabulário neutro:** `novo` \| `usado`, como a venda já fez na migração 2000. "Seminovo" vira rótulo da empresa. A nota de estado (excelente, bom, bateria) **não** entra na variante: diferença de preço por estado é **preço próprio** da unidade (decisão D3). |
| Preço de referência só na variante | **Valido.** |
| Unidade herda o preço; preço próprio só quando alguém define | **Valido no conceito, contesto a implementação "calcular na leitura".** Hoje C é lido em ~25 lugares (PDV, orçamentos, reserva, veículos, feed dos portais, `itens`, relatório, contrato). Calcular na leitura obrigaria a trocar todos. Proposta: **herança materializada** (detalhe abaixo). Fica igual para o usuário, e quase nada de leitura muda. |
| Custo continua na unidade | **Valido.** O "só dono e admin" é trabalho novo, não herdado (1.3, D9). |
| A deixa de ser digitado; "a partir de" é derivado | **Valido.** A vira **campo derivado**, mantido pelo banco (menor preço das variantes ativas). Assim o cardápio público, o autocomplete e o aviso de "abaixo do catálogo" seguem funcionando sem mudança imediata. |
| B absorvida pela variante | **Valido.** |
| Funcionar para outros segmentos | **Valido:** todo produto tem **ao menos uma variante**. Produto sem opção (prato do cardápio, capinha, cabo) tem a **variante única**, sem opção e condição novo. O cardápio passa a gravar o preço nela. Veículo tem variante sem preço, e cada unidade com preço próprio (cada carro é único). |

**Como funciona a herança materializada:**
- C continua existindo, sempre com o **preço efetivo**.
- A unidade ganha **`preco_origem`** (`variante` \| `proprio`).
- Quando o preço da variante muda, o banco atualiza o C das unidades com origem `variante` que estão **disponíveis** (vendidas não mudam nunca; reservadas, decisão D5).
- Quando alguém grava C à mão numa unidade, a origem vira `proprio` sozinha.
- "Voltar ao preço da variante" é uma ação explícita.

### 3.2 Tabelas (descrição, sem DDL)

**`estoque_variantes`** (nova; dono: módulo `catalogo`; prefixo `estoque_`, como as outras tabelas do catálogo):

| Coluna | Para quê |
|---|---|
| `id`, `empresa_id` | (FK composta com o produto da mesma empresa) |
| `produto_id` | FK real, `on delete restrict` |
| `opcao` | texto, vazio na variante única; ex.: `256GB`, `100ml` |
| `opcao_norm` | gerada: minúsculo, sem acento, sem espaço; `256 GB` = `256GB` |
| `condicao` | `novo` \| `usado` |
| `preco` | o preço de referência; nulo = "sem preço" |
| `custo_referencia` | custo de mercado ou reposição: o que a precificação da fase 1 grava; **não** é o custo real de nenhuma unidade |
| `sku`, `ean text[]` | o código de barras é da variante (perfume de 50 ml e de 100 ml têm EANs diferentes). Ver o impacto no PDV v2 (4.4) |
| `ativo`, `travado` | travado = a precificação automática não mexe |
| `created_at`, `updated_at`, `atualizado_por` | |

- Únicos:
  - `(empresa_id, produto_id, opcao_norm, condicao)`;
  - `(empresa_id, sku)` onde houver SKU.
- Índices: `(empresa_id, produto_id)` e `(empresa_id, ativo)`.

**`estoque_unidades`** (muda):
- `+ variante_id` (FK, nulo permitido: troca ainda não classificada, veículo, legado vendido);
- `+ preco_origem` (`variante` \| `proprio`, padrão `proprio`: nada muda até a migração ligar).
- `preco_venda` e `preco_custo` ficam como estão.

**`estoque_produtos`** (muda):
- `preco` vira derivado, mantido por gatilho = menor `preco` das variantes ativas (o "a partir de"). Não é mais digitado por nenhuma tela.
- O rótulo do eixo de opção vem da **categoria**: `estoque_categorias` ganha `opcao_rotulo` (padrão vazio = sem eixo). Na JM, "iPhone/Smartphone" = "Armazenamento". `armazenamentos text[]` do produto segue como a **lista de opções permitidas** (o nome da coluna pode ficar).

**`estoque_precos_historico`** (nova; dono: `catalogo`):
- Colunas: `tabela` (`estoque_variantes` \| `estoque_unidades`), `registro_id`, `campo`, `valor_anterior`, `valor_novo`, `origem` (`manual` \| `csv` \| `heranca` \| `precificacao` \| `compra` \| `migracao`), `referencia jsonb` (ex.: sugestão e regra da precificação), `usuario_id`, `created_at`.
- Gravada por **gatilho** em toda mudança de `estoque_variantes.preco` e de `estoque_unidades.preco_venda`/`preco_origem`, venha de onde vier. Isso inclui o navegador e a propagação: a propagação grava uma linha por unidade, com origem `heranca`.
- A origem vem de `set_config('nexus.preco_origem', ...)`, no mesmo molde do `nexus.venda_excecao`. **Substitui o `precificacao_historico`** da proposta anterior.

**`estoque_tabela_precos`:** fica só leitura depois da migração e é renomeada para `_legado` um ciclo depois.

**RLS (uma policy por comando, sem `for all`):**
- **Leitura:** variantes por empresa (preço de venda não é segredo dentro da loja); histórico só dono/admin.
- **Escrita** em variantes: por padrão, dono/admin (decisão D6).
- Histórico: sem escrita direta, só pelo gatilho (`security definer`).

**Gatilhos (todos no banco, para valer em qualquer caminho de escrita):**
1. **Propagação:** muda `variantes.preco` → atualiza o C das unidades com origem `variante` e status disponível (ou também reservado, conforme D5).
2. **Preço próprio automático:** muda C numa unidade fora da propagação → `preco_origem = proprio`.
3. **Vínculo ou troca de variante** numa unidade com origem `variante` → C recebe o preço da variante nova. Se a variante não tiver preço, o C atual fica, como próprio.
4. **"A partir de":** recalcula `estoque_produtos.preco` quando uma variante muda.
5. **Histórico** (acima).

Mais uma conferência fixa, em teste: unidades disponíveis com origem `variante` e C ≠ preço da variante = 0.

### 3.3 Plano de migração

**M1, estrutura (aditiva, sem efeito visível):**
- tabelas e colunas novas, gatilhos, RLS;
- `preco_origem` nasce `proprio` em todas as unidades e nenhuma tem `variante_id`, então nada propaga;
- arquivo de volta e teste SQL (isolamento entre duas empresas; propagação; preço próprio; histórico; "a partir de").

**M2, dados.** Um script com **prévia em modo simulação** (relatório CSV, nada gravado), rodado no local com dump novo e depois na produção com o seu ok:

| Passo | O que faz | Automático | Revisão manual |
|---|---|---|---|
| 1 | Condição: `seminovo` → `usado` **na variante**; na unidade, conforme D3 | sim | — |
| 2 | B → variantes: modelo normalizado **igual** ao nome normalizado de um produto (sem substring) + capacidade + condição | linhas que casam com 1 produto e sem conflito de preço | duplicatas com preços diferentes; linhas sem produto; casos que só casariam por substring. Saem num CSV para você decidir: criar produto, juntar ou descartar |
| 3 | A → variante única: produto com A preenchido e sem opção → cria a variante única com esse preço (cardápio) | sim | produtos com A **e** com unidades de opções diferentes |
| 4 | Unidades não vendidas com produto + opção + condição → `variante_id`; cria a variante se faltar. Preço da variante nova = o de B, se houver; senão, o C mais comum entre as disponíveis do grupo; senão, nulo | sim | grupos com C diferentes **e** sem B (o preço da variante é escolha sua: o script propõe o mais comum) |
| 5 | Origem: `variante` **só** onde C = preço da variante, centavo a centavo; **todo o resto vira `proprio`** | sim | — |
| 6 | Trava de segurança: o script confere **antes e depois** que nenhuma unidade mudou de C (contagem tem de dar 0). Se der diferente de 0, desfaz tudo | sim | — |
| 7 | Vendidas: `variante_id` só quando a chave for clara; nunca mexe em C nem na venda | sim | — |
| 8 | Sem produto, sem opção numa categoria que usa opção, ou com cara de teste | — | relatório (na JM, a id 45) |

**M3, app.** Leitores e gravadores passam a usar a variante (lista na seção 4).

**M4, limpeza (um ciclo depois):** B → `_legado`; remove os leitores antigos.

**Na JM, pelo dump de 09/11:**
- B vazia;
- A vazio;
- 6 unidades com variante criada automaticamente, cada uma vira a referência da própria variante, com origem `variante`;
- 1 unidade para revisão;
- 0 mudanças de preço efetivo.

---

## 4. Impacto no PDV e nas telas

### 4.1 Entrada de unidade (/estoque)

1. Escolhe o produto. O campo **opção** aparece com o rótulo da categoria e a lista do produto. Escolhe a condição.
2. A tela mostra a **variante** encontrada e o preço dela: "Preço da variante: R$ 4.795".
   - Sem variante: "Nova variante; o preço que você digitar vira o preço dela" (se a pessoa puder editar variante, conforme D6).
3. O campo "Preço de venda" vem preenchido com o da variante.
   - **Deixar como está** = herda (origem `variante`).
   - **Digitar outro valor** = preço próprio, com o aviso "Esta unidade terá preço próprio (a variante continua R$ 4.795)".
4. Custo continua obrigatório por unidade.
5. Acaba o casamento por substring.

### 4.2 Edição da unidade (`unidade-modal`)

- Selo "Herdado da variante" ou "Preço próprio", com a ação "Voltar ao preço da variante".
- A troca pendente, ao ser classificada (produto + opção + condição), ganha variante e, se a pessoa aceitar, o preço dela.

### 4.3 Catálogo (/catalogo)

- A aba "Tabela de preços" vira **"Preços"**: uma linha por variante (produto, opção, condição, preço, quantas unidades herdam, quantas têm preço próprio), com edição em lote e o mesmo CSV (agora com `produto_id` e chave única).
- Mudar o preço avisa: "X unidades disponíveis passam a R$ …".
- As colunas Novo/Usado do produto passam a sair das variantes, não mais do mínimo de C.

### 4.4 PDV

- **Não muda no que cobra:** segue lendo C, que é o preço efetivo.
- Melhoria pequena: mostrar no item o selo "preço próprio" quando for o caso.
- O aviso "abaixo do catálogo" passa a comparar com o **preço da variante** (hoje compara com A ou com a mediana de 90 dias).
- **Encomenda (venda sem unidade):** o item passa a escolher **variante** (produto + opção + condição), e o preço vem dela, não de A. Na chegada, a unidade criada recebe a variante. O preço vendido continua sendo o da venda: se a encomenda foi vendida por outro valor, a unidade nasce com preço próprio.
- **Troca no PDV e no orçamento:** a referência deixa de casar texto com B e passa a usar as variantes `usado` do produto escolhido.
- **PDV v2** (`docs/pdv-v2-especificacao.md`):
  - `vendas_itens` ganha `variante_id`;
  - `preco_tabela` = preço da variante no momento da venda;
  - o `sku`/`ean` previsto em `estoque_produtos` **deve ir para a variante**;
  - a RPC de venda deve **reler o preço no servidor** (hoje o navegador manda o valor).

### 4.5 Cadastro de produto e categoria

- **Produto:** perde qualquer campo de preço. Ganha a seção "Variantes e preços" (lista, criar, desativar, preço, travar).
- **Categoria:** ganha "Eixo de opção" (rótulo; vazio = sem eixo).

### 4.6 Cardápio

Grava o preço na variante única. O público continua lendo A, que é igual ao preço da variante única.

### 4.7 Orçamentos, reserva, veículos, relatórios, `itens`

Nada muda: leem C.

---

## 5. Como a fase 1 da precificação fica mais simples

| Na proposta anterior | Com a variante |
|---|---|
| `precificacao_alvos` ligando produto + armazenamento + cor + condição, porque não havia onde o preço morasse | **O alvo do Nexus é a própria variante.** `precificacao_alvos` fica só para quem precifica itens **externos** (fase 2) |
| Três destinos (tabela de preços, produto, unidades) e a decisão 2 ("gravar nas unidades?") | **Destino único: `estoque_variantes.preco`.** As unidades acompanham pela herança, e a decisão 2 some |
| Vínculo item da fonte ↔ alvo, casando texto com B | Vínculo item da fonte ↔ **variante**, com FK e chave única. Casar "IPHONE 17 PRO MAX / 256GB" vira: produto pelo nome + opção normalizada + condição da fonte |
| `precificacao_historico` próprio + gatilhos em três tabelas | **`estoque_precos_historico`** já cobre tudo. A precificação só grava `origem = precificacao` e a sugestão na referência |
| Margem mínima conferida contra o custo da fonte | Contra o custo da fonte na variante (`custo_referencia`) **e**, na prévia, contra o custo real das unidades que vão herdar |
| "Preço travado" no alvo | `travado` na variante; e a unidade com preço próprio nunca é tocada pela herança |

**Resultado:** a migração da precificação fica do tamanho das tabelas do módulo (fontes, importações, ofertas, itens da fonte, vínculos, regras, sugestões), sem mexer no estoque.

---

## 6. Riscos

1. **Herança materializada exige disciplina no banco.** Se alguém gravar C por fora do gatilho (restore, script), a unidade vira "próprio" sem querer. Mitigação: gatilho + teste de invariante + script de conferência.
2. **Mudar o preço da variante muda o que o PDV cobra das disponíveis na hora.** É o objetivo, mas um erro de digitação se espalha. Mitigação:
   - prévia "X unidades mudam";
   - histórico com volta;
   - escrita só dono/admin (D6);
   - na precificação, a variação máxima sem aprovação.
3. **O carrinho aberto no PDV pode ter carregado o preço antigo.** O navegador manda o valor da venda. Até o PDV v2 reler no servidor, quem abriu o carrinho antes cobra o antigo. Mitigação: no PDV v1, conferir na hora de concluir e avisar se o preço mudou.
4. **Encomendas** hoje não escolhem variante. A mudança mexe em `encomenda-itens`, `encomenda-form` e `/api/compras/receber`. As encomendas em aberto ficam como estão (venda sem variante).
5. **A JM quase não usa o estoque:** só 19 das 99 vendas do dump têm unidade. O ganho imediato dela vem da **precificação** (preço de referência visível no catálogo e na encomenda), não do PDV. Vale confirmar no dump novo.
6. **Custo visível a todos.** Esconder de quem não é dono/admin exige três coisas:
   - tirar o custo do que vai ao navegador do PDV (o lucro passa a ser calculado no servidor);
   - restringir colunas ou mover o custo para uma tabela própria;
   - cuidar de `itens.custo`.

   É um projeto em si (D9). Misturar com a variante aumenta o risco das duas coisas.
7. **Duas fontes de "condição"** (`novo`/`seminovo`/`usado` no estoque, `novo`/`usado` na venda) até D3 ser aplicada.
8. **Universalidade:** os nomes no banco e no código ficam neutros (opção, condição). "Armazenamento" e "seminovo" são rótulos de categoria ou vocabulário. O `check-segmento-modulo` do build já barra o resto.
9. **Ordem com o PDV v2 e a `fix/entregar-sem-pagamento`:** a variante deve entrar **antes** do PDV v2 criar `vendas_itens` e o SKU no produto. Senão, o SKU nasce no lugar errado e vai precisar migrar de novo.
10. **Dump antigo:** todos os números são de 09/11. A JM pode ter cadastrado unidades e tabela desde então.

---

## Decisões pendentes

- **D1. Modelo:** aprovar a **herança materializada** (C continua sendo o preço efetivo, mais `preco_origem`) no lugar do cálculo na leitura?
- **D2. Eixo da variante:** um eixo genérico "opção", com rótulo por categoria, mais a condição. A cor agregada, como você propôs. Um eixo basta por agora?
- **D3. Condição:** a variante usa `novo`/`usado` (seminovo = rótulo). As unidades do estoque também convertem `seminovo` → `usado`, como a venda fez? Nota de estado (excelente, bom, bateria) fica fora da variante e vira preço próprio?
- **D4. Preço por loja:** a variante tem um preço para a empresa toda (como B hoje), ou já nasce com preço por loja?
- **D5. Reservadas:** mudar o preço da variante atualiza também as unidades **reservadas** com origem `variante`, ou só as disponíveis? Recomendo só as disponíveis: a reserva é um preço combinado com o cliente.
- **D6. Quem edita o preço da variante:** só dono/admin (recomendado), ou quem tem uma permissão nova "editar preços"? E o preço próprio da unidade, quem pode definir?
- **D7. Criação de variantes:** sob demanda (quando entra unidade, quando alguém dá preço, quando a precificação vincula; recomendado) ou todas as combinações do cadastro já criadas sem preço (na JM, 208: 104 combinações de produto e capacidade × 2 condições)?
- **D8. Encomenda:** passa a exigir a variante (produto + opção + condição) já nesta etapa?
- **D9. Custo só para dono/admin:** fica como projeto separado, logo depois (recomendado), ou entra junto da variante? Hoje o custo é visível a todos.
- **D10. PDV v2:** confirmar que `sku`/`ean` vão para a variante e que `vendas_itens` terá `variante_id` (ajuste na especificação).
- **D11. Ordem:** variante → precificação fase 1 → PDV v2? E o diagnóstico com um **dump novo** antes de escrever a M2?
