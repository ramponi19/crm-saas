# Precificação por fornecedores: plano da fase 1 (e da fase 2)

26/11/2026. **Só plano: nenhum código, nenhuma migração, nada na produção.** Começa quando a etapa 1.2 (variante) estiver em produção até a entrega 1.2c.

Base:
- [precificacao-fornecedores-proposta.md](precificacao-fornecedores-proposta.md), com o adendo de 24/11 (destino único na variante, histórico na auditoria, permissões da 1.1);
- [etapa-1.1-plano.md](etapa-1.1-plano.md) (só leitura): auditoria única (`auditar`), motor de configuração (`empresa_config`, `config_valor`, `config_salvar`), cargos e `tem_permissao`, custo protegido por `estoque.ver_custo`; e a [entrega 1.1r](etapa-1.1r-rotinas-plano.md) (`rotinas_execucoes`);
- [etapa-1.2-variante-plano.md](etapa-1.2-variante-plano.md) revisão 2 (variante com opção **e versão**, cor agregada, criação rápida, contrato do §7);
- achados do MCP do Buscador PXT, explorado só com leitura em 25/11 (§1).

Regra de trabalho (memória do projeto, "Excelência sem espera de horário"): entrega liberada por critério; toda migração compatível com o app no ar (adiciona → usa → remove); portões completos em cada deploy.

---

## 0. Resumo

| Tema | Decisão (pedido de 26/11) |
|---|---|
| **Destino** | **Único: `estoque_variantes.preco`**, gravado só pela `estoque_variante_salvar` com `origem = 'precificacao'`. As unidades disponíveis que herdam acompanham pela herança; **reservadas e com preço próprio não são afetadas**. A precificação nunca grava em unidade |
| **Histórico** | Na auditoria única da 1.1 (`auditoria_eventos`). Sem tabela de histórico própria |
| **Regras** | Base, margem, arredondamento, variação máxima e modo no **motor de configuração da 1.1** (`empresa_config`), sem tabela de regras própria |
| **Quem vê** | Custo dos fornecedores e o módulo inteiro só com **`estoque.ver_custo`**. Aplicar preço exige também `estoque.preco_variante` |
| **Dono da regra** | **O Nexus, não o PXT.** O Nexus usa `costPrice` e `supplierCount`. O `sellingPrice` do PXT aparece só como comparação na fila de aprovação |
| **Base padrão** | Média das **3 menores** ofertas, ignorando as com `supplierCount` abaixo de um **mínimo configurável (padrão 2)**. Sobrou menos de 3: média do que sobrou. Não sobrou nenhuma: a variante vai para a fila **sem sugestão, com o motivo** |
| **Margem** | R$ fixo ou %, por **categoria > subcategoria > marca > modelo > versão** (a mais específica vence) |
| **Arredondamento** | configurável |
| **Modo** | **com aprovação (padrão)** ou automático dentro da variação máxima |
| **Casamento** | dicionário de equivalências por empresa; regra exata confirma sozinha; semelhança vai para a fila; **sem IA na fase 1** |
| **Sem variante** | aba **"Não encontrados"**; quem tem permissão usa a criação rápida de variante da 1.2 |
| **Fase 1** | upload do **XLSX exportado do PXT com chip e região**; reimportação do mesmo arquivo recusada |
| **Fase 2** | adapter **MCP** (cliente MCP no servidor, credencial em variável de ambiente, captura agendada registrada em `rotinas_execucoes`), **só depois da confirmação por escrito do PXT** de que o uso automatizado é permitido |
| **Outras empresas** | interface comum de adapters: XLSX genérico com mapeamento de colunas e JSON |

---

## 1. O que os achados do PXT mudam na proposta de 24/11

| Achado (MCP do PXT, só leitura, 25/11) | O que muda |
|---|---|
| O MCP entrega **por variante do PXT**: `productName`, `storage`, `color`, identidade de **versão** (chip físico / chip virtual / físico + virtual, origem 🇺🇸 🇯🇵 🇮🇳 🇦🇪 🇨🇳, ANATEL), `costPrice`, `sellingPrice`, `supplierCount` | A unidade de trabalho deixa de ser "uma linha por oferta de fornecedor anônimo" e passa a ser **uma oferta por variante do PXT, com a contagem de fornecedores**. O sinal "Baixa disponibilidade: N fornecedores" da planilha de 24/11 é o `supplierCount` |
| **A versão muda muito o preço:** 18 Pro Max 512GB Glacier a R$ 10.350 (chip virtual 🇺🇸), R$ 10.450 (sem versão), R$ 10.800 (chip virtual sem origem) e R$ 12.499 (chip físico) | A variante do Nexus ganhou o eixo **versão** (1.2 revisão 2). A versão entra na chave do vínculo; oferta "sem versão" só alimenta a variante "Não informada" |
| **A cor pesa menos, mas existe:** 17 Pro Max 512GB laranja R$ 8.450 × prata R$ 8.838 | A cor continua agregada: ofertas de cores diferentes da mesma variante entram juntas na base. Preço por cor é decisão pendente dos sócios (1.2 §2.3) |
| **Chip físico quase sempre com 1 fornecedor só**, e mais caro | Com o mínimo padrão de 2 fornecedores, a maioria das variantes de chip físico vai para a fila **sem sugestão** (§3, exemplo C). É o comportamento pedido; os sócios precisam saber |
| O **"+ R$ 700" não é do PXT**: é uma regra da própria conta da JM no PXT (iPhone, menor oferta + R$ 700, criada em 22/11); há também + R$ 1.000 no MacBook Air M4 512GB prata | O `sellingPrice` é só comparação. A margem da JM passa a ser configurada **no Nexus**. O Nexus **nunca** altera nada na conta do PXT (nem a regra dele) |
| A lista da JM tem **158 itens**; em 25/11, **147** vieram com preço e **2** ficaram indisponíveis | Escala da fase 1: ~160 ofertas por captura. Oferta sem preço ou indisponível é descartada com motivo, não vira preço 0 |
| A planilha de amostra (`lista-24-11.xlsx`) veio **sem versão** porque foi exportada sem as opções de chip e região | Explica as "20 linhas idênticas" e a dispersão de 20% da análise de 24/11: eram versões diferentes misturadas. **A fase 1 só aceita a exportação com chip e região** (§5.2) |

