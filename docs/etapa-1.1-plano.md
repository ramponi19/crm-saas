# Etapa 1.1: base (configuração, cargos, custo protegido, auditoria, empresa ativa). Plano de execução

25/11/2026. Branch `feat/etapa-1.1-base` (da `main` 5a625392 + os docs da `docs/roteiro-reconstrucao`), worktree `.claude/worktrees/etapa-1-1`.

**Revisão 2 (25/11, respostas do Lucas ao §8):** custo em **quatro** tempos, com a coluna antiga legível até o app novo estar no ar (Q3); checagem da conta "JM Store" antes da 1.1c (Q1); Consulta sem Financeiro (Q2); remoção da camada de papel legado registrada no roteiro como etapa E1.6. As entregas foram renomeadas: o custo ocupa 1.1d a 1.1g, e a contração final passou a 1.1h. **Aprovado para começar a 1.1a no local, sem produção.**

Base:
- [roteiro-reconstrucao.md](roteiro-reconstrucao.md): ordem, aceite da E1.1, §4.3 (preço e custo congelados);
- [pdv-v2-especificacao.md](pdv-v2-especificacao.md) revisão 3: §A (configuração), §B (cargos, auditoria, empresa ativa), §B.1 (custo, 17 pontos);
- [etapa-1.2-variante-plano.md](etapa-1.2-variante-plano.md) §0: o que a 1.2 espera receber da 1.1.

Levantamento do código: leitura da `main` 5a625392 nesta worktree (dois mapas completos: custo e cargos/empresa/configuração). Fatos de produção: os dos docs de 24 e 25/11; **nenhuma consulta nova à produção nesta fase**. Cada entrega refaz a leitura do dia antes da migração.

Regra que vale aqui ("Excelência sem espera de horário", 25/11):
- entrega liberada por **critério**, nunca por horário;
- **toda migração compatível com o app no ar**: adiciona → o app passa a usar → remove o velho, cada passo com deploy próprio;
- portões: plano revisado; testes, build e conferência visual; smoke na Demonstração; ponto de volta e backup antes de mudar o banco; deploy só sem atividade na JM nos últimos 10 minutos;
- onde algo não segue o padrão: **destacado (⚠) e explicado** abaixo, esperando decisão.

---

## 0. Resumo

| Entrega | O quê | Banco | App | Visível para a loja |
|---|---|---|---|---|
| **1.1a** | Auditoria única + motor de configuração definitivo (expansão) + índice `(empresa_id, concluida_em)` | sim | sim | quase nada: tela de Auditoria para o dono |
| **1.1b** | Cargos e permissões no servidor + empresa ativa + superadmin como plataforma + correção do 406 | sim | sim | Configurações → Cargos (troca Permissões); Equipe com cargo |
| **1.1c** | Dados da JM: Matheus e Eduardo Dono, "JM Store" Consulta, "Meta Reviewer" desativada (3 negócios e a conversa para o Matheus) | sim (dados, com ok) | não | JM Store passa a só ler |
| **1.1d** | Custo, **tempo 1**: tabelas-satélite protegidas por `estoque.ver_custo`, sincronizadas com a coluna antiga por gatilho; **a coluna antiga continua legível como hoje** | sim | não | nada |
| **1.1e** | Custo, **tempo 2**: app lê e grava só no satélite (17 pontos) + custo pendente + lista | não | sim | vendedor deixa de ver custo nas telas; o Dono continua vendo |
| **1.1f** | Custo, **tempo 3**, na mesma janela de trabalho da 1.1e: a coluna antiga fica vazia para todos; o gatilho continua até o tempo 4 | sim | não | nada (o app já não lê a coluna) |
| **1.1g** | Custo, **tempo 4**: remove as colunas antigas, num deploy separado, depois de provar que nada as lê | sim | não | nada |
| **1.1h** | Contração do resto: envelope provisório da configuração e `empresas.permissoes` | sim | não | nada |
| **1.1i** | Gerador de valores padrão: todos os padrões no catálogo, gerados para o banco e materializados na criação da empresa e na instalação do módulo. **Antes de qualquer cliente novo e antes de a Aletrini ligar módulo com configuração** (roteiro §2) | talvez (função de semente) | sim (cadastro) | nada para a JM |

Ordem obrigatória: a → b → c → d → e → f → g; a **h** depois da b e da e (sem leitor antigo). Cada uma vai sozinha para a produção; a f sobe logo depois da e, na mesma janela.

**O Dono nunca fica sem custo, e o vendedor não ganha nenhuma exposição nova** em nenhum tempo: até a 1.1f a exposição é a de hoje (coluna antiga), e cada tempo só tira.

**Por que essa ordem:**
- a auditoria vem primeiro porque todo o resto audita (cargos, configuração, custo, plataforma);
- o custo (d) depende de `tem_permissao('estoque.ver_custo')` (b) e dos cargos da JM já certos (c). Se o custo fosse protegido antes da c, a conta "JM Store" (hoje `owner`) continuaria vendo custo, e o primeiro minuto depois da c tiraria dela;
- a coluna antiga só é esvaziada (f) quando o app que lê o satélite (e) já está no ar, e só é removida (g) depois de provar que nada a lê.

---

## 1. Entrega 1.1a: auditoria, configuração definitiva e índice

### 1.1 O que existe hoje

- **Auditoria:** não existe tabela única. Há `superadmin_logs` (só início e fim da impersonação e ações do painel, lido só pelo superadmin), `eventos` (eventos de domínio), `negocio_historico`, `vendas_alertas` (gravada pelo navegador), `posvenda_chamado_eventos`. Nada registra o que o superadmin grava dentro da empresa.
- **Configuração provisória** (`20261123000500_config_provisoria`):
  - `config_valor_emp(p_empresa, p_modulo, p_chave, p_filial)` (só service_role), `config_valor(p_modulo, p_chave, p_filial)`, `config_salvar(p_modulo, p_chave, p_valor, p_filial)`;
  - guarda em `configuracoes_sistema`, linha `chave = '<modulo>.<chave>'`, valor num envelope `{empresa, lojas:{<filial>:v}, atualizado_por, atualizado_em}`;
  - `config_salvar` confere empresa, somente leitura, `is_empresa_admin`, chave válida, chave com cara de segredo e loja;
  - **15 funções SQL** chamam `config_valor_emp` (pós-venda, conta de serviço, horário por dia, sem dono, liberação diária, sem ofertas, rotina diária); no app: `leads/mover`, `ganho-modal`, `posvenda/carregar-fila`, `pos-venda/page`, `api/pos-venda/config`, `api/configuracoes/horario`;
  - **leitura direta do envelope** (fora das funções): `configuracoes/(admin)/pos-venda/page.tsx:27`, `pos-venda/page.tsx:35`; e `api/configuracoes/horario` ainda grava a chave antiga `horario_comercial` por compatibilidade.
- As outras ~18 chaves antigas de `configuracoes_sistema` (`mensagens_templates`, `lead_scoring`, `troca`, `transmissao`, `fuso`, `contrato`, `roleta_leads:<filial>`…) **não** são do provisório. Ficam onde estão; a migração delas para o motor é trabalho fora da 1.1 (§A da especificação: "migrar depois").

### 1.2 Banco

**Migração A1 `<n>_auditoria_eventos`** (só adiciona):

| Objeto | Detalhe |
|---|---|
| `auditoria_eventos` | `id bigint identity`, `empresa_id` (nulo só para evento de plataforma sem empresa), `filial_id`, `usuario_id`, `impersonado_por` (uuid do superadmin quando a escrita acontece numa impersonação), `entidade text`, `entidade_id text`, `acao text`, `antes jsonb`, `depois jsonb`, `motivo text`, `origem text` (nome da RPC, gatilho ou rota), `criado_em timestamptz default now()` |
| Índices | `(empresa_id, criado_em desc)`, `(empresa_id, entidade, entidade_id)`, `(empresa_id, usuario_id, criado_em desc)`, parcial `(empresa_id, criado_em desc) where impersonado_por is not null` |
| `auditar(p_entidade, p_entidade_id, p_acao, p_antes, p_depois, p_motivo, p_origem)` | `SECURITY DEFINER`, `search_path` fixo. Preenche empresa (`get_empresa_id()`), loja (`filial_atual()`), usuário e `impersonado_por` sozinha; o chamador não escolhe. Variante `auditar_emp(p_empresa, …)` só para service_role (rotas do servidor e jobs) |
| Imutável | `revoke insert, update, delete, truncate` de `anon`, `authenticated` e `service_role`; gatilho `BEFORE UPDATE OR DELETE` que recusa sempre (`AUDITORIA_IMUTAVEL`), inclusive para quem tem chave de serviço. Inserção só pela `auditar()` |
| RLS | uma política SELECT: `empresa_id = get_empresa_id()` **e** permissão de auditoria. Na 1.1a ainda não há cargos: a política usa `is_empresa_admin(empresa_id)`; a 1.1b troca por `tem_permissao('auditoria.ver')` |

**Migração A2 `<n>_empresa_config`** (expansão da configuração):

| Objeto | Detalhe |
|---|---|
| `empresa_config` | `empresa_id`, `filial_id` (nulo = empresa toda), `modulo`, `chave`, `valor jsonb`, `atualizado_por`, `atualizado_em`. Único `(empresa_id, coalesce(filial_id,0), modulo, chave)`. RLS SELECT membro da empresa; **sem grant de escrita** para `authenticated` |
| Cópia | cada linha `'<modulo>.<chave>'` do envelope vira uma linha de empresa (`empresa`) e uma por loja (`lojas`). Prova: contagem de chaves e valores iguais, comparados um a um por função de conferência no mesmo arquivo; se diferir, a migração aborta |
| `config_valor_emp` / `config_valor` | **mesma assinatura**, corpo novo: loja → empresa → `null`, lendo `empresa_config`. As 15 funções SQL e os 6 leitores do app não mudam uma linha |
| `config_salvar` | mesma assinatura e mesmos códigos de erro; grava em `empresa_config`, chama `auditar('config', …)` com antes e depois, e **continua escrevendo o envelope antigo** (ponte) enquanto houver leitor direto dele. A ponte sai na 1.1h |
| Permissão | na 1.1a continua `is_empresa_admin`; a 1.1b passa a conferir a permissão da definição (padrão `config.editar`) |

Compatibilidade: o app de hoje lê pelas funções (corpo trocado, mesma resposta) ou pelo envelope (ainda escrito pela ponte). Nada quebra com a migração aplicada e o app velho no ar.

**Migração A3 `<n>_vendas_concluida_idx`:** `create index vendas_vendas_empresa_concluida_idx on vendas_vendas (empresa_id, concluida_em) where concluida_em is not null`. A tabela tem ~131 linhas: o `create index` comum trava a escrita por milissegundos (o `concurrently` não roda dentro da transação da `apply_migration`). Pode ir no mesmo arquivo da A2; separado para a volta ser um `drop index`.

### 1.3 App

| Arquivo | Mudança |
|---|---|
| `core/modulos.ts` | novo campo `configuracoes: DefinicaoConfig[]` no manifesto (§A da especificação): chave, tipo, padrão, escopo, faixa, rótulo, ajuda, seção, permissão. Entram as chaves que já existem no provisório (`core.condicao_venda`, `core.horario`, `core.sem_ofertas`, `posvenda.*`, liberação diária, conta de serviço…); a lista exata sai da leitura do dia (`select chave from configuracoes_sistema where chave ~ '^[a-z_]+\.'`) |
| `lib/config.ts` (novo) | `lerConfig(modulo, filialId)` no servidor: resolve loja → empresa → padrão do manifesto, cache por request, objeto tipado |
| `scripts/gerar-config-padroes.mjs` (novo) | gera do manifesto os padrões usados pelas funções SQL (como já se faz com os tipos) |
| `configuracoes/(admin)/pos-venda/page.tsx`, `pos-venda/page.tsx` | deixam de ler o envelope direto; passam a `lerConfig` |
| `api/configuracoes/horario/route.ts` | continua chamando `config_salvar`; a escrita de compatibilidade de `horario_comercial` fica (é chave antiga, fora do provisório) |
| `app/(dashboard)/configuracoes/(admin)/auditoria/page.tsx` + `components/modules/auditoria/auditoria-view.tsx` (novos) | tela Auditoria: filtro por pessoa, entidade, ação e período; "antes → depois" lado a lado; paginação no banco |
| `lib/menu.ts` | item "Auditoria" em Configurações (dono e admin na 1.1a; `auditoria.ver` na 1.1b) |
| `tests/` | `config.test.ts` (camadas e padrão), `auditoria.test.ts` (formato do antes/depois na tela) |

**Como ficou no código (25/11, commits `3beb8e04` e `d639ee88`, local):**
- O catálogo das chaves ficou em `lib/config.ts` (`DEFINICOES_CONFIG`), não no manifesto: o pós-venda já tinha as definições em `lib/posvenda/config.ts` e o catálogo as reaproveita, sem cópia. O teste `tests/config.test.ts` reprova chave usada no código ou nas migrações que não esteja no catálogo.
- O gerador de padrões para o SQL (`scripts/gerar-config-padroes.mjs`) **não** foi feito na 1.1a: os padrões de horário, liberação diária, sem ofertas e dias úteis continuam no chamador (marcados `padraoNoChamador`). Destino: **entrega 1.1i** (registrada no roteiro §2), obrigatória antes de qualquer cliente novo, Aletrini incluída.
- Além das duas telas do pós-venda, três leitores diretos de `core.horario` passaram ao motor novo: `api/configuracoes/horario` (GET), `lib/horario-empresa.ts` e `lib/alertas-entrada.ts`. Com isso, nenhum código do app lê o envelope provisório (pré-requisito da 1.1h).
- Tabelas novas lidas com cliente sem tipo: `types/database.gerado.ts` é gerado da produção e só as terá depois da migração aplicada.
- `scripts/teste-local.sh` aceita projeto e portas próprios (`TESTE_LOCAL_PROJETO`, `TESTE_LOCAL_PREFIXO`) para sessões paralelas. A faixa 553xx é reservada pelo Windows nesta máquina; usar 573xx.

**Em produção (25/11/2026):** migrações aplicadas como `20261125172744 auditoria_eventos`, `20261125172836 empresa_config` e `20261125172859 vendas_concluida_idx` (no repositório: `20261125000300`, `0400`, `0500`). App `fd809b97` = `dpl_24gjmRTpSNcMz9n7hKtPo5cb9DzM`; ponto de volta `dpl_5f6DbEzbY6HoZD4JaDX8ejd6C3Mg`. Backup `public._backup_config_1_1a_20261125` (12 linhas, md5 `00456c2c…`). Conferido: 3 valores no envelope = 3 linhas na tabela nova (só a JM), valores lidos pela JM com o mesmo md5 de antes, fila do Pós-venda da JM com as 400 pendentes idênticas, liberação e rotina sem erro, logs de 15 min limpos.

