# Precificação por fornecedores: análise e proposta (fase 0)

> **Adendo de 24/11.** Com a variante aprovada ([unificacao-preco-proposta.md](unificacao-preco-proposta.md)) e a ordem do [roteiro](roteiro-reconstrucao.md), esta proposta muda assim:
> - **Destino único:** `estoque_variantes.preco`. Para quem usa o estoque do Nexus, **o alvo é a variante**. `precificacao_alvos` fica só para itens **externos** (fase 2). A decisão 2 ("gravar nas unidades?") deixa de existir: as unidades disponíveis acompanham pela herança.
> - **Vínculo:** item da fonte ↔ variante, com FK.
> - **Sem `precificacao_historico`:** a aplicação chama a mesma RPC de preço da variante, que audita em `auditoria_eventos` com `origem = 'precificacao'` e a sugestão e a regra em `depois`.
> - **Permissões:**
>   - aprovar ou aplicar exige `estoque.preco_variante`;
>   - ver custo de fornecedor exige `estoque.ver_custo`;
>   - as decisões 8 e 9 ficam respondidas pela etapa 1.1.
> - **Começa** em paralelo, assim que a variante estiver em produção (etapa 1.2), sem esperar o resto do PDV v2.
> - **Condição:** `novo`/`usado`, igual à variante.

24/11/2026. Só análise: nenhuma migração, nenhum código. Nome provisório do módulo: **Precificação por fornecedores** (chave `precificacao`, prefixo de tabela `precificacao_`).

Fontes desta análise:
- o schema das migrações da `origin/main` (o baseline é a definição final das tabelas de estoque; nenhuma migração posterior mexe nas colunas);
- o código de `/catalogo`, `/estoque`, PDV, orçamentos, `core/modulos.ts`, `proxy.ts`, `lib/modulo-ligado.ts`, `lib/planilha.ts`;
- a amostra `lista-24-11.xlsx` (exportação do Buscador PXT de 24/11; o arquivo `docs/samples/pxt-exemplo.xlsx` citado no pedido não existe no repositório).

Não consultei a produção (regra: teste só no local). Por isso não sei quantos produtos a JM tem cadastrados nem como estão escritos. Esse número entra na fase 1, no banco local montado a partir do dump.

---

## 1. O que existe hoje

### 1.1 Tabelas de produto e estoque

| Tabela (nome atual) | O que guarda | Preço | Observações |
|---|---|---|---|
| `estoque_produtos` | o modelo (nome, `marca_id`, `categoria_id`, `subcategoria_id`, `cores text[]`, `armazenamentos text[]`, `codigos`, `ativo`) | `preco numeric` (um só, por modelo) | Sem índice único por nome. Sem `loja`. O comentário da coluna `preco` ainda diz "Food: preço do item no cardápio", mas o PDV usa esse valor como "preço de catálogo". |
| `estoque_categorias` | categoria (`nome`, `tipo_formulario`, `ordem`) | não | |
| `estoque_subcategorias` | subcategoria (FK para categoria, cascata) | não | A tabela existe, mas o modal de produto **não grava `subcategoria_id`**: na prática fica vazia. |
| `estoque_marcas` | marca | não | |
| `estoque_unidades` | a unidade física (IMEI, nº de série, `cor`, `armazenamento`, `condicao`, `estado`, `filial_id`, `quantidade`, `fornecedor_id`, `status`) | `preco_custo`, `preco_venda`, `custo_reparo` | **É o preço que o PDV cobra.** Cor e armazenamento ficam em texto livre. |
| `estoque_tabela_precos` | "Tabela de preços" de /catalogo: `modelo text`, `armazenamento`, `condicao`, `preco_sugerido`, `observacoes`, `ativo` | `preco_sugerido` | `modelo` é **texto, sem FK** para o produto. Sem chave única, sem `updated_at`. Alimenta a sugestão de `preco_venda` na entrada de estoque e os orçamentos. |
| `estoque_fornecedores` | cadastro de fornecedor (CNPJ, contato) | não | |
| `celulares_troca_precos` | preço de recompra na troca (módulo celulares) | `na_troca` | `UNIQUE (empresa_id, modelo, armazenamento)`. Fora do escopo. |
| `itens` (core) | espelho de produtos e unidades, mantido pelo gatilho `estoque_item_sync()` | `preco`, `custo` | O gatilho copia sozinho. Não precisa ser tocado. |

**Custo e venda separados:** só na unidade (`preco_custo` e `preco_venda`). O produto tem um preço só. A tabela de preços tem só o sugerido, sem custo.

**Variações:** **não existe entidade de variante (SKU).**
- `cores` e `armazenamentos` são listas de opções do cadastro do modelo.
- O preço por variação existe em dois lugares, os dois casando por texto:
  - a unidade (`cor` e `armazenamento` em texto);
  - a tabela de preços (`modelo` + `armazenamento` + `condicao`, **sem cor**).