O que **sai** da proposta de 24/11: `precificacao_historico` (vai para a auditoria), `precificacao_regras` (vai para o motor de configuração), `precificacao_alvos` na fase 1 (o alvo é a variante; itens externos ficam para depois), o vínculo por IA na fase 1, o endpoint com token na fase 1 e a "API do PXT" como adapter próprio (vira o adapter MCP da fase 2).

---

## 2. Princípios

1. **A regra de preço é do Nexus.** Entradas do cálculo: `costPrice` (custo da oferta) e `supplierCount` (fornecedores). O `sellingPrice` é guardado e exibido como comparação; um teste garante que mudar o `sellingPrice` não muda nenhuma sugestão.
2. **Destino único.** Só `estoque_variantes.preco`, só pela RPC da 1.2. Nada de `estoque_produtos.preco`, `estoque_tabela_precos` ou unidade.
3. **Herança cuida das unidades.** Disponíveis com `preco_origem = 'variante'` acompanham; reservadas, vendidas e com preço próprio ficam como estão (D5 da variante). A fila mostra, antes de aprovar, quantas unidades vão mudar (`estoque_variante_previa` da 1.2).
4. **Nenhum preço muda sem rastro.** Cada aplicação gera a linha de auditoria da própria RPC de preço (`origem = 'precificacao'`), com a referência da sugestão e da regra. A sugestão guarda o "porquê" completo (ofertas usadas e descartadas, base, margem e de onde veio).
5. **Custo fica atrás de `estoque.ver_custo`**, inclusive o custo indireto: a margem configurada mais o preço público revela o custo de mercado (preço − R$ 700). Por isso as chaves de configuração do módulo e as linhas de auditoria delas também ficam atrás da permissão (§8.3). A auditoria do preço da variante **não leva custo** no `depois`.
6. **Regras primeiro, sem IA na fase 1.** Casamento por equivalência e regra exata; semelhança só sugere.
7. **Vocabulário de segmento é dado.** "chip", "ANATEL", nomes de cor em inglês, bandeiras: tudo nas equivalências da empresa e na lista de versões da categoria. O código do módulo fala em produto, opção, versão, cor e condição (`check-segmento-modulo` continua valendo).
8. **Módulo de verdade** (regra "tudo fora do core é módulo"): manifesto `precificacao` com `requer: ['catalogo']` (a variante é do `catalogo`, que já requer `estoque`), trava no servidor (`exigirModuloLigado`), vitrine, Central, prefixo `precificacao_`, `emPreparacao` até o ok dos sócios.

---

## 3. Cálculo do preço sugerido

Função pura em TypeScript (`lib/precificacao/calculo.ts`), testada com fixture. Para cada variante com pelo menos um vínculo confirmado na importação:

1. **Junta as ofertas** da importação ligadas à variante (todas as cores, cor agregada).
2. **Descarta**, guardando o motivo de cada uma:
   - sem custo, custo ≤ 0 ou marcada indisponível → "indisponível";
   - `fornecedores < precificacao.base.fornecedores_min` (padrão 2) → "menos de 2 fornecedores".
3. **Base** (`custo_base`): ordena as que sobraram pelo custo e tira a **média das N menores** (`precificacao.base.n`, padrão 3), em centavos, arredondada a 2 casas. Sobraram menos de N: média das que sobraram. **Não sobrou nenhuma: `sem_sugestao`**, com o motivo ("nenhuma oferta disponível" ou "todas as ofertas com menos de 2 fornecedores; a menor: R$ X com 1") e as ofertas descartadas à vista.
4. **Margem:** resolve a regra mais específica que existir, nesta ordem: **versão > modelo > marca > subcategoria > categoria > padrão da empresa** (§4.2). Tipo `valor` soma R$; tipo `pct` soma % do `custo_base`. A sugestão guarda de onde veio ("R$ 700 · categoria Celular").
5. **Arredondamento** (§4.1). O resultado **nunca** fica abaixo do `custo_base` (se ficasse, a sugestão sai `bloqueada`, motivo "abaixo do custo de mercado").
6. **Comparação:** variação = (sugerido − atual) / atual. Variante **sem preço** = primeiro preço, sem variação.
7. **Status:**

| Status | Quando |
|---|---|
| `sem_mudanca` | sugerido = preço atual |
| `sem_sugestao` | nenhuma oferta válida (passo 3) |
| `bloqueada` | variante `travado`, ou abaixo do custo de mercado |
| `pendente` | todo o resto, no modo com aprovação; no automático, o que passa da variação máxima e todo primeiro preço |
| `aplicada` | aplicada (pela fila ou pelo automático) |
| `recusada` | recusada na fila |
| `expirada` | um cálculo novo da mesma variante chegou, ou o preço da variante mudou por outro caminho depois do cálculo |

**Exemplos** (preços reais de 25/11; a combinação das ofertas é ilustrativa):

