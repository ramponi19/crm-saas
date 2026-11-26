# Etapa 1.2: variante e preço efetivo (plano de execução)

25/11/2026, **revisão 2 em 26/11/2026** (versão do aparelho). **Só plano: nenhum código, nenhuma migração.** A 1.2 começa quando a 1.1 estiver em produção.

Base:
- [unificacao-preco-proposta.md](unificacao-preco-proposta.md) com o adendo de 24/11 (D1–D11 aprovadas);
- [roteiro-reconstrucao.md](roteiro-reconstrucao.md) (ordem, critérios de aceite, veículos fora, PDV aberto);
- [pdv-v2-especificacao.md](pdv-v2-especificacao.md) §B e §B.1 (o que a 1.1 entrega);
- [precificacao-fase1-plano.md](precificacao-fase1-plano.md) (novo, 26/11): a precificação por fornecedores que usa a variante como destino único.

Regra de trabalho que vale aqui (memória do projeto, "Excelência sem espera de horário", 25/11):
- etapa liberada por **critério**, nunca por horário;
- **toda migração é compatível com o app no ar**: primeiro adiciona, depois o app passa a usar, por último remove o velho;
- portões obrigatórios: plano revisado; testes, build e conferência visual; smoke na Demonstração; ponto de volta e backup antes de mudar o banco; deploy só sem atividade na JM nos últimos 10 minutos.

---

## O que mudou (revisão 2, 26/11, contra a revisão 1 de 25/11, commit `44ee4449`)

**Motivo:** a exploração do MCP do Buscador PXT (só leitura, 25/11) mostrou que a **versão do aparelho** muda o preço mais do que a cor. Exemplo: iPhone 18 Pro Max 512GB Glacier custava R$ 10.350 (chip virtual 🇺🇸), R$ 10.450 (sem versão), R$ 10.800 (chip virtual sem origem) e R$ 12.499 (chip físico): **21% de diferença** dentro do mesmo modelo, capacidade e cor. Com um eixo só, essas quatro ofertas cairiam na mesma variante e a média delas (R$ 11.024,75) não seria o preço de nenhum aparelho real.

| Ponto | Revisão 1 (25/11) | Revisão 2 (26/11) |
|---|---|---|
| **D2: eixos da variante** | um eixo "opção" + condição | eixo **"opção"** (ex.: armazenamento) + eixo **"versão"** (ex.: chip físico, chip virtual, físico + virtual, origem, ANATEL) + condição. Os dois rótulos vêm da categoria e **os dois são opcionais**: perfume e acessório não usam versão (§2.2) |
| Chave única da variante | `(empresa, produto, opcao_norm, condicao)` | `(empresa, produto, opcao_norm, versao_norm, condicao)` |
| Valores de versão | não existia | lista fechada por categoria (`estoque_categorias.versoes`), escolhida em lista na tela, sem texto livre. Versão vazia = **"Não informada"**, que também é uma variante válida |
| **Cor** | agregada, sem comentário | continua agregada. **Decisão pendente dos sócios:** preço por cor (§2.3). A função de preço já nasce com o parâmetro de cor reservado, para a exceção por cor não exigir trocar leitores depois |
| M1 | colunas de opção | + `versao`/`versao_norm` na variante; + `versao_rotulo`/`versoes` na categoria; RPCs validam a versão contra a lista da categoria; `preco_variante(variante, loja, cor)` |
| M2 (dados da JM) | 6 variantes | as mesmas 6 variantes, com versão **"Não informada"** (nenhum dado de hoje traz versão); categoria celular ganha o rótulo "Versão" e a lista semeada a partir das versões que o PXT mostra na lista da JM, conferida no dia |
| Telas | entrada, unidade, Preços, encomenda com opção | as mesmas, com o passo **versão** entre opção e condição; Preços agrupa por produto + opção e mostra as versões lado a lado; filtro "Versão não informada"; categoria ganha "Eixo de versão" e a lista de versões |
| Encomenda | exige variante | exige variante **com versão definida** nas categorias que usam versão (recomendação, decisão dos sócios: §2.3) |
| Encaixe com a precificação (§7) | resumo dentro deste plano | plano próprio, [precificacao-fase1-plano.md](precificacao-fase1-plano.md); aqui fica só o contrato entre os dois |
| Critérios de aceite | 11 | 13 (versão e cor reservada) |
| Auditoria do preço | `depois` com a sugestão e a regra | idem, e **nunca custo** no `depois` (a Auditoria é lida por `auditoria.ver`, que não exige `estoque.ver_custo`) |
| Quem edita `estoque.troca_parada_dias` | "`equipe.cargos`/Dono" | `config.editar`, a permissão do motor de configuração da 1.1b |

O diagnóstico da JM (§1), as decisões respondidas pelo Lucas em 25/11 (§2.1) e as entregas 1.2a–1.2g (§5) **não mudam**: a versão entra na estrutura desde a M1, que ainda não existe, então não há migração a refazer.

---

## 0. O que a 1.1 entrega e a 1.2 usa

| Da 1.1 | Para quê na 1.2 |
|---|---|
| `tem_permissao(p)` e o catálogo de permissões | as RPCs de preço conferem `estoque.preco_variante` e `estoque.preco_proprio` dentro do banco |
| permissões `estoque.preco_variante` e `estoque.preco_proprio` (JM: Dono e Admin) | quem edita o preço da variante e quem define ou tira o preço próprio da unidade |
| `estoque.ver_custo` e o custo em `estoque_unidades_custos` | a variante **não tem custo** (D9). A prévia "X unidades mudam de preço" mostra margem só para quem tem `ver_custo`, lendo o satélite |
| `auditar()` e `auditoria_eventos` (só INSERT) | todo o histórico de preço (D11): `entidade = 'variante'\|'unidade'`, `acao = 'preco'`, `origem` manual, herança, precificação, CSV ou migração |
| `empresa_config` definitivo | uma chave nova na 1.2 (`estoque.troca_parada_dias`, §2.1); as chaves da precificação usam o mesmo motor ([precificacao-fase1-plano.md §4](precificacao-fase1-plano.md)) |
| RLS de escrita substituída por RPC nas tabelas de estoque | a variante já nasce sem escrita direta: só RPC |