**Condição:**
- `condicao` aceita `novo`, `seminovo` ou `usado` (`lib/tabela-precos-csv.ts`, `CONDICOES_VALIDAS`). `seminovo` só aparece com o módulo `celulares` ligado.
- `estado` é outra coisa: o estado físico (`lacrado`, `excelente`, `bom`, `regular`).
- A `feat/pos-venda` acabou de neutralizar a condição da venda para `novo` | `usado` (migração `20261124002000_condicao_usado`). O estoque ainda usa os três valores.

### 1.2 Quem lê e grava preço

- **/catalogo** (`catalogo-view.tsx`):
  - CRUD da tabela de preços **direto do navegador**, sob RLS;
  - já tem **importação/exportação CSV com prévia** (preço antigo riscado), por `lib/tabela-precos-csv.ts`. O import nunca apaga e grava linha a linha.
- **/estoque**: a entrada de unidade exige custo e venda e sugere a venda pela tabela de preços (modelo + armazenamento + condição).
- **PDV**: cobra `estoque_unidades.preco_venda`. A referência "abaixo do catálogo" é `estoque_produtos.preco` ou a mediana das vendas dos últimos 90 dias.
- **Orçamentos**: leem unidades, tabela de preços e preços de troca.
- **Recebimento de compra** (`/api/compras/receber`): grava custo e venda na unidade.
- **Histórico de preço: não existe** (nenhuma tabela, coluna ou gatilho).

### 1.3 Ativação de módulos

- Manifesto em `core/modulos.ts`: `chave`, `href`, `nome`, `frase`, `grupo`, `requer`, `emPreparacao`, `abasConfiguracoes`, `tabelas`, etc. Exemplos: `estoque`, e `catalogo` com `requer: ['estoque']`.
- Instalar = linha em `empresa_modulos (empresa_id, modulo, ativo, config jsonb, origem)`.
- Trava da tela: `proxy.ts` (`moduloDaRota` → vitrine ou redireciona).
- Trava da API: `exigirModuloLigado(empresaId, chave)` em `lib/modulo-ligado.ts`. `moduloEstaLigado()` serve para cron.
- O build reprova:
  - rota sem dono ou sem trava (`scripts/check-modulos.mjs`);
  - vocabulário de segmento (iPhone, IMEI, seminovo…) fora do módulo dono (`scripts/check-segmento-modulo.mjs`).

### 1.4 RLS

Padrão das migrações novas (transmissão, públicos, etiquetas):
- **leitura:** `empresa_id = (select get_empresa_id())` e filtro de loja por `filiais_visiveis()`;
- **escrita:** uma policy `for all` com `is_empresa_admin(empresa_id)`;
- **grants:** `revoke all` de `anon` e `authenticated`, depois grants explícitos;
- **RPCs:** `security definer` com `search_path` fixo, conferindo `is_empresa_admin` por dentro.
- Helpers: `get_empresa_id()` (já trata a impersonação), `filiais_visiveis()`, `is_empresa_admin(bigint)`, `is_super_admin()`.

Dois pontos fracos que afetam este módulo:
- **As tabelas de estoque usam uma policy `ALL` sem papel** (`tenant_isolamento`): qualquer membro da empresa grava preço.
- O `for all` de escrita também vale para leitura (é somado por OR à policy de select) e **escapa do filtro de loja**. Por isso, nas tabelas novas: uma policy por comando.

### 1.5 Configuração, agendamento, IA e planilha

- **Configuração:** na `origin/main` existem `config_valor(modulo, chave, loja)` e `config_salvar(...)` (migração `20261123000500_config_provisoria`). Hoje gravam em `configuracoes_sistema`; a assinatura vale para o `empresa_config` futuro. A branch atual (`fix/entregar-sem-pagamento`) ainda não tem: **o módulo nasce da `origin/main`.**
- **Agendamento:**
  - pg_cron chamando a rota do app com o segredo do Vault: o job `entrada-parada` faz `net.http_get` em `/api/cron/entrada-parada`;
  - rota única `app/api/cron/[job]` com `CRON_SECRET` comparado em tempo constante;
  - crons da Vercel só diários (`vercel.json`);
  - uma única Edge Function (`webhook-leads`).
- **IA:** SDK `@anthropic-ai/sdk`, chave `ANTHROPIC_API_KEY`. O ZapIntel usa `claude-haiku-5-5` por padrão (configurável em `assistente_config`, uso registrado em `assistente_uso`). O chat de dados usa `claude-sonnet-5-5`.
- **Planilha:** `lib/planilha.ts`. É leitor próprio de CSV e XLSX, só no servidor e sem dependência. Lê só a primeira aba e recusa `.xls`. A rota `/api/importacao/ler` já faz prévia + palpite de mapeamento para contatos (só dono/admin, até 5 MB).

---

## 2. A amostra do Buscador PXT (`lista-24-11.xlsx`)

### 2.1 Estrutura