- **A. Versões separadas.** As quatro ofertas do 18 Pro Max 512GB Glacier (R$ 10.350 chip virtual 🇺🇸, R$ 10.450 sem versão, R$ 10.800 chip virtual, R$ 12.499 chip físico) vão para **quatro variantes diferentes**, e cada base usa só as ofertas da sua versão. Sem o eixo de versão, a média das 3 menores daria R$ 10.533,33, um preço que não é o de nenhum aparelho real.
- **B. Cor agregada.** 17 Pro Max 512GB, mesma versão: laranja R$ 8.450 e prata R$ 8.838, ambas com 2 ou mais fornecedores e sem terceira oferta → base = média das duas = **R$ 8.644**. Com + R$ 700: **R$ 9.344**. A regra de hoje da JM no PXT (menor oferta + R$ 700) daria R$ 9.150. A diferença de R$ 194 vem da base nova (média) somada à cor agregada: é por isso que os sócios precisam rever a margem (§13).
- **C. Fornecedor mínimo.** Variante de chip físico cujas ofertas têm todas `supplierCount = 1` → todas descartadas → `sem_sugestao`, motivo "todas as ofertas com menos de 2 fornecedores; a menor: R$ 12.499 com 1". O preço dessa variante continua manual.

---

## 4. Configuração no motor da 1.1

Chaves do módulo `precificacao` no catálogo `lib/config.ts` (`DEFINICOES_CONFIG`), gravadas por `config_salvar` (que já audita), lidas por `config_valor`/`lerConfig`. **Escopo: empresa** (o preço é por empresa, D4 da variante). Permissão de edição das chaves: `estoque.preco_variante` (mexer na regra é mexer no preço). Leitura: só com `estoque.ver_custo` (§8.3).

### 4.1 Chaves

| Chave | Tipo | Padrão | O que é |
|---|---|---|---|
| `precificacao.base` | `{n, fornecedores_min}` | `{n: 3, fornecedores_min: 2}` | base do §3, passos 2 e 3. Faixas: n 1–10; mínimo 1–10 |
| `precificacao.margem_padrao` | `{tipo: 'valor'\|'pct', valor}` | **sem padrão de fábrica**: enquanto não houver margem configurada, toda sugestão sai `bloqueada` com o motivo "margem não configurada" (evita sugerir custo como preço) | margem da empresa, último nível da cascata |
| `precificacao.margens` | lista `[{escopo, alvo, tipo, valor}]` | `[]` | exceções: `escopo` = `categoria` \| `subcategoria` \| `marca` \| `modelo` (id do produto) \| `versao` (valor normalizado da versão, dentro de uma categoria: `{categoria_id, versao}`). Única por escopo + alvo |
| `precificacao.arredondamento` | `{modo: 'nenhum'\|'final'\|'multiplo', final?, passo?, sentido?}` | `{modo: 'nenhum'}` | `final`: sobe até terminar no final dado (final 9: 9.343 → 9.349; final 90: 9.343 → 9.390). `multiplo`: passo (ex. 50) e sentido (`cima`, `baixo`, `proximo`) |
| `precificacao.modo` | `'aprovacao'\|'automatico'` | `'aprovacao'` | §7 |
| `precificacao.variacao_max_pct` | número | `5` | limite do automático, para mais ou para menos |
| `precificacao.retencao_dias` | número | `180` | quanto tempo as ofertas brutas ficam (as sugestões ficam sempre) |
| `precificacao.captura` (fase 2) | `{ativa, intervalo_min, so_no_horario}` | `{ativa: false, intervalo_min: 120, so_no_horario: true}` | agendamento do adapter MCP; `so_no_horario` usa o horário da empresa (`core.horario`) |

O teste que já existe na 1.1 (`tests/config.test.ts`, "chave usada no código e não declarada no catálogo reprova") cobre as chaves novas. Os padrões ficam no catálogo, não no chamador (direção da 1.1i).

### 4.2 Cascata da margem

- A mais específica vence: **versão > modelo > marca > subcategoria > categoria > padrão**.
- A regra de **versão** vale para todos os produtos da categoria com aquela versão (ex.: "Chip físico" + R$ 900 na categoria Celular). A ordem pedida põe a versão acima do modelo: uma regra de versão vence a regra de um modelo. A tela mostra isso explicitamente ("este preço usa a regra da versão Chip físico, não a do modelo").
- **Subcategoria:** o cadastro de produto hoje **não grava `subcategoria_id`** (achado da proposta de 24/11, §4.4). O nível existe na cascata, mas só terá efeito depois do ajuste no `produto-modal` (entra na P1b, pequeno).
- A tela de Regras mostra a árvore com "herdado de…" e o **simulador**: recalcula a última importação com a regra em edição, sem gravar, e mostra quantas sugestões mudam.

---

## 5. Fontes, importação e adapters

### 5.1 Interface comum

Todo adapter recebe a **fonte** (com sua configuração) e o **insumo** (arquivo enviado, ou nada no MCP, que busca sozinho) e devolve:
- **ofertas normalizadas:** `produto`, `opcao`, `versao`, `cor`, `condicao`, `custo`, `fornecedores` (nulo = a fonte não informa), `venda_fonte` (comparação), `disponivel`, `capturado_em`, `bruto` (a linha original);
- **descartadas com motivo** (linha sem preço, capacidade ilegível, coluna obrigatória vazia);
- **capacidades** da fonte: fornece versão? fornecedores? preço de venda? data? As telas desligam o que a fonte não tem (sem `fornecedores`, o mínimo de fornecedores não se aplica e a tela avisa).

Depois do adapter, a **normalização comum** (minúsculo, sem acento, espaços colapsados, GB/TB padronizados) e as **equivalências** da empresa (§6.1) valem para todos. Os adapters vivem em `lib/precificacao/adapters/` e não sabem nada de banco.