**Atenção para o plano da 1.1** (não é escopo desta etapa, mas afeta a ordem): o §B.1 do PDV v2 dizia "remoção das colunas antigas [de custo] no **mesmo deploy** do app". **Resolvido em 25/11:** [etapa-1.1-plano.md §4](etapa-1.1-plano.md) usa quatro tempos (entregas 1.1d a 1.1g), com a coluna antiga legível até o app novo estar no ar.

---

## 1. Diagnóstico da JM: leitura direta da produção, 25/11/2026 (só SELECT)

Comparado com o dump de 09/11 usado na proposta.

### 1.1 Volumes

| O quê | Dump 09/11 | Produção 25/11 | Leitura |
|---|---|---|---|
| Empresas com produto, unidade ou tabela de preços | — | **só a JM** (empresa 1) | nenhuma outra empresa tem dado a migrar |
| Produtos | 35 | **35** (todos ativos) | igual |
| Produtos com opções (`armazenamentos`) | — | **32**; 3 sem opção (Apple Watch Ultra 3, iPhone 18 Pro, Cabo USB-C) | — |
| Combinações produto × opção | 104 | **101** (opções em uso: 64GB, 128GB, 256GB, 512GB, 1TB, 2TB) | D7 "sob demanda" continua certa: criar 202 variantes vazias seria ruído. Com a versão, seria ainda pior: 101 × N versões × 2 condições |
| **Versão do aparelho** | — | **nenhum campo** guarda versão hoje (nem produto, nem unidade, nem venda); aparece, quando aparece, no texto livre | as variantes da M2 nascem com versão "Não informada" (§3, M2) |
| Nomes de produto duplicados (normalizados) | — | **0** | o casamento por nome exato é seguro |
| **A** (`estoque_produtos.preco` > 0) | 0 | **0** | nada a migrar para variante única |
| **B** (`estoque_tabela_precos`) | 0 | **0** linhas, em **todas** as empresas | nada a migrar; a contração de B é só remover código |
| Categorias da JM | — | 7: celular (33 produtos), tablet (0), notebook (0), smartwatch (1), outro (0), acessório (1), perfume (0) | o rótulo "Armazenamento" vale para celular, tablet e notebook; "Versão" só para celular na semente (§3, M2) |
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
| Disponíveis com produto + opção + condição claros | **6** (ids 36, 49, 50, 51, 52, 53) | variante criada pela M2 com versão "Não informada", preço da variante = C da unidade, origem `variante`. **0 mudança de preço** |
| Disponível **inativa** (id 45, "iPhone SE 3ª geração", C 100, custo 20, sem opção) | 1 | ativo = false desde 09/11 (parecia teste). A M2 **pula** unidade inativa |
| Reservada sem produto (id 75, ligada à encomenda 121) | 1 | fica sem variante, `preco_origem = proprio` |
| Trocas pendentes (sem produto, sem opção, sem C; descrição só no texto, ex.: "iPhone 11 — entrada da encomenda de …") | **31** (19 → 31 desde 09/11) | ficam sem variante até alguém classificar a troca na tela da unidade. Na classificação, escolhe produto + opção + versão + condição e ganha a variante |
| Vendidas | 18 (3 com produto + opção, 12 sem opção, 3 sem produto) | `variante_id` só nas **3** com chave clara (versão "Não informada"); nunca mexe em C nem na venda |
| Condição `seminovo` | 4 (2 disponíveis: 49 e 50; 2 vendidas) | D3: viram `usado` na unidade; "seminovo" fica rótulo da empresa |

As 6 variantes que a M2 cria na JM (todas na loja 3, Mogi Guaçu):

| Unidade | Variante (produto / opção / versão / condição) | Preço da variante = C |
|---|---|---|
| 52 | iPhone 12 / 128GB / Não informada / usado | 1.495 |
| 53 | iPhone 12 Pro / 128GB / Não informada / usado | 1.995 |
| 49 | iPhone 14 Pro Max / 256GB / Não informada / usado (era seminovo) | 3.695 |
| 50 | iPhone 16 / 128GB / Não informada / usado (era seminovo) | 3.995 |
| 51 | iPhone 16 / 128GB / Não informada / novo | 4.795 |
| 36 | iPhone 17 / 256GB / Não informada / novo | 5.445 |

Quem conferir o aparelho na loja pode reclassificar a versão depois (edição da unidade, §4.2): a unidade troca de variante pela `estoque_unidade_vincular`, auditada.

### 1.3 Encomendas abertas (7)

54, 92, 31, 37, 43 e 122 têm produto (iPhone 17, 17 Pro, 17 Pro Max, 13 Pro), **sem opção**; a 121 não tem produto. Pela D8, **a encomenda nova** exige variante; as abertas ficam como estão (venda sem variante) e são entregues pelo fluxo de hoje.

### 1.4 Leitura

- A migração de dados da JM é **pequena e toda automática**: 6 variantes, 6 vínculos de unidade disponível, 3 de vendida, 4 condições trocadas, **0 preço efetivo alterado**.
- O peso da etapa está no **código e nas telas** (seção 4), não nos dados.
- O ganho imediato da JM vem da **precificação** e da **encomenda com variante**, não do PDV, porque 112 das 131 vendas não passam por unidade de estoque. Com a versão, a encomenda passa a registrar o que o cliente comprou de fato (chip físico × virtual), que hoje se perde no texto.

---

## 2. Decisões aplicadas (D1–D11) e o que ainda falta decidir