- Uma aba, **"Preços"**, com **150 linhas** de dados e **7 colunas**:

| Coluna | Conteúdo |
|---|---|
| Produto | modelo em CAIXA ALTA, em inglês: `IPHONE 17 PRO MAX`, `IPHONE 17E`, `IPHONE 18 PRO`… (6 modelos) |
| Capacidade | `128GB`, `256GB`, `512GB` (texto) |
| Memória | **vazia nas 150 linhas** (provavelmente RAM, para Android/Mac) |
| Cor | em inglês, CAIXA ALTA: `COSMIC ORANGE`, `DEEP BLUE`, `GLACIER`, `BURGUNDY`, `MIST BLUE`, `SAGE`, `TEAL`, `ULTRAMARINE`… (14 cores) |
| Disponibilidade | vazia em 95 linhas; `Baixa disponibilidade: 1 fornecedor` (38) ou `… 2 fornecedores` (17) |
| Preço de custo | inteiro, formatado como `R$` |
| Preço de venda | inteiro: **custo + R$ 700 em 140 das 150 linhas**; nas outras 10, + R$ 390 a 650 |

- Metadados: gerado por `openpyxl` às 18:29 de 24/11, ou seja, exportação automática do PXT.
- **Não há:** fornecedor, código do item, condição, data/hora da cotação nem moeda.

### 2.2 Padrões

- **Cada linha é uma oferta de um fornecedor anônimo.**
  - As 150 linhas se reduzem a **38 combinações** modelo + capacidade + cor, com 1 a 7 ofertas cada.
  - Distribuição: 4 com 1 oferta, 3 com 2, 8 com 3, 10 com 4, 6 com 5, 3 com 6 e 4 com 7.
- **20 linhas são idênticas a outras.** Sem a coluna de fornecedor, não dá para saber se é o mesmo fornecedor repetido ou dois fornecedores com o mesmo preço. Isso pesa na média e na mediana.
- **Dispersão grande dentro do mesmo aparelho**, até 20%. Exemplo: 18 Pro Max 512 GB Glacier, ofertas de R$ 10.500 a R$ 12.499.
  - Os preços altos coincidem com "Baixa disponibilidade: 1 fornecedor".
  - Logo, descartar outliers e tratar a baixa disponibilidade não é luxo: muda o preço.
- **A lista vem filtrada:** 6 modelos e só algumas capacidades (não há 17 Pro, Air, 1 TB…). Parecem os favoritos ou filtros configurados no PXT. **Não há seminovos.**
- **A cor muda o preço pouco, mas muda.** Exemplo: 17 Pro Max 256 GB, menor oferta Cosmic Orange R$ 7.490 contra Deep Blue R$ 7.599.

### 2.3 Problemas de qualidade (e o que cada um exige)

| Problema | Consequência no desenho |
|---|---|
| Modelo e cor em inglês e em CAIXA ALTA; o Nexus usa nome em português (`lib/apple-modelos.ts`: "Laranja-cósmico", "Azul-intenso", "Azul-névoa", "Sálvia", "Rosa-pálido", "Verde-acinzentado"…) | **dicionário de equivalências por empresa** (dado, não código), com sementes para a JM |
| `IPHONE 17`, `IPHONE 17E` e `IPHONE 17 PRO MAX` compartilham prefixo | casamento por **conjunto exato de palavras**, não por "contém"; números e capacidade são travas duras |
| Modelos que o catálogo do Nexus ainda não tem (a lista Apple do código começa no 17; não há "iPhone 18") | fila de "sem produto no catálogo" |
| Sem fornecedor | a regra "fornecedor específico" fica indisponível para esta fonte; dedupe impossível |
| Sem condição | a condição é **fixada na configuração da fonte** (esta exportação = novo) |
| Sem data | `capturado_em` = hora do upload (ou informada por quem sobe); regra de validade da cotação |
| "Preço de venda" do PXT = custo + R$ 700 (margem configurada no PXT?) | o módulo calcula pelo **custo**; usar o "venda" da fonte vira opção de base, não padrão |
| Semântica de "Baixa disponibilidade: N fornecedores" | perguntar ao PXT; por ora, um sinal para descartar ou pesar a oferta |

---

## 3. Proposta

### 3.1 O que valido e o que contesto na arquitetura alvo