| Adapter | Fase | Insumo | Observações |
|---|---|---|---|
| `xlsx_pxt` | **1** | XLSX exportado do PXT **com chip e região** | predefinição gravada como **dado** da fonte (mapeamento de colunas), não como código; lê com `lib/planilha.ts` (sem dependência nova, só a primeira aba, até 5 MB) |
| `xlsx` genérico | 1 (P1f) | XLSX ou CSV de qualquer fornecedor | mapeamento de colunas salvo na fonte, com palpite pelo nome da coluna (como a importação de contatos já faz) e prévia das 20 primeiras linhas; condição fixa da fonte quando não há coluna |
| `json` | 1 (P1f) | arquivo `.json` no formato normalizado acima | validação por esquema, limite de linhas. O endpoint com token (envio automático por terceiros) fica para depois da fase 2 |
| `mcp_pxt` | **2** | nada (cliente MCP no servidor) | §12, só com a confirmação por escrito do PXT |

### 5.2 A exportação do PXT na fase 1

- **Só a exportação com chip e região é aceita.** A planilha de 24/11 veio sem elas e mistura versões. A predefinição exige a(s) coluna(s) de versão; arquivo sem elas é **recusado na prévia** com a mensagem "exporte do PXT com as opções de chip e região".
- **Pré-requisito da P1c:** um arquivo real exportado assim pela JM. A disposição exata das colunas (versão numa coluna própria? junto do nome?) só se conhece com ele; a predefinição é escrita a partir dele. O arquivo real fica **fora do git** (`conciliacao-pedidos/precificacao/`); no repositório entra uma fixture sintética com a mesma disposição.
- **`fornecedores` na planilha:** vem da coluna "Disponibilidade" ("Baixa disponibilidade: N fornecedor(es)" → N). **Vazio** = o PXT não marcou baixa disponibilidade → tratado como "acima do mínimo". Isso é uma **suposição** a confirmar: na P1c, uma conferência única e só de leitura compara, para a mesma lista no mesmo dia, o número lido do XLSX com o `supplierCount` do MCP (feita pelo Lucas ou com ele, à mão). Se não bater, a regra muda antes da P1d.
- **Condição:** fixa na fonte (exportação do PXT = `novo`).
- **Data:** `capturado_em` = hora do upload (a planilha não traz data).

### 5.3 Importação

1. Upload → o servidor lê, roda o adapter e a normalização, calcula o `sha256` do arquivo.
2. **Reimportação do mesmo arquivo recusada** (`unique (empresa_id, fonte_id, arquivo_sha256)`), com a mensagem "este arquivo já foi importado em DD/MM HH:MM por Fulano". Um arquivo novo com os mesmos preços é aceito (bytes diferentes) e simplesmente não muda nada.
3. **Prévia** antes de gravar: lidas, válidas, descartadas por motivo, chaves, quantas casam exato, quantas por semelhança, quantas não encontradas.
4. Confirmar → uma transação grava a importação, as ofertas e os vínculos novos (§6), e o cálculo roda (§3) gerando as sugestões. Pendentes antigas da mesma variante viram `expirada`.

---

## 6. Casamento (oferta → variante)

**Chave do vínculo:** `(fonte, produto, opção, versão, condição)` normalizados. A **cor não entra** (cor agregada); fica guardada na oferta.

### 6.1 Equivalências por empresa

Tabela `precificacao_equivalencias`: `campo` (`produto` \| `opcao` \| `versao` \| `cor` \| `condicao`), `de` (normalizado), `para`, `fonte_id` (nulo = todas). Exemplos de semente para a JM, gravados **como dado** num script de operação, com ok: "chip virtual 🇺🇸" → "Chip virtual · EUA"; "chip fisico" → "Chip físico"; "fisico + virtual" → "Físico + virtual"; "cosmic orange" → "Laranja-cósmico" (para exibição); "sem versao"/vazio → "" ("Não informada"). A equivalência de **versão** só aceita como destino um valor da lista da categoria (1.2 §2.2).

### 6.2 Ordem

1. **Vínculo já confirmado** para a chave: usa. Da segunda importação em diante, quase tudo cai aqui.
2. **Exato:** depois das equivalências, o conjunto de palavras do produto é **idêntico** ao nome do produto do Nexus (sem a marca), e opção, versão e condição batem. "17" ≠ "17e" ≠ "17 pro max". **Confirma sozinho** (origem `exato`) e entra no relatório da importação.
3. **Semelhança:** mesmas travas duras (números do modelo, capacidade e versão têm de bater exatamente); tolerância só para grafia e abreviação ("PM" = "Pro Max"). Token set + Jaro-Winkler em TypeScript, sem `pg_trgm`. Score ≥ 0,85 → **sugerido**, vai para a fila de vínculos; **nunca confirma sozinho**.
4. **Sem candidato → "Não encontrados"** (§6.3).

Confirmar um vínculo vale para as próximas importações; desfazer volta a chave para a fila. Cada decisão de vínculo é auditada (`entidade = 'precificacao_vinculo'`).

### 6.3 Aba "Não encontrados"

Agrupada por chave, com as ofertas de exemplo (cores, custos, fornecedores) e o **motivo**:

| Motivo | Ação disponível (com `estoque.preco_variante`) |
|---|---|
| a variante não existe (produto existe, opção e versão válidas) | **"Criar variante"**: a criação rápida da 1.2, já preenchida; a variante nasce **sem preço** e o primeiro preço passa pela fila |
| a versão da oferta não está na lista da categoria | "Acrescentar à lista de versões" (RPC da 1.2) ou criar equivalência para uma versão existente |
| a opção não está na lista do produto | "Acrescentar opção ao produto" (cadastro do produto) ou equivalência |
| o produto não existe no catálogo | **só listar** na fase 1 (o produto é cadastrado no Estoque; decisão dos sócios, §13) |
| (qualquer) | "Vincular a uma variante existente" (vínculo manual) ou "Ignorar" (não aparece mais até ser desfeito) |