| # | Aprovado | Como aparece neste plano |
|---|---|---|
| D1 | herança **materializada** (`preco_venda` continua sendo o preço efetivo, mais `preco_origem`) | M1 + gatilhos |
| **D2 (revista em 26/11)** | **dois eixos**, "opção" e "versão", ambos texto, com rótulo e uso definidos pela categoria; a opção pode ser composta ("16GB / 512GB"); a cor fica agregada | `opcao`/`opcao_norm`, `versao`/`versao_norm`; `estoque_categorias.opcao_rotulo`, `versao_rotulo`, `versoes` (§2.2) |
| D3 | `novo`/`usado`; seminovo é rótulo; nota de estado vira preço próprio | M1 aceita os dois valores; M2 converte; M4 restringe |
| D4 | preço por empresa; exceção por loja **reservada** | `preco_variante(variante, loja, cor)` lida por todos desde o início (o parâmetro de cor também reservado, §2.3) |
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
- **O que entra:** toda unidade de troca **ativa** que ainda não tem variante, em duas situações:
  - **aguardando chegada** (`status = 'pendente'`): idade contada do aceite (`created_at`);
  - **chegou, sem classificação** (recebida e ainda sem variante): idade contada da chegada (`recebido_em`).
- **Colunas:** aparelho (descrição digitada no aceite), loja, situação, **idade em dias**, venda de origem (link para o Histórico pelo `grupo_pdv`), valor oferecido na troca (visível ao vendedor por decisão de 24/11; o custo da unidade só com `estoque.ver_custo`).
- **Topo:** a **quantidade** total e por situação, e o filtro "paradas há mais de X dias".
- **Ação "Classificar":** abre a edição da unidade (1.2b) com produto, opção, **versão** (quando a categoria usa; "Não informada" é aceita na troca) e condição; ao salvar, vincula a variante pela `estoque_unidade_vincular` (audita). A troca aguardando chegada pode ser classificada antes de chegar; a chegada continua pelo fluxo de hoje (Estoque → confirmar chegada).
- **Ordem padrão:** a mais antiga primeiro.

**O aviso de troca parada** (painel do dono):
- **Configuração:** chave `estoque.troca_parada_dias` no `empresa_config` da 1.1 (por empresa, com exceção por loja se o motor permitir). **Padrão: 7 dias.** Editável em Configurações → Estoque por quem tem `config.editar`.
- **Quem vê:** no painel (dashboard), o Dono e quem tem `estoque.preco_proprio`, só para as lojas que enxerga.
- **Regra:** aparece quando houver pelo menos uma troca, nas duas situações acima, com idade **maior que X dias**. Mostra a quantidade e a mais antiga ("4 trocas paradas há mais de 7 dias; a mais antiga há 54 dias") e leva à lista já filtrada.
- **Some sozinho** quando todas forem classificadas ou recebidas e classificadas. Não grava nada: é leitura (sem notificação nem e-mail nesta etapa).
- **Na JM hoje, com X = 7:** apareceria com **22** trocas.

**Banco (vai na M1, só adiciona):**
- função `estoque_trocas_a_classificar(p_filial bigint default null) STABLE SECURITY INVOKER`: devolve as linhas da lista com a idade calculada no fuso da loja; a RLS da unidade já limita empresa e loja, e a função recusa sem `estoque.preco_proprio`;
- função `estoque_trocas_paradas_resumo() STABLE`: quantidade e idade máxima acima do `estoque.troca_parada_dias` (lido pela `config_valor`), para o painel;
- índice parcial `estoque_unidades (empresa_id, filial_id, created_at) where tipo = 'troca' and variante_id is null and ativo` (a lista e o aviso não varrem a tabela).

**Critério de aceite próprio:** com X = 7, o painel do dono mostra exatamente as trocas com mais de 7 dias (prova SQL comparando a função com a contagem direta); Vendedor e Consulta não veem a lista nem o aviso; classificar pela lista grava a variante e a auditoria; mudar X na configuração muda o aviso sem deploy.

### 2.2 D2 revista: opção + versão (26/11)

**Por que um segundo eixo, e não versão dentro da opção:** a opção já é texto composto ("16GB / 512GB"); enfiar a versão nela ("256GB · Chip físico") faria a lista de opções do produto multiplicar (6 capacidades × N versões), misturaria duas escolhas numa só e impediria filtrar "todas as de chip físico". Dois eixos curtos, cada um com sua lista, são mais fáceis de escolher na tela e de casar com a fonte de preço.

**Modelo:**

| Onde | O quê |
|---|---|
| `estoque_categorias.opcao_rotulo` | rótulo do eixo de opção ("Armazenamento", "Volume", "Tamanho"); vazio = categoria sem opção (já estava na revisão 1) |
| `estoque_categorias.versao_rotulo` (novo) | rótulo do eixo de versão ("Versão", "Conectividade"); **vazio = categoria sem versão** (perfume, acessório, veículo) |
| `estoque_categorias.versoes text[]` (novo) | lista **fechada** das versões aceitas na categoria, na ordem de exibição. Ex. na JM, celular: "Chip físico", "Chip virtual", "Físico + virtual", "Chip virtual · EUA", "Chip virtual · Japão", "ANATEL"… (a lista final sai da leitura do dia, §3 M2). Editável pela tela da categoria por quem tem `estoque.preco_variante`, sem deploy |
| `estoque_produtos.armazenamentos` | continua sendo a lista de opções permitidas do produto (sem mudança) |
| `estoque_variantes.versao` (novo) | texto; **vazio = "Não informada"**; obrigatoriamente um valor da lista da categoria ou vazio. Categoria sem eixo de versão: sempre vazio |
| `estoque_variantes.versao_norm` (novo, gerada) | mesma normalização da opção (minúsculo, sem acento, sem espaço; `·`, `-` e `/` ignorados), para "Chip Virtual · EUA" = "chip virtual - eua" |
| Chave única | `(empresa_id, produto_id, opcao_norm, versao_norm, condicao)` |