| Ponto | Posição |
|---|---|
| Fontes com interface comum (adapters) | **Valido.** Acrescento: cada adapter declara o que fornece (fornecedor? condição? data? código?). As telas e as regras desligam o que a fonte não tem: nesta exportação do PXT não há fornecedor, então "fornecedor específico" não aparece. |
| `codigo_externo` | **Contesto como chave do vínculo.** A exportação não tem código. A identidade do item da fonte é a **chave normalizada** (marca, modelo, capacidade, memória, cor, condição), gravada uma vez por fonte. O código externo, quando existir, entra como atalho. |
| Staging por importação | **Valido.** Sem guardar o arquivo no Storage (o Storage já passou de 1 GB): guardo as linhas lidas, mais o `sha256` do arquivo para barrar reimportação. |
| Vínculo produto Nexus ↔ item da fonte | **Ajusto o lado Nexus.** O preço não mora no produto: mora em modelo + capacidade + condição (tabela de preços) ou na unidade. Proponho a entidade **alvo de preço** (o que se precifica), que pode ser: (a) uma linha da tabela de preços do Nexus, (b) o produto inteiro, (c) um item externo de quem não usa o estoque do Nexus. Isso também resolve o "universal" do ponto 6. |
| Motor de regras por nível | **Valido**, com herança **campo a campo** (null = herda): margem na categoria, arredondamento na empresa, exceção num produto. A tela mostra de onde veio cada valor. A margem precisa aceitar **R$ fixo** além de %: a própria JM usa + R$ 700 no PXT. |
| Automático ou fila de aprovação | **Valido**, com duas travas que mandam para a fila mesmo no automático: margem mínima violada e variação acima do limite. Mais uma: alvo marcado **"preço travado"** nunca é tocado. |
| Saída para terceiros | **Valido**, na fase 2, junto com os alvos externos. |
| Agendamento | Recomendação na 3.6. Com upload de XLSX, agendamento não se aplica: a fase 1 não precisa dele. |

### 3.2 Modelo de dados

Todas as tabelas têm:
- `empresa_id bigint not null`;
- FKs compostas `(empresa_id, id)` entre as tabelas do módulo, para que nenhuma gravação feita com a chave de serviço ligue registros de empresas diferentes;
- `created_at`, e `updated_at` onde muda.

**Configuração (gravada pela tela, dono/admin):**

| Tabela | Colunas principais | Índices / unicidade |
|---|---|---|
| `precificacao_fontes` | `nome`, `adaptador` (`planilha` \| `pxt_api` \| `json`), `config jsonb` (mapeamento de colunas, linha do cabeçalho, condição fixa, moeda, transformações), `capacidades jsonb` (o que a fonte fornece), `ativo`, `frequencia` (nula na planilha), `proxima_execucao_em`, `token_hash` (endpoint genérico; o token não fica em claro) | `unique (empresa_id, nome)`; índice parcial em `proxima_execucao_em` onde `ativo` |
| `precificacao_dicionario` | `fonte_id` (nulo = todas as fontes), `campo` (`marca` \| `modelo` \| `cor` \| `capacidade` \| `condicao`), `de` (normalizado), `para` | `unique (empresa_id, coalesce(fonte_id,0), campo, de)` |
| `precificacao_alvos` | `tipo` (`tabela_precos` \| `produto` \| `externo`), `produto_id`, `tabela_preco_id`, `armazenamento`, `cor` (nula = todas as cores), `condicao` (`novo` \| `usado`), `codigo_externo`, `descricao`, `preco_atual` (só no externo), `travado`, `ativo` | únicos parciais: `(empresa_id, produto_id, armazenamento, coalesce(cor,''), condicao)` para os do Nexus; `(empresa_id, codigo_externo)` para os externos |
| `precificacao_regras` | `escopo` (`empresa` \| `categoria` \| `subcategoria` \| `marca` \| `produto` \| `alvo`), `escopo_id`, `base` (`menor` \| `mediana` \| `media` \| `media_n_menores` \| `fornecedor` \| `venda_da_fonte`), `parametros jsonb` (n, fornecedor, outlier `{metodo: iqr \| pct_mediana, limite}`, mínimo de ofertas, ignorar baixa disponibilidade, validade em horas), `markup_pct`, `acrescimo_valor`, `arredondamento jsonb` (`{modo: final, final: 9}`, `{modo: multiplo, passo: 50, sentido: cima}`), `margem_min_pct`, `margem_min_valor`, `variacao_max_auto_pct`, `ativo` | `unique (empresa_id, escopo, coalesce(escopo_id,0))` |

**Captura (gravada só pelo servidor):**

| Tabela | Colunas principais | Índices / unicidade |
|---|---|---|
| `precificacao_importacoes` | `fonte_id`, `origem` (`upload` \| `agendada` \| `endpoint`), `arquivo_nome`, `arquivo_sha256`, `capturado_em`, `status`, `linhas_lidas`, `linhas_validas`, `linhas_descartadas`, `erros jsonb`, `criado_por` | `unique (fonte_id, arquivo_sha256)`; `(empresa_id, created_at desc)` |
| `precificacao_ofertas` (staging, snapshot) | `importacao_id`, `fonte_id`, `item_fonte_id`, `linha`, `descricao_original`, `marca`, `modelo`, `capacidade`, `memoria`, `cor`, `condicao`, `fornecedor`, `disponibilidade`, `preco_custo numeric(12,2)`, `preco_venda_fonte`, `moeda char(3)`, `capturado_em`, `bruto jsonb` | `(importacao_id)`; `(empresa_id, item_fonte_id, capturado_em desc)`. Retenção configurável (padrão 180 dias) |
| `precificacao_itens_fonte` | `fonte_id`, `chave` (normalizada), `codigo_externo`, `atributos jsonb`, `descricao_exemplo`, `primeira_vez_em`, `ultima_vez_em` | `unique (fonte_id, chave)` |
| `precificacao_vinculos` | `item_fonte_id`, `alvo_id` (nulo se ignorado), `status` (`sugerido` \| `confirmado` \| `ignorado` \| `recusado`), `origem` (`exato` \| `dicionario` \| `similaridade` \| `ia` \| `manual`), `confianca numeric(4,3)`, `motivo`, `confirmado_por`, `confirmado_em` | um único vínculo vigente por item (único parcial em `item_fonte_id` onde `status` in (`confirmado`, `ignorado`)); vários itens podem apontar para o mesmo alvo (cores agregadas) |