Quem só tem `estoque.ver_custo` vê a aba, sem as ações.

---

## 7. Fila de aprovação, aplicação e modo automático

**Fila** (tela do módulo): uma linha por variante com sugestão `pendente` ou `sem_sugestao`. Colunas: produto / opção / versão / condição; preço atual; **sugerido**; variação %; custo base; ofertas usadas (quantas, fornecedores, cores) e descartadas, com motivo; margem e de onde veio; **unidades que mudam** (prévia da 1.2: disponíveis que herdam); **comparação PXT** ("venda na regra da sua conta PXT: R$ X", o menor `sellingPrice` entre as ofertas usadas, com o aviso de que vem da regra da própria conta no PXT e não entra no cálculo). Filtros: status, categoria, variação acima de X%, primeiro preço, sem sugestão. Ações em lote: **aprovar** (aplica) e **recusar** (com motivo opcional). Para pôr outro valor, o caminho é a aba Preços (manual, auditado como manual).

**Aplicação: RPC `precificacao_aplicar(p_sugestoes bigint[])`**, `SECURITY DEFINER`:
- confere módulo ligado, `estoque.ver_custo` **e** `estoque.preco_variante`;
- para cada sugestão, com a variante travada para escrita (`for update`): status ainda `pendente`; preço atual da variante **igual** ao `preco_atual` da sugestão (senão `expirada`, "o preço mudou desde o cálculo"); variante não `travado` (senão `bloqueada`);
- grava pela `estoque_variante_salvar` com `origem = 'precificacao'` e, no `depois` da auditoria, só `{sugestao_id, calculo_id, regra: {n, fornecedores_min, margem_origem, arredondamento}}`, **sem custo**;
- a herança da 1.2 propaga às disponíveis que herdam, com a auditoria por unidade que ela já faz;
- o lote roda numa transação: itens que falham nas travas são marcados com o motivo e não impedem os outros; um erro inesperado desfaz o lote inteiro.

**Modo automático:** depois do cálculo, aplica sozinho só o que tem `|variação| ≤ precificacao.variacao_max_pct`, **não é primeiro preço** e não está travado; o resto vai para a fila. Na fase 1 o automático roda na hora do upload **com a sessão de quem subiu**; se essa pessoa não tiver `estoque.preco_variante`, nada é aplicado e tudo vai para a fila (a RPC recusa). Na fase 2, a captura agendada usa a variante de serviço `precificacao_aplicar_emp(p_empresa, …)` (só `service_role`), auditada com `auditar_emp` e origem `rotina:precificacao-captura`.

---

## 8. Banco

### 8.1 Tabelas (módulo `precificacao`)

Todas com `empresa_id bigint not null`, FKs compostas `(empresa_id, id)` entre as tabelas do módulo (nenhuma gravação liga registros de empresas diferentes), `created_at` e, onde muda, `updated_at`.

| Tabela | Colunas principais | Unicidade / índices |
|---|---|---|
| `precificacao_fontes` | `nome`, `adaptador` (`xlsx_pxt` \| `xlsx` \| `json` \| `mcp_pxt`), `config jsonb` (mapeamento, condição fixa), `capacidades jsonb`, `ativo` | `unique (empresa_id, nome)` |
| `precificacao_equivalencias` | `fonte_id` (nulo = todas), `campo`, `de` (normalizado), `para` | `unique (empresa_id, coalesce(fonte_id,0), campo, de)` |
| `precificacao_importacoes` | `fonte_id`, `origem` (`upload` \| `agendada`), `arquivo_nome`, `arquivo_sha256`, `capturado_em`, `status`, `contagens jsonb`, `descartadas jsonb`, `criado_por`, `rotina_execucao_id` (fase 2) | `unique (empresa_id, fonte_id, arquivo_sha256)`; `(empresa_id, created_at desc)` |
| `precificacao_ofertas` | `importacao_id`, `linha`, `produto`, `opcao`, `versao`, `cor`, `condicao`, `chave`, `custo numeric(12,2)`, `fornecedores int`, `venda_fonte numeric(12,2)`, `disponivel`, `bruto jsonb` | `(empresa_id, importacao_id)`; `(empresa_id, chave)`. Retenção por `precificacao.retencao_dias` |
| `precificacao_vinculos` | `fonte_id`, `chave`, `variante_id` (nulo se ignorado), `status` (`confirmado` \| `sugerido` \| `ignorado` \| `recusado`), `origem` (`exato` \| `semelhanca` \| `manual` \| `criacao_rapida`), `confianca numeric(4,3)`, `decidido_por`, `decidido_em` | um vigente por chave: único parcial `(empresa_id, fonte_id, chave)` onde `status in ('confirmado','ignorado')`; várias chaves podem apontar para a mesma variante |
| `precificacao_calculos` | `importacao_id`, `modo`, `config_usada jsonb` (retrato das chaves do §4 no momento), `totais jsonb`, `criado_por` | `(empresa_id, created_at desc)` |
| `precificacao_sugestoes` | `calculo_id`, `variante_id`, `preco_atual`, `custo_base`, `preco_sugerido`, `variacao_pct`, `venda_fonte_ref`, `ofertas_usadas jsonb`, `ofertas_descartadas jsonb` (retrato: sobrevive à retenção das ofertas), `regra_efetiva jsonb`, `status`, `motivo`, `decidido_por`, `decidido_em` | `unique (calculo_id, variante_id)`; `(empresa_id, status)`; `(empresa_id, variante_id, created_at desc)` |

Nenhuma tabela existente ganha coluna. A variante e as RPCs de preço vêm da 1.2.

### 8.2 RLS e escrita