**Achado no deploy (pré-requisito da 1.1h):** duas funções do banco leem o envelope direto, fora das funções de configuração: `core_horario` (`chave = 'core.horario'`) e `core_liberar_lotes_do_dia` (descobre as empresas por `chave = 'distribuicao.liberacao_diaria'`). Funcionam enquanto a ponte existir; têm de passar para `empresa_config` antes de a 1.1h apagar o envelope. As duas também engolem o erro de cada empresa no resultado (o job fica `succeeded`): a conferência pós-deploy tem de ler o resultado (`posvenda_rotina_execucoes.resultado`, histórico `atribuir` com motivo), não só o status do job.

### 1.4 Testes e scripts

- `supabase/scripts/testes/teste-auditoria.sql` + esperado: só a `auditar()` insere; UPDATE/DELETE recusados para `authenticated` **e** `service_role`; empresa e usuário preenchidos pela função, não pelo chamador; isolamento entre duas empresas.
- `teste-empresa-config.sql` + esperado: mesma resposta de `config_valor_emp` antes e depois da cópia para todas as chaves da semente; `config_salvar` grava a nova tabela, o envelope (ponte) e a auditoria; códigos de erro iguais aos do `teste-config-provisoria.sql` (que continua verde sem mudança).
- O ritual inteiro (`scripts/teste-local.sh`): os 37 testes de integração e todos os `teste-*.sql` atuais verdes (as 15 funções que leem configuração passam por eles).
- Voltas: `volta-auditoria-eventos.sql` (drop, só enquanto ninguém grava; depois da 1.1b a volta é só do app), `volta-empresa-config.sql` (devolve os corpos provisórios; o envelope está íntegro pela ponte), `volta-vendas-concluida-idx.sql`.

### 1.5 Aceite da 1.1a

1. `auditoria_eventos` sem UPDATE/DELETE possível para nenhum papel (teste SQL e tentativa pela API com a chave de serviço).
2. Para **todas** as chaves do provisório na produção: `config_valor_emp` devolve o mesmo valor antes e depois (prova na própria migração e conferência depois).
3. `config_salvar` pela tela de Pós-venda e de Horário: grava, aparece na Auditoria com antes e depois, e a tela velha (envelope) mostra o mesmo valor.
4. Índice criado e válido (`pg_index.indisvalid`).
5. Rotina diária do pós-venda, liberação diária e roleta: a rodada seguinte ao deploy `succeeded`, com o mesmo resultado da simulação local.
6. Conferência visual: Configurações → Pós-venda, Horário e a nova Auditoria.
7. Smoke na Demonstração: salvar uma chave, ver na Auditoria, voltar o valor.

---

## 2. Entrega 1.1b: cargos e permissões no servidor, empresa ativa, plataforma, 406

### 2.1 O que existe hoje

- 4 papéis fixos em `empresa_usuarios.role` (CHECK `owner/admin/vendedor/tecnico`). **264 checagens de papel em ~115 arquivos**: 52 usam `requireEmpresaRole*` (`lib/owner.ts`), ~28 repetem à mão "`is_super_admin` ou `role in (owner, admin)`", e componentes do navegador escondem botões pelo papel.
- 7 permissões em `empresas.permissoes`, lidas por `permsDoPapel` (11 importadores). `verFinanceiro`/`verRelatorios` só escondem o menu; `excluir` e `descontoMax` **não são aplicados em lugar nenhum**; `/api/permissoes` **descarta `verVendasOutros`** ao salvar.
- No banco: `is_empresa_admin(emp)` (19 migrações usam), `filiais_visiveis()` (dono/admin veem a rede), `posvenda_administradores` (admin, senão owner).
- **Somente leitura já existe** no banco: `sessao_pode_escrever()` (hoje: empresa com status ativo) e políticas restritivas `somente_leitura_insert/update/delete` em **todas** as tabelas com `empresa_id`, exceto 16 de sessão e sistema (`acessos`, `chat_leituras`, `notificacao_prefs`…). A conta Consulta usa esse mecanismo.
- `get_empresa_id()`: impersonação válida, senão o vínculo ativo com `LIMIT 1` **sem ORDER BY**. `lib/supabase/server.ts:getEmpresaId()` e `lib/owner.ts` repetem a mesma coisa no TypeScript, também sem ordem e, no `owner.ts`, **sem filtro de empresa**.
- **O 406 do Laboratório** (pendência do hotfix, 24/11): `app/(dashboard)/layout.tsx:71-76` faz `.single()` em `empresa_usuarios` só por `usuario_id` e `ativo`, quando `getImpersonation()` volta nulo. O superadmin não tem vínculo; com a impersonação vencida ou recém-limpa (o Laboratório troca a impersonação e redireciona), a consulta volta 0 linhas e o PostgREST responde 406. Além disso, durante a impersonação a RLS de `empresa_usuarios` só mostra a empresa impersonada, então qualquer `.single()` do próprio vínculo dá 0 linhas. Outros `.single()` no mesmo padrão: `api/equipe/atualizar-usuario:40,59`, `criar-usuario:60`, `remover-usuario:43`. **Hipótese a reproduzir no local antes de corrigir** (aceite 2.6).
- Os caches do proxy (`cacheModulos`, `cacheSituacao`) **já** têm a empresa na chave; o item da especificação sobre isso está feito.

### 2.2 Decisão de desenho: cargo decide, papel vira derivado

Trocar as 264 checagens de uma vez é o maior risco da etapa. O plano faz em duas camadas:

1. **O cargo passa a ser a fonte.** `empresa_cargos.papel_base` (`owner`/`admin`/`vendedor`/`tecnico`) e um gatilho mantêm `empresa_usuarios.role` **derivado do cargo**. Todo o código antigo que lê `role` continua certo, porque o papel é consequência do cargo.
2. **As permissões com efeito real passam a ser conferidas no banco e nas rotas** por `tem_permissao()`, na 1.1b: as 7 de hoje, custo e preço (1.1d/1.2), auditoria, cargos, configuração e lojas. As 264 checagens estruturais de "é admin" ficam valendo pelo papel derivado e migram aos poucos, cada uma na etapa que mexer na tela (regra: tela tocada, checagem trocada).

**Fim da camada de compatibilidade (aprovado 25/11, registrado no roteiro):** etapa **E1.6 "Fim do papel legado"**, última da Fase 1, depois do caixa (E1.5) e antes da Fase 2. Troca as checagens que sobrarem por permissões, apaga `requireEmpresaRole*`, `getEmpresaRole`, `useSouAdmin` e `is_empresa_admin`, e remove o gatilho que deriva `empresa_usuarios.role` e a própria coluna `role`. Aceite: busca no código e no banco sem nenhum leitor de `role`; matriz de cargos da 1.1b verde. Até lá, cada etapa da Fase 1 diz no plano quantas checagens trocou (contador `scripts/check-papel.mjs`, criado na 1.1b, que só deixa o número cair).

Nenhuma permissão sem ponto de aplicação entra no catálogo, **exceto** as duas da D6 (`estoque.preco_variante`, `estoque.preco_proprio`), criadas agora para a 1.2, como pedido.

### 2.3 Banco

**Migração B1 `<n>_cargos_permissoes`** (só adiciona, mais troca de corpo de função com a mesma assinatura):

| Objeto | Detalhe |
|---|---|
| `empresa_cargos` | `id`, `empresa_id`, `nome`, `descricao`, `sistema bool` (Dono: não edita nem apaga), `papel_base`, `somente_leitura bool`, `criado_por`, `criado_em`. Único `(empresa_id, nome)` |
| `empresa_cargo_permissoes` | `cargo_id`, `empresa_id`, `permissao text`, `limite numeric null`. PK `(cargo_id, permissao)` |
| `empresa_usuarios` | `+ cargo_id` (FK, nulo até a semente rodar; depois, `not null` para vínculo ativo por gatilho) |
| `usuarios` | `+ empresa_ativa_id`; entra na lista do `prevent_privilege_escalation` (só muda pela RPC). **Também entram `impersonando_expires_at` e `filial_atual_id`**, que hoje não são protegidos |
| RLS | SELECT membro da empresa; escrita **só RPC** (`cargo_salvar`, `cargo_apagar`, `usuario_cargo_trocar`), todas com `tem_permissao('equipe.cargos')` e auditadas. Uma política por comando, sem `for all` |
| `tem_permissao(p text) → boolean` | `STABLE SECURITY DEFINER`. Superadmin impersonando a empresa atual: sempre (auditado pela plataforma). Cargo `sistema` (Dono): sempre. Senão: existe a linha no cargo do vínculo ativo em `get_empresa_id()` |
| `limite_permissao(p text) → numeric` | Dono = `null` (sem limite); sem a permissão = 0 |
| Cargo Consulta (decidido 25/11, Q2) | `core.ver_leads_outros`, `core.ver_vendas_outros`, `core.ver_relatorios` (relatórios sem custo), `lojas.ver_rede`. **Sem** `core.ver_financeiro`, sem `estoque.ver_custo`, sem nenhuma escrita |
| Catálogo inicial | `core.ver_financeiro`, `core.ver_relatorios`, `core.ver_leads_outros`, `core.ver_vendas_outros`, `core.excluir`, `core.exportar` (as 7 de hoje, sem `descontoMax`, que não tem efeito e volta no §F da Fase 2); `estoque.ver_custo`; `estoque.preco_variante`, `estoque.preco_proprio` (D6, aplicadas na 1.2); `auditoria.ver`; `equipe.cargos`; `config.editar`; `lojas.ver_rede` |
| Semente por empresa | cargos Dono (`sistema`, papel `owner`), Administrador (papel `admin`: tudo menos `equipe.cargos`), Vendedor, Técnico, Consulta (`somente_leitura`, papel `vendedor`, sem `estoque.ver_custo`). Cada vínculo recebe o cargo do seu papel. As 7 permissões salvas em `empresas.permissoes` viram as linhas dos cargos Vendedor e Técnico **com o valor que a empresa salvou** (o `verVendasOutros` perdido pelo bug fica com o padrão, que é o que a empresa vê hoje). Gerente e Caixa **não** são semeados agora: entram com o PDV v2 (1.4/1.5), quando houver o que eles fazem |
| Ponte das permissões antigas | gatilho em `empresas.permissoes`: enquanto a tela velha estiver no ar, salvar lá atualiza as linhas dos cargos Vendedor/Técnico. Sai na 1.1g |
| `sessao_pode_escrever()` | mesma assinatura; passa a ser "empresa ativa **e** cargo do vínculo sem `somente_leitura`". As políticas restritivas que já existem fazem o resto: a Consulta fica só leitura em todas as tabelas da empresa, sem mexer em nenhuma política |
| `filiais_visiveis()` | mesma assinatura; o ramo "vê a rede" passa a ser `papel in (owner, admin) **ou** tem_permissao('lojas.ver_rede')`. Diverge da especificação ("cria a permissão sem mudar a função"): sem isso a Consulta, de papel `vendedor`, veria só uma loja. Para quem existe hoje o resultado é idêntico |
| Dono nunca falta | gatilho em `empresa_usuarios`: recusa tirar o último vínculo ativo do cargo Dono (troca de cargo, desativação, exclusão) com `EMPRESA_SEM_DONO` |
| Consulta fora da distribuição | gatilho: vínculo em cargo `somente_leitura` fica com `participa_roleta = false`; `lib/roleta.ts`, `sem_dono`, esteira e roteamento do pós-venda passam a ignorar `somente_leitura` (conferido no teste) |
| `get_empresa_id()` | mesma assinatura, ordem da especificação: (1) impersonação válida; (2) `empresa_ativa_id` com vínculo ativo; (3) o único vínculo ativo; (4) `null`. Hoje ninguém tem dois vínculos ativos: resultado idêntico para todos |
| `trocar_empresa_ativa(p_empresa)` | confere o vínculo, grava `empresa_ativa_id`, limpa `filial_atual_id`, audita |
| `sessao_contexto()` (nova) | uma chamada devolve empresa, loja, cargo, permissões, `somente_leitura`, `plataforma` (superadmin impersonando) e `tem_mais_de_uma_empresa`. **Substitui os `.single()` em `empresa_usuarios`**: é a correção do 406 |
| Plataforma (superadmin) | gatilho em `empresa_usuarios` recusa vínculo para conta `is_super_admin` (fecha o "resíduo aceito" de 03/09: impersonando, ele criava vínculo para si). `set_impersonation` e `encerrar_impersonacao` passam a gravar também em `auditoria_eventos` da empresa (`acao = 'plataforma_entrou'/'plataforma_saiu'`), para o dono ver |
| Escrita da plataforma | gatilho genérico `AFTER INSERT/UPDATE/DELETE`, uma linha por comando, nas tabelas com `empresa_id` (a mesma lista das políticas de somente leitura): se a sessão é de superadmin impersonando, grava `auditoria_eventos` com `impersonado_por`, tabela, id e antes/depois. Para os outros usuários o custo é uma leitura por chave primária em `usuarios` e sai; para service_role (webhook, cron) sai na primeira linha |
| `auditoria_eventos` | política SELECT troca `is_empresa_admin` por `tem_permissao('auditoria.ver')` |

**Volta da B1:** devolve os corpos de `get_empresa_id`, `filiais_visiveis`, `sessao_pode_escrever`, `prevent_privilege_escalation`; remove gatilhos; tabelas e colunas novas ficam (ninguém mais grava pelo app velho). Arquivo `volta-cargos-permissoes.sql` com os corpos atuais copiados.

**Decisão pendente D-A1 (LGPD), antes do código da auditoria da plataforma:** a auditoria não guarda dado pessoal de cliente em texto (nome, telefone, CPF, e-mail, endereço, observação livre), só identificadores e os nomes dos campos alterados, porque a tabela é imutável e um pedido de exclusão não conseguiria apagá-los. O gatilho genérico de "escrita da plataforma" (acima) grava `{tabela, id, campos_alterados}` e só os valores de campos não pessoais; lista de campos pessoais por tabela no código, com teste. Registrada no roteiro §7.