**Cálculo e aplicação:**

| Tabela | Colunas principais | Índices / unicidade |
|---|---|---|
| `precificacao_execucoes` | `importacao_id`, `modo` (`automatico` \| `aprovacao`), `disparo` (`manual` \| `agendado`), `totais jsonb`, `criado_por` | `(empresa_id, created_at desc)` |
| `precificacao_sugestoes` | `execucao_id`, `alvo_id`, `preco_atual`, `preco_sugerido`, `custo_base`, `variacao_pct`, `n_ofertas`, `ofertas_usadas jsonb`, `regra_efetiva jsonb` (com a origem de cada campo), `status` (`pendente` \| `aprovada` \| `recusada` \| `aplicada` \| `expirada` \| `sem_mudanca` \| `bloqueada`), `motivo_bloqueio`, `decidido_por`, `decidido_em` | `unique (execucao_id, alvo_id)`; `(empresa_id, status)`. Uma execução nova expira as pendentes do mesmo alvo |
| `precificacao_historico` | `tabela` (`estoque_tabela_precos` \| `estoque_unidades` \| `estoque_produtos` \| `precificacao_alvos`), `registro_id`, `campo`, `valor_anterior`, `valor_novo`, `origem` (`precificacao` \| `manual` \| `csv` \| `compra`), `sugestao_id`, `fonte_id`, `regra jsonb`, `usuario_id` | `(empresa_id, tabela, registro_id, created_at desc)` |

**Como "nenhum preço muda sem histórico" fica garantido:**
- Um **gatilho** nas colunas de preço das tabelas de estoque grava em `precificacao_historico` toda mudança, **inclusive as manuais** (a tela /catalogo grava pelo navegador).
- A origem vem de `set_config('nexus.preco_origem', ...)`, no mesmo molde do `nexus.venda_excecao`.
- A aplicação pelo módulo passa por uma RPC (`precificacao_aplicar`) que:
  - confere admin e módulo ligado;
  - grava o preço e marca a origem, numa transação só;
  - marca a sugestão como aplicada.

**RLS (uma policy por comando, nada de `for all`):**
- **Leitura:** `empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id)`. Custo de fornecedor é dado sensível: proponho que só dono/admin veja (decisão 8).
- **Escrita direta (insert/update/delete):** só nas três tabelas de configuração, para admin.
- **Captura, vínculos, sugestões e histórico:** sem policy de escrita para `authenticated`. O servidor grava com a chave de serviço, depois de `exigirModuloLigado` + admin, ou por RPC `security definer`.
- `revoke all` de `anon` em tudo. O endpoint genérico valida o token da fonte (hash) e grava com a chave de serviço.
- Teste SQL obrigatório: duas empresas, nenhuma lê, grava ou vincula nada da outra.

**Mudanças em tabelas existentes (mínimas, todas do módulo `catalogo`):**
- `estoque_tabela_precos` ganha:
  - `produto_id` (FK, nulo nas linhas antigas);
  - `custo_referencia numeric(12,2)` (o custo de mercado que gerou o preço);
  - `updated_at`;
  - índice único `(empresa_id, lower(modelo), coalesce(armazenamento,''), condicao)` **onde `ativo`**, depois de checar duplicatas no local.
- `cor` na tabela de preços **só se** a decisão 3 for "preço por cor".
- Gatilho de histórico nas colunas de preço (`estoque_tabela_precos.preco_sugerido`, `estoque_unidades.preco_venda`, `estoque_produtos.preco`).

### 3.3 Interface dos adapters

Contrato (descrição, sem código):
- **Entrada:** a fonte (com `config`) e o insumo: um arquivo (planilha), nada (API, que busca sozinha) ou um JSON recebido (endpoint).
- **Saída:**
  - uma lista de **ofertas normalizadas** (`codigo_externo?`, `descricao_original`, `marca`, `modelo`, `capacidade`, `memoria`, `cor`, `condicao`, `fornecedor?`, `disponibilidade?`, `preco_custo`, `preco_venda_fonte?`, `moeda`, `capturado_em`, `bruto`);
  - as **linhas descartadas com motivo** (preço vazio, capacidade ilegível…);
  - as **capacidades** da fonte.