- **SELECT** em todas: `empresa_id = (select get_empresa_id()) and tem_permissao('estoque.ver_custo')`. Uma política por comando, sem `for all`. Para quem não tem a permissão: 0 linhas, sem erro.
- **Sem grant de escrita** para `anon` e `authenticated`. Toda escrita por RPC `SECURITY DEFINER` com `search_path` fixo, conferindo módulo ligado e permissões e auditando: `precificacao_fonte_salvar`, `precificacao_equivalencia_salvar`/`apagar`, `precificacao_importar` (importação + ofertas + vínculos exatos e sugeridos numa transação; recusa hash repetido com `IMPORTACAO_REPETIDA`), `precificacao_calculo_gravar`, `precificacao_vinculo_decidir`, `precificacao_aplicar`, `precificacao_recusar`. As de serviço (`*_emp`) só para `service_role` (fase 2).
- **Permissões:** ver, importar e gravar cálculo = `estoque.ver_custo`; decidir vínculo, mexer em fontes e equivalências, aplicar e recusar = `estoque.ver_custo` + `estoque.preco_variante`.
- O cálculo roda no servidor (TypeScript) e é gravado pela RPC com a sessão do usuário. Quem pudesse forjar uma sugestão já teria `estoque.preco_variante`, ou seja, já poderia mudar o preço pela aba Preços: a RPC de aplicação é a trava que importa.

### 8.3 Ponto que toca a 1.1: leitura protegida da configuração do módulo

A margem + o preço público revelam o custo de mercado. Hoje `empresa_config` tem SELECT para qualquer membro da empresa, e `config_salvar` audita antes e depois em `auditoria_eventos`, lida por quem tem `auditoria.ver`. Proposta (na migração da P1a, compatível com o app no ar, com `alter policy`, sem `drop`):
- função `config_leitura_permitida(p_modulo text) STABLE`: devolve `tem_permissao('estoque.ver_custo')` para `precificacao` e `true` para o resto (lista explícita dentro da função, com teste);
- a política SELECT de `empresa_config` passa a exigir `config_leitura_permitida(modulo)`;
- a política SELECT de `auditoria_eventos` passa a esconder as linhas `entidade = 'config'` cujo `entidade_id` começa por `precificacao.` de quem não tem `estoque.ver_custo`.

Para todo o resto da configuração e da auditoria, o resultado é idêntico (prova na migração, comparando as leituras antes e depois para os cargos da semente). A sessão da 1.1 precisa saber dessa mudança antes de mexer nas mesmas políticas.

### 8.4 Migrações

Todas compatíveis com o app no ar; número reservado no registro só ao criar o arquivo; teste SQL + esperado + volta no mesmo commit; `lock_timeout` curto; nada em `usuarios`/`empresa_usuarios` (lição do deadlock da 1.1b).

| Migração | Entrega | Conteúdo | Volta |
|---|---|---|---|
| `<n>_precificacao_estrutura` | P1a | as 7 tabelas, RLS, RPCs, §8.3 | enquanto não houver importação real: `drop` de tudo e as políticas antigas de volta; depois, só o app (as tabelas ficam, sem efeito sem o app) |
| `<n>_precificacao_retencao` | P1f | `ops.purgar_retencao` passa a apagar ofertas mais velhas que `precificacao.retencao_dias` (as sugestões ficam) | corpo anterior do procedimento |
| `<n>_precificacao_captura` | P2 | linha `precificacao-captura` no catálogo `rotinas` da 1.1r + job do pg_cron chamando `/api/cron/precificacao` | desagendar o job e apagar a linha |

**Teste SQL** (`teste-precificacao.sql`, transação desfeita, duas empresas): isolamento; sem `ver_custo` 0 linhas em todas as tabelas, nas chaves `precificacao.*` de `empresa_config` e nas linhas de auditoria delas; com `ver_custo` e sem `preco_variante`, importar e calcular passam, aplicar é recusado; hash repetido recusado; aplicar grava só `estoque_variantes.preco` e a auditoria sem custo; herdeira disponível acompanha, reservada e própria não; travada `bloqueada`; preço mudado por fora → `expirada`; o resto da configuração e da auditoria lido igual antes e depois do §8.3.

---

## 9. Telas (módulo, em `/precificacao`; só com `estoque.ver_custo`)

1. **Importar:** escolher a fonte, enviar o arquivo, prévia (§5.3), confirmar. Mostra a última importação de cada fonte.
2. **Aprovação:** a fila do §7.
3. **Não encontrados:** §6.3.
4. **Vínculos:** sugeridos por semelhança (confirmar, trocar, recusar), confirmados (desfazer) e ignorados.
5. **Equivalências:** por campo, com as sugestões tiradas do que não casou.
6. **Regras:** as chaves do §4 com a árvore da margem, "herdado de…" e o simulador.
7. **Fontes e importações:** fontes (predefinição PXT, mapeamento do XLSX genérico) e o histórico de importações e cálculos (na fase 2, com as capturas agendadas e o link para a execução da rotina).

Fora do módulo, só um acréscimo: na aba **Produtos → Preços** da 1.2, o selo "sugestão pendente" na variante, com link para a fila, para quem tem `estoque.ver_custo`.

Conferência visual obrigatória de cada tela, no local, antes de cada deploy de app.

---

## 10. Quem faz o quê (JM, com os cargos da 1.1)

| Cargo | Módulo | Pode |
|---|---|---|
| Dono, Administrador | vê (têm `estoque.ver_custo`) | tudo: importar, decidir vínculo, criar variante pela aba, regras, aprovar e aplicar (têm `estoque.preco_variante`) |
| Vendedor, Técnico, Consulta | **não vê** (nem menu, nem rota, nem dado pela API) | nada. Continuam vendo o preço da variante como hoje |
| Plataforma (Lucas, impersonando) | vê | tudo, registrado na Auditoria da empresa como plataforma |