**Como ficou no código (25/11, local, sem deploy; migração `20261125000700_cargos_permissoes`, commits `ba24d8fc`, `e3289961`):**
- **406 reproduzido no local antes da correção** (gateway local: `GET /rest/v1/empresa_usuarios?select=role,empresa:empresas(...)&usuario_id=eq.<superadmin>&ativo=eq.true` → **406**, superadmin com a impersonação vencida abrindo `/dashboard`). Depois da correção, o mesmo caminho vai ao painel do superadmin sem nenhuma resposta 4xx/5xx.
- Contexto da sessão em `lib/sessao.ts` (servidor) e `lib/permissoes-cargo.ts` (parte pura, que pode chegar ao navegador: `lib/escopo.ts` entra no painel; a conferência visual pegou o erro de importar `next/headers` por esse caminho).
- O cargo de cada pessoa é trocado na própria tela de **Cargos** (seção Pessoas), não na tela de Equipe; a Equipe continua igual até ser tocada.
- **Relatórios** e **Executivo** passam a `core.ver_relatorios`, **Financeiro** a `core.ver_financeiro`, na página (antes, dono/admin pelo papel). Na JM isso não muda ninguém hoje (vendedores com as duas desligadas). A Consulta abre Relatórios (Q2).
- **Relatórios sem custo já na 1.1b** (pedido de 25/11): sem `estoque.ver_custo`, a página nem pede `valor_custo`/`lucro` ao banco (chegam `null` ao navegador) e somem o KPI "Lucro total", a coluna Lucro, a coluna Lucro do CSV de vendas e a coluna Custo do CSV de estoque (que deixa de pedir `preco_custo`). Sem `core.ver_financeiro`, o livro-caixa nem é lido (aba e "Exportar Financeiro" somem). Sem `core.exportar`, somem a aba Exportar e o botão CSV. Conferido no local com uma Consulta e um Vendedor com "Ver Relatórios" (carga RSC sem custo nem lucro) e o Dono como contraprova (vê tudo). A 1.1e reforça no banco. **Fora daqui, ainda com lucro para quem vê vendas:** Dashboard e Histórico (são pontos do D9, tratados nos tempos do custo).
- **Administrador edita cargos** (matriz de acesso de 25/11: ele editava a tela antiga de Permissões; sem isso perderia). Recebe `equipe.cargos` de fábrica, com as travas no banco para quem não é Dono (`sessao_e_dono()`): não concede permissão que não tem (`cargo_salvar` e `usuario_cargo_trocar`); não põe nem tira ninguém do cargo Dono e não muda o cargo de quem também edita cargos (`SO_DONO`, a mesma hierarquia da Equipe de hoje); **ninguém troca o próprio cargo** (`PROPRIO_CARGO`, nem o Dono). A tela de Cargos espelha as travas. Testado em `teste-cargos` (t8b/t8c) e `cargos-local`.
- **Produção (25/11, ~20:50 UTC):** a 0700 entrou em **duas partes**: `20261125205020 cargos_permissoes` (tudo menos o laço final) e `20261125205029 cargos_permissoes_plataforma_gatilhos` (os 113 gatilhos `zz_plataforma_auditar`, sem `drop trigger`, só onde não existia). A 1ª tentativa, num bloco só, deu **deadlock** com o app (a transação segurava `usuarios` com o `add column` enquanto pedia `AccessExclusiveLock` em `chamadas` pelo `drop trigger if exists`; uma consulta do app tinha `chamadas` e esperava `usuarios`) e foi desfeita inteira (conferido: nada aplicado, vínculos com o mesmo md5). As duas partes rodaram com `lock_timeout` (5 s / 3 s). Efeito final igual ao arquivo do repo. **Lição para as próximas:** DDL em muitas tabelas fica numa migração separada da que mexe em `usuarios`/`empresa_usuarios`, sem `drop` desnecessário e com `lock_timeout`.
- **Ritual local não chama produção** (pendência de 25/11): `scripts/teste-local.sh` troca, na cópia das migrações, `https://crm-saas-beta.vercel.app` pelo app local (`TESTE_LOCAL_APP`, padrão `http://host.docker.internal:3011`) e recusa o banco se sobrar `vercel.app`/`supabase.co` em `cron.job` ou em função de `public` (as 3 rotinas com URL: lgpd-exportacoes-limpar, entrada-parada, resgatar-midias).
- O **seletor de loja** e `/api/filial/selecionar` passam a `lojas.ver_rede` (Dono, Administrador e Consulta de fábrica): a Consulta escolhe a loja ou a rede.
- Auditoria da escrita da plataforma (gatilho `zz_plataforma_auditar` nas tabelas da empresa) grava **só tabela, id e os nomes dos campos alterados** (D-A1 já respeitada). O fim da impersonação **por prazo vencido** não gera linha de "saiu" (só a saída pelo botão).
- Trava `scripts/check-papel.mjs` no `npm run build`: **219** checagens de papel (só pode cair até a E1.6).
- Verde: ritual do zero (todos os `teste-*.sql`, inclusive `teste-cargos`; 44 de integração, com `cargos-local`), `npm test` 643, `npm run check`, build. Conferência visual local: Cargos (lista, editor, troca de cargo), Consulta (faixa, rede, Relatórios abre, Financeiro não), Escolha a empresa e seletor de empresa, auditoria das ações.

### 2.4 App

| Área | Arquivos | Mudança |
|---|---|---|
| Contexto da sessão | `lib/sessao.ts` (novo), `lib/owner.ts`, `lib/supabase/server.ts`, `lib/escopo.ts` | um helper `contextoDaSessao()` (uma chamada a `sessao_contexto()`, cache por request) e `exigirPermissao(p)` / `exigirPermissaoApi(p)`. `resolveEmpresaERole` passa a usar o contexto (com o filtro de empresa que falta hoje). `getEmpresaId()` sem `limit(1)` solto |
| **406** | `app/(dashboard)/layout.tsx:54-125`, `api/equipe/atualizar-usuario`, `criar-usuario`, `remover-usuario` | layout usa o contexto; as rotas de equipe trocam `.single()` por leitura do contexto e `maybeSingle()` com 404 limpo para o alvo |
| As 7 permissões antigas | os 11 importadores de `lib/permissoes.ts` (`layout`, `leads`, `gestao-leads`, `historico`, `orcamentos`, `api/exportar`, `lib/assistente/acesso.ts`, `lib/escopo.ts`, `entrar/page`) | passam a `tem_permissao` pelo contexto. **`core.ver_financeiro` e `core.ver_relatorios` passam a valer na página e na rota** (`financeiro/page`, `relatorios/page`, `executivo`), não só no menu. `core.excluir` passa a valer nas rotas de exclusão (lista na implementação; hoje nenhuma confere) |
| Cargos | `configuracoes/(admin)/cargos/page.tsx` + `components/modules/configuracoes/cargos-view.tsx` (novos) | lista com quantas pessoas; editor com permissões agrupadas por módulo (só módulos ligados), limite nas de limite, "duplicar cargo"; Dono travado |
| Permissões (antiga) | `configuracoes/(admin)/permissoes/*`, `api/permissoes/route.ts` | página vira redirecionamento para Cargos; rota antiga fica respondendo (ponte) até a 1.1h |
| Equipe | `components/modules/equipe/equipe-view.tsx`, `api/equipe/*` | coluna e seletor de cargo (troca por `usuario_cargo_trocar`, auditada); "criar usuário" escolhe cargo; papel deixa de ser escolhido |
| Empresa ativa | `components/layout/seletor-empresa.tsx` (novo, ao lado do seletor de loja, só com mais de um vínculo), `app/escolher-empresa/page.tsx` (novo: quando `get_empresa_id()` é nulo) | |
| Consulta | `components/layout/aviso-somente-leitura.tsx` (novo) + as telas de escrita principais (leads, conversa, estoque, PDV) | faixa "Conta de consulta: só leitura"; botões de gravar escondidos pela flag do contexto; o banco já recusa de qualquer jeito |
| Plataforma | `lib/superadmin-preview.ts`, `api/superadmin/empresas/[id]/impersonar`, `components/superadmin/impersonation-banner.tsx`, `app/(dashboard)/layout.tsx` | navegação de página durante a impersonação grava `acao = 'plataforma_acessou'` (rota, no máximo uma por rota por minuto); Auditoria ganha o filtro "acessos da plataforma" |
| Rotas com service_role que gravam dado da empresa | as que hoje conferem só papel (lista do mapa A1) | passam a conferir `somente_leitura` e a permissão; a RLS não protege rota com chave de serviço |
| Tipos | `types/database.gerado.ts` | regenerado |

### 2.5 Testes

- `teste-cargos.sql` + esperado: **matriz cargos × ações** (Dono, Administrador, Vendedor, Técnico, Consulta, superadmin impersonando e sem impersonar) × (ler vendas de outro, ler leads de outro, exportar, gravar negócio, gravar estoque, editar cargo, ler auditoria, ver rede de lojas) com sessão simulada; empresa nunca sem Dono; superadmin não cria vínculo; `get_empresa_id` com dois vínculos e `empresa_ativa_id`; Consulta recusada em INSERT/UPDATE/DELETE de três tabelas amostra e fora da roleta; escrita da plataforma auditada com `impersonado_por`.
- `tests/integracao/cargos-local.test.ts`: as rotas com sessão real de cada cargo (os usuários `@teste.invalid` da semente ganham um Consulta e um segundo vínculo).
- e2e `laboratorio-406-e2e.mjs`: o fluxo do Laboratório (entrar, trocar de empresa de teste, impersonação vencida, sair) sem nenhuma resposta 406 na rede.
- Ritual inteiro verde; `npm test`, `npm run check`, `next build`.

### 2.6 Aceite da 1.1b

1. Matriz de RLS verde (teste acima) e a mesma matriz pelas rotas (integração).
2. **406 reproduzido no local antes da correção** e zero 406 depois, no e2e e nos logs da produção nos 15 min após o deploy (hoje: 1 a 2 por dia em `empresa_usuarios`).
3. `get_empresa_id()` determinístico: com dois vínculos, devolve a empresa ativa; sem empresa ativa e com dois vínculos, devolve nulo e o app manda para "Escolha a empresa".
4. Para **todos** os usuários de produção, `get_empresa_id()`, `filiais_visiveis()` e o papel derivado iguais antes e depois (conferência por SQL na própria migração).
5. As 7 permissões com o mesmo efeito de hoje para cada usuário (comparação antes/depois no local com a cópia de dados fictícia da semente), e `verVendasOutros` salvando de verdade na tela de Cargos.
6. Superadmin: entrar e sair pelo Laboratório aparece na Auditoria da empresa; uma escrita durante a impersonação aparece com `impersonado_por`; não aparece em Cargos nem na Equipe de nenhuma empresa.
7. Conferência visual: Cargos, Equipe, seletor de empresa (usuário de teste com dois vínculos), "Escolha a empresa", faixa de Consulta, Auditoria com o filtro de plataforma.
8. Smoke na Demonstração pelo Laboratório (sem 406), criar e apagar um cargo, trocar o cargo de um usuário de teste e voltar.

---

## 3. Entrega 1.1c: cargos da JM (dados, com ok do Lucas)

Gravação na JM: **só com ok explícito** (regra de 25/11). Script único com simulação, como as triagens do pós-venda.

**Arquivo:** `supabase/scripts/ops/cargos-jm.sql` (simula por padrão, numa transação desfeita, e imprime o antes/depois) + `volta-cargos-jm.sql`. Não é migração do repositório: é dado da JM, que não pode estar no código (regra dos parâmetros universais).

**Antes de tudo: a "JM Store" é só de consulta, e ninguém pode estar vendendo por ela** (Q1, 25/11). Checagem obrigatória, só leitura, últimos 30 dias:

| O quê | Onde |
|---|---|
| Vendas lançadas, concluídas ou com ela como vendedora | `vendas_vendas.usuario_id`, `vendedor_id`, `concluida_por` |
| Pagamentos dessas vendas | `vendas_pagamentos` pela `venda_id` (a tabela não guarda quem recebeu) |
| Negócios criados, movidos, ganhos ou em que é responsável | `negocio_historico.por_usuario`, `eventos.por_usuario`, `negocios.responsavel_id` |
| Mensagens enviadas pela conta | `mensagens.usuario_id` |
| Entradas no sistema (dias e horários) | `acessos` (sessões: entrada, último sinal, saída) |
| Em que loja | `filial_id` das vendas e negócios acima |

- **Se houver qualquer gravação: PARAR e mostrar ao Lucas antes de transformar a conta em Consulta**, com a lista por loja, dia e horário. O banco não registra o computador: a loja sai da `filial_id` das gravações, e quem usa sai da conversa com a equipe.
- Cada pessoa que vende pela conta recebe **conta própria antes da 1.1c** (criada pelo Lucas ou pelos sócios na tela de Equipe; eu não crio conta).
- Só com a lista vazia, ou com cada pessoa já na sua conta, a 1.1c segue.

| Passo | O quê | Conferência |
|---|---|---|
| 0 | Leitura do dia: vínculos ativos da JM, quem é `owner`, ids de Matheus, Eduardo, "JM Store" e "Meta Reviewer"; negócios e conversas em que a Meta Reviewer é responsável (24/11: 3 negócios, 1 conversa) | igual ao esperado, senão para |
| 1 | Backup `public._backup_cargos_jm_<data>` (vínculos, negócios e conversas afetados), RLS ligada, sem grant | contagem + digital |
| 2 | Matheus e Eduardo → cargo **Dono** (papel derivado `owner`) | 3 Donos por um instante |
| 3 | "JM Store" → cargo **Consulta** (só leitura, sem custo, sem Financeiro, `participa_roleta = false`) **depois** do passo 2 e só com a checagem de 30 dias vazia | 2 Donos; o gatilho de "nunca sem Dono" garante a ordem |
| 4 | "Meta Reviewer": os 3 negócios e a conversa → responsável **Matheus** (com `negocio_historico` registrando a troca); vínculo `ativo = false` | 0 negócios/conversas abertos com ela; as 2 mensagens enviadas ficam como histórico |
| 5 | Auditoria de cada mudança (`origem = 'cargos-jm'`) | linhas na Auditoria |
| 6 | Vendedores ativos (Pedro, Luis Felipe, Milena, Emerson, Vanessa) → Vendedor (já feito pela semente; só confere) | — |

**Efeitos colaterais conferidos na simulação:**
- `posvenda_administradores` (papel `admin`, senão `owner`): hoje devolve Matheus e Eduardo (admin); depois devolve os `owner`, que serão Matheus e Eduardo. Mesmo resultado; o teste confere.
- Roleta, esteira e liberação diária: a "JM Store" não entra em nenhuma (era `owner`, já ficava fora; o teste confere que como Consulta continua fora).
- A "JM Store" perde a escrita **no mesmo instante**; por isso a checagem de 30 dias vem antes.

**Aceite da 1.1c:** checagem de 30 dias vazia (ou cada pessoa já com conta própria); 2 Donos ativos; JM Store Consulta sem conseguir gravar (tentativa simulada recusada com `SOMENTE_LEITURA`); Meta Reviewer inativa, sem negócio ou conversa aberta; contagem de negócios e conversas da JM igual antes e depois; Auditoria com as mudanças; volta testada no local.