- **Normalização** (comum a todos, depois do adapter): minúsculas, sem acento, espaços colapsados, `GB` e `TB` padronizados, dicionário da empresa aplicado, condição fixa da fonte quando a coluna não existe.

Os três adapters:
- **A — Planilha (fase 1):**
  - reaproveita `lib/planilha.ts`;
  - o mapeamento de colunas fica salvo na fonte, com o palpite automático pelo nome da coluna, como já se faz para contatos;
  - **predefinição "Buscador PXT – exportação XLSX"** gravada como dado (o mapeamento das 7 colunas acima + condição = novo), não como código.
- **B — API do PXT (preparado, sem implementar):** o mesmo contrato e o mesmo `adaptador = pxt_api` na fonte, com a credencial no Vault. Uma loja de celulares já anuncia "integração com o Buscador PXT", então vale pedir o acesso oficial agora. **Sem raspagem com login.**
- **C — Endpoint JSON (fase 2):** `POST /api/precificacao/fontes/{id}/ofertas` com `Authorization: Bearer <token da fonte>`, corpo = lista no formato normalizado. Validação por esquema, limite de linhas, idempotência por `Idempotency-Key`.

### 3.4 Casamento (vínculo), regras primeiro

1. **Vínculo já confirmado** para a chave normalizada: usa e pronto. Da segunda importação em diante, quase tudo cai aqui: **custo zero e tempo zero**.
2. **Exato:** monta-se a chave normalizada do alvo (nome do produto sem a marca + capacidade + condição [+ cor]) e compara-se com a do item.
   - Trava dura: o **conjunto de palavras do modelo é idêntico**. "17" ≠ "17e" ≠ "17 pro max".
   - Capacidade e números iguais.
   - Cor pelo dicionário.
   - Confiança 1,0. Confirmação automática se a empresa ligar (decisão 7).
3. **Similaridade:** a mesma trava de números e capacidade; tolerância só para grafia e abreviação ("PM" = "Pro Max", "lacrado", "Apple"). Feita em TypeScript (token set + Jaro-Winkler); não depende de `pg_trgm`. Score ≥ 0,85 vira **sugerido**.
4. **IA (fase 2, opcional por empresa, respeita "IA do CRM ligada"):**
   - entra só para o que sobrou;
   - lotes de até 25 itens; para cada item, os **8 melhores candidatos** da etapa 3;
   - modelo: `claude-haiku-5-5` (já é o padrão do projeto), com saída estruturada (`item_id`, `alvo_id` da lista ou nulo, confiança, motivo curto);
   - o servidor recusa `alvo_id` fora da lista de candidatos;
   - **nunca confirma**: vira sugerido com `origem = ia`;
   - uso registrado em `assistente_uso`.
   - Prompt (resumo): papel "cadastrista de catálogo"; regra "só escolha entre os candidatos; na dúvida devolva nulo; capacidade e número do modelo têm de bater exatamente"; descrições cruas do item e dos candidatos.
   - **Custo estimado:**
     - pior caso de uma primeira importação com ~40 itens sem vínculo: 2 chamadas de ~4 mil tokens de entrada e ~1 mil de saída;
     - Haiku 5.5 (US$ 0,10 / 0,50 por milhão): **≈ US$ 0,002 por importação**;
     - Sonnet 5.5 (US$ 2 / 10): ≈ US$ 0,04;
     - nas importações seguintes ≈ zero, porque os vínculos ficam salvos.
5. **Fila de vínculos** (tela): o humano confirma, troca, ignora ou cria o alvo. Confirmar grava o vínculo, e a regra fica valendo nas próximas importações.

**Com esta amostra:** com o dicionário de cores semeado, as 38 chaves casam pelo passo 2 com os produtos que existirem no catálogo da JM. A IA não seria chamada. Os modelos que faltam no catálogo (provavelmente a linha 18) vão para "sem produto no catálogo".

### 3.5 Motor de regras e aplicação

**Cálculo** (função pura em TypeScript, testada com a amostra como fixture). Para cada alvo com vínculo:
1. junta as ofertas válidas da importação (dentro da validade);
2. aplica os filtros (baixa disponibilidade, mínimo de ofertas, outlier);
3. aplica a base (menor, mediana…) → **custo_base**;
4. aplica a margem (% e/ou R$) → arredondamento → confere a margem mínima;
5. compara com o preço atual → variação;
6. decide o status: `sem_mudanca`, `pendente`, `aprovada`, ou `bloqueada` com motivo.

A **regra efetiva** fica gravada na sugestão (o "porquê" de cada preço).