---

## 11. Entregas menores

| Entrega | Conteúdo | Banco | Visível | Pode subir quando |
|---|---|---|---|---|
| **P1a** | Migração `precificacao_estrutura` (§8) + teste SQL + volta; manifesto com `emPreparacao` | sim | não | **1.2c em produção**; ritual verde; backup das políticas de `empresa_config` e `auditoria_eventos` no arquivo de volta; IOwait < 10%; fora dos minutos 05–15; 10 min sem atividade na JM |
| **P1b** | Chaves do §4 no catálogo; telas Regras, Equivalências e Fontes (predefinição PXT); ajuste do `produto-modal` para gravar `subcategoria_id` | não | só com o módulo instalado (Demonstração) | P1a em produção; testes, build, conferência visual |
| **P1c** | Interface de adapters + `xlsx_pxt`; importação com prévia e recusa por hash; casamento (equivalências, exato, semelhança); Vínculos; Não encontrados com a criação rápida da 1.2 | não | idem | P1b em produção; **arquivo real da JM exportado com chip e região**; conferência única XLSX × MCP do campo de fornecedores (§5.2) |
| **P1d** | Motor de cálculo (§3); fila de aprovação; `precificacao_aplicar`; selo na aba Preços | não | idem | P1c em produção; números conferidos à mão para 3 variantes (uma com 3+ ofertas, uma com 2, uma só com 1 fornecedor) |
| **P1e** | Modo automático com as travas; **ligar na JM**: instalar o módulo, gravar as equivalências semeadas e as regras aprovadas pelos sócios (dados, com ok), tirar `emPreparacao` | dados (com ok) | sim, Dono e Administrador da JM | P1d em produção; decisões do §13 respondidas; primeira importação real da JM no modo **com aprovação**, conferida com os sócios |
| **P1f** | Adapters `xlsx` genérico (mapeamento de colunas) e `json`; retenção das ofertas | sim (retenção) | sim | P1d em produção (não depende da P1e) |

**Smoke na Demonstração** (empresa 5, Laboratório, tudo limpo no fim) em cada entrega de app: fonte de teste com uma fixture sintética de 10 ofertas (duas versões do mesmo modelo, duas cores, uma oferta com 1 fornecedor, uma sem variante); importar; reimportar e ver a recusa; criar a variante que faltava pela aba; recalcular; aprovar; ver a unidade herdeira mudar e a reservada não; ver a linha da Auditoria sem custo; um usuário Vendedor de teste sem acesso ao módulo nem aos dados pela API.

Cada deploy de app: ponto de volta na Vercel; `npm test`, `npm run check`, `next build`; conferência visual; 10 minutos sem venda, pagamento ou conclusão na JM; push; `READY`; smoke; logs da Vercel e do Supabase por 15 minutos sem erro novo. Volta: app primeiro, banco depois.

---

## 12. Fase 2: adapter MCP do PXT

**Condição para começar:** **confirmação por escrito do PXT** de que o uso automatizado (cliente MCP rodando no servidor do Nexus, em horário agendado, com a credencial da conta da JM) é permitido. A confirmação fica guardada fora do git e citada aqui com data. Sem ela, nada desta seção é construído; a JM segue pela importação de XLSX.

| Tema | Como fica |
|---|---|
| **Cliente** | cliente MCP no servidor (rota do app, Node), transporte HTTP do servidor MCP do PXT. Implementa a mesma interface do §5.1 (`mcp_pxt`) |
| **Credencial** | **variável de ambiente** da Vercel (nome provisório `PXT_MCP_TOKEN`, só em Production), **nunca** no código, no repositório, em fixture, em log, em mensagem de erro ou na auditoria. Local: `.env.local`, fora do git. Quando uma segunda empresa usar o PXT, a credencial passa a ser por fonte, no Vault (decisão técnica nessa hora) |
| **Só leitura** | lista fechada das ferramentas de consulta das listas e da configuração da conta. O adapter **recusa** qualquer outra (criar ou alterar lista, aplicar ou remover margem, exportar): o Nexus não muda nada na conta do PXT, nem a regra + R$ 700 da JM |
| **Mapeamento** | `productName` → produto, `storage` → opção, identidade de versão → versão (pelas equivalências), `color` → cor, `costPrice` → custo, `supplierCount` → fornecedores, `sellingPrice` → `venda_fonte`; sem preço ou indisponível → descartada com motivo |
| **Agendamento** | job do pg_cron `precificacao-captura` → `/api/cron/precificacao` (rota única `app/api/cron/[job]`, `CRON_SECRET`), no intervalo de `precificacao.captura` e só no horário da empresa se configurado |
| **Registro** | a rota abre e fecha a execução em `rotinas_execucoes` (1.1r), com uma linha por empresa em `rotinas_execucoes_empresas` (contagens: ofertas, descartadas, sugestões, aplicadas; ou o erro). Linha no catálogo `rotinas` com intervalo esperado e folga: captura parada aparece como **atrasada** na página de rotinas do superadmin |
| **Importação agendada** | `origem = 'agendada'`, com o `sha256` do conteúdo normalizado: captura igual à anterior = registrada como "sem mudança", sem importação nova e sem erro |
| **Falhas** | tempo limite por empresa; até 2 novas tentativas com espera; o erro de uma empresa não derruba as outras e marca a execução `com_erro` |
| **Automático** | só se `precificacao.modo = 'automatico'`, pela `precificacao_aplicar_emp`, com as mesmas travas do §7 |
| **Teste** | servidor MCP falso nos testes (nenhuma chamada real no CI ou no ritual); aceite em produção só pelo **efeito no dado** (importação criada pelo job e execução registrada), não pelo status do agendador |