**Regras:**
1. **Os dois eixos são opcionais por categoria.** Perfume: opção "Volume", sem versão. Acessório: nenhum dos dois (variante única por condição). Veículo: nenhum, e "cada unidade é única" (roteiro §4.1).
2. **Lista fechada, sem texto livre** na entrada, na encomenda e na classificação. A versão é dado da empresa (lista na categoria), não código: nada de "chip", "ANATEL" ou bandeira no código do núcleo (`check-segmento-modulo` continua valendo). As bandeiras do PXT viram texto na equivalência da precificação (🇺🇸 → "EUA").
3. **"Não informada" é uma variante de verdade**, com preço próprio. Serve para os aparelhos de hoje (nenhum dado traz versão), para a troca em que a loja não conferiu e para a oferta "sem versão" da fonte de preço, que tem preço diferente (o exemplo do 18 Pro Max: R$ 10.450). Uma oferta sem versão **nunca** alimenta uma variante com versão definida, e vice-versa.
4. **Unidade não ganha coluna de versão:** a versão é da variante. A unidade sem variante (troca a classificar) não precisa dela; a classificada herda pela variante. Trocar a versão de uma unidade = trocar de variante (`estoque_unidade_vincular`, auditada, mesma regra de preço do gatilho de vínculo).
5. **Tirar uma versão da lista da categoria** não apaga variante: as variantes daquela versão continuam valendo e a RPC recusa só criar variante nova com ela (aviso na tela da categoria: "N variantes usam esta versão").
6. **Onde a versão é obrigatória:** na categoria que usa versão, a escolha é obrigatória em todo lugar que cria ou escolhe variante. Entrada de unidade e classificação de troca aceitam "Não informada"; a **encomenda nova** exige versão definida (recomendação, decisão dos sócios no §2.3, item 2).

**Exemplos:**

| Categoria | Opção | Versão | Variantes de exemplo |
|---|---|---|---|
| Celular (JM) | Armazenamento | Versão | iPhone 18 Pro Max / 512GB / Chip virtual · EUA / novo; … / Chip físico / novo; … / Não informada / novo |
| Smartwatch (se a JM quiser) | — | Conectividade | Apple Watch Ultra 3 / — / GPS + Cellular / novo |
| Perfume (futuro) | Volume | — | Perfume X / 100ml / — / novo |
| Acessório | — | — | Cabo USB-C / — / — / novo |

### 2.3 Decisões pendentes dos sócios (Matheus e Eduardo)

1. **Preço por cor.** A cor continua agregada (uma variante para todas as cores). O PXT mostra diferença real, embora menor que a da versão: iPhone 17 Pro Max 512GB laranja R$ 8.450 × prata R$ 8.838 (**+R$ 388, 4,6%**). Com a cor agregada, a precificação mistura as cores na base ([precificacao-fase1-plano.md §3](precificacao-fase1-plano.md)) e a loja vende as duas pelo mesmo preço.
   - **Recomendação:** manter agregada agora e, se os sócios quiserem, ligar depois uma **exceção por cor** (preço diferente só para as cores que pedirem, sem multiplicar variantes).
   - **O que a 1.2 já deixa pronto:** `preco_variante(p_variante, p_filial, p_cor text default null)` nasce com o parâmetro de cor, ignorado hoje; todo leitor já passa a cor da unidade. O nome `estoque_variantes_precos_cor (variante_id, cor_norm, preco)` fica reservado, como a exceção por loja da D4. Ligar a exceção depois é uma migração aditiva + o gatilho de propagação passando a olhar a cor da unidade, sem trocar nenhum leitor.
   - Se a decisão for "preço por cor sempre", a cor vira um terceiro eixo: mudança grande (entrada, encomenda, precificação), que precisaria de revisão deste plano **antes** da M1.
2. **Encomenda com versão "Não informada".** Recomendação: **não** nas categorias que usam versão (o cliente encomenda um aparelho definido, e a diferença de preço entre versões chega a 21%). Entrada de unidade e troca continuam aceitando.
3. **Lista de versões da JM.** Os nomes exatos que a loja quer ver ("Chip virtual · EUA" ou "eSIM EUA"?). Proposta: semear com as versões que aparecem na lista da JM no PXT, no texto em português, e ajustar pela tela da categoria.

---

## 3. Migrações (todas compatíveis com o app no ar)

Números reservados no `.claude/sessoes-locais.json` só no momento em que cada arquivo for criado (regra de colisão). Cada migração vem com o `teste-*.sql` e o `esperado/*.json` dela, no mesmo commit (ritual §8.6.1), e com o arquivo de volta.

### M1 — estrutura (só adiciona; o app atual não percebe nada)

**Tabelas e colunas novas:**

| Objeto | Detalhe |
|---|---|
| `estoque_variantes` (nova; módulo `catalogo`) | `id`, `empresa_id`, `produto_id` (FK `on delete restrict`, mesma empresa), `opcao text` (vazio na variante única), `opcao_norm` (gerada), **`versao text not null default ''`** (vazio = "Não informada"), **`versao_norm`** (gerada), `condicao` (`novo`\|`usado`), `preco numeric` (nulo = sem preço), `sku text`, `ean text[]`, `ativo`, `travado` (a precificação automática não mexe), `created_at`, `updated_at`, `atualizado_por`. Únicos: **`(empresa_id, produto_id, opcao_norm, versao_norm, condicao)`** e `(empresa_id, sku)` parcial. Índices `(empresa_id, produto_id)`, `(empresa_id, ativo)` e GIN em `ean` |
| `estoque_unidades` | `+ variante_id` (FK, nulo permitido), `+ preco_origem` (`variante`\|`proprio`, **padrão `proprio`**, não nulo). Nada muda: nenhuma unidade herda até a M2. **Sem coluna de versão** (§2.2, regra 4) |
| `estoque_categorias` | `+ opcao_rotulo text` (vazio = sem eixo), **`+ versao_rotulo text`** (vazio = sem versão), **`+ versoes text[] not null default '{}'`**, `+ unidade_unica boolean default false` ("cada unidade é única": veículo e afins) |
| `estoque_variantes_precos_loja`, `estoque_variantes_precos_cor` | **não criadas** (D4 e §2.3 só reservam os nomes). A função abaixo já existe para todo leitor usar |