### 3.1 Execução (25/11/2026)

- **Passo 1 em produção (22:52 UTC, ok do Lucas):** Matheus e Eduardo foram de Administrador (cargo 2, `admin`) para Dono (cargo 1, `owner`). Backup `public._backup_empresa_usuarios_1_1c_donos_20261125` (15 vínculos da JM). Só essas 2 linhas mudaram (`cargo_id` e `role`), com 2 linhas em `auditoria_eventos` (origem `script 1.1c`). A matriz dos 18 vínculos é igual à da 1.1b, exceto o papel dos dois; ambos seguem com 13/13 permissões, as mesmas lojas e a mesma escrita. `posvenda_administradores(1)` = `{Matheus, JM Store, Eduardo}`, `eh_dono` verdadeiro. Volta: `conciliacao-pedidos/etapa-1.1c-20261125/1-promover-donos-volta.sql`.
- **Passo 2 (só leitura):** a checagem da JM Store **não está vazia**: mensagens enviadas, ações em negócios e acessos quase diários. Pelo §3, o passo 3 espera a decisão do Lucas. As ações em lote em nome dela (24/11 16:28, 25/11 08:11) são a esteira de devolução (`lib/esteira.ts`), que roda com a sessão de quem abre `/leads` e grava `por_usuario = auth.uid()`.

### 3.2 Pendências registradas na 1.1c (sem execução)

| # | Pendência | Estado |
|---|---|---|
| P1 | **Pós-venda: responsável de reserva configurável por loja**, que pula ausentes, em vez de cair em `posvenda_administradores` (Administradores, senão Donos). Parâmetro por loja via `config_valor`, sem nome de pessoa no código | **pendente** (confirmado em 26/11) |
| P2 | **Troca de cargo de um Dono por outro Dono:** fica na Auditoria (já fica: `usuario_cargo_trocar` audita) **e gera aviso ao Dono afetado** (falta o aviso) | a fazer na entrega mais natural (notificações da equipe ou a próxima que mexer em Cargos) |
| P2-D | **Decisão (26/11): "dono é dono".** Um Dono pode mudar o cargo de outro Dono (como já está no banco: SO_DONO e PROPRIO_CARGO). A troca fica na Auditoria e o Dono afetado recebe aviso (P2) | **decidido** |
| P3 | **ZapIntel exclui `owner` do reconhecimento pelo nome** (`zapintel_conversa_calc`, CTE `US`: `eu.role <> 'owner'`, herdado do baseline). Depois do passo 1, as apresentações de Eduardo e Matheus pelo celular ("aqui é o Eduardo") deixam de identificá-los: nos 30 dias até 25/11 foram 100 mensagens em 95 conversas (Eduardo) e 19 em 16 (Matheus). Essas mensagens e as seguintes passam ao apresentador anterior (até 72 h), ao responsável do negócio ou a "Não identificado". Direção, contagem do cliente e casamento venda × conversa não mudam. Trocar o critério por um explícito (ex.: excluir só contas de Consulta ou uma marca "não atende") | **resolvida** (marca "atende clientes", migração `20261125234314`, app `c6df8245`, 25/11; §3.3) |
| P4 | **Esteira grava em nome de quem abre `/leads`:** com a JM Store em Consulta, a varredura dela passa a ser recusada pela RLS; a devolução continua quando um vendedor ou Dono abrir a tela. **Observação do Lucas (25/11):** a esteira de devolução deveria rodar como **rotina do sistema** (pg_cron, com registro em `rotinas_execucoes` da 1.1r), não em nome de quem abre a tela de Leads. Avaliar na etapa em que a esteira for revisada | **pendente**: a devolução vira rotina do sistema, com registro na 1.1r, na etapa em que a esteira for revisada |
| P5 | **ZapIntel com muito "Não identificado":** 15.943 mensagens enviadas em 30 dias sem autor (mais da metade das 28.432; cache de 25/11 23:43 UTC). **Causa:** uso do WhatsApp pelo celular em coexistência (cerca de 95% das conversas), que chega sem autor. **Tratamento:** adoção do CRM (incentivo pelo painel do vendedor na fase 2) e orientação à equipe para se apresentar no início das conversas. Não é correção técnica. **Enquanto isso,** os números do ZapIntel por vendedor não servem para avaliação individual; os totais por loja e da empresa são confiáveis (26/11) | **pendente**: adoção do CRM e orientação à equipe |

### 3.3 Decisões do Lucas antes do passo 3 (25/11/2026)

1. **ZapIntel: marca "atende clientes" por pessoa** (resolve a P3). Migração `20261125000800_atende_clientes`: `empresa_usuarios.atende_clientes` (padrão ligada, inclusive Donos); o gatilho do cargo força desligada em cargo de Consulta (como já fazia com a roleta), e sair da Consulta não religa sozinho; `zapintel_conversa_calc` reconhece pelo nome quem está ativo e com a marca, em vez de "todos menos `owner`". Tela de Equipe: caixa "Atende clientes" no bloco "Distribuição e atendimento" e selo "Não atende clientes"; grava por `/api/equipe/roleta`. A atribuição do ZapIntel é calculada na hora; o que fica guardado é só o cache `zapintel_conversa_cache` (6 chaves da JM, gerado às 05:00 UTC de 25/11, **antes** da promoção, e não recalculado depois). "Reatribuir" = recalcular o cache depois da migração, com backup das 6 linhas e conferência por pessoa antes e depois. Teste: `teste-atende-clientes.sql`. Volta: `supabase/scripts/volta/volta-atende-clientes.sql`.
2. **JM Store: cargo temporário "Balcão compartilhado (temporário)"**, não Consulta ainda: papel_base `vendedor` (escreve em leads, negócios e mensagens como o Vendedor), permissão só `lojas.ver_rede` (atende nas duas lojas), sem custo, financeiro, cargos e exportação; `participa_roleta = false`; sai da reserva do pós-venda (que só olha admin e owner). Script `conciliacao-pedidos/etapa-1.1c-20261125/2-balcao-compartilhado.sql` (+ simulação e volta). **Consulta só quando cada pessoa que usa a conta tiver login próprio; nesse momento, trocar também a senha da JM Store.**
3. **Meta Reviewer:** negócios 2628 (ganho) e 7266 (aberto, inativo) e a conversa 2958 ao Matheus (`negocio_atribuir('transferir')`, histórico e auditoria); vínculo desativado. O pós-venda do 2628 (jornada 1330, passo 1882 em 09/08/2027) está com o Pedro pela roleta, porque ela é conta de serviço, e não muda. Script `3-meta-reviewer.sql` (+ simulação e volta).

---

### 3.4 Auditoria da plataforma nas rotas com chave de serviço (26/11/2026)

**Achado do smoke de 25/11:** as gravações da plataforma por rota com chave de serviço não geravam linha de escrita na Auditoria. Exemplo: superadmin mudando a distribuição e atendimento de alguém. Só apareciam entrou, acessou e saiu. Motivo: com a chave de serviço, `auth.uid()` chega nulo ao gatilho.

**Correção, num ponto só:**
- **No app:** `createServiceClient()` e `rastrDb()` usam o `fetch` de `lib/supabase/usuario-na-escrita.ts`.
  - Nas escritas (POST, PATCH, PUT, DELETE) feitas dentro de uma requisição com sessão e com o cookie de impersonação, ele manda o id do usuário no cabeçalho `x-nexus-usuario`.
  - O cookie é só uma pista para não custar nada à equipe. O id é conferido em `auth.getUser()`, uma vez por requisição.
- **No banco:** a função `plataforma_auditar_escrita`, migração `20261126000100`, aceita o cabeçalho só de `service_role` e só se o id for de um superadmin com impersonação ativa.
  - Grava como antes: tabela, id e nomes de campos (D-A1), com origem `gatilho servico`.
  - Ignora a própria linha do superadmin em `usuarios`.
- **Gatilho novo:** em `empresas`, `diagnostico_canais` e `assistente_config` (0100), e em `usuarios` (0200, separada pela lição do deadlock).
- **Trava:** `npm run check` (`check:servico`) recusa cliente com a chave de serviço criado fora desses dois pontos.

**Inventário completo das rotas e funções:** `docs/etapa-1.1-auditoria-plataforma-rotas.md`.

**Testes:**
- `teste-auditoria-plataforma-servico.sql`;
- `tests/usuario-na-escrita.test.ts`;
- `tests/integracao/plataforma-servico-local.test.ts`: rotas reais `/api/equipe/roleta`, `/api/empresa/fuso` e `/api/empresa`, mais os negativos.

**Em produção (26/11/2026):**
- **Migrações:** `20261126101826 auditoria_plataforma_servico` e `20261126101836 auditoria_plataforma_usuarios`, aplicadas separadas.
  - IOwait em 0,08%, nenhuma atividade da JM nos 10 minutos antes.
  - A função tem o mesmo md5 do local (`b82588aa…`). São 117 gatilhos `zz_plataforma_auditar`.
- **App:** `7b33d924` = `dpl_27hbJMjgwGZcCMfjWt21RZnR3jFv`, READY às 10:23 UTC.
  - O primeiro build Turbopack, de `3c135453`, recusou `next/headers` no grafo do navegador. A correção é o gancho ligado no `instrumentation.ts`.
- **Conferência na produção:** simulação desfeita na Demonstração.
  - Escrita com chave de serviço e o cabeçalho do superadmin gerou 1 linha (`empresa_usuarios:25`, `campos: [atende_clientes]`, origem `gatilho servico`).
  - Sem o cabeçalho, nenhuma linha.
- **Logs desde as 10:17 UTC:** nenhum 4xx/5xx, Vercel sem erro, nenhum deadlock.
- **Falta:** o smoke pela tela, que precisa do login do Lucas no navegador do app (a sessão tinha expirado).
- **Volta:**
  - app: `dpl_7EJTXHc8CzY7oHPr4q5MBAgxWXwg`;
  - banco: `volta-auditoria-plataforma-servico.sql`, com o gatilho de `usuarios` saindo antes.

**Limite conhecido:** sem o cookie de impersonação (o navegador o apagou, mas o banco ainda está impersonando), a escrita não é auditada. Os dois caminhos de entrada (impersonar e laboratório) gravam o cookie com o mesmo prazo do banco.

### 3.5 Decisões e pendências de 26/11/2026

- **Conta "JM Store":** fica como está, Dono e com "atende clientes" ligada. É usada só pelo Lucas, para acessar a JM sem impersonação. O item 2 (Balcão compartilhado) foi **cancelado** e arquivado em `conciliacao-pedidos/etapa-1.1c-20261125/cancelado-item2-balcao/`, sem nada gravado. Os negócios 5933 e 6047 continuam com ela.
- **Meta Reviewer:** gravado em 26/11 às 09:32 UTC.
  - Os negócios 2628 e 7266 e a conversa 2958 foram para o Matheus, com histórico "transferir" e auditoria. O vínculo foi desativado.
  - Os totais da JM ficaram iguais (4.006 negócios e 4.462 conversas).
  - A jornada 1330 continua com o Pedro.
  - Backup: `public._backup_meta_reviewer_1_1c_20261125`. Volta: `3-meta-reviewer-volta.sql`.
- **"Dono é dono":** um Dono pode mudar o cargo de outro Dono. A troca fica na Auditoria e o Dono afetado recebe aviso (P2, na entrega mais natural).
- **Etiqueta (Niimbot B2 Pro):** impressora testada pelo Lucas e funcionando com a branch `spike/niimbot-b2pro`. A etiqueta entra **logo depois da 1.2**, porque depende do preço efetivo.
- **P1** continua pendente. **P3** está resolvida. **P4** fica pendente para a revisão da esteira. **P5** é nova (tabela da §3.2).
- **Correção (26/11):** são **7** encomendas abertas na JM, não 8. A 173 foi entregue em 25/11, com o pagamento. Ficam as 31, 37, 43, 54 e 92, sem pagamento, e as 121 e 122, com sinal.
- **Conciliação de vendas antigas:** plano curto em `docs/conciliacao-vendas-antigas-plano.md`. A implementação será liberada depois.

---

## 4. Entregas 1.1d a 1.1g: custo protegido em quatro tempos

### 4.1 Onde o custo está hoje (mapa da `main` 5a625392)

**Colunas:** `estoque_unidades.preco_custo`, `estoque_unidades.custo_reparo`, `vendas_vendas.valor_custo` (padrão 0) e a coluna gerada `vendas_vendas.lucro = valor_venda − valor_custo`, `compras_pedidos.valor_total` (única coluna de custo em `compras_*`; não há tabela de itens de compra), `itens.custo` (espelho, só o gatilho `estoque_item_sync` grava; ninguém no app lê).

**RLS:** `tenant_isolamento` (`ALL`, empresa + loja) em `estoque_unidades`, `vendas_vendas`, `vendas_pagamentos`, `compras_pedidos`; `itens` com 4 políticas por empresa. Nenhuma olha papel. `authenticated` tem `select/insert/update/delete`.

**Os 17 pontos do §B.1, com o arquivo que muda no tempo 2:**

