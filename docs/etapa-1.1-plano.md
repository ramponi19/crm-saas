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

**Só depois de:** 1.1b e 1.1e em produção, e busca no código sem leitor do envelope provisório nem de `empresas.permissoes`.

**Migração H1 `<n>_contracao_config_permissoes`:**
- `config_salvar` para de escrever o envelope; as linhas `'<modulo>.<chave>'` de `configuracoes_sistema` vão para `_backup_config_provisoria_<data>` e saem da tabela (as chaves antigas sem ponto ficam);
- sai o gatilho-ponte de `empresas.permissoes`; a coluna vai para backup e é removida;
- `/api/permissoes` e a página antiga são apagadas no app do mesmo pacote (deploy do app **antes** da migração).

**Aceite:** `config_valor_emp` igual antes e depois para todas as chaves; o teste `teste-config-provisoria.sql` substituído pelo `teste-empresa-config.sql`; nenhuma rota responde pela tela antiga; Cargos sem mudança para nenhum usuário.

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