**Funções:**

| Função | O que faz |
|---|---|
| `preco_variante(p_variante, p_filial, p_cor text default null) STABLE` | hoje devolve `estoque_variantes.preco`; amanhã, a exceção por loja e, se aprovada, por cor (§2.3). Os parâmetros de loja e cor são aceitos e ignorados |
| `estoque_variante_salvar(...)` RPC `SECURITY DEFINER` | cria ou altera variante e preço; confere `tem_permissao('estoque.preco_variante')` e `modulo_ligado`; recusa ligar variante a categoria `unidade_unica`; **recusa versão fora da lista da categoria (`VERSAO_INVALIDA`) e versão não vazia em categoria sem eixo de versão (`CATEGORIA_SEM_VERSAO`)**; audita (`origem` vem do parâmetro: manual, csv, precificação; `depois` leva só preço, versão, opção, condição e a referência da origem, **nunca custo**, porque a Auditoria não exige `ver_custo`) |
| `estoque_variante_previa(p_variante, p_preco_novo) STABLE` | "X unidades disponíveis passam de R$ A para R$ B" (e a margem, só com `ver_custo`) |
| `estoque_unidade_preco(p_unidade, p_preco \| null)` RPC | `p_preco` = define preço próprio; `null` = volta ao preço da variante. Confere `estoque.preco_proprio`; audita |
| `estoque_unidade_vincular(p_unidade, p_variante)` RPC | liga ou troca a variante (classificação da troca, entrada, **correção de versão**); recusa `unidade_unica` |
| `estoque_categoria_versoes_salvar(p_categoria, p_rotulo, p_versoes text[])` RPC | grava o rótulo e a lista; confere `estoque.preco_variante`; recusa valor duplicado depois de normalizado; audita. Tirar um valor da lista não toca variante (§2.2, regra 5) |
| `pdv_conferir_precos(p_itens jsonb) STABLE` | roteiro §4.4: recebe unidade + preço mostrado e devolve as diferenças contra o preço efetivo atual |

**Gatilhos (valem para qualquer caminho de escrita):**

1. **Propagação:** `AFTER UPDATE OF preco ON estoque_variantes` → atualiza `preco_venda` das unidades com `preco_origem = 'variante'` **e** `status = 'disponivel'` (D5); marca a transação com `nexus.preco_origem = 'heranca'` e audita uma linha por unidade.
2. **Preço próprio automático:** `BEFORE UPDATE OF preco_venda ON estoque_unidades` fora da propagação → `preco_origem = 'proprio'` e audita. **Compatibilidade:** é isto que deixa o app antigo seguro: a tela de hoje, que grava `preco_venda` direto, continua funcionando e a unidade vira "própria", sem perder o valor.
3. **Vínculo:** troca de `variante_id` numa unidade com origem `variante` → recebe o preço da variante; variante sem preço = mantém C, como próprio. Vale também para a troca de versão.
4. **"A partir de":** recalcula `estoque_produtos.preco` = menor preço das variantes ativas, **só quando o produto tem variante**. Produto sem variante mantém o A de hoje (o cardápio, que grava A, continua funcionando até a M3).
5. **Ponte do cardápio (temporária, sai na M4):** se o app antigo gravar `estoque_produtos.preco` num produto que tem **variante única**, o valor vai para a variante única. Sem dado hoje (A = 0 em todas as empresas), mas evita divergência durante a transição.

**Condição (expansão):** a checagem de `estoque_unidades.condicao` passa a aceitar `novo`, `usado` **e** `seminovo` (o app antigo grava `seminovo`). A variante só aceita `novo`/`usado`; ao vincular, `seminovo` lê como `usado`.

**RLS:** `estoque_variantes` com SELECT por empresa (preço de venda não é segredo na loja) e **sem grant de escrita** para `authenticated` (só RPC). As colunas novas de `estoque_categorias` seguem a RLS da tabela; a escrita delas passa pela RPC. Uma política por comando, sem `for all`.

**Teste SQL da M1** (transação desfeita, duas empresas): isolamento; propagação só em disponível que herda (reservada e vendida intactas); preço próprio automático; vínculo; troca de versão pela vinculação; "a partir de"; recusa sem permissão; recusa em `unidade_unica`; **duas variantes do mesmo produto, opção e condição com versões diferentes convivem, e a mesma versão escrita de dois jeitos é recusada como duplicada; versão fora da lista recusada; versão em categoria sem eixo recusada; `preco_variante` com e sem cor devolve o mesmo valor**; auditoria gravada em cada caso, sem custo no `depois`; invariante "disponível com origem `variante` e C ≠ preço da variante = 0".

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
| 1b | **`versao_rotulo = 'Versão'` e `versoes` só na categoria celular**, com a lista aprovada pelos sócios (§2.3, item 3), lida no dia das versões que aparecem na lista da JM no PXT. Demais categorias sem versão (a JM liga depois pela tela, sem deploy) | 1 categoria com versão |
| 2 | Unidades **ativas** não vendidas com produto + opção + condição → usa a variante que já existir (pode ter sido criada pela tela da 1.2b) ou cria com **versão vazia ("Não informada")** (preço = C da unidade; com mais de um C no grupo, o mais comum e o resto vira próprio) e vincula | 6 variantes, 6 vínculos |
| 3 | Origem `variante` **só** onde C = preço da variante, centavo a centavo; o resto fica `proprio` | 6 com origem `variante` |
| 4 | Condição `seminovo` → `usado` na unidade (D3) | 4 unidades |
| 5 | Vendidas: `variante_id` só com chave clara (versão "Não informada"); nunca toca C nem venda | 3 vínculos |
| 6 | **Trava:** contagem e soma de `preco_venda` por empresa **antes = depois**, e "unidades com preço efetivo diferente" = 0. Se não bater, a transação desfaz tudo | 0 |
| 7 | Relatório do que ficou de fora | 31 trocas pendentes, 1 reservada sem produto, 1 inativa |