| # | Ponto | Leitura hoje | Arquivos |
|---|---|---|---|
| 1 | /estoque: lista, entrada, margem, lote | `select *` das unidades, `...u` no prop; insert com `.select()` devolve a linha | `estoque/page.tsx:19-29,81-93,131`; `estoque-view.tsx:38,45,421,863-867,903,941-946,1144-1167` |
| 2 | `unidade-modal` | custo, reparo, margem com outra fórmula | `unidade-modal.tsx:24,33,99-100,120,150-157,288-311` |
| 3 | /catalogo "Custo total" | `preco_custo, custo_reparo` explícitos | `catalogo/page.tsx:51-55,104-105`; `catalogo-view.tsx:53-54,369` |
| 4 | PDV: unidades e reservas; o navegador grava `valor_custo` | `pdv/page.tsx:23,53,59-60,146,163`; `pdv-view.tsx:36,59,295-299,495,518-520,543-545` |
| 5 | PDV: vendas recentes e encomendas | `pdv/page.tsx:67-68,87-88,182-187,229` |
| 6 | Encomendas abertas: editar custo, "lucro 100%" | `encomendas-abertas.tsx:40,83,311-313,323,429-449,564,582` |
| 7 | Histórico: lucro, card, CSV sem conferir `exportar` | `historico/page.tsx:40,61,97`; `historico-view.tsx:29,88,93,223,272,302,308` |
| 8 | Painel: lucro e margem | `lib/painel/metricas.ts:66-84,130,155,383`; `dashboard-view.tsx:92-106,279,311` |
| 9 | Relatórios: lucro, CSV de vendas, **CSV de estoque lido pelo navegador** | `relatorios/page.tsx:24,55,84-90`; `lib/vendas-periodo.ts:29`; `relatorios-view.tsx:31-37,115,157-175,254,259,311-313` |
| 10 | Compras: `valor_total`, "investido" | `compras/page.tsx:9` (`select *`); `compras-view.tsx:18,98-108,119,215` |
| 11 | Avaliações: valor ofertado | `avaliacoes/page.tsx:13`; `avaliacoes-view.tsx:23,143` — **fica visível** (proposta ao cliente, decidido 24/11); o insert da unidade em `api/avaliacoes/route.ts:113-121` passa ao satélite |
| 12 | Troca: "margem para a loja" | `pdv-troca.tsx:233`, `config-troca-card.tsx:70-73`, `lib/troca-referencia.ts` — compara oferta com a tabela de preços, **não** lê coluna de custo; o texto passa a aparecer só com `estoque.ver_custo` |
| 13 | Configurações → Usuários: `vendas_comissoes` | **não tem custo** (conferido). Fica para `comissao.ver_todas` na Fase 2 |
| 14 | Assistente: lucro e margem | `lib/assistente/ferramentas.ts:477-606`, `acesso.ts:27-56` — `verFinanceiro` vira `estoque.ver_custo` |
| 15 | Documentos `{{trocas}}` | `garantia/page.tsx:77-89,103` lê `preco_custo` da unidade de troca → passa a ler `vendas_pagamentos.valor_pago` da troca (C2 do roteiro) |
| 16 | Orçamento por link | `api/orcamento/[token]/route.ts:88-99,174-175,206-214` (service role) — o custo da venda passa a vir do gatilho no banco; o congelamento no orçamento (C1) é da 1.4 |
| 17 | Espelho `itens.custo` | `estoque_item_sync` (`20261105000600_drop_views_lote4.sql:19-38`) deixa de copiar |

**Fora da lista, também com custo:** `lib/lgpd/exportacao.ts:38,43,78` (`select *` de vendas no ZIP do superadmin); `api/compras/receber/route.ts:21-22,35-41` (cria a unidade com `preco_custo = valor_total` do pedido); `encomenda-form.tsx:279-287,384-398` (pedido com `valor_total` 0 e aparelho do sinal com custo). Scripts de volta antigos `volta-views-lote4.sql` e `volta-views-lote5.sql` recriariam views com custo: são ajustados no tempo 3.

**Gravadores (7 inserts em `estoque_unidades`):** `estoque-view.tsx:941`, `unidade-modal.tsx:120`, `pdv-view.tsx:564` (troca), `encomenda-form.tsx:384` (aparelho do sinal), `api/avaliacoes:113`, `api/compras/receber:35`, `api/orcamento/[token]:88`.

### 4.2 Os quatro tempos (decidido em 25/11, Q3)

A primeira versão deste plano esvaziava a coluna antiga já no tempo 1, e as telas antigas ficariam sem custo também para o Dono até o app novo subir. **Recusado.** A ordem agora:

| Tempo | Entrega | O que muda | Dono | Vendedor e Consulta |
|---|---|---|---|---|
| 1 | 1.1d (banco) | satélites criados e protegidos por `estoque.ver_custo`; gatilho mantém coluna antiga e satélite **iguais nos dois sentidos** | vê custo como hoje (app antigo, coluna antiga) | **nenhuma exposição nova**: satélites e funções novas devolvem nada; a coluna antiga continua como hoje |
| 2 | 1.1e (app) | o app lê e grava só no satélite | vê custo pelo satélite | as telas e rotas deixam de mandar custo; a coluna antiga ainda responde a quem chamar a API direto (exposição de hoje, fechada no tempo 3, na mesma janela) |
| 3 | 1.1f (banco, logo depois da 1.1e) | coluna antiga **vazia para todos**; o gatilho continua, agora só como porta de entrada (grava no satélite e deixa a coluna nula) | vê custo pelo satélite | **zero custo** em qualquer caminho |
| 4 | 1.1g (banco, deploy separado) | remove as colunas antigas e o gatilho-ponte | igual | igual |

"Na mesma janela de trabalho" (tempo 3) quer dizer: a migração do tempo 3 está pronta e testada junto com o app do tempo 2 e é aplicada assim que o deploy do tempo 2 fica `READY` e o smoke passa, sem esperar outro dia. Os portões do banco (backup, digital, IOwait, fora dos minutos 05–15, 10 min sem atividade na JM) valem do mesmo jeito.

### 4.3 Tempo 1 (entrega 1.1d): satélites e sincronia nos dois sentidos

**Migração D1 `<n>_custo_satelites`** (só adiciona; a coluna antiga não muda de valor):

| Objeto | Detalhe |
|---|---|
| `estoque_unidades_custos` | `unidade_id` PK (FK **deferrable initially deferred**, para o gatilho `BEFORE INSERT` gravar o satélite com o id da unidade que está nascendo), `empresa_id`, `filial_id`, `preco_custo` (**nulo = custo pendente**), `custo_reparo`, `custo_origem` (`entrada`, `troca`, `compra`, `avaliacao`, `orcamento`, `informado`, `migracao`), `atualizado_por`, `atualizado_em` |
| `vendas_vendas_custos` | `venda_id` PK (FK deferrable), `empresa_id`, `filial_id`, `valor_custo` (nulo = pendente), `custo_preenchido_em`, `custo_preenchido_por` |
| `compras_pedidos_custos` | `pedido_id` PK (FK deferrable), `empresa_id`, `filial_id`, `valor_total` |
| RLS dos três | SELECT: `empresa_id = get_empresa_id()` **e** loja visível **e** `tem_permissao('estoque.ver_custo')`. Sem grant de escrita para `authenticated`. Para quem não tem a permissão, a junção do PostgREST volta nula, sem erro |
| Cópia | todos os valores das colunas antigas → satélites, sem mudar nenhum. Prova na migração: contagem e soma por empresa iguais; se diferir, aborta |
| Gatilho **antigo → satélite** (`BEFORE INSERT/UPDATE` em `estoque_unidades`, `vendas_vendas`, `compras_pedidos`) | o que o app antigo grava na coluna vai para o satélite, e a coluna **fica com o valor** (como hoje). Insert de unidade: grava o satélite com o id que está nascendo; troca grava o valor oferecido. Update que reenvia o mesmo valor não gera auditoria |
| Gatilho **satélite → antigo** (`AFTER INSERT/UPDATE` nos satélites) | o que o app novo (tempo 2) grava no satélite volta para a coluna antiga, enquanto ela existir. É o que deixa a **volta do app** do tempo 2 para o antigo segura: a tela antiga encontra o custo certo. Proteção contra laço por marca de transação (`nexus.custo_sincronizando`) |
| Custo pendente | entrada **sem** a permissão com valor `0` ou nulo = pendente no satélite (o formulário antigo obriga o campo; o novo o esconde). Na coluna antiga, pendente aparece como nulo. Troca nunca fica pendente |
| Venda de unidade | `vendas_vendas` `BEFORE INSERT` com `unidade_id`: o custo da venda vem **do satélite da unidade** naquele instante (congelado; pendente se a unidade estiver pendente), e o mesmo valor vai para a coluna antiga. O valor que o navegador mandar é ignorado. Sem unidade: o valor recebido, como hoje |
| Edição de custo de venda | só com a permissão; `vendas_valor_guarda` (hotfix) continua recusando venda concluída e roda antes (ordem conferida no teste) |
| `estoque_item_sync` | deixa de copiar `preco_custo` para `itens.custo` (C9) e `itens.custo` fica nulo: ninguém no app lê esse espelho, então não é exposição que o Dono use |
| `estoque_custo_informar(p_unidade, p_custo, p_reparo, p_motivo)` | RPC `SECURITY DEFINER`, exige `estoque.ver_custo`; grava o satélite da unidade; se a unidade está **vendida** com venda de custo pendente e `custo_preenchido_em` nulo, grava **uma vez** o custo da venda e marca `custo_preenchido_em/por`; audita as duas (`acao = 'custo_preenchido_pos_venda'`). Venda já preenchida, ou que nunca esteve pendente: só a unidade muda |
| Guarda do satélite da venda | `BEFORE UPDATE` em `vendas_vendas_custos`: recusa mudar `valor_custo` com `custo_preenchido_em` não nulo, ou de venda concluída sem pendência, por qualquer caminho, inclusive service_role (exceção só com a marca de script `nexus.venda_valor_ajuste`, como no hotfix) |
| `estoque_custos_pendentes(p_filial)`, `estoque_custos_pendentes_resumo()`, `venda_resultado(p_venda)`, `vendas_resultado(p_ids)` | `STABLE`, recusam sem `estoque.ver_custo`. Lista de pendentes por loja (disponíveis e vendidas) e contador; lucro e margem calculados no banco, com custo pendente = "margem desconhecida" (nulo), nunca 100% |
| RPCs de escrita do tempo 2 | `estoque_unidade_criar(p jsonb)` (unidade + satélite numa transação), `venda_custo_ajustar` (só `status = encomenda`, como o H3), `compras_pedido_salvar(p jsonb)`. Criadas aqui, usadas pelo app só no tempo 2 |

**Volta da D1:** remove gatilhos, funções e satélites. As colunas antigas nunca deixaram de ter o valor; nada a restaurar.

**Vendedor lendo custo pela API, tempo 1** (local com sessão real; produção com sessão simulada, só leitura e desfeita, com o id de um vendedor da JM):

| Chamada (token do Vendedor e da Consulta) | Esperado |
|---|---|
| `estoque_unidades_custos`, `vendas_vendas_custos`, `compras_pedidos_custos` | **0 linhas** |
| `estoque_unidades?select=*,estoque_unidades_custos(*)` | junção nula |
| `rpc/estoque_custos_pendentes`, `rpc/venda_resultado`, `rpc/estoque_custo_informar` | recusadas (`SEM_PERMISSAO`) |
| `estoque_unidades?select=preco_custo`, `vendas_vendas?select=valor_custo,lucro`, `compras_pedidos?select=valor_total` | **os mesmos valores de antes da migração** (exposição de hoje, sem nada novo; fecha no tempo 3) |
| `itens?select=custo` | nulo |
| Mesmas chamadas com o token do **Dono** | satélites com os valores; somas iguais às da coluna antiga |

**Aceite da 1.1d:**
1. Prova de somas por empresa (coluna antiga = satélite), antes e depois de cada teste.
2. Tabela acima: nenhuma exposição nova para Vendedor e Consulta; o Dono lê o satélite.
3. **Prova SQL do custo pendente, quatro casos** (§B.1): entrada sem permissão; troca com custo = valor oferecido; venda de unidade pendente preenchida uma vez; segunda alteração sem efeito na venda.
4. **Sincronia nos dois sentidos:** gravar pela coluna antiga aparece no satélite; gravar pelo satélite (RPC) aparece na coluna antiga; sem laço.
5. **O app antigo continua igual**, inclusive para o Dono: e2e atuais do PDV, estoque, encomenda e entrega (`entregar-pagamento-e2e`, `pdv-valor-catalogo-e2e`, `lote2-e2e`) verdes **sem ajuste**; uma venda pelo PDV antigo grava o custo no satélite e na coluna.
6. Nenhuma venda antiga alterada: contagem e soma de `valor_venda`, `valor_custo` e `data_venda` iguais.
7. Empresa 10 (Aletrini): contagens iguais em `estoque_*`, `vendas_*`, `orcamentos_*`, `compras_*` (critério fixo do roteiro §4.1).

**Estado em 26/11/2026: pronta no local, PARADA antes do deploy.**
- **Migração e testes:**
  - migração `20261126000300_custo_satelites`, com a volta em `supabase/scripts/volta/volta-custo-satelites.sql`;
  - teste SQL `teste-custo-satelites.sql`;
  - integração `tests/integracao/custo-local.test.ts`, que é a tabela "Vendedor lendo custo pela API" com sessão real de Vendedor, Consulta e Dono.
- **Onde a implementação difere do texto acima, e por quê:**
  - **Gatilhos AFTER, sem FK adiada:** a coluna antiga vai ao satélite por gatilho AFTER, e o satélite volta à coluna também por AFTER.
    - Assim o `vendas_valor_guarda` (H2) decide antes, e o teste confere a ordem: "Venda concluída não muda de valor" vem do H2.
    - E a FK do satélite pode ser comum (`on delete cascade`).
    - Só a regra do custo pendente e a do custo da venda vindo da unidade são BEFORE, porque mudam a linha que está entrando.
  - **Escrita na coluna antiga não é recusada no tempo 1.** O app antigo grava custo (o vendedor também, nas encomendas), e recusar quebraria o app no ar.
    - A permissão vale nas funções novas: `estoque_custo_informar`, `venda_custo_ajustar`, `estoque_unidade_criar` e `compras_pedido_salvar`.
    - A porta fecha no tempo 3.
  - **Custo pendente na entrada:** custo nulo, ou 0 vindo de quem não tem `estoque.ver_custo`. Troca nunca fica pendente. Com a permissão, 0 é 0.
  - **Sem drop de gatilho nem de política** (lição de 25/11): usa `create or replace trigger`.
- **e2e do app antigo, local:** `entregar-pagamento-e2e` passou inteiro, **sem ajuste**, com a 1.1d aplicada.
  - Na primeira rodada falhou por tempo, com a tela compilando a frio. Para isolar, rodei sem a 1.1d (passou) e de novo com ela e o app aquecido (passou).
  - `pdv-valor-catalogo-e2e` e `lote2-e2e` estão presos à cópia local da produção (porta 54322, senha `teste-local-22`, `montar-local.sh`, que precisa de um dump com a senha do Lucas). Eles rodam na preparação do deploy.
- **Cópia local da produção (26/11/2026):**
  - **Dump:** `tools/banco/dump-unico.ps1` às 10:5x UTC, com o Lucas digitando as duas senhas. Saída em `dumps/2026-11-26-unico/` (`.7z` cifrado, 34 MiB).
  - **Montagem:** `montar-local.sh` da worktree, com todas as migrações da branch. O restore do `public` foi refeito sem as tabelas `_backup_*` (que só existem na produção) e com o `truncate` em modo réplica, por causa da trava da Auditoria.
  - **A 1.1d aplicada sobre os dados reais:** a prova da migração passou, e os satélites da JM ficaram idênticos à coluna antiga (57 unidades com R$ 84.259 de custo e R$ 600 de reparo, 131 vendas com R$ 12.400, 127 compras com R$ 7.920). `itens` com custo foi de 57 para 0.
  - **`pdv-valor-catalogo-e2e`:** **tudo ok, sem ajuste**.
  - **`lote2-e2e`:** **tudo ok**, mas o teste está desatualizado desde a remoção das views (consulta `vendas` e `pedidos_compra`, que não existem mais nem na produção). Rodei uma cópia temporária com só esses nomes trocados nas consultas SQL do próprio teste; a parte de tela é idêntica, e a cópia foi apagada. **Pendência:** atualizar o `lote2-e2e` no repositório.
  - **Ao fim:** apaguei a cópia (`supabase stop --no-backup`, nenhum volume), a pasta `_claro` (o dump aberto), a cópia local do `usuarios.local.json` e o script com as chaves locais. Fica só o `.7z` cifrado.