**Aplicação:** RPC `precificacao_aplicar(ids)` em lote, atômica, com histórico. Destino por tipo de alvo:
- `tabela_precos` → `preco_sugerido` (+ `custo_referencia`);
- `produto` → `estoque_produtos.preco`;
- `externo` → `precificacao_alvos.preco_atual`;
- opcional (decisão 2): as **unidades disponíveis** do mesmo modelo, capacidade e condição, sem reserva e sem preço travado. Nelas a margem mínima é conferida contra o **custo real da unidade**, não o da fonte.

**Modo automático:** aplica o que não estiver bloqueado; o resto vai para a fila. **Modo aprovação:** tudo vai para a fila. A configuração do modo fica em `config_valor('precificacao', 'modo')`, por empresa.

### 3.6 Onde roda o agendamento (fase 3)

**Recomendação:** o **pg_cron como relógio** chama `/api/cron/precificacao` a cada 15 min, com o segredo do Vault (o mesmo caminho do `entrada-parada`). A rota:
- pega as fontes com `proxima_execucao_em <= now()` e módulo ligado;
- roda adapter → importação → cálculo;
- reagenda pela frequência da fonte, no fuso da empresa.

| Alternativa | Por que não |
|---|---|
| Vercel Cron | No plano atual só roda diário (todos os jobs de `vercel.json` são diários); a frequência por empresa ficaria presa nisso |
| Edge Function (Supabase) | Deno, com código separado: duplicaria a normalização, o motor e os adapters, que vivem em `lib/` |
| pg_cron com o cálculo em SQL | Motor e adapters em TypeScript; chamar API externa de dentro do Postgres (pg_net assíncrono) complica erros e repetições |

Lição registrada: agendado não é executado. O teste da fase 3 só passa quando o **efeito no dado** aparece (importação criada pelo job).

### 3.7 Telas (módulo `precificacao`, em `/precificacao`, só dono/admin)

1. **Fontes:** lista; criar (planilha, API ou endpoint); **mapeamento de colunas** com prévia das 20 primeiras linhas, palpite automático e predefinição PXT; condição fixa; validade da cotação; token do endpoint (gerar ou revogar).
2. **Importar:** upload → prévia (lidas, válidas, descartadas com motivo; quantas chaves novas) → confirmar.
3. **Vínculos:** fila agrupada por chave (com as ofertas de exemplo); confirmar, trocar, ignorar, criar alvo; filtros por origem e confiança; "sem produto no catálogo".
4. **Dicionário:** equivalências (cor, modelo, marca…), com sugestões das chaves que não casaram.
5. **Alvos:** o que é precificado (gerado do catálogo: produto × capacidade × condição [× cor]); travar preço; na fase 2, importar alvos externos.
6. **Regras:** árvore empresa > categoria > subcategoria > marca > produto, campo a campo, com "valor herdado de…"; **simulador** (aplica a regra na última importação, sem gravar).
7. **Aprovação:** tabela com preço atual × sugerido × variação % × custo base × nº de ofertas × motivo de bloqueio; aprovar ou recusar em lote; filtros.
8. **Histórico:** por alvo e por período, com origem (módulo, manual, CSV, compra), usuário, fonte e regra.
9. **Integrações (fase 2):** tokens de leitura da API de preços, webhook (assinado por HMAC) e exportação CSV.

---

## 4. Riscos e lacunas

1. **Não há variante (SKU) e o preço mora em três lugares** (produto, tabela de preços e unidade). Atualizar só a tabela de preços **não muda o que o PDV cobra** das unidades que já estão no estoque: daí a decisão 2.
   - Criar uma tabela de variantes de verdade resolveria na raiz, mas mexe em entrada de estoque, PDV e orçamentos: **não proponho para a fase 1.**
2. **A tabela de preços casa por texto** (`modelo` sem FK, sem unicidade). Pode ter duplicata hoje; a fase 1 começa medindo isso no banco local. A FK `produto_id` nova vira o elo; o texto fica por compatibilidade.
3. **Escrita de preço sem papel:** as tabelas de estoque deixam qualquer membro gravar preço, e /catalogo grava do navegador. O histórico por gatilho cobre isso. **Apertar a RLS para admin muda o que vendedores fazem hoje** (decisão 9).
4. **`subcategoria_id` não é gravado pelo modal de produto:** a regra por subcategoria ficaria sem efeito até isso ser corrigido (ajuste pequeno no `produto-modal`, se quiser usar esse nível).
5. **Vocabulário:** o build barra "iPhone" e "seminovo" fora do módulo `celulares`.
   - O módulo fala de "modelo", "capacidade" e "condição (novo/usado)"; nada de Apple no código.
   - As equivalências da JM (cores em inglês → português) são dados.
   - O estoque ainda tem `seminovo` (a venda já passou a `usado`): o módulo mapeia `seminovo` → `usado` na leitura.