- A M2 **não adivinha versão** pelo texto da unidade, nem quando o texto fala em "chip" ou país: o palpite errado viraria preço errado (mesma regra das trocas, §2, resposta 2). A loja corrige na edição da unidade.
- Backup antes: `_backup_variante_unidades_<data>` (id, produto, opção, condição, C, status) e `_backup_variante_categorias_<data>` (id, rótulos, versões) com RLS ligada e sem grant, + dump externo das tabelas tocadas (como no hotfix).
- Auditoria: cada vínculo, cada variante criada e cada categoria alterada vão para `auditoria_eventos` com `origem = 'migracao'`.
- Volta: `update` a partir dos backups (variante_id nulo, origem `proprio`, condição antiga, rótulos e listas antigos) e `delete` das variantes criadas.

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
| `supabase/scripts/testes/teste-variante.sql` + `esperado/teste-variante.json` | prova da M1 (com os casos de versão) |
| `supabase/scripts/testes/teste-pdv-preco-mudou.sql` + esperado | prova da M1b |
| `supabase/scripts/ops/variante-migrar.sql` + `variante-simular.mjs` | M2 com prévia (a lista de versões da JM entra como dado do script, não do código) |
| `supabase/scripts/volta/volta-variante-*.sql` | voltas de M1, M1b, M2, M4 |
| `tests/integracao/variante-local.test.ts` | RPCs com sessão real (Dono, Admin, Vendedor, Consulta) |
| `types/database.gerado.ts` | regenerado |

### 4.2 App: o que muda (leitores e gravadores de preço, código de 25/11)

| Área | Arquivos | Mudança |
|---|---|---|
| **Produtos → Preços** (nova aba, troca a "Tabela de preços") | `app/(dashboard)/catalogo/page.tsx`, `catalogo/components/catalogo-view.tsx`, `lib/tabela-precos-csv.ts` → `lib/variantes-csv.ts` | uma linha por variante, **agrupadas por produto + opção, com as versões lado a lado** (versão, condição, preço, quantas herdam, quantas próprias, travado); filtros por versão e **"Versão não informada"**; edição em lote com prévia "X unidades mudam"; CSV com `produto_id`, opção, **versão** e condição (versão fora da lista = linha recusada com motivo na prévia); colunas Novo/Usado do produto saem das variantes |
| **Cadastro de produto** | `estoque/components/produto-modal.tsx` | seção "Variantes e preços" (lista com versão, criar, desativar, preço, SKU/EAN); some qualquer campo de preço do produto |
| **Categoria** | tela de categorias do estoque | "Eixo de opção" (rótulo), **"Eixo de versão" (rótulo + lista de versões, com "N variantes usam esta versão")** e "Cada unidade é única" |
| **Entrada de unidade** | `estoque/components/estoque-view.tsx`, `estoque/page.tsx` | produto → opção (rótulo da categoria) → **versão (rótulo da categoria; lista fechada, "Não informada" por último)** → condição → mostra a variante e o preço; "deixar" = herda, "outro valor" = próprio (com aviso). Variante inexistente: criação rápida para quem tem `estoque.preco_variante`, senão a unidade entra com preço próprio e a variante fica a criar. Acaba o casamento por substring com B |
| **Edição da unidade** | `estoque/components/unidade-modal.tsx` | selo "Herdado da variante" / "Preço próprio", ação "Voltar ao preço da variante"; classificar troca pendente (produto + opção + versão + condição); **"Corrigir versão"** (troca de variante, auditada) |
| **PDV** | `pdv/page.tsx`, `pdv/components/pdv-view.tsx` | item mostra a versão; selo "preço próprio"; antes de gravar, `pdv_conferir_precos` e o aviso "o preço mudou"; o aviso "abaixo do catálogo" compara com o preço da variante (`lib/valor-abaixo-do-catalogo.ts`) |
| **Encomenda** | `components/modules/pdv/encomenda-form.tsx`, `encomenda-itens.tsx`, `encomendas-abertas.tsx`, `app/api/compras/receber/route.ts` | item escolhe a variante, **com a versão obrigatória e definida nas categorias que usam versão** (§2.3, item 2), e criação rápida para quem tem `preco_variante`; preço vem dela; na chegada a unidade nasce com a variante (preço vendido diferente = próprio) |
| **Troca no PDV e orçamento** | `lib/troca-referencia.ts`, `orcamentos/page.tsx`, `orcamentos/tipos.ts`, `components/modules/orcamentos/orcamento-editor-modal.tsx`, `components/modules/celulares/card-orcamento-troca.tsx` | referência pelas variantes `usado` do produto (a da versão escolhida; sem versão, a "Não informada"), não por texto em B |
| **Cardápio** | `app/(dashboard)/cardapio/cardapio-view.tsx`, `cardapio/page.tsx` | grava na variante única; o público (`app/menu/[slug]`, `/api/menu/[slug]/pedido`) segue lendo A, que é igual |
| **Autocomplete de produto** | `components/modules/leads/produto-autocomplete.tsx`, `new-lead-modal.tsx` | mostra o "a partir de" (A derivado); sem mudança de código além do texto |
| **Trocas a classificar e aviso** (1.2g) | `app/(dashboard)/estoque/page.tsx` (aba), `components/modules/estoque/trocas-a-classificar.tsx` (novo), `lib/painel/metricas.ts` + `components/modules/dashboard/dashboard-view.tsx` (aviso), tela de configuração do estoque (chave `estoque.troca_parada_dias`) | lista com quantidade e idade; aviso no painel; X configurável |
| **Sem mudança** (leem C, que continua sendo o preço efetivo) | reserva (`/api/reservas`, `lead-reserva-panel`), veículos (`/api/veiculos/[slug]`, `lib/match-veiculos.ts`, `/api/match/lead/[id]`, `lead-interesse-panel`), relatórios, contrato | — |