**EM PRODUÇÃO em 26/11/2026** (migração `20261126112709`; app `51768bfa`, `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY`, READY 11:30:58 UTC).
- **Portões:** build igual ao da Vercel no commit; backup `_backup_custo_1_1d_{unidades,vendas,compras,itens}_20261126` (57/131/127/57 linhas); ponto de volta do app `dpl_27hbJMjgwGZcCMfjWt21RZnR3jFv` (`7b33d924`) e do banco `volta-custo-satelites.sql`; IOwait medido; 10 min sem atividade na JM; migração fora dos minutos 05–15.
- **Somas antes = depois, por empresa** (coluna antiga × satélite): JM 57 unidades, R$ 84.259 de custo e R$ 600 de reparo; 131 vendas, R$ 12.400; 127 compras, R$ 7.920; md5 das vendas igual (`ac785464…`); `itens.custo` 57 → 0. Aletrini: nenhuma linha de custo, antes e depois. Releitura às 11:33: 0 divergências, 0 linhas sem satélite.
- **Fixes no caminho** (pegos pelo ritual antes do push): data do pedido sem `current_date` (`3681ac27`); `compras_pedido_salvar` como SECURITY DEFINER com as travas da RLS explícitas, porque `empresa_fuso` não é executável pelo navegador (`51768bfa`).
- **Smoke:** na JM, simulação com rollback (Vendedor e Consulta: satélites 0 e `SEM_PERMISSAO`; Dono: 57/131/127). Na Demonstração, também com rollback: três usuários temporários (Dono, Vendedor, Consulta) e uma unidade com custo de R$ 1.234 criada pela `estoque_unidade_criar` — o Dono lê 1.234 na unidade e na venda, e `venda_resultado` passa; Vendedor e Consulta leem 0 linhas e recebem `SEM_PERMISSAO`. Conferido depois: nada ficou gravado.
- **Logs de 15 min** (11:31–11:46): Vercel sem nenhum erro ou aviso; Postgres sem ERROR além das duas simulações (que terminam com `raise` de propósito); API do Supabase com 58 requisições e nenhum 4xx/5xx (recontado em 26/11 às 12:58 pelo campo certo, `response.status_code`; a primeira leitura usou um campo que não existe e não provava nada). Tráfego baixo (antes da abertura da loja).

### 4.4 Tempo 2 (entrega 1.1e): o app só no satélite

Sem migração. O app para de ler e de gravar as colunas antigas.

| Área | Mudança |
|---|---|
| Leitura | os 17 pontos da §4.1: troca de `select *` por lista explícita **sem** as colunas antigas; custo pela junção com o satélite (nula sem permissão) ou por `venda_resultado`; nada de custo, lucro ou margem no prop de quem não tem a permissão (o servidor nem lê) |
| Fórmula única de margem | `lib/margem.ts` (nova): substitui as duas fórmulas diferentes de `estoque-view` e `unidade-modal` |
| Escrita de unidade | os 7 inserts passam a `estoque_unidade_criar`. **O campo de custo some para quem não tem `estoque.ver_custo`** (decidido 25/11, Q5): a unidade nasce com custo pendente. Troca: PDV, encomenda, avaliação e orçamento mandam o valor oferecido, e a RPC grava como custo |
| Edição de custo | `unidade-modal` e a lista de pendentes usam `estoque_custo_informar`; `encomendas-abertas` usa `venda_custo_ajustar` |
| Compras | `compras_pedido_salvar` em `compras-view` e `encomenda-form`; "investido" só com a permissão |
| PDV | não lê nem manda custo; o custo da venda é do gatilho no banco |
| Histórico | lucro e card só com a permissão; CSV confere `core.exportar` |
| Relatórios | CSV de estoque sai do navegador para uma rota do servidor que só inclui custo com a permissão |
| Troca nos documentos | `garantia/page.tsx` e o termo usam `vendas_pagamentos.valor_pago` da troca (C2) |
| Assistente | `verFinanceiro` → `estoque.ver_custo` para lucro e margem |
| LGPD | `lib/lgpd/exportacao.ts` lista colunas, sem custo |
| **Unidades com custo pendente** | aba no Estoque (só com `estoque.ver_custo`), por loja, disponíveis e vendidas, com "Informar custo"; contador no menu do estoque |
| "Margem para a loja" na troca | só com a permissão |
| `scripts/check-custo.mjs` (novo, no `npm run build`) | reprova qualquer leitura ou gravação das colunas antigas fora de testes e voltas |

**Vendedor lendo custo pela API, tempo 2:**
- a tabela do tempo 1, repetida (mesmo resultado: a coluna antiga ainda responde à chamada direta até o tempo 3);
- **varredor de respostas do app**: e2e `custo-oculto-e2e.mjs` entra como Vendedor e como Consulta, abre as telas dos 17 pontos, chama as rotas da lista e procura `custo`, `preco_custo`, `valor_custo`, `lucro` e `margem` em **toda resposta JSON e todo prop serializado** (payload do RSC). Tem de dar zero ocorrência com valor. Com o Dono, tem de achar os valores (prova de que o teste enxerga).

**Aceite da 1.1e:**
1. Varredor zero para Vendedor e Consulta; positivo para o Dono.
2. `check-custo` verde: nenhuma leitura ou gravação das colunas antigas no app.
3. Custo pendente ponta a ponta na tela: entrada pelo Vendedor sem campo de custo → aparece na lista do Dono → venda da unidade → Dono informa → a venda recebe uma vez → segunda mudança não altera a venda; tudo na Auditoria.
4. Conferência visual: Estoque (lista, entrada, unidade, pendentes), Catálogo, PDV, Encomendas, Histórico, Painel, Relatórios, Compras, Garantia (termo com o valor da troca), com Dono e com Vendedor.
5. Smoke na Demonstração com os passos do item 3.
6. A migração do tempo 3 pronta e testada no local contra este app, para subir na mesma janela.

### 4.5 Tempo 3 (entrega 1.1f): coluna antiga vazia para todos

**Sobe quando:** a 1.1e está `READY` em produção, o smoke passou e o `check-custo` está verde no commit em produção.

**Migração F1 `<n>_custo_coluna_antiga_vazia`:**
- as colunas antigas (`estoque_unidades.preco_custo`, `custo_reparo`, `vendas_vendas.valor_custo` e, por consequência, `lucro`; `compras_pedidos.valor_total`) ficam **nulas para todos**;
- o gatilho antigo → satélite passa a só **porta de entrada**: o que alguém ainda gravar na coluna vai para o satélite (com as regras de permissão e de pendente) e a coluna volta a nulo; o gatilho satélite → antigo é desligado;
- prova na migração: somas dos satélites iguais antes e depois.

**Volta da F1:** copia os satélites de volta para as colunas e religa a sincronia do tempo 1 (para o caso de voltar o app ao antigo).

**Vendedor lendo custo pela API, tempo 3:**
- `estoque_unidades?select=*` e `?select=preco_custo,custo_reparo`, `vendas_vendas?select=valor_custo,lucro`, `compras_pedidos?select=valor_total`, `itens?select=custo` → **nulos**;
- satélites: 0 linhas; RPCs: recusadas;
- varredor do tempo 2 repetido: zero;
- com o Dono: satélites com os valores, telas com custo (o app já lê só o satélite, então nada some para ele).

**Aceite da 1.1f:** a lista acima; somas iguais; uma entrada e uma venda pela tela depois da migração gravam no satélite; smoke na Demonstração; logs sem erro novo por 15 minutos.

### 4.5.1 Roteiro de deploy da 1.1e + 1.1f (mesma janela, uma logo depois da outra)

**Por que nessa ordem:** o app da 1.1e só lê e grava os satélites, e o banco da 1.1d aceita os dois apps (o antigo e o novo), porque a sincronia ainda é nos dois sentidos. Já a 1.1f esvazia a coluna antiga: com ela no ar, o app antigo (1.1d) mostraria custo vazio. Então: **o app sobe primeiro; o banco, depois.** E, na volta, **o banco volta primeiro; o app, depois.**

**Um commit só** (`feat/etapa-1.1-base` → `main`, só fast-forward) leva o app da 1.1e e o arquivo da migração 0400. A Vercel não aplica migração: o arquivo no repositório não muda nada até o `apply_migration` do passo 2.

**0. Antes de tudo (portões; nada começa sem todos):**
1. **ok do Lucas** para a janela;
2. **local:** ritual do zero verde (com a 0400), `npm run check` verde (inclui `check:custo`), `custo-local` nos tempos 2 e 3, varredor `custo-oculto-e2e` verde, ciclo 0400 → volta → 0400 com somas iguais;
3. **build igual ao da Vercel** no commit exato (checkout principal, `git checkout --detach <commit>`, `npm run -s build`);
4. **retrato "antes"** (só leitura), por empresa: contagem e soma de `preco_custo`, `custo_reparo`, `valor_custo`, `lucro`, `valor_total` na coluna antiga e nos satélites, md5 da digital das vendas; salvo em `conciliacao-pedidos/etapa-1.1c-20261125/custo-1.1ef-antes.json`;
5. **backup** das tabelas afetadas pela 1.1f: `_backup_custo_1_1f_unidades_<data>` (`id, preco_custo, custo_reparo`), `_vendas_` (`id, valor_custo`), `_compras_` (`id, valor_total`) e os três satélites inteiros;
6. **pontos de volta anotados:** app = `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY` (`51768bfa`, a 1.1d); banco = `supabase/scripts/volta/volta-custo-coluna-antiga-vazia.sql` (uma transação);
7. **IOwait** (`SEG=65 node .gate/iowait-metricas.mjs`) sem pico; **10 min sem atividade na JM** (nenhuma escrita em unidades, vendas, pagamentos, compras).

**1. 1.1e (app):**
1. `git push origin feat/etapa-1.1-base:main` (fast-forward); esperar o deploy `READY` e conferir o `githubCommitSha`;
2. **conferências antes de seguir para a 1.1f** (todas):
   - `node scripts/check-custo.mjs` no commit em produção: verde;
   - Demonstração, superadmin impersonando, como Dono: Estoque (lista com custo, aba "Custo pendente"), Histórico (lucro), Catálogo (custo total), PDV, Relatórios e Compras abrem sem erro e com custo;
   - simulação com rollback na Demonstração (a mesma do smoke da 1.1d): Vendedor e Consulta sem custo; Dono com custo;
   - somas coluna antiga = satélite, por empresa, ainda iguais (a sincronia do tempo 1 copia o que o app novo grava no satélite);
   - logs: Vercel e Postgres sem erro novo por **5 minutos** (os 15 completos ficam para depois da 1.1f, que fecha a janela);
3. **se algo falhar aqui:** volta da 1.1e = promover de novo o deploy `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY` (a 1.1d). O banco não muda. A 1.1f não sobe.

**2. 1.1f (banco), em seguida:**
1. conferir o relógio: **fora dos minutos 05–15**;
2. `apply_migration` com o conteúdo de `20261126000400_custo_coluna_antiga_vazia.sql` (tem `lock_timeout` de 5 s e a prova dentro: se as somas mudarem ou sobrar valor na coluna antiga, a migração inteira desfaz sozinha). Se cair por lock, esperar 2 min e repetir; nada fica pela metade;
3. **conferências depois:**
   - somas dos **satélites** por empresa idênticas ao retrato "antes" (JM e Aletrini); md5 das vendas igual;
   - colunas antigas: zero valores (`preco_custo`, `custo_reparo`, `valor_custo`, `lucro`, `valor_total`, `itens.custo`);
   - simulação com rollback na Demonstração: Vendedor e Consulta leem a coluna antiga **nula** e os satélites com 0 linhas; o Dono lê o satélite; uma entrada (pela `estoque_unidade_criar`) e uma venda gravam no satélite e deixam a coluna nula;
   - smoke na tela da Demonstração como Dono: Estoque, Histórico, Catálogo e Relatórios com o mesmo custo de antes;
   - logs de **15 minutos** (Vercel e Postgres), registrados;
4. **se houver qualquer diferença nas somas:** parar e avisar o Lucas antes de qualquer outra coisa.

**Volta, em cada caso:**

| Situação | Volta | Ordem |
|---|---|---|
| a 1.1e falhou (antes da 1.1f) | promover `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY` | só o app |
| a 1.1f falhou na aplicação | nada: a migração é uma transação e desfaz sozinha | — |
| a 1.1f subiu e algo está errado, mas a 1.1e está bem | `volta-custo-coluna-antiga-vazia.sql`: copia os satélites de volta para as colunas e religa a sincronia da 1.1d; conferir somas coluna = satélite | só o banco |
| as duas precisam voltar | **primeiro** a volta da 1.1f (banco), conferir somas; **depois** promover a 1.1d (app) | banco → app, nunca o contrário (o app antigo com a coluna vazia mostraria custo em branco) |

A volta da 1.1f foi provada no local, com dados: 0400 → volta → 0400, somas dos satélites iguais nos três estados e a coluna antiga cheia de novo depois da volta (§4.5.2).

### 4.5.2 Estado da 1.1e + 1.1f em 26/11/2026: prontas no local (commit `1f6bfb46`, build igual ao da Vercel verde), PARADAS antes do deploy

- **Ritual do zero com a 0400:** verde (testes de migração, inclusive o `teste-custo-satelites` no estado final: porta de entrada do vendedor ignorada, do dono e da chave de serviço indo ao satélite, colunas antigas vazias, satélites completos; 63/63 de integração).
- **Vendedor lendo custo pela API (`custo-local`, sessão real):** tempo 2 (sem a 0400) 13/13, com a coluna antiga ainda respondendo como hoje; tempo 3 (com a 0400) 13/13, com a coluna antiga **nula** para Vendedor e Consulta. Nos dois: satélites 0 linhas, junção nula, funções `SEM_PERMISSAO`; Dono lê.
- **Ida, volta e ida com dados** (banco local, custo em unidade, venda de unidade, venda avulsa, compra): 
  - tempo 2: coluna `2/1777.77/50 · 2/1120/680 · 1/2468` = satélite;
  - depois da 0400: coluna `0/0/0 · 0/0/0 · 0/0`, satélite igual ao de antes;
  - depois da volta: coluna de novo igual ao satélite; 0400 de novo: igual ao segundo estado.