---

## 13. Decisões que dependem dos sócios (Matheus e Eduardo)

1. **Margem da JM no Nexus.** A base nova (média das 3 menores com 2+ fornecedores) fica acima da "menor oferta" que a regra do PXT usa hoje (exemplo B: R$ 194 a mais no mesmo aparelho). Manter + R$ 700 no iPhone, baixar, ou usar %? Margem por categoria e por versão (ex.: chip físico)?
2. **MacBook Air M4 512GB prata (+ R$ 1.000 no PXT).** Com a cor agregada, a exceção vale para todas as cores do modelo e capacidade no Nexus. Serve assim?
3. **Arredondamento:** nenhum, final 9, final 90 ou múltiplo de 50 (para cima)?
4. **Mínimo de fornecedores (2) e N (3).** Confirmar, sabendo que as variantes de chip físico vão sair quase sempre **sem sugestão** (preço manual).
5. **Modo e variação máxima:** começar com aprovação (padrão) e com quantas importações conferidas passar ao automático? Variação máxima de 5%?
6. **Preço por cor** (decisão da 1.2 §2.3): agregada agora, com exceção por cor no futuro?
7. **Lista e nomes das versões da JM** (1.2 §2.3).
8. **Produto que não existe no catálogo:** só listar (recomendado na fase 1) ou criar produto pela aba "Não encontrados"?
9. **Acesso:** só quem tem `estoque.ver_custo` (hoje Dono e Administrador). Confirmar.

**Ações dos sócios / do Lucas fora do sistema:**
- pedir ao PXT a **confirmação por escrito** do uso automatizado (condição da fase 2);
- perguntar ao PXT o que significa "Disponibilidade" vazia (a suposição do §5.2);
- exportar da conta da JM um XLSX **com chip e região** (pré-requisito da P1c).

---

## 14. Critérios de aceite da fase 1

1. Upload do XLSX real com chip e região: linhas lidas = linhas do arquivo; descartadas só com motivo; quantidade de chaves informada.
2. Vínculo exato para toda chave cuja variante existe; **nenhuma oferta vai para variante de outra versão**; oferta "sem versão" só na variante "Não informada"; arquivo sem as colunas de versão recusado na prévia.
3. "Não encontrados" com o motivo certo; criar a variante pela aba e reimportar outro arquivo → vínculo exato, sem fila.
4. Cálculo conferido à mão para 3 variantes (3+ ofertas; 2 ofertas; só 1 fornecedor → `sem_sugestao` com motivo).
5. Margem com a origem visível; mudar a margem da categoria muda o simulador sem gravar nada.
6. Aprovar em lote → `estoque_variantes.preco` atualizado só pela RPC; uma linha de auditoria por variante com `origem = 'precificacao'` **e sem custo**; disponíveis que herdam acompanham; **reservadas e com preço próprio iguais** (contagem e soma de `preco_venda` antes e depois); variante travada não muda.
7. Reimportar o mesmo arquivo → recusado pelo hash; arquivo com preços alterados → 0 vínculos novos, só sugestões, e as pendentes antigas expiradas.
8. Vendedor e Consulta (sessão real e chamada direta à API): 0 linhas em todas as `precificacao_*`, nas chaves `precificacao.*` e nas linhas de auditoria delas; todas as RPCs recusadas; módulo fora do menu e da rota.
9. Modo automático: aplica só dentro da variação máxima; nunca primeiro preço; nunca variante travada; o resto na fila.
10. Mudar o `sellingPrice` no arquivo não muda nenhuma sugestão (teste unitário e de integração).
11. Nada fora das `precificacao_*`, de `estoque_variantes.preco` e das unidades herdeiras muda; empresa 10 (Aletrini) com contagens iguais (critério fixo do roteiro §4.1).
12. O resto da configuração e da auditoria lido igual antes e depois do §8.3, para todos os cargos.

---

## 15. Riscos

| Risco | Cobertura |
|---|---|
| Versão lida errado na planilha e o preço de chip físico vai para chip virtual | versão na chave com trava dura; arquivo sem versão recusado; exato só com versão idêntica; equivalência de versão só aponta para a lista da categoria |
| Suposição errada sobre "Disponibilidade" vazia | conferência única XLSX × MCP antes da P1d (§5.2); pergunta ao PXT |
| Margem + preço revelam custo a quem não tem `ver_custo` | §8.3 (configuração e auditoria do módulo protegidas); auditoria do preço sem custo |
| Erro de regra muda muitos preços de uma vez | modo com aprovação por padrão; variação máxima no automático; nunca primeiro preço no automático; prévia de unidades na fila; auditoria com volta (o preço anterior está no `antes`) |
| Corrida: preço da variante mudado à mão entre o cálculo e a aprovação | `precificacao_aplicar` confere o preço atual = o do cálculo, senão `expirada` |
| Chip físico sem sugestão quase sempre | esperado e mostrado com o motivo; preço manual; decisão 4 do §13 |
| PXT muda o formato da exportação | a predefinição é dado da fonte (ajuste sem deploy); a prévia recusa coluna obrigatória ausente |
| Uso automatizado sem permissão do PXT | a fase 2 só começa com a confirmação por escrito; o adapter é só leitura, com lista fechada de ferramentas |
| Credencial vazada | só em variável de ambiente; teste de que nenhum log ou erro a contém; nada no repositório |
| Captura agendada parada sem ninguém notar | catálogo `rotinas` com intervalo esperado (atraso visível na página do superadmin, 1.1r); aceite pelo efeito no dado |
| Staging crescendo | retenção das ofertas (P1f), sugestões com o retrato do que usaram |