6. **A fonte não traz fornecedor nem data.** Não dá para pesar fornecedor, tirar duplicatas nem saber a hora exata da cotação. Pedir ao PXT a coluna de fornecedor e a data na exportação (ou na API).
7. **O "Preço de venda" do PXT** (+ R$ 700) pode ser confundido com o preço da loja: na tela ele aparece só como informação.
8. **Base da branch:** `config_valor` só existe na `origin/main`. O módulo nasce de uma worktree da `origin/main`. O número da migração é conferido na hora em todas as branches e worktrees (hoje o maior é `20261124002000`, na `feat/pos-venda`).
9. **Ambiente local:** Docker só com o IDE fechado (máquina com 15,8 GB). O dump da JM permite medir o catálogo real sem tocar na nuvem.
10. **Custo de nuvem:** desprezível na escala da amostra (150 linhas por importação). A retenção do staging evita crescer sem limite. Nada vai para o Storage.

---

## 5. Plano em fases

### Fase 1: ponta a ponta com XLSX (módulo `emPreparacao` até o ok)

Entregáveis:
- manifesto (`precificacao`, sem `requer`; o destino "tabela de preços" exige `catalogo` ligado), trava no servidor, vitrine, Central;
- migração com as tabelas da 3.2 (menos as de saída), RLS por comando, mudanças mínimas em `estoque_tabela_precos`, gatilho de histórico e RPC `precificacao_aplicar`; arquivo de volta e teste SQL;
- adapter de planilha, mapeamento salvo, predefinição PXT, dicionário com sementes da JM **como dado**;
- alvos gerados do catálogo; vínculo exato + similaridade + fila de vínculos (**sem IA**);
- regras (empresa, categoria, marca, produto), simulador, sugestões, fila de aprovação, modo automático com travas;
- histórico (módulo + edições manuais).

Testes:
- unitários do motor, com a amostra como fixture: números conferidos à mão para 3 aparelhos, incluindo um com outlier de baixa disponibilidade;
- SQL de isolamento entre duas empresas e de histórico;
- integração no banco local.

**Critério de aceite (no local, com o dump da JM):**
1. subir `lista-24-11.xlsx` → 150 linhas lidas, 0 descartadas, 38 chaves;
2. vínculos exatos para todo modelo que existir no catálogo; o resto em "sem produto";
3. regra de exemplo → sugestões com regra efetiva visível;
4. aprovar em lote → `estoque_tabela_precos` atualizada e uma linha de histórico por preço;
5. reimportar o mesmo arquivo → recusado pelo hash;
6. reimportar um arquivo com preços alterados → zero vínculos novos, só sugestões.

### Fase 2: universal

- vínculo por IA (Haiku, opcional);
- aplicação nas unidades disponíveis (se não entrar na fase 1);
- endpoint JSON (adapter C);
- alvos externos (importar a lista de quem não usa o estoque do Nexus);
- saída: API de leitura com token, webhook assinado, exportação CSV;
- retenção do staging.

### Fase 3: recorrência

- agendamento pg_cron → `/api/cron/precificacao`, com frequência por fonte;
- adapter da API do PXT (se houver acesso oficial);
- alertas (cotação velha, variação grande, item que sumiu da fonte).

---

## Decisões antes da fase 1

1. **Nome e chave do módulo:** "Precificação por fornecedores" / `precificacao` / prefixo `precificacao_`?
2. **Onde o preço novo é gravado:** só na tabela de preços (recomendado), também em `estoque_produtos.preco`, e/ou **nas unidades disponíveis em estoque** (recomendo entrar na fase 1 como opção desligada; sem isso o PDV continua cobrando o preço antigo das unidades que já estão na loja)?
3. **A cor entra no preço?** Recomendo que não: um preço por modelo + capacidade + condição, agregando as cores (a diferença na amostra é pequena). A cor fica opcional por alvo.
4. **Base padrão da JM:** menor oferta, mediana ou média das N menores? Ofertas com "baixa disponibilidade" entram, saem ou só entram se forem as únicas?
5. **Margem e arredondamento da JM:** + R$ 700 fixo (como no PXT), % ou por faixa/modelo? Arredondar para final 9, 90 ou múltiplo de 50? Margem mínima?
6. **Modo inicial:** aprovação (recomendado no começo) ou automático? Variação máxima sem aprovação (sugestão: 5%)?
7. **Vínculo exato confirma sozinho** (recomendado, com relatório) ou também passa pela fila?
8. **Quem acessa o módulo e vê custo de fornecedor:** só dono/admin (recomendado)?
9. **Histórico também das edições manuais** (gatilho nas colunas de preço do estoque, recomendado)? E **restringir a edição de preço a dono/admin** nas tabelas de estoque? Isso muda o que vendedores fazem hoje.
10. **Produtos da fonte que não existem no catálogo** (ex.: linha 18): só listar (recomendado na fase 1) ou permitir criar o produto pela fila?
11. **Perguntas ao PXT** (em paralelo): o que significa "Baixa disponibilidade: N fornecedores"; de onde vem o "Preço de venda" (+ R$ 700); se a exportação pode trazer fornecedor, data e seminovos; se existe API oficial ou parceria.