- **Varredor `custo-oculto-e2e`** (Dashboard, Histórico, Estoque, PDV, Relatórios, Catálogo, Compras; HTML e toda resposta recebida pelo navegador): **Vendedor e Consulta zero** ocorrência, com a venda de teste visível no Histórico deles (prova de que o zero vale); Dono com o custo no Estoque, Histórico, Catálogo, Relatórios e Compras. Entrada pelo Vendedor: sem o campo de custo, com a nota; a unidade nasce pendente. Dono: aba "Custo pendente", informa 1.500, a unidade sai da lista, satélite com origem `informado`. 28/28.
- **Conferência visual** (fotos do varredor, as três pessoas): Estoque (coluna Custo, "pendente", "—" para 0, aba só do Dono), Histórico (lucro só do Dono), Relatórios (Consulta sem lucro), Catálogo, PDV, Compras, Dashboard.
- **`npm run check`** verde (inclui `check:custo`, que agora também olha arquivo novo e junção com `*`); `npm test` 655/655; `tsc` limpo.
- **Revisão independente do diff:** nenhum vazamento e nenhuma gravação perdida. Corrigido a partir dela: troca com uma linha de pagamento **por aparelho** (o termo e a lista de encomendas mostram o valor de cada um; antes da correção, vários aparelhos saíam rateados); custo 0 antigo como "—" (não "R$ 0,00"); aviso no modal quando o reparo muda sem custo; custo 0 informado não vira "pendente" na linha nova; a 0400 trata escrita sem usuário (chave de serviço, script) como do servidor (senão o custo sumia).
- **Pendências do §4.5.2: decisões do Lucas (26/11/2026):**
  - **16 unidades da JM com custo 0 copiado** (46, 47, 48, 54, 55, 56, 57, 59, 61, 62, 64, 65, 67, 69 e 73 vendidas; 75 reservada para a encomenda 121): **passam a "custo pendente"** com auditoria (`script 1.1f`) e entram na aba "Custo pendente". Feito junto com o deploy, por `conciliacao-pedidos/etapa-1.1ef-20261126/custo-zero-pendente.sql` (simulação, backup `_backup_custo_zero_pendente_20261126`, volta `custo-zero-pendente-volta.sql`). **Só a unidade muda:** as 16 vendas delas continuam com custo 0. `estoque_custo_informar` só preenche venda com custo nulo, então informar o custo dessas unidades **não chega à venda** (o lucro dessas vendas continua "sem custo"). Para chegar, as 16 vendas teriam de ficar pendentes também (mexe em venda concluída, com a marca de script): **decisão do Lucas, não feita**.
  - **Vendas antigas com troca rateada** (vários aparelhos numa linha só de pagamento): **ficam como estão (legado)**. O termo dessas vendas reparte o total por igual; as vendas novas gravam uma linha por aparelho.
  - **Termo no rebaixamento por orçamento** mostrando o valor pago (`min(valor de entrada, valor da venda)`) em vez do combinado: **defeito registrado, corrigir junto da fase 2 (impressão)**.
  - **Exportação LGPD sem os satélites de custo: não se aplica.** Custo é dado interno da loja (quanto ela pagou), não dado pessoal do cliente; a exportação LGPD é dos dados pessoais. Os satélites ficam fora de propósito.
  - **Ajuste da encomenda** grava o preço e depois o custo (`venda_custo_ajustar`): se a segunda falhar, o preço fica.
  - Linha nova da entrada mostra a loja "—" até recarregar (já era assim).
  - `lote2-e2e` desatualizado (views removidas).

### 4.5.3 1.1e + 1.1f EM PRODUÇÃO em 26/11/2026 (deploy aprovado pelo Lucas, roteiro §4.5.1)

- **Portões:** retrato "antes" (12:49 UTC, `conciliacao-pedidos/etapa-1.1ef-20261126/custo-1.1ef-antes.json`); backups `_backup_custo_1_1f_{unidades,vendas,compras,sat_unidades,sat_vendas,sat_compras}_20261126` (57/131/127/57/131/127); IOwait 0,15%; JM sem escrita em 10 min (antes do push e antes da 0400); build igual ao da Vercel em `1f6bfb46`; ponto de volta do app `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY` (`51768bfa`).
- **1.1e (app):** push fast-forward `51768bfa..afc457be` às 12:51 UTC; `dpl_21G6j38zyGj2CLopDy9DkseJviuB` READY 12:55:20.
  - **entre app e banco:** somas coluna = satélite (0 divergência; JM igual ao retrato, md5 `e29d5f6e…`); simulação na Demonstração com rollback (Vendedor e Consulta: satélites 0, `SEM_PERMISSAO`; coluna antiga ainda respondia, como esperado no tempo 2); Dono na tela da Demonstração: Estoque com custo, "pendente" e aba, Histórico e Relatórios com lucro; 5 min de logs: Vercel sem erro, API 558 requisições sem 4xx/5xx, Postgres sem erro do app (os 401 das 12:52 são de um navegador sem sessão, antes do READY).
- **1.1f (banco):** `apply_migration` às 13:16 UTC (adiada de 13:01 para não cair nos minutos 05–15), registrada como `20261126131651`; prova interna ok.
  - **somas depois = retrato antes, por empresa:** JM 57 unidades, R$ 84.259 de custo e R$ 600 de reparo; 131 vendas, R$ 12.400; 127 compras, R$ 7.920; md5 das vendas igual; colunas antigas com 0 valores; `itens.custo` 0. Aletrini sem nada antes e depois (`custo-1.1ef-depois.json`).
- **16 unidades de custo 0 → pendente** (logo depois da 0400): simulação às 12:49, gravação às 13:17; soma R$ 84.259 sem mudança, 41 unidades com valor e 16 pendentes, 16 auditorias `script 1.1f`, backup de 16 linhas.
- **Smoke final na Demonstração** (cenário criado e apagado no fim; superadmin impersonando; impersonação nula e loja 6 preservada ao sair; aba fechada):
  - **API, tempo 3:** Vendedor e Consulta leem a coluna antiga **nula** (unidade, venda e lucro), satélites 0 linhas, `venda_resultado` e `estoque_custos_pendentes` com `SEM_PERMISSAO`; o Dono lê R$ 1.234 no satélite;
  - **entrada como Vendedor** (a conta de apresentação da Demonstração vira Vendedor só dentro da transação e volta a Administrador): mandou 888 de custo e nasceu **pendente**; uma gravação direta de 777 na coluna antiga foi ignorada; apareceu na aba "Custo pendente" do Dono, que informou R$ 1.500 pela tela ("Custo informado."; satélite 1.500, origem `informado`, 1 auditoria; coluna antiga nula);
  - **telas do Dono:** Estoque, Histórico (lucro R$ 766), Relatórios (lucro total R$ 766), Catálogo, PDV e Dashboard, sem erro no console;
  - **Vendedor e Consulta nas telas da produção:** não há login de Vendedor nem de Consulta na Demonstração (e criar conta na produção não se faz). A prova de tela sem custo é o varredor local `custo-oculto-e2e` (28/28) mais a API acima.
- **Logs de 15 min depois da 0400 (13:16:51–13:32):** Vercel sem erro nem aviso; API do Supabase com 1.927 requisições e nenhum 4xx/5xx; Postgres só com o `raise` da simulação do smoke (prova de que o filtro `parsed.error_severity` enxerga erro).
- **JM depois do deploy (só leitura, 13:32):** somas = retrato (salvo a mudança autorizada das 16 unidades: 41 com valor + 16 pendentes, mesma soma); md5 das vendas igual; nenhum valor nas colunas antigas; rotinas depois do deploy todas `ok` (liberação 13:05, pós-venda 13:10, automações 13:17); página Rotinas com "Com erro, não vistas (0)" e tudo "em dia".
- **Defeito achado no smoke (não corrigido em produção):** `estoque_custos_pendentes_resumo().total` conta **lojas**, não unidades (`count(*)` sobre o agrupamento por loja). Só o número da aba erra; a lista está certa. Na JM, a aba mostra "(2)" com 16 pendentes. Correção: `sum(n)`, numa migração com teste (`teste-custo-satelites` com pendentes em duas lojas), na próxima entrega (junto com a P2, §5.2).
- **Volta, se precisar:** primeiro o banco (`volta-custo-coluna-antiga-vazia.sql`; se quiser desfazer as 16, `custo-zero-pendente-volta.sql` antes), depois o app (promover `dpl_CWqjShg849MSpmZzqx9ecqpLkjiY`).
- **As 16 VENDAS dessas unidades também ficaram pendentes** (ok do Lucas, 26/11 ~13h50 UTC): 51, 84, 85, 87, 89, 90, 93, 94, 98, 100, 102, 104, 108, 111, 115 (concluídas) e 121 (encomenda). Script `conciliacao-pedidos/etapa-1.1ef-20261126/vendas-custo-zero-pendente.sql` (simulação, backup `_backup_vendas_custo_zero_pendente_20261126`, volta `vendas-custo-zero-pendente-volta.sql`); só `vendas_vendas_custos` mudou (0 → nulo, com a marca de script na guarda), 16 auditorias.
  - **Antes = depois:** digital das vendas da JM (id, valor, desconto, comissão, situação, datas, unidade, loja) `ec11033c…` igual; faturamento concluído R$ 857.058, comissão 0, desconto 0, iguais; soma de custo R$ 12.400 igual (115 vendas com valor + 16 pendentes).
  - **Regra (já aprovada, agora valendo para elas):** quando o Dono informar o custo da unidade, a venda recebe UMA vez (`estoque_custo_informar`, auditoria `custo_preenchido_pos_venda`); nenhuma outra mudança de custo atinge venda concluída (guarda `CUSTO_CONGELADO`).
  - **Teste na Demonstração** (simulação desfeita): unidade pendente vendida por R$ 3.000 com comissão R$ 150; Dono informa R$ 1.000 → a venda recebe R$ 1.000 (lucro R$ 2.000, margem 66,7%); segunda mudança para R$ 1.200 → a unidade muda, a venda continua R$ 1.000; valor e comissão da venda iguais.
  - **Comissão e faturamento não dependem de custo:** nenhuma função do banco nem código do app calcula comissão a partir de custo, lucro ou margem (comissão é lançada na Equipe, por valor ou percentual); faturamento é `valor_venda`. Só o lucro muda quando o custo for informado.

### 4.6 Tempo 4 (entrega 1.1g): remover as colunas antigas

**Só roda quando, nesta ordem:**
1. o tempo 3 está em produção;
2. `check-custo` verde (zero leitor no código);
3. nenhuma função, gatilho ou view do banco cita as colunas, além do gatilho-ponte (`pg_proc.prosrc`, `pg_views`, `pg_depend`);
4. os logs da API da produção desde o tempo 3, cobrindo **pelo menos um dia de loja aberta**, sem nenhum `select=` ou corpo de gravação com os nomes antigos (critério de cobertura: PDV, estoque, compras e relatórios em uso real).

**Migração G1 `<n>_custo_remover_colunas`:**
- remove o gatilho-ponte (o gatilho de custo da venda **fica**, gravando só o satélite);
- `drop column` de `estoque_unidades.preco_custo`, `custo_reparo`, `vendas_vendas.lucro`, `valor_custo`, `compras_pedidos.valor_total`, `itens.custo`;
- ajusta `volta-views-lote4.sql` e `volta-views-lote5.sql` (não recriam mais custo);
- tipos regenerados.

**Volta da G1:** recria as colunas vazias e o gatilho-ponte do tempo 3.

**Vendedor lendo custo pela API, tempo 4:**
- `estoque_unidades?select=preco_custo` → **erro 400 (coluna não existe) para todos**, inclusive o Dono;
- `select=*` sem nenhuma chave de custo;
- satélites: 0 linhas para Vendedor e Consulta, valores para o Dono;
- varredor do tempo 2 repetido: zero.

**Aceite da 1.1g:** os quatro critérios de entrada; o teste acima; ritual, build e e2e verdes; somas dos satélites iguais antes e depois do `drop`; smoke na Demonstração (entrada, venda, relatório).

---

## 5. Entrega 1.1h: contração da configuração e das permissões antigas

**Só depois de:** 1.1b e 1.1e em produção, e busca no código sem leitor do envelope provisório nem de `empresas.permissoes`. **E** `core_horario` e `core_liberar_lotes_do_dia` lendo `empresa_config` (achado do deploy da 1.1a, §1.3); a busca inclui o corpo das funções do banco (`pg_proc.prosrc`), não só o código do app.

**Migração H1 `<n>_contracao_config_permissoes`:**
- `config_salvar` para de escrever o envelope; as linhas `'<modulo>.<chave>'` de `configuracoes_sistema` vão para `_backup_config_provisoria_<data>` e saem da tabela (as chaves antigas sem ponto ficam);
- sai o gatilho-ponte de `empresas.permissoes`; a coluna vai para backup e é removida;
- `/api/permissoes` e a página antiga são apagadas no app do mesmo pacote (deploy do app **antes** da migração).

**Aceite:** `config_valor_emp` igual antes e depois para todas as chaves; o teste `teste-config-provisoria.sql` substituído pelo `teste-empresa-config.sql`; nenhuma rota responde pela tela antiga; Cargos sem mudança para nenhum usuário.

### 5.1 Leitura protegida de chaves de configuração (vindo da precificação §8.3; entra na 1.1h)

**Por quê:** a margem da precificação somada ao preço de venda revela o custo de mercado (preço − margem). Então as chaves `precificacao.*` e as linhas de Auditoria delas só podem ser lidas por quem tem `estoque.ver_custo`. Hoje qualquer pessoa da empresa lê `empresa_config` (pela RLS e por `config_valor`) e a Auditoria de configuração.

**Por que na 1.1h:** é a entrega que já mexe na regra de leitura da configuração (sai o envelope antigo, `config_valor` fica só na tabela nova). Mudar a leitura antes disso obrigaria a proteger também o envelope. **Condição de calendário:** a 1.1h tem de estar em produção **antes da primeira entrega da precificação (P1a)**. Se a precificação ficar pronta antes, esta parte sai sozinha, antes da P1a, como migração própria.