### 4.3 Telas novas ou alteradas (conferência visual obrigatória em cada uma)

1. Produtos → Preços (lista agrupada com versões, filtros, edição em lote, prévia, CSV).
2. Produto → Variantes e preços.
3. Categoria → eixo de opção, **eixo de versão e lista de versões**, unidade única.
4. Estoque → entrada (com variante e versão) e edição da unidade (selo, voltar, classificar troca, corrigir versão).
5. PDV → aviso "o preço mudou", selo de preço próprio, versão no item.
6. Encomenda → item com variante, versão obrigatória e criação rápida.
7. Auditoria (da 1.1) → filtro "preço" mostrando antes → depois por variante e unidade.
8. Estoque → **Trocas a classificar** (quantidade, idade, situação, classificar).
9. Painel → **aviso de troca parada** (Dono e quem tem `estoque.preco_proprio`).
10. Configurações → Estoque → "Avisar troca parada há mais de X dias".

---

## 5. Entregas menores (cada uma com os portões completos)

| Entrega | Conteúdo | Banco | Visível | Pode subir quando |
|---|---|---|---|---|
| **1.2a** | M1 (estrutura com opção **e versão**, funções, gatilhos, RLS) + testes | sim | não (nenhuma unidade herda; app igual) | prova SQL verde no ritual; backup conferido; ponto de volta anotado; 10 min sem atividade na JM; IOwait < 10% |
| **1.2b** | App: Produtos → Preços, variantes no produto, categoria (com versão), entrada e edição de unidade, conferência de preço no PDV | não | sim, só para quem tem as permissões | 1.2a em produção; testes, build, conferência visual de cada tela da §4.3 no local; smoke na Demonstração |
| **1.2c** | M2 (dados da JM, com a lista de versões aprovada) | sim | sim (6 variantes aparecem, versão "Não informada") | 1.2b em produção; simulação local com cópia do dia e prévia aprovada pelo Lucas; lista de versões aprovada pelos sócios; trava "0 preço efetivo diferente" |
| **1.2d** | Encomenda com variante e versão + `/api/compras/receber` + troca e orçamento pela variante + cardápio na variante única | não | sim | 1.2c em produção; decisão dos sócios sobre "Não informada" na encomenda (§2.3, item 2) |
| **1.2e** | M1b (`PRECO_MUDOU` no fechamento) | sim | só quando o preço muda com o carrinho aberto | 1.2b em produção; smoke da conferência verde na Demonstração; nenhum aviso falso de "preço mudou" nos logs desde a 1.2b |
| **1.2f** | M4 (contração) | sim | não | 1.2d em produção; nenhum leitor antigo no código |
| **1.2g** | Trocas a classificar (lista) + aviso de troca parada no painel do dono + chave `estoque.troca_parada_dias` (§2.1). As funções e o índice já vêm na M1 | não (só a chave de configuração, gravada pelo motor da 1.1) | sim, para quem tem `estoque.preco_proprio` | 1.2b em produção (a ação "Classificar" usa a edição da unidade da 1.2b); conferência visual da lista e do aviso; smoke na Demonstração com uma troca de 10 dias e X = 7 |

Cada deploy de app: ponto de volta na Vercel anotado; 10 minutos sem venda, pagamento ou conclusão na JM; push; deploy pronto; smoke na Demonstração com o cenário da entrega; logs da Vercel e do Supabase sem erro novo por 15 minutos. Cada migração: backup + digital antes, `apply_migration` pelo MCP fora dos minutos 05–15, `lock_timeout` curto (lição do deadlock da 1.1b), conferência depois. Volta: app primeiro (promover o deploy anterior), banco depois.

**Smoke na Demonstração por entrega** (empresa 5, Laboratório, tudo limpo no fim):
- 1.2a: nada visível; conferir no banco que nenhuma unidade da JM mudou (contagem e soma de C).
- 1.2b: criar categoria com eixo de versão e duas versões; criar produto + **duas variantes que diferem só na versão**, com preços diferentes; entrar unidade herdando de uma delas; mudar o preço dessa variante e ver só essa unidade acompanhar; corrigir a versão da unidade e ver o preço trocar; definir preço próprio e voltar; reservar e ver que a reservada não muda; PDV com o preço alterado no meio da venda e o aviso.
- 1.2c: na JM, conferir as 6 variantes ("Não informada"), as 6 unidades com origem `variante` e a lista de versões da categoria celular (só leitura).
- 1.2d: encomenda nova com variante e versão (e a recusa sem versão definida, se aprovado), chegada criando a unidade com a variante; troca pelo preço `usado`.
- 1.2e: venda com preço alterado por fora no meio do fechamento → `PRECO_MUDOU`.

---

## 6. Critérios de aceite da 1.2