**Como (genérico, não só precificação):**
- o catálogo `lib/config.ts` ganha, por chave, `leitura: 'estoque.ver_custo'` (ou outra permissão); as chaves `precificacao.*` nascem com essa marca;
- o espelho no banco: tabela `config_chave_leitura(chave_prefixo, permissao)`, gerada do catálogo (pelo gerador da 1.1i, ou à mão até lá);
- `empresa_config`: a política de SELECT passa a exigir `tem_permissao(<permissão da chave>)` quando a chave tem marca; `config_valor`/`config_valor_emp` devolvem nulo (ou `SEM_PERMISSAO`, a decidir no teste) para quem não tem;
- `auditoria_eventos`: as linhas com `entidade = 'config'` e chave marcada só aparecem com a permissão (política de SELECT + filtro na tela Auditoria);
- `config_salvar` continua exigindo a permissão de **edição** da chave (`estoque.preco_variante` para precificação).

**Teste:** Vendedor e Consulta não leem `precificacao.margem_padrao` por `empresa_config`, `config_valor`, Auditoria nem tela; o Dono lê; chave sem marca continua legível como hoje.

### 5.2 O restante da 1.1: ordem e critérios (planejado em 26/11/2026, depois do deploy da 1.1e + 1.1f)

| Ordem | Entrega | Começa quando | Critério de pronto |
|---|---|---|---|
| 1 | **Aviso ao Dono afetado (P2)** + correção do contador da aba "Custo pendente" (§4.5.3) | já (pequena: uma migração de funções + app) | o Dono que tem o cargo trocado por outro Dono recebe aviso; a aba mostra o número de unidades (JM: 16), não de lojas |
| 2 | **1.1g** remover as colunas antigas de custo | 1.1f com **um dia inteiro de loja aberta** sem leitor | os 4 critérios do §4.6 |
| 3 | **1.1h** contração da configuração e das permissões + leitura protegida (§5.1) | P0 abaixo resolvido | aceite do §5 e teste do §5.1; **antes da P1a da precificação** |
| 4 | **1.1i** gerador de valores padrão | 1.1h em produção (o gerador escreve só na tabela nova) | **antes de qualquer cliente novo e antes de a Aletrini ligar módulo com configuração** |

**1. Aviso ao Dono afetado (P2):**
- **o quê:** quando `usuario_cargo_trocar` muda o cargo de alguém que era Dono, e quem mudou é outro Dono, nasce uma notificação para o afetado ("<nome> mudou seu cargo de Dono para <cargo> em <data>"), além da linha de Auditoria que já existe;
- **onde:** a notificação sai da própria função (mesma transação), pelo mecanismo de notificações já usado no app; e-mail fica de fora (decisão dos sócios, se quiserem);
- **critério:** teste SQL (Dono A rebaixa Dono B → 1 notificação para B, nenhuma para A; Administrador continua recebendo `SO_DONO`); conferência na tela da Demonstração; nada muda para a JM até alguém trocar o cargo de um Dono.

**Situação em 26/11/2026:** o item 1 (P2 + contador; migração `20261126000500`) e a primeira parte do item 3 (`core_horario` e `core_liberar_lotes_do_dia` na tabela nova; migração `20261126000600`) foram feitos e sobem juntos (commit `ebbffac3`). Detalhe da produção no `estado-atual`/§5.3.

**2. 1.1g — remover as colunas antigas de custo** (detalhe no §4.6):
- **coleta da evidência (começou em 26/11/2026):**
  - **banco:** funções, views e dependências que citam as colunas. Em 26/11, além dos gatilhos-ponte, **duas funções ainda GRAVAM nas colunas antigas** (o gatilho leva o valor ao satélite): `compras_pedido_salvar` (`compras_pedidos.valor_total`) e `concluir_encomenda` (`vendas_vendas.valor_custo`); e o gatilho `vendas_valor_guarda` depende de `vendas_vendas.valor_custo`. **Antes do `drop`, uma migração da 1.1g reescreve as três para o satélite** (e o teste prova);
  - **código:** `check-custo` verde no commit em produção (`afc457be`);
  - **logs da API** (só janelas de 15 min, filtradas por rota — regra dos logs): requisições REST cujo `select=` (decodificado, sem as junções `*_custos(...)` e o apelido `custo:`) pede `*` ou coluna antiga nas quatro tabelas, ou junção `tabela(*)`. 26/11 12:55–13:10: 825 requisições REST, 10 nas quatro tabelas, **0 suspeitas**. O critério exige **um dia inteiro de loja aberta** (27/11), conferido em janelas ao longo do dia; os logs ficam ~1 dia, então a conferência do dia 27 tem de ser feita até a manhã de 28/11.
- **antes de escrever a migração:** prova de que nada lê as colunas:
  - `check-custo` verde no commit em produção;
  - `pg_proc.prosrc`, `pg_views` e `pg_depend` sem citação fora dos gatilhos-ponte;
  - logs da API (`edge_logs`) desde o deploy da 1.1f, cobrindo **pelo menos um dia de loja aberta**, sem `preco_custo`, `custo_reparo`, `valor_custo`, `lucro`, `valor_total` em `select=` ou corpo de gravação de `estoque_unidades`, `vendas_vendas`, `compras_pedidos` e `itens`;
  - colunas ainda 100% nulas;
- **migração:** sai o gatilho-ponte e saem as colunas; DDL **separada por tabela**, com `lock_timeout` (lição de 25/11), fora dos minutos 05–15, com 10 min sem atividade na JM;
- **volta:** recria as colunas vazias e os gatilhos do tempo 3;
- **critério:** somas dos satélites iguais antes e depois; ritual, build e varredor verdes; `select=preco_custo` devolve 400 para todos; smoke na Demonstração; logs de 15 min.

**3. 1.1h — contração da configuração e das permissões antigas + leitura protegida:**
- **P0, antes de tudo (pré-requisito achado no deploy da 1.1a):** `core_horario` e `core_liberar_lotes_do_dia` passam a ler `empresa_config` (hoje leem o envelope direto). Entrega curta, própria, com teste SQL e conferência da liberação diária e da rotina do pós-venda do dia seguinte (resultado, não só status do job);
- **critério de entrada da contração:** busca sem leitor do envelope e de `empresas.permissoes` no código **e** no corpo das funções do banco (`pg_proc.prosrc`);
- **ordem dentro da 1.1h:** app primeiro (sem leitor do envelope; página antiga de permissões apagada), depois a migração (envelope para backup, ponte e coluna `empresas.permissoes` saem), depois a leitura protegida (§5.1);
- **critério:** `config_valor_emp` igual antes e depois para todas as chaves; Cargos igual para todo usuário; teste do §5.1; rotinas do dia seguinte ok na página Rotinas.

**4. 1.1i — gerador de valores padrão:**
- **o quê:** `scripts/gerar-config-padroes.mjs` lê `DEFINICOES_CONFIG` (`lib/config.ts`) e gera uma migração ou função de semente com todos os padrões (inclusive os que hoje estão no chamador: horário, liberação diária, sem ofertas, dias úteis; e a marca de leitura do §5.1);
- **onde vale:** criação da empresa e instalação de módulo materializam os padrões em `empresa_config`; o chamador deixa de ter padrão próprio;
- **trava:** `check-config-padroes` no `npm run check` (padrão no chamador reprova);
- **critério:** empresa nova criada no local tem as mesmas chaves e valores que o catálogo diz; JM e Aletrini sem nenhuma mudança de valor efetivo (`config_valor_emp` igual antes e depois); instalar um módulo grava os padrões dele.

---

## 6. Telas afetadas (conferência visual obrigatória em cada uma)

| Tela | Entrega | Mudança |
|---|---|---|
| Configurações → Auditoria (nova) | a, b | lista, filtros, antes → depois; filtro "acessos da plataforma" |
| Configurações → Pós-venda, Horário | a | só a origem do valor; aparência igual |
| Configurações → Cargos (nova; troca Permissões) | b | lista, editor, duplicar |
| Equipe | b | coluna e seletor de cargo; criar usuário com cargo |
| Topo: seletor de empresa (novo) e página "Escolha a empresa" (nova) | b | só para quem tem mais de um vínculo |
| Faixa "Conta de consulta" (nova) | b | em toda tela para a Consulta |
| Financeiro, Relatórios, Executivo | b | barrados na página e na rota pela permissão (hoje só o menu) |
| Laboratório (superadmin) | b | sem 406; entrada e saída aparecem na Auditoria da empresa |
| Estoque: lista, entrada, unidade, **Unidades com custo pendente** (nova) | e | custo só com a permissão; entrada sem custo para quem não vê |
| Catálogo | e | "Custo total" só com a permissão |
| PDV, Encomendas abertas | e | sem custo no navegador; editar custo só com a permissão |
| Histórico | e | lucro e CSV pela permissão |
| Painel (dashboard) | e | card de lucro e margem pela permissão |
| Relatórios | e | lucro e CSVs pela permissão |
| Compras | e | valor e "investido" pela permissão |
| Garantia / termo / 2ª via | e | `{{trocas}}` com o valor pago na troca |
| Assistente | e | lucro e margem pela permissão |

---

## 7. O que muda no dia a dia de cada cargo da JM

| Quem | Antes | Depois da 1.1 |
|---|---|---|
| **Dono** (Matheus, Eduardo; hoje `admin`) | tudo, menos o que é só do `owner` | tudo, inclusive editar Cargos, ver a Auditoria (com os acessos do Lucas), a lista **Unidades com custo pendente** e informar o custo que faltou. Continuam vendo custo, lucro e margem em todas as telas, em todos os tempos da troca: nada some, nem por um minuto |
| **Consulta** ("JM Store"; hoje a única `owner`) | tudo, inclusive custo | **vê** leads, conversas, vendas, estoque e relatórios da rede inteira, **sem custo, lucro ou margem**; **não grava nada** (o banco recusa e a tela mostra a faixa "Conta de consulta"); **sem Financeiro**; fora da roleta, da esteira e do pós-venda. Ninguém vende por ela: a 1.1c só roda com a checagem de 30 dias vazia (§3) |
| **Vendedores** (Pedro, Luis Felipe, Milena, Emerson, Vanessa) | veem custo e margem no Estoque, Catálogo e unidade; lucro das próprias vendas no Histórico e no Painel; editam custo nas encomendas | **deixam de ver** custo, reparo, margem e lucro em qualquer tela, CSV e assistente (tempo 2) e em chamada direta à API (tempo 3, na mesma janela). **Continuam vendo** preço de venda, o valor oferecido na troca e tudo o mais. Dão entrada no estoque **sem o campo de custo** (a unidade fica "custo pendente" para o Dono completar); a troca entra com o custo automático. Não editam custo de encomenda. Fora isso, igual |
| **Meta Reviewer** | vendedor ativo (conta de serviço) | desativada; os 3 negócios e a conversa com o Matheus |
| **Lucas** (plataforma) | entra pelo Laboratório; nada do que faz dentro fica registrado | igual, sem o 406; não aparece em Cargos nem na Equipe; cada entrada, saída, página aberta e gravação fica na Auditoria da empresa |

---

## 8. Respostas do Lucas (25/11)

| # | Pergunta | Resposta | Onde ficou |
|---|---|---|---|
| Q1 | Quem usa a conta "JM Store"? | É só de consulta; ninguém vende por ela. Se algum computador do balcão vende por ela: listar lojas e pessoas, e cada uma recebe conta própria **antes** da 1.1c. Checagem de vendas, pagamentos e negócios dos últimos 30 dias; se houver, **parar e mostrar** | §3 |
| Q2 | Consulta vê Financeiro? | **Não.** Vê leads, vendas, relatórios sem custo e a rede inteira | §2.3 |
| Q3 | Janela de custo vazio entre os tempos 1 e 2? | **Recusada.** Quatro tempos: satélite sincronizado com a coluna antiga legível → app no satélite → coluna antiga vazia logo depois, na mesma janela → remoção em deploy separado. O Dono nunca fica sem custo; o vendedor não ganha exposição nova | §4.2 a §4.6 |
| Q4 | "Venda concluída no PDV ganha o negócio": quando? | Na **E1.4**, como no roteiro | especificação §L.2 |
| Q5 | Campo de custo na entrada do vendedor | **Some** para quem não tem `estoque.ver_custo`; a unidade fica com custo pendente | §4.4 |
| Q6 | Gerente e Caixa | Entram com o PDV v2 | §2.3 |
| — | Camada de compatibilidade do papel | O cargo define o papel antigo; a remoção fica na **E1.6** "Fim do papel legado", registrada no roteiro | §2.2, roteiro §2 |

---

## 9. Portões e ambiente (valem para toda entrega)

- **Isolamento:** worktree `.claude/worktrees/etapa-1-1`; pilha local própria (`project_id` `etapa-1-1`, faixa livre do registro, hoje 553xx ou 563xx), registrada em `.claude/sessoes-locais.json` ao subir e apagada ao descer. Nenhum Docker/WSL fechado com outra pilha de pé. Build e gate no checkout principal **só quando ele estiver livre** (hoje a sessão A está fazendo deploy; combinar antes).
- **Números de migração:** conferidos na `main`, em todas as branches e worktrees, e **reservados no registro** só no momento de criar cada arquivo. Hoje: último na `main` `20261125000100`; reservado `20261125000200` (sessão A).
- **Cada migração:** `teste-*.sql` + `esperado/*.json` + arquivo de volta no mesmo commit; ritual local do zero verde; backup + digital das tabelas tocadas antes; `apply_migration` pelo MCP fora dos minutos 05–15; IOwait < 10%; conferência depois.
- **Cada deploy de app:** ponto de volta anotado na Vercel; `npm test`, `npm run check`, `next build` verdes; conferência visual das telas da entrega no local; 10 minutos sem venda, pagamento ou conclusão na JM; push; `READY`; smoke na Demonstração pelo Laboratório, limpando tudo; logs da Vercel e do Supabase por 15 minutos sem erro novo.
- **Volta:** sempre app primeiro (promover o deploy anterior), banco depois.
- **Leitura da produção** (só `SELECT`) no dia de cada entrega com banco: refaz os números deste plano.

---

## 10. Registro na especificação (feito junto com este plano)

- [pdv-v2-especificacao.md](pdv-v2-especificacao.md) §B.1 "Migração (1.1)": troca "remoção no mesmo deploy" pelos quatro tempos e aponta para este plano.
- §L.2 e Decisões de 25/11: as **duas "vendas" do Nexus** — negócio ganho no funil (base do pós-venda) e venda no PDV; daqui em diante, venda concluída no PDV ganha o negócio; ganhos antigos sem venda no PDV ficam como legado, contam para o pós-venda e **não** contam para faturamento nem comissão.
- Conferido no código de hoje: painel, relatórios, metas, ranking e comissão já leem faturamento de `vendas_vendas`; o único uso de `negocios.valor_estimado` em números é a previsão do funil das **Metas**, só com negócios abertos. A regra já vale; a E1.4 acrescenta a conclusão ganhando o negócio.