1. Diagnóstico refeito na produção **no dia da M2** (os números da §1 atualizados).
2. **0 unidades com preço efetivo diferente** antes e depois da M2 (contagem e soma de `preco_venda` por empresa iguais).
3. Propagação só em disponíveis que herdam: reservadas, vendidas e próprias intactas (prova SQL e smoke).
4. Veículos e categorias `unidade_unica`: sem variante, sem mudança; empresa 10 (Aletrini) com contagens iguais antes e depois (critério fixo do roteiro §4.1).
5. Encomenda **nova** exige variante (e versão definida nas categorias com versão, se aprovado); as 7 abertas continuam entregáveis pelo fluxo de hoje.
6. Histórico de preço visível na Auditoria, com origem (manual, herança, CSV, migração, precificação), **sem nenhum valor de custo no `depois`**.
7. Nenhuma venda, encomenda ou orçamento antigo alterado (contagem e soma de `valor_venda`, `valor_custo` e `data_venda` iguais).
8. Sem a permissão: Vendedor e Consulta não editam preço de variante, nem a lista de versões, nem definem preço próprio (teste de integração com sessão real e tentativa direta pela API, recusada no banco).
9. PDV: preço alterado com o carrinho aberto gera o aviso (1.2b) e, depois da 1.2e, a recusa `PRECO_MUDOU` no fechamento.
10. O app antigo continua funcionando com a M1 aplicada (teste: rodar o e2e atual do PDV e do estoque contra o banco com a M1).
11. Trocas a classificar e aviso de troca parada: o critério próprio da §2.1.
12. **Versão:** duas variantes que diferem só na versão convivem com preços independentes (mudar uma não muda a outra nem as unidades da outra); versão fora da lista e versão em categoria sem eixo são recusadas no banco; categoria sem eixo de versão (acessório, perfume) funciona exatamente como na revisão 1, com versão sempre vazia; trocar a versão de uma unidade troca a variante e o preço herdado, com auditoria.
13. **Cor reservada:** `preco_variante` com e sem cor devolve o mesmo valor; nenhum leitor de preço da 1.2 chama a variante sem passar pela função.

---

## 7. Encaixe com a precificação por fornecedores

O plano completo está em [precificacao-fase1-plano.md](precificacao-fase1-plano.md). O contrato entre os dois:

| A 1.2 entrega | A precificação usa assim |
|---|---|
| `estoque_variantes` com opção, **versão** e condição | **destino único** do preço. O item da fonte casa com a variante por produto + opção + versão + condição; a cor da fonte é guardada na oferta, mas não entra na chave (cor agregada) |
| `estoque_variante_salvar(..., origem = 'precificacao')` | o único caminho de escrita da precificação. Audita com a referência da sugestão e da regra, **sem custo** |
| Herança (D5) | as unidades disponíveis que herdam acompanham sozinhas; **reservadas e com preço próprio não são afetadas**. A precificação nunca grava em unidade |
| `travado` | variante travada nunca recebe aplicação, nem aprovada à mão pela fila: tem de ser destravada antes |
| Versão "Não informada" | recebe as ofertas "sem versão" da fonte e só elas |
| Lista de versões da categoria | a equivalência de versão da precificação (ex.: "Chip virtual 🇺🇸" → "Chip virtual · EUA") só aponta para valores da lista. Versão nova na fonte aparece em "Não encontrados" com o atalho "acrescentar à lista" para quem tem `estoque.preco_variante` |
| Criação rápida de variante (D8) | a aba "Não encontrados" da precificação reaproveita a mesma criação rápida; a variante nasce **sem preço** e o primeiro preço passa sempre pela fila de aprovação |
| Aba Produtos → Preços | a precificação acrescenta só o selo "sugestão pendente" com link para a fila, visível para quem tem `estoque.ver_custo` (quem acessa o módulo). A fila, os não encontrados e as regras ficam na tela do módulo |
| `preco_variante(variante, loja, cor)` | se a exceção por cor for aprovada (§2.3), a precificação passa a poder sugerir preço por cor sem mudar a chave do vínculo |

**Começa** quando a 1.2c estiver em produção (as variantes existem e têm preço) e a lista de versões da JM estiver gravada.

---

## 8. Riscos e como cada um é coberto

| Risco | Cobertura |
|---|---|
| Alguém grava `preco_venda` por fora (script, restore) e a unidade vira "própria" sem querer | gatilho de preço próprio + invariante no teste + conferência no smoke |
| Erro de digitação no preço da variante se espalha nas disponíveis | prévia "X unidades mudam", só com permissão, auditoria com volta, e na precificação a variação máxima sem aprovação |
| Carrinho aberto com preço antigo | `pdv_conferir_precos` (1.2b) e `PRECO_MUDOU` (1.2e) |
| App antigo e banco novo ao mesmo tempo durante o deploy | M1 só adiciona; gatilho de preço próprio mantém o app antigo seguro; trava e contração em entregas separadas |
| Condição com dois vocabulários na transição | M1 aceita os três valores; M2 converte; M4 restringe |
| Troca pendente crescendo sem classificação (19 → 31 em 16 dias; 10 com mais de 30 dias, todas ainda sem chegar) | lista "Trocas a classificar" e aviso no painel do dono acima de X dias (1.2g); nada automático |
| **Versão escolhida errada na entrada** (chip físico registrado como virtual) e o preço herdado sai errado | lista fechada (sem digitação), "Não informada" sempre disponível na entrada, "Corrigir versão" na unidade com auditoria; a M2 não adivinha |
| **Lista de versões cresce sem controle** (cada combinação de chip × origem vira um valor) | só quem tem `estoque.preco_variante` edita; a precificação mostra a versão nova em "Não encontrados" em vez de criar sozinha; a tela da categoria mostra quantas variantes usam cada versão |
| **Variantes "Não informada" e com versão do mesmo aparelho convivendo** e confundindo o vendedor | Preços agrupa por produto + opção com as versões lado a lado e o filtro "Versão não informada"; a reclassificação das unidades atuais é tarefa da loja, sem prazo técnico |
| Decisão futura de preço por cor obrigar a migrar leitores | `preco_variante` já recebe a cor (§2.3); a exceção por cor é aditiva |
