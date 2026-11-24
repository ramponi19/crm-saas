# Clientes e Pós-venda — desenho (modelo HubSpot adaptado ao Nexus)

> Status: **plano aguardando a aprovação do Lucas** (23/11/2026). Decisões D1–D12 tomadas (§3). Do desenho, só a M1/M1b e a 4A do ZapIntel estão em produção; o MVP (§8.3) ainda não começou.
> Base: leitura do código (`main` + branch atual) e do banco de produção só com SELECT.
> Relacionados: [pdv-v2-especificacao.md](pdv-v2-especificacao.md) (motor de configuração §A, pós-venda do PDV §I, integração com o CRM §L), conciliação de vendas (`scripts/conciliar-vendas/`).

---

## 0. Antes de tudo: um bug que contradiz o modelo e ameaça a conciliação

O comportamento de hoje vai contra a regra "negócio ganho vira histórico, não se move mais".

**Quem decide.** A função `core_negocio_do_canal` decide, a cada mensagem que chega, em que negócio ela entra ([20261105001400_retorno_cliente_um_card.sql:23-89](../supabase/migrations/20261105001400_retorno_cliente_um_card.sql)). A Edge não decide nada: só chama a função.

**A ordem das regras:**
1. Há negócio aberto e ativo → a mensagem entra nele.
2. Há negócio ganho com `ganho_em` nos últimos N dias → a mensagem entra nele. É o "pós-venda". N vem de `configuracoes_sistema.retorno_cliente.pos_venda_dias`, padrão 30.
3. Senão, pega **o negócio mais recente da loja, seja ganho, perdido ou arquivado**, e o **reabre**: `status='aberto'`, primeira etapa, **`ganho_em = null`**. O estado anterior fica só em `negocio_historico.detalhe`.
4. Não há negócio nenhum → cria um.

**O que isso já fez na JM.** Em `negocio_historico` há 49 reaberturas por mensagem. **8 delas eram negócios ganhos**, entre 06/11 e 23/11, e essas vendas sumiram do status. Também foram reabertos 17 perdidos e 16 arquivados.

**O efeito sobre a conciliação.**
- A Fase 4B vai marcar 138 negócios como ganhos, com `ganho_em` igual à data do pedido (ago–nov).
- A maioria tem mais de 30 dias. O primeiro "oi" de cada um desses clientes **reabre o negócio e apaga a venda**.
- **Recomendação:** corrigir a regra 3 antes da 4B, ou logo depois.
- A correção é pequena:
  - ganho fora da janela **não reabre**: abre um negócio **novo**, ligado ao contato. O ganho fica intacto.
  - perdido continua reabrindo, que é o comportamento desejado para quem volta depois de perder.
  - os 8 ganhos já reabertos podem ser restaurados pelo `detalhe` do histórico.
- A correção está na migração M1 (§8.2).

**Em produção desde 23/11/2026 (D1).**
- **M1** (`20261123000200_ganho_protegido`):
  - ganho fora da janela abre negócio novo (`novo_apos_ganho` no histórico);
  - o gatilho `negocios_ganho_protegido` barra qualquer saída do ganho e qualquer troca de `ganho_em`;
  - a única porta é a RPC `reabrir_negocio(negocio, motivo)`: só dono ou admin, motivo obrigatório, grava `reaberto_manual`.
- **M1b** (`…0300`): ganho **arquivado** dentro da janela também recebe a mensagem; arquivar e desarquivar vão para o histórico.
- **Restauração:** as 8 vendas reabertas pelo bug foram restauradas (`ganho_restaurado`), com 4 negócios novos de recompra.
- **Conciliação:** a 4B da conciliação rodou **depois** da M1 (147 negócios).

---

## 1. O que existe hoje (resumo da Fase 1)

### 1.1 Dados do core

| Peça | Onde | Estado na JM (empresa 1) |
|---|---|---|
| Contato | `contatos`. O "cliente" é o contato com a marca `dados._cliente` ([lib/clientes.ts](../lib/clientes.ts)) | 3,7 mil contatos. **Não há estágio de ciclo de vida** |
| Negócio | `negocios`: `status` aberto/ganho/perdido, `ganho_em`, `perdido_em`, `etapa_id`, `valor_estimado`, `dados.produto_interessado` | 134 ganhos (ago 12, set 38, out 23, nov 61). **Nenhum contato tem 2 ganhos.** Em 116 dos 138 convertidos da conciliação o produto está vazio |
| Funil | `funis` (com a marca `interno`) e `funil_etapas` (`tipo` normal/negociacao/ganho/perdido, `campos_obrigatorios` jsonb) | Funil principal com 16 etapas. **"Pós Venda" (id 38) é `normal`, ou seja, aberta: tem 80 negócios**, 77 deles parados há mais de 30 dias, nenhum com valor. Internos: Time JM e Candidatos |
| Histórico | `negocio_historico`, por gatilho, ações etapa/atribuição/reaberto_por_mensagem/etc. | Dados desde 20/10 |
| Tarefas | `tarefas` (lead/negocio/contato, tipo, vencimento, origem) | 68 tarefas, nenhuma de pós-venda |
| Usuários e lojas | `empresa_usuarios` (role, `filial_id`) e `filiais` | **2 lojas: Guaçu (matriz, id 3) e Jaguariúna (id 6). Não há loja Campinas** |
| Vendas (PDV) | `vendas_vendas` (sem `negocio_id`). A ponte com o negócio é `zapintel_venda_lead`, casada pelo telefone | 126 vendas (ago–nov) |
| Categorias | `estoque_categorias` | iPhone/Smartphone (1), iPad/Tablet (2), MacBook (3), Watch (4), Outros (5), Acessórios (6), Perfumes (7) |
| Garantia | `assistencia_garantias` (manual, sem venda). O PDV v2 cria `vendas_garantias` | Módulo `garantia` desligado, 0 registros |

### 1.2 Motores que podem ser reaproveitados

- **Cadência** (`cadencias`, `cadencia_passos`, `cadencia_inscricoes`, [lib/cadencia.ts](../lib/cadencia.ts)):
  - Só tem o gatilho `entrou_etapa`. O passo usa `dia_offset` contado a partir da inscrição.
  - **Nunca envia nada**: só agenda, e o vendedor executa na Fila do dia.
  - A JM tem 0 cadências.
  - **Reaproveitar a ideia, não as tabelas** (§2.3).
- **Automatize** (`automacoes`, `automacao_execucoes`, [lib/automacoes.ts](../lib/automacoes.ts)):
  - Gatilhos: entrou na etapa, etiqueta, público.
  - Ações: criar tarefa, notificar o gestor, atribuir responsável, **enviar modelo aprovado**.
  - Já tem travas prontas ([lib/automatize/travas.ts](../lib/automatize/travas.ts)): horário comercial, teto por hora, o mesmo modelo para o mesmo contato no máximo a cada 7 dias, opt-out e pausa geral.
  - Roda de hora em hora pelo pg_cron (job `automacoes`).
  - A JM tem 0 automações. **O pós-venda reaproveita as travas e o envio de modelo**.
- **Envio de WhatsApp:**
  - Só pela Meta Cloud API, na Edge `webhook-leads`. As ações são `send`, `send_template` e `send_template_automacao`.
  - Modelos ficam em `modelos_mensagem` e `modelos_mensagem_wabas`, com a aprovação por número. A JM tem 1 aprovado.
  - O aviso de 24 h já existe no chat e no card do lead.
  - O link wa.me não tem helper compartilhado: há 7 cópias locais (`waLink()` na Fila, em Gestão de Leads, Orçamentos…).
- **Janela de pós-venda:** já é configurável por empresa (`retorno_cliente.pos_venda_dias`, tela em Configurações › SLA).
- **SLA e horário:** `configuracoes_sistema.sla_atendimento` (verde 30 / amarelo 120 min) e `horario_comercial`, mais [lib/horario-util.ts](../lib/horario-util.ts).
- **Campos obrigatórios por etapa:**
  - `funil_etapas.campos_obrigatorios` já é checado ao arrastar e no card ([kanban-board.tsx:122](../components/modules/leads/kanban-board.tsx), [lead-modal.tsx:1119](../components/modules/leads/lead-modal.tsx)).
  - A JM não usa.
  - **É o ponto natural para exigir "categoria" e "valor" ao ganhar.**
  - A checagem só existe na tela: a rota `/api/leads/mover` não confere.
- **Módulos:**
  - Manifesto em [core/modulos.ts](../core/modulos.ts), instalação em `empresa_modulos`, trava no proxy e nas APIs (`exigirModuloLigado`), vitrine e Central.
  - O menu já tem o grupo **"Pós-venda"** (Garantia, Assistência) em [lib/menu.ts:642](../lib/menu.ts).
  - **Clientes (`/clientes`) é core** e não se instala.
- **Motor de configuração:** o PDV v2 (§A) define `empresa_config` com o valor da loja, depois o da empresa, depois o padrão do manifesto, mais `config_salvar` auditado. O pós-venda declara suas chaves ali.
- **RLS padrão:** `empresa_id = get_empresa_id()` e `filiais_visiveis() @> array[coalesce(filial_id,0)]`, mais as políticas `somente_leitura_*` (`sessao_pode_escrever()`).
- **ZapIntel:**
  - Uma ficha de IA por negócio (`zapintel_lead_perfil`).
  - A classe `customer` vem da IA ("a conversa mostra que comprou") e **ignora o kanban**.
  - `zapintel_venda_lead` liga venda e negócio.
  - `zapintel_posvenda` existe, mas é um painel de "quem comprou e o que ficou solto", não uma régua.
  - A Fase 4A da conciliação faz o ZapIntel ler o ganho do Nexus.

### 1.3 O quadro do funil

- **Não esconde ganho nem perdido.** `quadro_base` não filtra `status`, e as colunas Convertido e Perdido aparecem com o texto "Vendas fechadas aparecem aqui" ([kanban-column.tsx:83](../components/modules/leads/kanban-column.tsx)).
- **Ganho não volta mais a aberto sem permissão (M1, em produção desde 23/11/2026).**
  - O gatilho `negocios_ganho_protegido` barra no banco a saída do ganho e a troca de `ganho_em`.
  - A rota [app/api/leads/mover/route.ts](../app/api/leads/mover/route.ts) devolve 409 `GANHO_REABRIR` quando falta o motivo. Com motivo, chama `reabrir_negocio`, que só aceita dono ou admin (403 `GANHO_SEM_PERMISSAO` para os outros).
  - Falta na tela o modal que pede o motivo: hoje aparece só a mensagem de erro.
- O que mudar está em §2.5.4.

---

## 2. Proposta

### Princípios

1. **O negócio ganho é imutável na prática.**
   - Ele só sai do ganho por uma ação explícita, "Reabrir venda", com permissão e motivo, registrada no histórico.
   - A mensagem do cliente nunca reabre um ganho (§0).
2. **Quem é o cliente é o CONTATO, não o negócio.** O ciclo de vida fica no contato e é calculado a partir dos negócios.
3. **O pós-venda é um objeto à parte**, num módulo (`posvenda`) com área própria no menu.
   - Ele não tem etapa no funil de vendas.
   - Fica ligado ao contato, ao negócio ganho, ao responsável e à empresa.
4. **Tudo o que varia é cadastro ou chave de configuração por empresa:** régua, perguntas, prazos, SLA, status de chamado, limites do ciclo de vida e janela de roteamento.
5. **Primeira versão sem envio automático.** O sistema monta a mensagem e o atendente envia.

### Onde cada parte mora (regra "tudo fora do core é módulo")

| Parte | Core ou módulo | Por quê |
|---|---|---|
| Ciclo de vida do contato, compras históricas, "Reabrir venda", quadro sem ganho/perdido, roteamento da Edge | **Core** | Mudam o significado de contato e negócio para toda empresa, com ou sem pós-venda |
| Régua (cadências), acompanhamentos, chamados, pesquisas/NPS, tela Pós-venda | **Módulo `posvenda`** (prefixo `posvenda_`) | Funcionalidade instalável. A Aletrini pode não querer |
| Indicadores de compra na ficha do cliente | Provedor do PDV (§L do PDV v2) + compras históricas | Com o PDV desligado, a ficha mostra os negócios ganhos |

---

## 2.1 Ciclo de vida do contato

### Estágios

| Estágio | Regra derivada (padrão) | Comparação com o HubSpot |
|---|---|---|
| `lead` | Tem só negócio aberto em etapa `normal`, ou nenhum negócio | Lead |
| `oportunidade` | Tem negócio aberto em etapa de tipo `negociacao` ou posterior (orçamento enviado, por exemplo; configurável pela lista de etapas) | Opportunity |
| `cliente` | 1 compra | Customer |
| `recorrente` | **2 compras ou mais em datas separadas por pelo menos 7 dias** (configurável) | (HubSpot não tem; vira propriedade) |
| `promotor` | Já é cliente e tem **última nota NPS ≥ 9** respondida nos últimos 12 meses | Evangelist |
| `inativo` *(opcional, desligado por padrão)* | Já é cliente e está há mais de X meses sem compra (sugestão: 18) | Other |

**Detalhes:**
- **Compra** é um negócio `ganho` **ou** uma compra histórica (§2.7). Venda do PDV conta quando ganha o negócio, que é a política `crm.venda_ganha_negocio` do PDV v2.
- **Por que "datas separadas" no recorrente:** quem compra iPhone e capa no mesmo dia pode gerar dois negócios. Isso não é recompra.
- **Precedência:** promotor > recorrente > cliente > oportunidade > lead. A regra de promotor é só um selo por cima da compra. Um promotor que não compra há 18 meses continua promotor; `inativo` só vale com a chave ligada.
- **Perdido não rebaixa.** Um cliente que perde uma negociação nova continua cliente. É a regra do HubSpot: o estágio só sobe, a não ser por ajuste manual.

### Ajuste manual

- `ciclo_manual` sobrepõe o calculado e guarda quem ajustou, quando e por quê.
- A ficha mostra o selo "ajustado por X".
- O botão "Voltar ao automático" limpa o ajuste.
- **Recomendação:** o ajuste manual **não expira**, mas a ficha mostra quando o calculado é diferente dele, por exemplo "Calculado: recorrente".

### Onde guardar: tabela 1:1 do core, `contato_ciclo`

| Opção | Prós | Contras |
|---|---|---|
| Coluna em `contatos` | Sem join | `contatos` é tabela quente, com gatilhos, RLS por loja e realtime do chat. Recalcular o ciclo disparia tudo isso |
| View calculada | Sempre certa | Lista e filtro ("todos os recorrentes da loja") recalculam tudo a cada abertura. Não indexa |
| **Tabela `contato_ciclo` (recomendada)** | Indexável, gravada só quando algo muda, não toca `contatos` | Precisa de gatilho e de um backfill |

**Atualização:**
- A função `contato_ciclo_recalcular(p_contato)` é `SECURITY DEFINER` e tem `search_path` fixo.
- Ela é chamada por gatilho `AFTER INSERT/UPDATE OF status, ganho_em, etapa_id/DELETE` em `negocios`, por resposta de pesquisa (`posvenda_respostas`) e por compra histórica.
- O custo é uma consulta por contato no índice `negocios (contato_id, status)`. É desprezível no volume atual (3,8 mil negócios).
- Um job diário recalcula só `inativo`, quando a chave estiver ligada.

**Multi-empresa:**
- `empresa_id` em toda linha, com a RLS padrão.
- Os limites (dias entre compras, nota de promotor, validade do NPS, meses para inativo) são chaves `core.ciclo_*` em `empresa_config`.
- O contato de cada loja é um contato separado, como hoje (`contatos.filial_id`). Por isso o ciclo é **por contato**, e a ficha soma os contatos de lojas diferentes que tenham o mesmo telefone (`telefone_e164`). **Decisão D2 (23/11):** ciclo por contato, somado na ficha pelo telefone.
  - A ficha mostra o estágio **mais alto** entre os contatos somados.
  - Mostra também as compras de todos eles, cada uma com a loja.
  - A lista de Clientes filtra pelo estágio de cada contato.

---

## 2.2 Objetos de pós-venda

### Acompanhamento (proativo)

- Cada **jornada** é uma régua aplicada a uma compra: `posvenda_jornadas`.
- Cada **acompanhamento** é um passo dessa jornada com data marcada: `posvenda_acompanhamentos`.
- O acompanhamento é o "item da fila". Ele tem o seu próprio resultado (feito, sem resposta, reagendado, pulado, cancelado) e, se o passo for pesquisa, a nota.
- **Por que não usar `tarefas`:**
  - Faltam campos: passo, roteiro, resultado e nota.
  - Seria preciso pôr colunas de módulo numa tabela do core.
  - A tela Tarefas pode **listar** os acompanhamentos do dia por um provedor do módulo, como o PDV faz com os indicadores do cliente, sem misturar as tabelas.
- **Materializar todos os passos na criação da jornada** (e não só o próximo, como a cadência de vendas faz) tem três vantagens:
  - a fila de "próximos 7 dias" sai de uma consulta só;
  - o vendedor vê a régua inteira na ficha;
  - recompra e cancelamento mexem em linhas concretas.

### Chamado (reativo, equivale ao ticket)

- Tabela `posvenda_chamados`.
- **Categoria**, cadastrável: garantia, defeito, troca, dúvida, insatisfação (NPS), entrega.
- **Prioridade**: baixa, normal ou alta.
- **Status** vem de um cadastro por empresa (`posvenda_chamado_status`), como as etapas do funil. Cada status tem um **tipo fixo** que o código entende:

| tipo | Significado | SLA |
|---|---|---|
| `aberto` | Ninguém pegou ainda | Corre a 1ª resposta |
| `andamento` | Alguém está cuidando | Corre a resolução |
| `aguardando_cliente` | Depende do cliente | **Pausa** |
| `aguardando_terceiro` *(opcional)* | Assistência Apple, fornecedor | Pausa, se a configuração mandar |
| `resolvido` | Fechado | Para |

- Status padrão semeados: Aberto, Em andamento, Aguardando cliente, Resolvido.
- **SLA:** prazo de 1ª resposta e de resolução em horas, **por categoria e prioridade** (`posvenda_chamado_sla`).
  - Pode ser contado em horário comercial (reaproveita `horario_comercial` e `lib/horario-util.ts`) ou em horas corridas, por escolha da empresa.
  - A tela usa as cores ok/warn/bad do design Precisão.
- **Ligação com a Assistência:** se o chamado vira conserto e o módulo `assistencia` está ligado, o botão "Abrir OS" cria a OS e guarda `assistencia_garantia_id` no chamado. O chamado continua sendo a conversa com o cliente; a OS é o serviço.
- Ambos os objetos levam `empresa_id`, `filial_id`, `contato_id`, `negocio_id` (de origem; pode ser nulo num chamado avulso), `responsavel_id`, criado por e quando.

---

## 2.3 Cadências (régua) configuráveis

### Modelo

**`posvenda_cadencias`, uma régua por empresa:**
- `nome`, `ativo`, `prioridade` (inteiro; desempata réguas que se aplicam à mesma compra).
- `gatilho`: `negocio_ganho` (o único da v1) ou `compra_historica`.
- `filtros` jsonb, com tudo opcional:
  - `categorias` (ids de `estoque_categorias`);
  - `condicao`: `novo` / `seminovo` (de `estoque_unidades.condicao` quando há PDV, senão de um campo do negócio);
  - `valor_min` / `valor_max`;
  - `filiais`;
  - `funis`;
  - futuro: `segmento_veiculo` (Aletrini).
- `ao_recomprar`: `substituir` | `manter` | `pausar` (ver abaixo).
- `ancora_padrao`: `ganho` | `entrega`.

**`posvenda_cadencia_passos`:**
- `ordem`, `dia_offset` (≥ 0), `ancora` (`ganho` | `entrega`; nulo = a da régua), `hora_sugerida`.
- `ativo` (o passo pode ficar pronto e desligado, como o seguro do D+90; **D7**) e `filtros` jsonb **do passo** (mesmo formato dos da régua, por exemplo `{"condicao": "seminovo"}`). Um passo cujo filtro não casa com a compra não é materializado.
- `tipo_acao`: `whatsapp` | `ligacao` | `pesquisa` | `tarefa_interna`.
- `titulo` e `roteiro`: texto com variáveis `{nome}`, `{produto}`, `{vendedor}`, `{loja}`, `{data_compra}`.
- `modelo_id` (modelo aprovado da Meta, opcional; usado fora da janela de 24 h).
- `pesquisa_id` (quando `tipo_acao = pesquisa`).
- `responsavel`: `acompanhamento` (vendedor do negócio, senão padrão opcional da loja, senão roleta da loja) | `administradores` | `usuario:<uuid>` (D9 revista em 24/11).

**Responsável (D9 revista pelo Lucas em 24/11/2026; substitui o "responsável padrão por loja" obrigatório).**
- **Loja do negócio** = `negocios.filial_id`, herdada do contato ou do canal quando o negócio nasce.
  - Conferido em 24/11: dos 290 ganhos da JM, **nenhum** está sem loja (273 na matriz, 17 em Jaguariúna).
  - Negócio sem loja vai para os administradores.
- **Função única:** `posvenda_resolver_responsavel(p_empresa, p_filial, p_tipo, p_negocio)`. O `p_tipo` é `acompanhamento` ou `admin`. Nenhum acompanhamento ou chamado nasce sem responsável; `responsavel_id` é **NOT NULL**.
- **Passo de acompanhamento:**
  - **a)** O vendedor do negócio (`negocios.responsavel_id`), se ativo na empresa (`empresa_usuarios.ativo`).
  - **e)** Senão, se a configuração **opcional** `posvenda.responsavel_padrao` tiver alguém para a loja, ele tem prioridade sobre a roleta.
  - **b)** Senão, a **roleta do pós-venda** entre os **vendedores** ativos da loja:
    - `role = 'vendedor'`, a mesma regra de loja de `lib/roleta.ts` (vendedor sem loja conta como da matriz);
    - com **contador próprio**: tabela `posvenda_roleta (empresa_id, filial_id, ultimo_usuario_id)`, travada com `FOR UPDATE`;
    - "ausente" não tira da roleta, porque o passo é para dias depois;
    - a roleta de leads **não** serve como está, porque não filtra cargo e poria os administradores e a conta da empresa na matriz.
  - **d)** Loja sem vendedor ativo: os administradores.
- **NPS com nota até o limite (6) e chamados (c):** os **administradores** da empresa, distribuídos entre eles pela mesma roleta (contador próprio, chave "administradores").
  - "Administrador" é buscado pelo cargo: `empresa_usuarios.role = 'admin'` e `ativo`. Na JM hoje são Matheus e Eduardo.
  - Nenhum nome fixo no código.
  - Empresa sem nenhum admin ativo cai no `owner`, a última rede.
- **Na hora do passo:** se o responsável estiver inativo quando o passo vence, a mesma função escolhe de novo.
  - Ao desativar um usuário em `empresa_usuarios`, os passos pendentes e os chamados abertos dele são redistribuídos pela mesma função.
  - Fica a observação "reatribuído" no acompanhamento e um registro em `posvenda_chamado_eventos`.
- **Ligar o módulo não exige configuração de responsável.** A tela mostra as lojas sem vendedor ativo, cujos passos irão para os administradores, e o `responsavel_padrao` opcional por loja.
- **Nos passos da régua da JM:** D+1, D+30, D+90 e D+330 são acompanhamento (vendedor ou roleta da loja). O NPS de nota baixa e os chamados vão para os administradores.
- `tolerancia_dias`: depois desse prazo atrasado, o passo vira "perdido". Não fica para sempre na fila.
- `pular_se`: lista de condições, por exemplo `chamado_aberto` ou `respondeu_nps`.

**Âncora.** "D+1 entrega" só faz sentido a partir da **entrega**. Na encomenda, a conciliação usa a data do pedido como `ganho_em`, e a entrega pode ser semanas depois. Com o PDV v2 a entrega vem de `vendas.entregue_em`. Sem PDV, ou sem a entrega informada, o passo usa o ganho e mostra a etiqueta "data estimada".

**De onde vem a categoria da compra.** O negócio só tem `produto_interessado` em texto, vazio em 84% dos convertidos. Por isso:
1. Com PDV e venda ligada ao negócio: as categorias dos itens.
2. Sem isso: **campos obrigatórios na etapa de ganho** (`funil_etapas.campos_obrigatorios`, que já existe): `categoria_compra` (opção, da lista de categorias), `condicao` (novo/seminovo) e `valor`.
   - É preciso levar a checagem também para a rota `/api/leads/mover`. Hoje ela só existe na tela.
3. Sem categoria: aplica-se a régua "Geral" da empresa, se existir.

**Data da venda no modal de ganho (decisão do Lucas, 23/11/2026).** O modal que abre ao marcar ganho (arrastar para a etapa de ganho, botão no card ou PDV sem venda ligada) pede, além dos campos obrigatórios acima, a **data da venda**: campo de data com **hoje** como padrão, que não aceita data futura. É essa data que vai para `ganho_em`, e não o instante do clique.
- **Motivo:** a equipe registra o ganho dias depois da venda. Com `ganho_em` = clique, a régua de pós-venda (D+1, D+7…) começa atrasada e a janela da Edge (`pos_venda_dias`) fica deslocada: a mensagem do cliente cai em pós-venda quando já devia abrir negócio novo, ou o contrário. Exemplo real: o 5096 foi marcado ganho em 23/11, com pedido no grupo em 15/10 (a confirmar com a equipe).
- **Hora:** data passada grava meio-dia no fuso da empresa; hoje grava o instante atual.
- **Servidor:** a rota `/api/leads/mover` aceita `ganho_em` no corpo, recusa data futura ou anterior à criação do negócio por mais de 30 dias (tolerância para venda registrada antes do lead) e, sem o campo, usa agora (compatível com os clientes antigos).
- **Correção depois (decisão de 23/11):** a data de um ganho já gravado só muda pela RPC própria **`corrigir_data_venda(p_negocio bigint, p_nova_data date, p_motivo text)`**. **Nunca** por `reabrir_negocio`, que serve para tirar do ganho, não para corrigir a data.
  - **Só dono ou admin** (`is_empresa_admin`), com a mesma checagem de empresa e de somente leitura da `reabrir_negocio`.
  - Recusa: negócio que não é ganho, motivo com menos de 5 caracteres, data nula (`DATA_INVALIDA`), **data futura** (`DATA_FUTURA`), **data antes de 01/01/2024** (`DATA_ANTIGA`; o grupo de pedidos da JM começa em mar/2024) e data igual à atual (`DATA_IGUAL`).
  - **Aceita com aviso** (não barra) data anterior à entrada da empresa no Nexus ou à criação do negócio: há vendas reais assim (a JM entrou em 19/06/2026 e a triagem tem vendas de maio e junho). Os avisos voltam no resultado e ficam no histórico (`detalhe.avisos`).
  - **Grava em `negocio_historico`** a ação `data_venda_corrigida`, com `por_usuario` e `detalhe` = data anterior, data nova e motivo.
  - **Libera o gatilho da M1** com uma exceção própria (`nexus.corrigir_data_venda` = id do negócio), que permite **só** trocar `ganho_em` com o status continuando ganho.
  - **Hora gravada:** meio-dia no fuso da empresa; se for hoje, o instante atual.
  - **Efeitos:** o ciclo de vida (M4) recalcula pelo próprio gatilho em `negocios.ganho_em`. A janela de roteamento da Edge muda junto, porque ela lê `ganho_em`.
  - **Ponto previsto para o pós-venda (M6):** a RPC já chama `posvenda_reancorar_jornada(negocio_id bigint)` **se ela existir** (`to_regprocedure`). Hoje não existe, e nada acontece. A M6 cria a função com essa assinatura: ela reposiciona os passos **pendentes** da jornada pela data nova, e os já feitos ficam. Nenhuma tabela é criada agora, e a M3 não muda quando a M6 chegar.
  - **Tela:** o botão "Corrigir data da venda" aparece na lista de ganhos e na aba Compras da ficha, só para dono e admin.
  - **Primeiro caso:** o 5096, se a equipe confirmar que a venda é a de 15/10.

**Caminhos que marcam ganho (Entrega A, 23/11/2026).** Todos passam a exigir a venda ou a recusam:

| Caminho | Como trata data, categoria, condição e valor |
|---|---|
| Quadro (arrastar para a etapa de ganho) | Abre o modal "Venda fechada"; a rota `/api/leads/mover` valida de novo (422 `GANHO_DADOS`) |
| Ficha do lead (seletor de etapa) | Mesmo modal e mesma rota |
| Ficha do lead ("Converter em cliente") | Mesmo modal antes de converter; se o lead já é venda, converte sem pedir de novo |
| Ficha imobiliária (mover etapa) | Mesmo modal e mesma rota |
| Excluir etapa levando os leads para uma etapa de ganho (`/api/funil`) | **Recusado** quando há lead que não é venda (ganho em lote não tem os dados) |
| Importação de planilha numa etapa de ganho (`/api/importacao`) | **Recusada**: importa numa etapa aberta e marca cada venda depois |
| Lead novo numa etapa de ganho (`/api/leads`, agendamento online) | **Recusado** antes de criar o contato |
| Edge / mensagem do cliente (`core_negocio_do_canal`) | Nunca marca ganho (só abre, reabre ou cria aberto) |
| PDV, ZapIntel, automações | Hoje não marcam ganho. Quando o PDV ganhar o negócio (`crm.venda_ganha_negocio`), preenche data, categoria, condição e valor **a partir da venda** |
| Conciliação (scripts) | Grava a data do pedido e o valor; sem categoria e condição (o grupo de pedidos não as tem) |

- O que a tela grava: `ganho_em` (data da venda: meio-dia no fuso; hoje = instante atual), `valor_estimado` = valor da venda e `negocios.dados.venda` = `{data, categoria_id, condicao, valor, registrada_por, registrada_em}`.
- **Categoria:** a lista ativa de `estoque_categorias` da empresa, na `ordem` dela (a JM: iPhone, iPad, MacBook, Watch, Acessórios, Perfumes, Outros). Empresa sem categoria cadastrada não é cobrada.
- **Condição:** valores `novo` / `seminovo`. O rótulo do segundo é **vocabulário da empresa** (`vocabulario.usado`, padrão "Usado"), porque "seminovo" é termo do segmento de celular e a trava do build não deixa termo de segmento no núcleo. Gravado em 23/11/2026 para a JM e para a "Nexus Demonstração" (`empresa_menu.itens.base.vocabulario.usado = "Seminovo"`).

### Recompra no meio da régua

**Regra do Lucas (24/11/2026), implementada na C3** (substitui o `substituir`/`manter`/`pausar` por régua):
- Venda nova da **mesma categoria** cancela, com o motivo `recompra`, **só os passos de ciclo de troca** (`posvenda_cadencia_passos.ciclo_troca`, o D+330) pendentes das jornadas anteriores do cliente. Os outros passos da jornada anterior continuam.
- Venda de **outra categoria** (acessório depois de iPhone, iPad depois de iPhone) não cancela nada.
- **Uma jornada por venda.** O passo igual (mesmo tipo de ação, mesmo cliente, mesmo dia), vindo de duas vendas, não duplica: o segundo nasce `juntado`, apontando para o primeiro. Se o primeiro sai da fila (cancelado ou pulado), o juntado volta a ser pendente.
- Venda reaberta e ganha de novo: **jornada nova**. A antiga fica cancelada; há só uma jornada **ativa** por negócio e régua.

**Regras anti-excesso** (chaves da empresa):
- `posvenda.intervalo_minimo_dias`, padrão 3: no máximo 1 contato proativo por cliente nesse intervalo. Os passos que colidem são empurrados para depois.
- Várias compras no mesmo dia geram uma jornada **por venda** (24/11), com os passos iguais juntados (ver acima).
- O teto diário por responsável (`posvenda.teto_diario_por_responsavel`, padrão 25) segura a fila em dia de importação em massa (§2.7).

### Sugestão inicial — JM (dados semeados, tudo editável)

**Régua "iPhone e aparelhos Apple"** (categorias 1, 2, 3, 4; prioridade 100; `substituir`):

| Passo | Quando | Ação | Roteiro (resumo) |
|---|---|---|---|
| 1 | D+1 da **entrega** | WhatsApp | Chegou bem? Transferência de dados, Face ID, iCloud, película. Oferece ajuda |
| 2 | D+7 | Pesquisa (NPS) | "De 0 a 10, quanto recomendaria a JM?" + comentário |
| 3 | D+30 | WhatsApp | Acessórios: capa, película, carregador, AirPods. Com cupom, se a empresa quiser |
| 4 | D+90 | WhatsApp | **Só seminovo** (filtro do passo `condicao = seminovo`): saúde da bateria e dicas de carga. **D7** |
| 4b | D+90 | WhatsApp | **Seguro:** semeado **pronto e desligado** (`ativo = false`). Liga quando a JM tiver um parceiro de seguro. **D7** |
| 5 | D+330 | Ligação ou WhatsApp | Ciclo de troca: avaliação do usado como entrada. Fica antes de completar 1 ano, a tempo de oferecer o modelo novo |

O "lançamento do iPhone" (setembro) não é um passo, é uma **campanha**: o público "clientes de iPhone há mais de 10 meses" no módulo Públicos + Transmissão.

**Régua "Perfumes"** (categoria 7; prioridade 50; `manter`):
- D+3: fixação e se gostou.
- D+7: NPS, só se não houver outro NPS nos últimos 60 dias.
- D+75: reposição ("seu frasco deve estar acabando") com sugestão de lançamento.

**Régua "Acessórios"** (categoria 6; prioridade 10; `manter`):
- Só D+7 com NPS, e só se o cliente não estiver numa régua de aparelho.

### Sugestão inicial — Aletrini (só desenho, não semear agora)

| Passo | Quando | Ação |
|---|---|---|
| 1 | D+3 | Transferência do veículo concluída? Documento em mãos |
| 2 | D+30 | Experiência + NPS |
| 3 | Primeira revisão | `dia_offset` configurável (por exemplo D+180). **Por km não dá na v1**, porque não há dado de rodagem |
| 4 | D+365 | Aniversário da compra + avaliação para troca |
| (opcional) | jan/fev | IPVA e licenciamento: campanha por público, não passo |

O módulo `avaliacoes` (veículos) está em preparação. A régua da Aletrini usa os mesmos tipos de passo, sem nada de veículo no código.

---

## 2.4 Pesquisa de satisfação

**Modelo:**
- `posvenda_pesquisas`, por empresa: `nome`, `tipo` (`nps` 0–10 | `csat` 1–5), `pergunta`, `pergunta_comentario`, `ativo`.
- `posvenda_respostas`:
  - `contato_id`, `negocio_id`, `acompanhamento_id`, `pesquisa_id`, `nota`, `comentario`;
  - `canal`: `registrada_pelo_atendente` | `link` (fase 2);
  - `respondida_em`, `registrada_por`;
  - **retrato do momento**: `vendedor_id` e `filial_id` do negócio. Assim o indicador por vendedor não muda se o negócio trocar de dono depois.
- A nota vai para `contato_ciclo.nps_ultimo` / `nps_em`, e o selo de promotor sai daí.

**Nota baixa:**
- Nota ≤ `posvenda.nps_limite_detrator` (padrão 6) **abre um chamado** da categoria "Insatisfação", prioridade alta.
- O chamado vai para os **administradores** da empresa (D9 revista em 24/11), pela roleta "administradores" da mesma função do §2.3. O chamado nunca nasce sem responsável.
- O texto inicial do chamado é a nota mais o comentário.

**Indicadores** (tela do módulo; ver também §2.5):
- NPS = % promotores (9–10) − % detratores (0–6).
- Por período, **por vendedor** (o retrato), **por loja** (Guaçu, Jaguariúna) e por categoria de produto.
- Taxa de resposta = respostas ÷ passos de pesquisa feitos.
- Só a **primeira resposta por negócio** entra no NPS.
- **Campinas não existe como loja no cadastro.** **Decisão D3 (23/11):** não cadastrar por enquanto. Fica fora do MVP. Os indicadores mostram só as lojas cadastradas.

**Fase 2:** um link público com token (o padrão de [lib/portal-token.ts](../lib/portal-token.ts)) para o próprio cliente responder. O atendente manda o link na mensagem.

---

## 2.5 Telas

### 2.5.1 Menu

- **Pós-venda** (`/pos-venda`) entra no grupo "Pós-venda" que já existe, ao lado de Garantia e Assistência.
- Fica no manifesto: `chave: 'posvenda'`, `abasConfiguracoes: ['posvenda']`, sem `requer`.
- Nome **"Pós-venda"** (**D4, 23/11**), e não "Clientes", porque **Clientes já é core** (`/clientes`), e duas telas com o mesmo nome confundem.
- A ficha do cliente melhora no core (§2.5.3).
- Com o módulo desligado, aparece a vitrine (`/vitrine/posvenda`).

### 2.5.2 Fila "Hoje" (`/pos-venda`)

- Três abas: **Atrasados · Hoje · Próximos 7 dias**. Filtros: Meus / da loja / todos (conforme a permissão), régua e tipo.
- Cada cartão mostra:
  - cliente e estágio;
  - a compra (produto, data, vendedor, loja);
  - o passo (título e roteiro já preenchido);
  - quantos dias de atraso.
- **Ações rápidas:**
  - **Abrir WhatsApp:**
    - Se há conversa no Nexus **dentro da janela de 24 h**, abre o chat com o texto no campo.
    - Fora da janela, oferece o **modelo aprovado** do passo, se houver.
    - Senão, `wa.me` com o texto. Esse caminho não fica registrado no Nexus, e a tela avisa.
    - Nos três casos o atendente é quem aperta enviar.
  - **Registrar resultado:**
    - feito;
    - sem resposta (tenta de novo em N dias, configurável);
    - pediu para falar depois (reagenda);
    - número errado;
    - não quer contato (marca o opt-out, que o Automatize já respeita).
    - No passo de pesquisa, pede a nota de 0 a 10 e o comentário.
  - **Reagendar** (escolhe a data).
  - **Abrir chamado** (já preenchido com o contato e a compra).
  - **Pular passo** (com motivo).
- O helper `wa.me` vira `lib/whatsapp-link.ts`, compartilhado, no lugar das 7 cópias locais. É um ajuste pequeno, de passagem.

### 2.5.3 Ficha do cliente (core, `/clientes` → ficha)

**Cabeçalho:** nome, telefone, loja, **estágio do ciclo de vida** (com o selo "ajustado"), NPS mais recente e responsável.

**Abas:**
- **Compras:** negócios ganhos e compras históricas, com produto, valor, data, vendedor e loja.
  - Mostra "Reabrir venda" só para quem tem a permissão.
  - Corrige o bug "Compras / Total gasto = 0" que o PDV v2 §L.1 aponta: com o PDV desligado, o total vem dos negócios ganhos.
- **Aparelho atual:**
  - O produto mais recente das categorias que contam como aparelho (chave `posvenda.categorias_aparelho`, padrão 1,2,3,4), com IMEI e condição quando houver venda do PDV ligada.
  - Garantia: vencimento quando o PDV v2 ou o módulo Garantia estiverem ligados.
- **Pós-venda** (só com o módulo ligado): jornada em andamento (a régua inteira, com o que foi feito e o que falta), notas de NPS e chamados.
- **Conversas:** link para o chat do contato e a ficha do ZapIntel, quando o ZapIntel estiver ligado.

### 2.5.4 Funil de vendas

**Ganho e perdido saem do quadro:**
- `quadro_base`, `quadro_contagens` e `quadro_pagina` ganham `p_status text default 'aberto'`.
- As colunas de tipo `ganho` e `perdido` somem por padrão.
- O filtro "Mostrar: Abertos | Ganhos | Perdidos" troca para uma **lista** (não colunas) com data, valor e vendedor. É o que o HubSpot faz com o "Closed won".
- **Arrastar para ganho/perdido continua possível:** uma faixa de soltar fixa no rodapé do quadro ("Ganhou" / "Perdeu") no lugar das colunas, como no Kommo.
- **Reabrir venda (D10, 23/11):** **dono e admin por enquanto**. O banco já faz isso (M1: `reabrir_negocio` exige `is_empresa_admin` e motivo, e grava `reaberto_manual` com o estado anterior).
  - Falta a tela: o **modal que pede o motivo** ao arrastar um ganho para fora ou ao clicar em "Reabrir venda". Hoje aparece só o 409.
  - Quando os cargos do PDV v2 existirem, a checagem passa a ser a permissão `negocios.reabrir_ganho`, ligada para Dono e Gerente. Muda só a função `reabrir_negocio`; a rota e a tela continuam iguais.
  - Ao reabrir, o ciclo de vida é recalculado.
- **Corrigir data da venda:** `corrigir_data_venda` (§2.3), só dono e admin, na lista de ganhos e na ficha.
- **Campos obrigatórios do ganho** passam a ser checados também na rota, e não só na tela.

**Etapa "Pós Venda" (id 38) — como migrar sem perder nada:**
1. **Feito em 23/11:** a 4B da conciliação levou **41** dos 80 a ganho, com a data do pedido. Nesse intervalo, outro saiu da etapa pela equipe.
   - Ao instalar o módulo, a régua é criada, mas os passos com data já vencida nascem `pulado` (motivo `retroativo`).
   - Só os passos futuros ficam na fila: tipicamente o D+330 e, para as compras de novembro, o D+30.
2. **38 restantes** (37 Guaçu, 1 Jaguariúna, todos sem responsável). **Triagem feita pelo Matheus (D11, 23/11)** numa **planilha**, e não numa tela:
   - Arquivo: `conciliacao-pedidos/rodada2-20261123/triagem_pos_venda.csv` (dados de clientes, fora do git).
   - Colunas: cliente, telefone, loja, criado em, última interação, resumo da conversa, se está na lista "sem registro", pedidos no grupo e a sugestão de Claude. As colunas `decisao` e `observacao` ficam para o Matheus.
   - As decisões possíveis:
     - **ganho com data X** → etapa Convertido, `ganho_em` = X;
     - **aberto em etapa Y** → Em contato, Negociando ou Stand By;
     - **perdido** com motivo.
   - A planilha preenchida é aplicada por script, com o mesmo cuidado da 4B: backup, transação, filtro pelo status atual, parada se a contagem divergir e histórico `triagem_pos_venda`.
   - Em quatro deles (433, 520, 970, 2636) o pedido também está no `conciliacao_revisar.csv`; vale **uma** decisão por negócio.
3. Só quando a etapa estiver **vazia**: `funil_etapas.ativo = false`.
   - **Nunca apagar.** O `negocio_historico` aponta para ela.
   - O nome passa a "Pós Venda (antiga)", para ler o histórico sem confusão.
4. As automações e cadências que citam o slug `pos_venda` são conferidas antes do passo 3. Hoje a JM tem 0 de cada.

---

## 2.6 WhatsApp, Edge e ZapIntel

### Envio (v1 manual; automático depois)

- **v1:** nada é enviado sem o clique do atendente. Os três caminhos estão em §2.5.2.
- **Envio automático (fase 3):**
  - Usa o motor que já existe: `send_template_automacao` e as travas do Automatize (horário comercial, teto por hora, intervalo por modelo, opt-out, `automacoes_pausadas`).
  - É ligado **por empresa e por passo**: a chave `posvenda.envio_automatico` vem `false` de fábrica, e o passo precisa ter `modelo_id`.
  - **Regra da Meta:** passo automático só pode usar **modelo aprovado**. Pós-venda proativo cai quase sempre fora da janela de 24 h, porque o cliente não falou nas últimas 24 h.
    - Os modelos são de categoria **UTILITY** (acompanhamento da compra, entrega) ou **MARKETING** (acessórios, troca). A cobrança e as regras de opt-in são diferentes. **Decisão D8 (23/11): só UTILITY no começo.**
    - A pesquisa de NPS por modelo pode usar botões de resposta rápida (0–10 não cabe; uma alternativa é "Ótimo / Bom / Ruim" + link). Fica para a fase 2/3.
- A tela de configuração mostra, em cada passo, se o modelo está aprovado **no número de cada loja** (`modelos_mensagem_wabas`). A Edge já confere isso no `send_template`.

### Roteamento da mensagem que chega (Edge → `core_negocio_do_canal`)

A nova ordem é a correção do §0 mais o pós-venda:

1. Há negócio **aberto** e ativo → entra nele. Sem mudança.
2. **Só com o módulo ligado** (regra ajustada pelo Lucas em 23/11). A mensagem fica no pós-venda, sem abrir negócio, **apenas** quando o contato (na loja) tem:
   - um **chamado aberto** (status de tipo ≠ `resolvido`); **ou**
   - um **acompanhamento pendente já vencido ou com data de hoje**, dentro da janela `posvenda.janela_acompanhamento_dias` (padrão **3**). Em termos de banco: `status = 'pendente'` e `previsto_para` entre o início do dia de (hoje − janela) e o fim de hoje, no fuso da empresa.
   - A mensagem fica na conversa como hoje (`mensagens` é por contato e loja). O chamado ou o acompanhamento ganha a marca "cliente respondeu", e a fila do pós-venda mostra isso.
   - **Passo futuro não segura mensagem.** Um D+330 agendado para daqui a meses, ou um D+7 para amanhã, não faz diferença: o cliente que escreve querendo comprar cai nas regras da M1 abaixo e ganha negócio novo. Sem isso, uma régua de 12 meses esconderia as recompras, que é o problema que a M1 e a 4A acabaram de resolver.
   - O acompanhamento vencido há mais que a janela também não segura: ele já está na fila de atrasados do responsável, e a mensagem nova pode ser outra conversa.
3. **Regra da M1 (em produção):** há negócio **ganho**, arquivado ou não, com `ganho_em` dentro de `pos_venda_dias` → a mensagem entra nele ("em pós-venda", sem negócio novo).
4. Há negócio **perdido** ou arquivado → **reabre o mesmo**, como hoje.
5. **Ganho fora da janela e nada aberto → cria um negócio NOVO** na primeira etapa do funil padrão. O ganho antigo não é tocado. A ficha mostra "cliente recorrente em negociação".
6. Nenhum negócio → cria um, como hoje.

Sobre a configuração:
- X = `pos_venda_dias` **já é por empresa** e já tem tela. Ele passa para `empresa_config` (`core.pos_venda_dias`) quando o motor do PDV v2 existir, mantendo o valor atual.
- O item 2 só olha as tabelas `posvenda_*` se o módulo estiver ligado (`core_modulo_ligado(p_empresa,'posvenda')`). Sem módulo, valem os itens 1, 3, 4, 5 e 6, que são exatamente a função da M1/M1b em produção.
- `posvenda.janela_acompanhamento_dias` é lida por `config_valor_emp(p_empresa, 'posvenda', 'janela_acompanhamento_dias', p_filial)`. Vale `coalesce` com 3; 0 = só os de hoje.

**Testes obrigatórios da M7** (transação desfeita no banco, como a M1):

| Cenário | Esperado |
|---|---|
| **Cliente com D+330 agendado (futuro), ganho há 300 dias, manda "quero comprar o 18"** | **Negócio NOVO** (`novo_apos_ganho`); o D+330 continua pendente e intacto; nada marcado como "cliente respondeu" |
| D+7 agendado para amanhã, ganho há 6 dias | Entra no ganho pela regra 3 (dentro dos 30 dias), não pelo acompanhamento |
| D+330 agendado para amanhã, ganho há 329 dias | Negócio novo (passo futuro não segura) |
| Acompanhamento com data de hoje, ganho fora da janela | Fica no pós-venda: nenhum negócio aberto, acompanhamento com "cliente respondeu" |
| Acompanhamento vencido há 2 dias (janela 3) | Fica no pós-venda |
| Acompanhamento vencido há 5 dias (janela 3) | Negócio novo; o acompanhamento segue na fila de atrasados |
| Janela configurada em 0 | Só o de hoje segura |
| Chamado aberto (aguardando cliente), ganho há 200 dias | Fica no pós-venda; o chamado ganha o evento `cliente_respondeu` |
| Chamado resolvido, ganho há 200 dias | Negócio novo |
| Cliente com negócio aberto e chamado aberto | Entra no negócio aberto (regra 1 vem antes) |
| Módulo desligado com acompanhamento de hoje | Ignora o pós-venda: igual à M1 |
| Acompanhamento de hoje em **outra loja** do mesmo contato | Não segura (a regra é por contato e loja) |
| Perdido, arquivado, sem negócio | Iguais à M1 (reabre; reabre; cria) |

**Atenção:** mexer nessa função muda o comportamento de recebimento de todos os canais. Teste e promoção seguem o cuidado já registrado para a Edge (memória "Integrações Meta — zona sensível"): migração com rollback, teste com contato de teste e conferência em `negocio_historico`.

### ZapIntel

- A Fase 4A da conciliação já faz o ZapIntel tratar o negócio `ganho` como Cliente e tirá-lo da fila.
- Com este desenho, o ZapIntel passa a ler também `contato_ciclo.estagio`: um recorrente que abriu negócio novo aparece com o selo "cliente" na lista de leads, e a ficha da IA recebe "já comprou X em dd/mm" no contexto do prompt.
- O painel `zapintel_posvenda` (quem comprou e ficou com ponta solta) vira **fonte de sugestão** de chamado: um botão "abrir chamado" na linha. Não cria nada sozinho.
- **Não fazer na v1:** a IA classificar a resposta do cliente ("respondeu 9" → registrar a nota). É possível na fase 3, sempre como **sugestão** que o atendente confirma.

---

## 2.7 Clientes históricos (cerca de 800 pedidos sem negócio)

**Dados (conciliação, Fase 3):**
- 804 pedidos sem negócio, de mar/2024 a nov/2026, com nome, produto, valor, data e loja.
- Só parte tem telefone:
  - 112 têm telefone que não está no Nexus;
  - 120 trazem só o primeiro nome;
  - 120 são de contatos cujo único aberto foi criado depois do pedido.

**As duas opções:**

| | (A) Negócio ganho num funil "Histórico" | **(B) Tabela de compras históricas (recomendada)** |
|---|---|---|
| Contato obrigatório | Sim (negócio exige contato), o que forçaria criar 300 contatos de "primeiro nome só" | Não: `contato_id` pode ser nulo e é ligado depois |
| Efeito colateral | Entra em relatório de conversão, no quadro (com filtro), no ZapIntel e no roteamento da Edge (regra 3/5) | Nenhum: só o ciclo de vida, a ficha e a régua leem |
| Idempotência | Teria de vir de `dados` | `unique (empresa_id, origem, origem_ref)`, com o `id_pedido` da conciliação |
| Ligação posterior | Juntar negócios | Basta preencher `contato_id` |

**Tabela core `compras_historicas`:**
- `id`, `empresa_id`, `filial_id`, `contato_id` (nulo), `nome_informado`, `telefone_e164`;
- `produto`, `categoria_id`, `condicao`, `valor numeric`, `data_compra date`, `vendedor_nome`;
- `origem` (`pedidos_whatsapp`, `planilha`…), `origem_ref`, `confianca` (`telefone` | `nome` | `manual`), `negocio_id` (se um dia virar negócio);
- `importado_por`, `importado_em`.
- RLS padrão. Escrita **só por RPC/importador** (service role ou dono).

**Importação:**
1. O script da conciliação (`scripts/conciliar-vendas`, que já extrai, normaliza e pula os `id_pedido` já tratados) gera o arquivo de importação.
2. Liga ao contato só nas faixas A/B (telefone). Faixas C/D/nome ficam sem contato e aparecem numa lista "ligar ao contato".
3. Cria contato novo **só para quem tem telefone válido** e não existe. **Decisão D5 (23/11): aprovado, na Fase 2.** O contato novo não abre negócio. Se esse cliente mandar mensagem, a Edge cria negócio novo (regra 6) e a ficha já mostra o histórico.

**Sem régua retroativa:**
- O gatilho `compra_historica` gera jornada **só com os passos cuja data ainda não passou**. Do D+1 ao D+30 já passaram para quem comprou há mais de 30 dias.
- Compras com mais de 12 meses já passaram do D+330. Elas **não** entram na fila; vão para um **público** "ciclo de troca vencido" (módulo Públicos), que o Lucas trabalha como campanha, no ritmo dele.
- Compras entre 30 dias e 11 meses ganham só o passo D+330 futuro.
- O teto diário por responsável (`posvenda.teto_diario_por_responsavel`) distribui o que cair na mesma semana.

---

## 2.8 Esquema e plano

### 8.1 Tabelas e colunas novas

Convenções:
- `bigint generated always as identity`, `timestamptz`, `empresa_id bigint not null references empresas`.
- `filial_id bigint references filiais` (nulo = empresa toda).
- RLS ligada com a política padrão (`empresa_id = get_empresa_id()` e `filiais_visiveis() @> array[coalesce(filial_id,0)]`) mais as 3 políticas `somente_leitura_*`.
- Escrita das regras sensíveis só por RPC `SECURITY DEFINER` com `search_path` fixo e checagem de `core_modulo_ligado`.

**Core**

| Tabela / coluna | Colunas principais | Índices / restrições |
|---|---|---|
| `contato_ciclo` | `contato_id` PK FK contatos on delete cascade, `empresa_id`, `estagio` text CHECK (lead, oportunidade, cliente, recorrente, promotor, inativo), `estagio_calculado`, `ciclo_manual` text null, `manual_por` uuid, `manual_em`, `manual_motivo`, `compras_qtd` int, `primeira_compra_em` date, `ultima_compra_em` date, `valor_total` numeric, `nps_ultimo` smallint, `nps_em` timestamptz, `atualizado_em` | `(empresa_id, estagio)`, `(empresa_id, ultima_compra_em)` |
| `compras_historicas` | ver §2.7 | `unique (empresa_id, origem, origem_ref)`, `(empresa_id, contato_id)`, `(empresa_id, telefone_e164)` |
| `negocio_historico.acao` | valores já em uso desde a M1: `reaberto_manual`, `ganho_restaurado`, `novo_apos_ganho`, `arquivado`/`desarquivado`, `conciliacao_zip`. Novos: `data_venda_corrigida`, `triagem_pos_venda` | — |
| RPC `corrigir_data_venda(bigint, date, text)` + exceção `nexus.corrigir_data_venda` no gatilho da M1 | §2.3 | — |
| Funções `config_valor_emp` / `config_valor` / `config_salvar` (provisórias sobre `configuracoes_sistema`) | §8.1, D6 | — |
| Função `contato_ciclo_recalcular(bigint)` + gatilho em `negocios` e `compras_historicas` | — | — |
| `core_negocio_do_canal` (revisada) | ordem do §2.6 | — |
| `quadro_base` / `quadro_contagens` / `quadro_pagina` | + `p_status text default 'aberto'` | índice parcial `negocios (empresa_id, funil_id, etapa_id) where status='aberto'`, se o EXPLAIN pedir |

**Módulo `posvenda`**

| Tabela | Colunas principais | Índices / FKs |
|---|---|---|
| `posvenda_cadencias` | `id`, `empresa_id`, `nome`, `ativo`, `prioridade` int, `gatilho` text CHECK, `filtros` jsonb, `ao_recomprar` text CHECK, `ancora_padrao` text CHECK, `criado_por`, `criado_em` | `(empresa_id, ativo)` |
| `posvenda_cadencia_passos` | `id`, `empresa_id`, `cadencia_id` FK cascade, `ordem`, `ativo` bool (D7), `filtros` jsonb (D7), `dia_offset` int ≥0, `ancora`, `hora_sugerida` time, `tipo_acao` CHECK, `titulo`, `roteiro`, `modelo_id` FK modelos_mensagem null, `pesquisa_id` FK null, `responsavel` text, `tolerancia_dias` int, `pular_se` jsonb | `unique (cadencia_id, ordem)` |
| `posvenda_jornadas` | `id`, `empresa_id`, `filial_id`, `contato_id` FK, `negocio_id` FK null, `compra_historica_id` FK null, `cadencia_id` FK, `ancora_em` timestamptz, `entrega_em` timestamptz null, `status` CHECK (ativa, pausada, concluida, cancelada), `motivo_fim`, `criado_em` | `(empresa_id, contato_id, status)`; CHECK de que há negócio OU compra histórica; `unique (negocio_id, cadencia_id)` |
| `posvenda_acompanhamentos` | `id`, `empresa_id`, `filial_id`, `jornada_id` FK cascade, `passo_id` FK, `contato_id`, `negocio_id`, `responsavel_id` uuid **NOT NULL** (D9), `previsto_para` timestamptz, `status` CHECK (pendente, feito, sem_resposta, reagendado, pulado, perdido, cancelado), `resultado` text, `observacao`, `cliente_respondeu_em`, `feito_por`, `feito_em`, `tentativas` int | **`(empresa_id, responsavel_id, previsto_para) where status='pendente'`** (a fila); `(jornada_id)` |
| `posvenda_pesquisas` | `id`, `empresa_id`, `nome`, `tipo` CHECK (nps, csat), `pergunta`, `pergunta_comentario`, `ativo` | — |
| `posvenda_respostas` | `id`, `empresa_id`, `filial_id`, `contato_id`, `negocio_id`, `acompanhamento_id` null, `pesquisa_id`, `nota` smallint, `comentario`, `canal`, `vendedor_id` (retrato), `respondida_em`, `registrada_por` | `(empresa_id, respondida_em)`, `(empresa_id, vendedor_id)`, `unique (negocio_id, pesquisa_id)` |
| `posvenda_chamado_status` | `id`, `empresa_id`, `nome`, `tipo` CHECK (aberto, andamento, aguardando_cliente, aguardando_terceiro, resolvido), `ordem`, `cor`, `ativo` | — |
| `posvenda_chamado_categorias` | `id`, `empresa_id`, `nome`, `ativo`, `responsavel_padrao` text | — |
| `posvenda_chamado_sla` | `empresa_id`, `categoria_id` null, `prioridade`, `primeira_resposta_horas`, `resolucao_horas`, `horario_comercial` bool | `unique (empresa_id, coalesce(categoria_id,0), prioridade)` |
| `posvenda_chamados` | `id`, `empresa_id`, `filial_id`, `numero` (sequência por empresa), `contato_id`, `negocio_id` null, `acompanhamento_id` null, `resposta_id` null (NPS baixo), `categoria_id`, `prioridade`, `status_id`, `titulo`, `descricao`, `responsavel_id` **NOT NULL** (D9), `assistencia_garantia_id` null, `aberto_em`, `primeira_resposta_em`, `resolvido_em`, `sla_resposta_vence`, `sla_resolucao_vence`, `sla_pausado_seg` int, `origem` (manual, nps, zapintel), `criado_por` | `(empresa_id, status_id)`, `(empresa_id, responsavel_id) where resolvido_em is null`, `(contato_id)` |
| `posvenda_chamado_eventos` | `id`, `empresa_id`, `chamado_id` FK cascade, `tipo` (status, nota, atribuicao, cliente_respondeu), `de`, `para`, `texto`, `por`, `em` | `(chamado_id, em)` |

**Funções do módulo:** todas `SECURITY DEFINER`, com `search_path` fixo, `core_modulo_ligado(...,'posvenda')` e checagem de permissão.
- `posvenda_iniciar_jornadas(p_negocio)`: chamada pelo gatilho do ganho (via `contato_ciclo_recalcular` ou gatilho próprio). Escolhe as réguas pelos filtros, aplica a recompra e materializa os passos com o intervalo mínimo e o teto.
- `posvenda_registrar(p_acomp, p_resultado, p_nota, p_comentario, p_reagendar_para)`.
- `posvenda_chamado_abrir(...)` / `posvenda_chamado_mover(p_chamado, p_status, p_texto)`: calcula o SLA e a pausa.
- `posvenda_indicadores(p_de, p_ate, p_filial)`: NPS, taxa de resposta e atrasos.

**Configuração:** chaves no manifesto (`configuracoes` do PDV v2 §A), módulo `posvenda`.
- `intervalo_minimo_dias` (3), `teto_diario_por_responsavel` (25);
- `nps_limite_detrator` (6); o chamado da nota baixa vai sempre para os administradores (D9 revista em 24/11);
- `envio_automatico` (false), `categorias_aparelho` ([1,2,3,4]), `sem_resposta_tentar_em_dias` (2).
- No core: `ciclo_dias_entre_compras` (7), `ciclo_nota_promotor` (9), `ciclo_validade_nps_meses` (12), `ciclo_inativo_meses` (null = desligado), `pos_venda_dias` (já existe, 30).
- No módulo também: `responsavel_padrao` (por loja, **opcional** desde 24/11; **D9**) e `janela_acompanhamento_dias` (3; roteamento da M7, §2.6).

**Armazenamento provisório e a migração para o `empresa_config` (D6, 23/11).** Enquanto o `empresa_config` do PDV v2 não existir, as chaves ficam em `configuracoes_sistema`, a tabela que já existe com `empresa_id`, `chave` e `valor` jsonb, sem loja. As convenções são escolhidas para a migração ser mecânica.

1. **Uma linha por chave**, com o nome `<modulo>.<chave>`, igual ao par `(modulo, chave)` do `empresa_config`. Exemplos: `posvenda.intervalo_minimo_dias`, `posvenda.responsavel_padrao`, `core.ciclo_dias_entre_compras`.
   - Nunca um jsonb "saco de chaves" como o `retorno_cliente` de hoje: ele força a migração a desmontar o objeto e a conhecer cada campo.
   - **Nenhum segredo no formato `<modulo>.<chave>` (regra do Lucas, 23/11).** Token, chave de API e senha ficam onde estão hoje (cofre das integrações, variáveis de ambiente da Vercel e da Edge). O motivo: qualquer membro da empresa lê `configuracoes_sistema` pela RLS atual. O `config_salvar` recusa nomes com cara de segredo (`token`, `secret`, `senha`, `password`, `api_key`, `credencial`, `private_key` → `CHAVE_PROIBIDA`), e as funções só alcançam chaves `<modulo>.<chave>` válidas: as antigas (`horario_comercial`, `roleta_leads:3`…) ficam fora do alcance delas.
2. **O valor sempre no mesmo envelope:**

   ```json
   {"empresa": <valor ou null>, "lojas": {"<filial_id>": <valor>}}
   ```

   Exemplo (D9): `posvenda.responsavel_padrao` = `{"empresa": null, "lojas": {"3": "<uuid Guaçu>", "6": "<uuid Jaguariúna>"}}`.
   - O envelope tem exatamente o formato das linhas do `empresa_config`: `filial_id` nulo é a empresa, cada loja é uma linha.
3. **Ninguém lê `configuracoes_sistema` direto para essas chaves.** O SQL usa a função **`config_valor_emp(p_empresa, p_modulo, p_chave, p_filial)`**, `STABLE` e `SECURITY DEFINER`.
   - Ordem de leitura: valor da loja, valor da empresa, `null`. É a mesma do `config_valor` do PDV v2 §A; o padrão fica no chamador (`coalesce` com o padrão do manifesto).
   - Para a sessão, há o atalho `config_valor(p_modulo, p_chave, p_filial)`, que usa `get_empresa_id()`, com o mesmo nome e a mesma assinatura do PDV v2.
   - A escrita passa só por `config_salvar(p_modulo, p_chave, p_valor, p_filial)`. Ela confere dono ou admin, sessão que pode escrever e loja da própria empresa, e grava no envelope (com `atualizado_por` e `atualizado_em`). **Não** exige o módulo ligado: o `responsavel_padrao` opcional pode ser preenchido antes de ligar o pós-venda.
   - O TypeScript usa um único `lib/config.ts` (`lerConfig` e `salvarConfig`), que chama essas RPCs.
4. **Migração quando o PDV v2 Fase 1 criar o `empresa_config`.** É uma migração só, e ninguém fora dela muda:
   1. cria `empresa_config`, se ainda não existir;
   2. copia, para cada linha `chave like 'posvenda.%' or chave like 'core.ciclo_%'`:
      - `(empresa_id, null, split_part(chave,'.',1), substr(chave, position('.' in chave)+1), valor->'empresa')`, se `valor->'empresa'` não for nulo;
      - `(empresa_id, filial_id, …, valor->'lojas'->>filial_id)` para cada loja;
   3. troca o corpo de `config_valor_emp`, `config_valor` e `config_salvar` para ler e gravar no `empresa_config`. **As assinaturas não mudam**, e por isso RPCs, telas e `lib/config.ts` não são tocados;
   4. confere a contagem: linhas copiadas = valores de empresa + valores de loja;
   5. deixa as linhas antigas de `configuracoes_sistema` com a chave renomeada para `_migrado.<chave>` por 30 dias, como volta, e depois apaga numa migração própria.
   - **Requisito para o PDV v2:** manter o `config_valor_emp(p_empresa, …)`. Gatilhos e a Edge não têm sessão; o `config_valor` do §A só conhece a empresa da sessão.
   - O `retorno_cliente.pos_venda_dias` de hoje vira `core.pos_venda_dias` nessa mesma migração, como já previsto no §2.6.

**Realtime:** só `posvenda_chamados`, para o quadro. Entra em `realtime` do manifesto e é adicionada à publicação por migração.

### 8.2 Migrações em ordem

**Já em produção (23/11/2026):**

| Migração | O que fez |
|---|---|
| ✅ M1 `ganho_protegido` | Ganho fora da janela abre negócio novo; gatilho que trava a saída do ganho e o `ganho_em`; RPC `reabrir_negocio` |
| ✅ M1b `ganho_arquivado_e_arquivamento` | Ganho arquivado conta na janela; arquivar e desarquivar no histórico |
| ✅ 4A `zapintel_ganho_por_negocio` | O ZapIntel lê o status do negócio (ganho = Cliente; aberto nunca vira Cliente pela IA; selo "já é cliente") |

**MVP (em ordem; cada uma com arquivo de volta e teste em transação desfeita, como a M1):**

| # | Migração | O que faz | Lado | Depende de |
|---|---|---|---|---|
| M2 | `config_provisoria` | `config_valor_emp`, `config_valor` e `config_salvar` sobre `configuracoes_sistema`, no envelope `{empresa, lojas}` (D6). Sem dados novos | core | — |
| M3 | `corrigir_data_venda` | RPC `corrigir_data_venda` (dono/admin, motivo, histórico `data_venda_corrigida`) e a exceção `nexus.corrigir_data_venda` no gatilho da M1, que libera só a troca de `ganho_em` com o status ganho | core | M1 |
| M4 | `contato_ciclo` | Tabela `contato_ciclo`, função `contato_ciclo_recalcular`, gatilho em `negocios` (status, ganho_em, etapa, delete) e backfill dos 3,7 mil contatos da JM. Lê os limites por `config_valor_emp('core', 'ciclo_*')` | core | M2 |
| M5 | `quadro_por_status` | `quadro_base`, `quadro_contagens` e `quadro_pagina` ganham `p_status` (padrão `aberto`), mais o índice parcial se o EXPLAIN pedir | core | — |
| M6 | `posvenda_modulo` | As 10 tabelas `posvenda_*` com RLS (responsável NOT NULL), `posvenda_resolver_responsavel`, `posvenda_iniciar_jornadas` (gatilho no ganho; passos vencidos nascem `pulado`), `posvenda_registrar`, `posvenda_chamado_abrir`/`_mover` (SLA em horas corridas), reatribuição ao desativar usuário, `posvenda_reancorar_jornada(bigint)` (o gancho que a M3 já chama), e as sementes na instalação: status e categorias de chamado, SLA padrão, pesquisa NPS e régua "iPhone e aparelhos" com o D+90 seminovo ligado e o seguro desligado | módulo | M2 (não depende mais da M4: ordem A → C → B) |
| M7 | `canal_le_posvenda` | `core_negocio_do_canal` com o item 2 do §2.6: só **chamado aberto** ou **acompanhamento vencido ou de hoje dentro de `posvenda.janela_acompanhamento_dias` (3)** segura a mensagem sem abrir negócio. Passo futuro nunca segura. Só com o módulo ligado; o resto é a M1. Os testes do §2.6 vêm junto, com destaque para o D+330 agendado e a recompra | core | M6 |
| — | Aplicar a triagem da etapa Pós Venda | Script, não migração: backup, transação, filtro pelo status atual, histórico `triagem_pos_venda`. Depois `funil_etapas.ativo = false` na etapa 38 e o nome "Pós Venda (antiga)" | dados | planilha do Matheus |

**Fase 2:**

| # | Migração | O que faz |
|---|---|---|
| M8 | `compras_historicas` | Tabela e RPC de importação idempotente (`origem_ref` = `id_pedido`), contatos só com telefone válido (D5), gatilho `compra_historica` sem régua retroativa |
| M9 | `posvenda_realtime` | Realtime de `posvenda_chamados` para o quadro de chamados |
| M10 | `config_para_empresa_config` | Migração das chaves provisórias para o `empresa_config`, quando o PDV v2 Fase 1 existir (§8.1, D6) |

### 8.3 MVP (o mínimo para a JM usar)

**Entregas em produção (plano aprovado pelo Lucas em 23/11, com ajustes).** São três entregas, A, B e C. Cada uma vai para produção na sequência migração → app → validação, e a próxima só começa depois da validação da anterior. Diff e testes de cada migração passam pelo Lucas antes de aplicar.

| Entrega | Conteúdo |
|---|---|
| **A** | M2 + M3 + modal de ganho (data da venda, categoria, condição e valor, com validação no servidor) + modal de motivo ao reabrir + botão "Corrigir data da venda" (itens 2 abaixo) |
| **B** | M4 + M5 + telas do ciclo de vida e quadro só com abertos (itens 3 e 4). **Depois da C** |
| **C** | M6 + M7 + `/pos-venda` + Configurações › Pós-venda + aba Pós-venda na ficha (item 5). A vitrine vem por último, dentro da C ou depois. **Antes da B; pelo ritual do banco local (§8.6.1)** |
| Fora das entregas | Triagem (item 1), em paralelo, e o desligamento da etapa (item 6), só depois da triagem aplicada |

**Ordem nova (decisão do Lucas, 23/11/2026): A → C → B.**
- ✅ **A em produção** em 23/11: M2, M3 e app, com o deploy `2b00174f`.
- **C vem antes de B**, e segue o ritual do banco local (§8.6 e §8.6.1; o staging foi descartado em 23/11).
- O que muda na C para funcionar **sem a M4 (ciclo de vida) e sem a M5 (quadro só com abertos)**:

| Ponto da C | Plano antigo (dependia de B) | Plano novo (sem M4/M5) |
|---|---|---|
| Disparo da jornada no ganho | Pelo `contato_ciclo_recalcular` (M4) ou por gatilho próprio | **Gatilho próprio** em `negocios` (`posvenda_negocio_ganho`, AFTER INSERT/UPDATE OF status, ganho_em), só com o módulo ligado: entrar no ganho chama `posvenda_iniciar_jornadas` |
| Venda reaberta (`reabrir_negocio`) | Recalculava o ciclo | O mesmo gatilho **cancela** os passos pendentes da jornada (`cancelado`, motivo `venda_reaberta`); os feitos ficam |
| Data da venda corrigida (M3) | Reancora e recalcula o ciclo | Só reancora: `posvenda_reancorar_jornada(bigint)`, o gancho que a M3 já chama |
| Régua: categoria e condição | Campos obrigatórios na etapa de ganho | Já existem: `negocios.dados.venda.categoria_id` e `.condicao` (Entrega A). Ganho antigo, sem `dados.venda`, usa a régua "Geral" |
| NPS | Ia para `contato_ciclo.nps_ultimo` e dava o selo de promotor | Fica só em `posvenda_respostas`. Sem selo de promotor até a B; a M4 lê as respostas já gravadas no backfill |
| Recompra no meio da régua | Lia o estágio "recorrente" | Lê as jornadas ativas do contato e os ganhos em `negocios` (não precisa do ciclo) |
| Fila `/pos-venda` | Mostrava o estágio do cliente no cartão | Mostra a compra (produto, data, valor, vendedor, loja) e os NPS anteriores. Sem estágio |
| Ficha do cliente | Cabeçalho com estágio, mais a aba Pós-venda | Só a **aba Pós-venda** (jornada, NPS, chamados), pelo provedor do módulo. Cabeçalho com estágio, aba Compras e total gasto ficam na B |
| Quadro do funil | Ganho e perdido fora das colunas (M5) | Sem mudança: Convertido e Perdido continuam colunas. A C não depende disso |
| Roteamento (M7) | — | Igual: não usa nem M4 nem M5 |

- **Dependências finais:** M6 depende só da M2 (configuração) e da Entrega A (`dados.venda`). A M7 depende da M6. A M4 (na B) passa a ler `posvenda_respostas` para o NPS. A M5 continua independente.

**Ativação do módulo sobre as vendas que já existem (pedido do Lucas, 23/11/2026; parte da Entrega C).**
- Ao ligar o módulo, as vendas fechadas antes da instalação ganham jornada **só com os passos que ainda caem de hoje em diante**, contados a partir do `ganho_em`.
  - Passo já vencido **não é criado**: nada de D+1 ou D+7 retroativo, nem nasce como `pulado`.
  - Na prática, venda com mais de 30 dias recebe só o D+330 (ciclo de troca) e, no seminovo, às vezes o D+90.
- A ativação roda como **função própria** (`posvenda_ativar_existentes`), chamada uma vez na instalação. É idempotente: `unique (negocio_id, cadencia_id)`.
- **Antes de ativar, o Lucas vê a simulação** (`scripts/conciliar-vendas/simular-ativacao.mjs`): quantas jornadas e passos, por categoria e por mês de vencimento. A ativação respeita o teto diário por responsável e o intervalo mínimo.
- **Simulação de 23/11/2026** (290 ganhos da JM; categorias dos 147 da conciliação pela simulação do texto dos pedidos; os outros 143 sem categoria):

| Cenário | Jornadas | Passos | Por mês de vencimento | Maior dia |
|---|---|---|---|---|
| Só a régua de aparelhos (iPhone, iPad, Mac, Watch) | 141 | 210 (141 D+330, 40 D+30, 23 D+90, 6 D+7) | nov/26 22 · dez 28 · jan/27 10 · fev 9 · jun 1 · jul 36 · ago 29 · set 52 · out 23 | 6 passos (29/11) |
| Aparelhos + régua "Geral" (D+7 e D+330) para quem não tem categoria | 290 | 403 | nov/26 66 · dez 28 · jan 10 · fev 9 · jun 1 · jul 54 · ago 74 · set 75 · out 86 | 22 passos (25/11) |

  - A fila não enche de uma vez. O grosso cai de **jul a out/2027** (o D+330 das vendas de ago a nov/2026); o resto se espalha por nov/26 a fev/27.
  - Os números mudam com a data real da ativação: quanto mais tarde, menos D+7 e D+30 sobram.
  - Os 143 ganhos sem categoria são os marcados no quadro antes da Entrega A. Parte deles tem pedido no grupo (125 pedidos casaram com ganhos já existentes na conciliação) e pode ser classificada do mesmo jeito que os 147, antes da ativação.

0. ✅ **Feito:** M1, M1b e 4A em produção. A venda não é mais apagada, e o ZapIntel lê o ganho.
1. **Triagem da etapa Pós Venda.** O Matheus preenche o `triagem_pos_venda.csv` e o script aplica (com backup).
   - Não depende de código novo. Pode correr em paralelo com o resto.
2. **Entrega A — Ganho com data e reabrir com motivo** (core; M2 e M3 + app):
   - modal de ganho com **data da venda** (hoje como padrão) e os campos obrigatórios da etapa Convertido (categoria, condição novo/seminovo, valor);
   - a rota `/api/leads/mover` aceita e valida `ganho_em` e confere os campos obrigatórios no servidor;
   - modal de **motivo** ao tirar uma venda do ganho (dono e admin);
   - botão **"Corrigir data da venda"** (dono e admin), que chama `corrigir_data_venda`.
3. **Entrega B — Quadro só com abertos** (M5 + app): ganho e perdido viram lista filtrada, e o quadro ganha faixas de soltar "Ganhou" / "Perdeu".
4. **Entrega B — Ciclo de vida** (M4 + app):
   - estágio no cabeçalho da ficha do cliente, somando os contatos com o mesmo telefone (D2);
   - coluna e filtro na lista de Clientes;
   - aba Compras com os ganhos e o total gasto (corrige o "Compras = 0").
5. **Entrega C — Módulo Pós-venda** (M6 e M7 + app; chave `posvenda`, menu "Pós-venda", D4):
   - Configurações › Pós-venda:
     - responsável padrão por loja, **opcional** (D9 revista em 24/11: tem prioridade sobre a roleta quando preenchido);
     - régua iPhone (passos, ligar e desligar);
     - intervalo mínimo e teto diário;
     - limite do NPS;
     - status, categorias e SLA de chamado.
   - Fila `/pos-venda` em três abas: Atrasados, Hoje e Próximos 7 dias. Ações: Abrir WhatsApp com o texto montado, Registrar resultado, NPS manual, Reagendar, Pular e Abrir chamado.
   - Chamados: lista com filtros (sem realtime), abrir e mover, SLA em horas corridas. Nota de NPS ≤ 6 abre chamado para os administradores (roleta entre eles).
   - Aba Pós-venda na ficha do cliente: jornada, NPS e chamados.
   - Vitrine `/vitrine/posvenda` para quem não tem o módulo: por último, dentro da C ou logo depois.
6. **Desligar a etapa "Pós Venda"**, depois da triagem aplicada e conferida.

**Fica para a Fase 2:**
- compras históricas (M8) e contatos novos só com telefone válido (D5);
- o público "ciclo de troca vencido";
- réguas de Perfumes e Acessórios;
- indicadores de NPS por período, vendedor, loja e categoria (os dados já são gravados com o retrato desde o MVP);
- link público de NPS;
- SLA em horário comercial;
- realtime de chamados (M9);
- âncora `entrega` pelo PDV v2;
- "Aparelho atual" com IMEI e garantia;
- migração da configuração para o `empresa_config` (M10), quando o PDV v2 Fase 1 existir;
- cargo Gerente no "Reabrir venda" e no "Corrigir data", quando os cargos existirem (D10).

**Fica para a Fase 3:**
- envio automático **só com modelos UTILITY** (D8), com as travas do Automatize;
- ZapIntel lendo o ciclo de vida e sugerindo chamado ou nota;
- régua da Aletrini e primeira revisão;
- estágio `inativo` (D12; 18 meses quando ligar) e campanha de reativação;
- ligar o passo de seguro do D+90, que já existe desligado, quando houver parceiro (D7). É um clique de configuração, sem código.

**Fora do plano por decisão:** cadastrar Campinas (D3).

### 8.4 Fases seguintes

O detalhe da Fase 2 e da Fase 3 está no fim do §8.3. A ordem dentro de cada fase fica para quando o MVP estiver em uso.

### 8.5 Riscos

| Risco | Mitigação |
|---|---|
| ~~Fazer a 4B da conciliação sem M1~~ | **Resolvido:** a M1 entrou antes da 4B (23/11) |
| Acompanhamento ou chamado sem dono (110 de 112 negócios "sem registro" e os 38 da etapa Pós Venda estão sem responsável) | Vendedor do negócio → `responsavel_padrao` opcional → roleta dos vendedores da loja → administradores; `responsavel_id` NOT NULL (D9 revista em 24/11) |
| Mexer em `core_negocio_do_canal` muda o recebimento de todos os canais e empresas | Migração com rollback, teste com contato de teste por canal, conferência de `negocio_historico` nas primeiras horas (zona sensível da Meta) |
| Régua com dados ruins: 84% dos ganhos sem produto ou categoria | Campos obrigatórios no ganho (checados também no servidor) e uma régua "Geral" de reserva |
| Fila inchada no dia da importação ou da instalação | Passos vencidos nascem `pulado`; teto diário por responsável; histórico de mais de 12 meses vai para público, não para fila |
| Excesso de mensagens ao cliente (várias réguas) | Intervalo mínimo entre contatos; uma jornada por dia de compra; prioridade entre réguas |
| Mensagem pelo wa.me não fica no Nexus | A tela avisa; preferir o chat do Nexus dentro da janela e o modelo aprovado fora dela |
| Política da Meta (modelo MARKETING exige opt-in, custo por conversa) | v1 manual; o automático só com modelo aprovado e chave por empresa desligada de fábrica |
| Contato duplicado por loja divide o histórico do mesmo cliente | A ficha soma pelo telefone (D2); a fusão de contatos já existe (`lib/fusao-contatos.ts`) |
| Dependência do motor de configuração do PDV v2 | Chave provisória em `configuracoes_sistema` (D6) |

### 8.6 Ambiente de teste: o Supabase LOCAL (Docker), não um projeto de staging

**Decisão do Lucas (23/11/2026, substitui a opção A): NÃO se cria o `crm-saas-staging`.** O ambiente de teste é o Supabase local que roda em Docker na máquina do Lucas.
- A opção A e o projeto de staging ficam no histórico do git deste arquivo. Custo extra: zero.

**O problema que continua (conferido em 23/11/2026).** Os previews da Vercel usam as **mesmas** variáveis do Supabase que a produção: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` têm o alvo "production + preview".
- Testar num link de preview grava no banco real. Por isso o **preview não é ambiente de teste de gravação**: serve para ver a tela; quem testa gravação é o local.
- O preview também recebe segredos de produção. A proposta para isso está no item "Previews da Vercel", abaixo (aguarda o ok do Lucas).

**O banco local reproduz a produção (conferido em 23/11/2026).**
- Um Supabase local descartável, montado do zero por **todas** as migrações da `main`, ficou com o esquema `public` igual ao da produção: 114 tabelas, 416 índices, 509 restrições, 447 políticas, 79 gatilhos, 119 funções, view e permissões.
- **Fora da comparação ficaram só:**
  - os 3 `_backup_*` operacionais da produção;
  - duas linhas de comentário em `automacao_reservar` e `transmissao_reservar`;
  - o `work_mem` das 3 funções do painel do ZapIntel, que a migração `0800` devolve à produção (a 4A o tinha apagado).
- **Para chegar lá, dois consertos:**
  - as travas por hash da M3 e da 0700 passaram a ignorar `\r`: os arquivos são CRLF e a produção recebeu os corpos sem eles;
  - a 0800 alinha `work_mem` e uma permissão.
- **Regra para migração nova com trava por hash:** comparar sempre `md5(replace(prosrc, E'\r', ''))`.
- A comparação usa a impressão digital do catálogo: um hash por tabela, coluna, função, política, gatilho, índice e restrição. Esquemas `auth`, `storage` e `realtime` ficaram fora; quando forem precisos, entram na mesma conta.

**Como o local é montado.**
1. **Esquema:** `npx supabase db reset` aplica todas as migrações do repositório.
   - Nunca `db push` ou `link` contra a produção: a produção não tem o histórico de migrações do repositório.
2. **Dados só fictícios:**
   - a semente da demonstração (`supabase/scripts/demo/preview-demonstracao.sql`);
   - uma empresa "JM de teste" com as etapas, categorias e vocabulário da JM;
   - usuários de teste (dono, admin e vendedor em duas lojas), com senha só local.
   - O dump real (`tools/banco/montar-local.sh`) **não** é usado para teste: é ferramenta de diagnóstico, cifrado, aberto só pelo Lucas.
3. **Edge e crons:** a Edge local não recebe credencial real da Meta (nada envia mensagem real). Os crons só rodam quando um teste os chama.
4. **Máquina:** Docker só com o IDE fechado. Ao terminar: `npx supabase stop` (guarda o volume), fechar o Docker Desktop e `wsl --shutdown`.

**Testes contra o banco local.**
- **`npm run test:local`** (suíte de integração, `tests/integracao/*.test.ts`): rotas e RPCs **gravando de verdade** no banco local, com sessões reais dos usuários de teste.
  - O script recusa qualquer URL que não seja `127.0.0.1`/`localhost`.
  - Confere o resultado no banco local com a service_role local (a chave padrão do Supabase local, que não é segredo).
- **Cobertura mínima:** todo caminho que grava em `negocios`, `contatos` ou `dados` e já quebrou ou é crítico.
  - Marcar venda pelo quadro, pela ficha e pelo "Converter em cliente": com e sem dados, data futura, categoria de outra empresa.
  - Corrigir data e reabrir: dono e admin passam; vendedor recebe 403.
  - Criar lead com produto, reserva, importação, juntar negócios.
  - O `teste-*.sql` de cada migração.
- **Isolamento:** cada teste cria os próprios leads na "JM de teste". `db reset` + semente devolvem o estado inicial em cerca de 1 minuto.
- **Testes de tela:** `npm run dev` apontando para o Supabase local (`.env.local.teste` com URL e chaves locais, fora do git), com os dados fictícios. É onde se testa o modal, o quadro e o celular antes de qualquer deploy.

**Previews da Vercel — proposta (NÃO aplicada; aguarda o ok do Lucas).**
- **O risco hoje:** o preview usa o banco da produção e tem a `CHANNEL_ENCRYPTION_KEY` da produção. Por isso consegue decifrar os tokens dos canais e mandar WhatsApp e Instagram de verdade.
  - Com a `PAYMENT_ENCRYPTION_KEY`, decifra as credenciais de pagamento e os segredos das empresas: Pixel/CAPI e token de portal.
  - Com o `CRON_SECRET`, alguém com o link pode disparar os jobs (automações, transmissão) contra o banco real.
- **Troca proposta:** só no alvo **Preview**. A produção não muda.

| Variável | No preview passa a ser | Efeito |
|---|---|---|
| `CHANNEL_ENCRYPTION_KEY` | chave de teste (32 bytes aleatórios) | não decifra token de canal → não envia mensagem, não sincroniza modelos, não renova token |
| `PAYMENT_ENCRYPTION_KEY` | chave de teste | não decifra credencial de pagamento nem segredo de empresa (CAPI, token de portal) |
| `META_APP_SECRET`, `INSTAGRAM_APP_SECRET` | valor de teste | conectar canal ou Instagram pelo preview falha na troca do código |
| `WEBHOOK_VERIFY_TOKEN` | valor de teste | nada (o webhook da Meta aponta para a produção e para a Edge) |
| `CRON_SECRET` | valor de teste | nada (cron da Vercel só roda em produção); fecha a porta dos jobs pelo link do preview |
| `META_APP_ID`, `NEXT_PUBLIC_META_*`, `META_GRAPH_VERSION` | ficam | identificadores públicos, sem poder sozinhos |

- **O que quebra no preview:**
  - enviar mensagem e transmissão;
  - conectar ou reconectar canal (WhatsApp, Instagram, Messenger);
  - lista de modelos aprovados e renovação de token;
  - configurar pagamento e ler gateway;
  - Pixel/CAPI;
  - entrada de leads por portal ou site com o token da empresa;
  - rodar cron pelo link.
  - As telas que só leem continuam funcionando, inclusive o status dos canais que vem do banco.
- **⚠ Cuidado que a troca cria:** salvar pelo preview um segredo novo (conectar canal, configurar pagamento, gerar token de portal) gravaria no **banco da produção** um valor cifrado com a chave de teste, ilegível para a produção.
  - Junto com a troca, essas três rotas passam a recusar quando `VERCEL_ENV = 'preview'`. É uma mudança pequena de código.
- **O que continua igual:** o preview ainda lê e grava no banco da produção com a service_role. Isso só muda apontando o preview para outro banco, o que não existe mais na decisão de 23/11.

---

### 8.6.1 Ritual de deploy (REGRA, decisão do Lucas em 23/11/2026)

**O banco local do ritual é DESCARTÁVEL** (decisão do Lucas, 23/11/2026): o banco local dele (projeto `guiuzbcqkvelqcuogxtd`, portas 543xx, com a cópia de dados reais) fica parado como está e **não** é usado nem resetado.

**`bash scripts/teste-local.sh`** (ou `npm run teste-local`) faz os passos 1 e 2 sozinho:
1. sobe um Supabase local NOVO (projeto `teste-local`, portas 561xx) com **as migrações da branch**, do zero;
2. semente **só fictícia**:
   - `supabase/scripts/teste-local/semente.sql`, com o esqueleto da produção e os mesmos ids (empresas 1 "JM de teste" e 5, lojas, funis, etapas, categorias, usuários `@teste.invalid` com senha só local);
   - mais a demonstração `supabase/scripts/demo/preview-demonstracao.sql`;
3. roda cada `supabase/scripts/testes/teste-*.sql`, numa transação desfeita, e compara com `supabase/scripts/teste-local/esperado/<nome>.json`:
   - cada chave do esperado tem de vir igual;
   - teste sem esperado conta como falha;
4. roda `npm run test:local` (`tests/integracao/*.test.ts`): as rotas de verdade, com sessão real dos usuários de teste, gravando no banco local;
5. desmonta (`stop --no-backup`) e apaga a pasta temporária, dê certo ou não. Com `MANTER=1`, deixa no ar para o `npm run dev` apontar para ele.
- **Saída:** "tudo verde — pode seguir para a produção" ou o número de etapas com falha. Com falha, **não** se vai para a produção.
- **Migração nova:** vem com o `teste-*.sql` e o `esperado/*.json` dela, no mesmo commit.
1. **Migração no Supabase local primeiro**, junto com o `teste-*.sql` dela.
2. **`npm run test:local` passando** (rotas e RPCs gravando no banco local). Mudança de tela: conferida no `npm run dev` contra o local.
3. **Produção:** migração pelo `apply_migration` do MCP, com IOwait conferido, volta e trava por hash (sem `\r`).
4. **Deploy:**
   - `main` por cherry-pick numa worktree temporária;
   - checagens de sempre (tsc, `npm test` e as 8 `check:*`);
   - IOwait antes do push;
   - deploy anterior anotado para voltar.
5. **Conferência em produção** na "Nexus Demonstração", sem dado da JM.
- Nenhuma exceção sem o ok do Lucas.
- A correção do gatilho de dados (prioridade 2 do §8.7) e a Entrega C inteira seguem este ritual.

### 8.7 Pendências (registradas em 23/11/2026; o ambiente de teste é o local, §8.6)

**Prioridade decidida pelo Lucas (23/11/2026):**
1. **Agora:** achado (d), o campo de valor do modal substitui o valor, nunca acrescenta. Vai para a produção junto com o arquivo da migração 0700.
2. **Pelo ritual do §8.6.1 (local primeiro):** o gatilho `core_validar_dados` confere só as chaves que mudaram, comparando com o valor anterior, e inclui `produto_interessado` na conferência.
3. **Entrega C:**
   - (b) ao reabrir uma venda, `dados.venda` vai para o histórico e sai do negócio;
   - (c) avaliar exigir `dados.venda` no banco na entrada em ganho e restringir quem edita `dados.venda` depois de gravado.
4. **Quando der:** (a) o botão do superadmin (o hook precisa perguntar ao banco; não é mudança de uma linha) e o perfil de busca do módulo Imóveis.

**O incidente que motivou esta seção.** A Entrega A foi para a produção gravando `negocios.dados.venda`, e o gatilho `core_validar_dados` recusa toda chave de `dados` que não seja campo personalizado nem comece com `_`. Marcar venda pela tela falhava. Ninguém chegou a usar entre o deploy (21h16 UTC) e a correção `20261123000700_dados_venda_reservada` (aplicada às ~22h40 UTC). Os testes de rota simulam o banco e não pegaram.

**1. `corrigir_data_venda` atualiza também `dados.venda.data` (decisão do Lucas).**
- Hoje a RPC muda só o `ganho_em`. No teste de 23/11, o negócio 7757 ficou com `ganho_em` em 01/10 e `dados.venda.data` em 15/11.
- Na mesma transação da RPC: `dados = jsonb_set(dados, '{venda,data}', to_jsonb(p_data::text))` quando `dados ? 'venda'`. O histórico `data_venda_corrigida` continua guardando as duas datas.
- Teste novo: depois de corrigir, `dados.venda.data` = dia local do `ganho_em`. A divergência fica impossível por construção.

**2. Testes de rota que gravam no banco: contra o Supabase LOCAL.** Aprovado pelo Lucas em 23/11/2026. Primeiro como proposta com staging; o mesmo dia trocou o staging pelo local.
- Suíte `npm run test:local`, cobertura e ritual: §8.6 e §8.6.1.

**3. Achados do teste funcional de 23/11 (empresa 5), aguardando decisão.**
- **a. A tela esconde "Reabrir venda" e "Corrigir data da venda" do superadmin impersonando.** O banco aceita, porque `is_empresa_admin` cobre o superadmin. O hook `useSouAdmin` procura o usuário na lista da equipe, onde ele não está. Correção: o hook pergunta ao banco, com `is_empresa_admin(get_empresa_id())`. Para o dono e o admin reais, a tela já está certa.
- **b. A venda reaberta continua com `dados.venda`.** O 7758 voltou para Negociando com a venda antiga no `dados`. Uma nova entrada no ganho sobrescreve, mas até lá o negócio aberto carrega uma venda. Opções:
  - `reabrir_negocio` move a chave para `dados._venda_reaberta`;
  - ou quem lê (M6, relatórios) só considera `dados.venda` com `status = 'ganho'`.
- **c. O banco não exige `dados.venda` no ganho.** Pela API direta, sem tela, um vendedor marca ganho sem `dados.venda`; testado em transação desfeita. Também consegue editar `dados.venda`. A exigência hoje está só na rota.
  - Opção para a Entrega C: o gatilho de ganho exige `dados.venda` quando a mudança vem de um JWT de usuário, com exceção das RPCs do sistema (PDV, canal, conciliação).
  - Na mesma linha, `dados.venda` só pode mudar pela rota ou por RPC.
- **d. Campo de valor do modal.** Ele vem preenchido com o valor do negócio, e digitar acrescenta ao fim ("4590" + "4590,00"). Selecionar tudo ao focar resolve.

**4. Riscos latentes do mesmo gatilho (varredura de 23/11; hoje nenhum ativo).**
- `imoveis_perfil_espelho` (gatilho em `imoveis_perfis_busca`) grava `busca_*` em `contatos.dados`. Nenhuma empresa tem esses campos nem o módulo Imóveis. O primeiro perfil de busca salvo vai falhar. Antes de ligar Imóveis para alguém: instalar os campos com o módulo, ou mover as chaves para `_busca`.
- `produto_interessado` é gravado sem conferir o campo pela criação de lead, pela reserva, pelos portais e pela rota imob. Só a importação confere. Hoje o campo está ativo nas 3 empresas.
- O gatilho confere **todas** as chaves do `dados`, não só a nova. Se um campo for apagado ou desligado com dados já gravados (o `aplicarPreset` com `substituir` apaga os campos de módulo), qualquer gravação de `dados` naquele negócio ou contato falha, inclusive marcar venda.
  - Opção: o gatilho valida só as chaves que mudaram (`new.dados` × `old.dados`);
  - ou apagar o campo exige limpar a chave antes.

### 8.8 Plano de execução da Entrega C (proposta de 24/11/2026; aguarda o ok do Lucas, nenhum código escrito)

Cada etapa segue o ritual do §8.6.1: migração e teste no banco local descartável (`scripts/teste-local.sh`), depois a produção e depois o deploy. **O módulo só liga na JM depois da triagem dos 38**, que está com o Lucas.

| # | Etapa | O que entra | Teste (local) |
|---|---|---|---|
| C1 | **M6a: esquema** | `posvenda_cadencias`, `posvenda_cadencia_passos`, `posvenda_jornadas`, `posvenda_acompanhamentos` (`responsavel_id` NOT NULL), `posvenda_pesquisas`/`posvenda_respostas`, `posvenda_chamados` (+ status, categorias, eventos), **`posvenda_roleta`** (contador da D9). RLS por empresa e loja. Chave `posvenda` no manifesto (`core/modulos.ts`), tabelas com o prefixo do módulo | `teste-m6a.sql`: RLS (vendedor de uma loja não vê a outra), FK, NOT NULL do responsável |
| C2 | **M6b: regra do responsável (D9)** | `posvenda_resolver_responsavel`: vendedor ativo do negócio → padrão opcional da loja → roleta dos vendedores da loja → administradores. Roleta "administradores" para NPS baixo e chamados. Redistribuição ao desativar usuário (gatilho em `empresa_usuarios`) e na hora do passo | `teste-m6b-responsavel.sql`: os 5 casos (a–e), a roleta alternando, loja sem vendedor, negócio sem loja, empresa sem admin (cai no dono), vendedor desativado redistribui |
| C3 | **M6c: jornada** | `posvenda_iniciar_jornadas(negocio)`: materializa os passos da régua pela categoria e condição de `dados.venda`; sem categoria, régua Geral. Gatilho próprio `posvenda_negocio_ganho`, só com o módulo ligado: entrar no ganho inicia, sair cancela os pendentes (`venda_reaberta`). `posvenda_reancorar_jornada` (o gancho que a M3 já chama). Teto diário e intervalo mínimo | `teste-m6c-jornada.sql`: ganho cria passos; seminovo ganha D+90; reabrir cancela; corrigir data reancora; módulo desligado não cria nada |
| C4 | **Pendências do §8.7 que vão junto** | `corrigir_data_venda` atualiza também `dados.venda.data` (1); `reabrir_negocio` move `dados.venda` para o histórico e limpa do negócio (3b); avaliar exigir `dados.venda` no banco ao entrar no ganho e restringir quem edita a venda depois de gravada (3c) | casos nos testes da M3 e da M1 |
| C5 | **M7: roteamento** | Mensagem que chega com um acompanhamento pendente dentro da janela (`posvenda.janela_acompanhamento_dias`, 3) vai para ele, sem abrir negócio novo. Passo futuro não segura mensagem | os casos aprovados, inclusive "cliente com D+330 agendado manda mensagem querendo comprar" → negócio novo |
| C6 | **Ativação sobre as vendas que já existem** | `posvenda_ativar_existentes`: só passos futuros, idempotente. Antes de ligar, a simulação atualizada mostra os passos por responsável (vendedor, roleta por loja, administradores) e por mês | idem, mais contagem igual à simulação |
| C7 | **App** | Configurações › Pós-venda: réguas, limite do NPS, status/categorias/SLA dos chamados, `responsavel_padrao` **opcional** por loja e aviso de loja sem vendedor ativo. Fila `/pos-venda` (Atrasados, Hoje, 7 dias e as ações). Aba Pós-venda na ficha. Lista de chamados. NPS manual | `test:local`: ganho pela rota cria a jornada com o responsável certo; vendedor só vê a própria fila; NPS ≤ 6 abre chamado para um administrador. Tela no `npm run dev` contra o local |
| C8 | **Ligar na JM** | Depois da triagem dos 38 e com o ok do Lucas sobre a simulação: Central de Módulos → instala → `posvenda_ativar_existentes` | conferência na Nexus Demonstração antes; na JM, contagens iguais às da simulação |

**Números de hoje para a D9 (JM, 290 ganhos):**
- 35 têm vendedor ativo e ficam com ele.
- 7 estão com um administrador como responsável.
- 248 estão sem responsável e vão para a roleta da loja:
  - matriz: 3 vendedores de loja, mais 1 vendedor sem loja que conta como da matriz;
  - Jaguariúna: 2 vendedores ativos.
- Nenhum está sem loja.

**Respostas do Lucas (24/11/2026), que valem para a C2. Plano C1–C8 aprovado:**
1. **Administrador como responsável do ganho (7 na JM):** os passos de acompanhamento vão para a **roleta da loja**. Administradores recebem só:
   - NPS até 6;
   - chamados;
   - o caso de loja sem vendedor ativo.
   - Na regra (a), "vendedor do negócio" é `role = 'vendedor'`.
2. **Vendedor ausente** (`empresa_usuarios.ausente`): fica **fora da roleta**.
   - Os passos dele que **vencem durante a ausência** vão para a roleta da loja. A reavaliação roda na hora do vencimento.
   - Os passos com data **depois da volta** continuam com ele.
3. **Teto diário estourado** (`posvenda.teto_diario`, por responsável e dia):
   - Passo de cliente do **próprio vendedor** (regra a): fica com ele, no **dia útil seguinte**. O dia útil é o mesmo do calendário do PDV v2 (§N da especificação): a chave `calendario.dias_semana_uteis` (padrão de segunda a sexta; a JM pode incluir o sábado), sem feriados até o calendário do core existir. A função `posvenda_proximo_dia_util` será trocada pelo `proximo_dia_util` do core quando ele vier.
   - Passo que veio da **roleta**: vai para o **próximo da roleta da mesma loja** que tenha vaga no dia.
   - Se todos estiverem cheios, o passo vai para o dia útil seguinte com a roleta.
- Cada acompanhamento guarda a **origem** do responsável (`vendedor`, `padrao_loja`, `roleta`, `administradores`, `dono`, `manual`). É ela que decide o caminho do teto e da ausência.

---

## 3. Decisões do Lucas (23/11/2026)

| # | Pergunta | Decisão | Onde está no desenho |
|---|---|---|---|
| **D1** | Aplicar a M1 antes da Fase 4B? | **Aplicada.** M1 e M1b em produção em 23/11, antes da 4B; as 8 vendas restauradas | §0, §1.3, §8.2 |
| D2 | O mesmo telefone em duas lojas (dois contatos): somar ou separar? | Ciclo de vida **por contato**, **somado na ficha pelo telefone** | §2.1 |
| D3 | Campinas: loja a cadastrar? | **Não cadastrar por enquanto.** Fora do MVP | §2.4 |
| D4 | Nome do menu | **"Pós-venda"** | §2.5.1 |
| D5 | Clientes históricos sem contato: criar? | Criar contato **só com telefone válido**, na **Fase 2** | §2.7 |
| D6 | Esperar o `empresa_config` ou chave provisória? | **Provisória em `configuracoes_sistema`**: chave `<modulo>.<chave>`, valor `{empresa, lojas}`, acesso só por `config_valor_emp`/`config_valor`/`config_salvar`, com a migração documentada | §8.1, M2, M10 |
| D7 | D+90 da régua de iPhone | **Só seminovo** (bateria). **Seguro só com parceiro:** passo pronto e **desligado** | §2.3 |
| D8 | Modelos do envio automático | **Só UTILITY no começo**, na Fase 3 | §2.6, §8.3 |
| D9 | Responsável dos passos (**revista em 24/11**) | Acompanhamento: vendedor ativo do negócio; senão `responsavel_padrao` da loja (opcional); senão roleta dos vendedores ativos da loja (contador próprio); loja sem vendedor ou negócio sem loja → administradores. NPS baixo e chamados → administradores (cargo `admin`, roleta entre eles). **O módulo liga sem configuração de responsável. Nada nasce sem responsável** | §2.3, §2.4, §8.1 |
| D10 | Quem pode "Reabrir venda"? | **Dono e admin por enquanto;** gerente quando o cargo existir | §2.5.4 |
| D11 | Triagem dos negócios da etapa Pós Venda | **Feita pelo Matheus**, na planilha `triagem_pos_venda.csv` (38 negócios, com sugestão), aplicada por script | §2.5.4, §8.3 |
| D12 | Estágio `inativo` | **Desligado no MVP** (18 meses quando ligar, Fase 3) | §2.1, §8.3 |
| — | Data da venda no ganho | **Mantida no modal de ganho** (hoje como padrão). Para datas já gravadas, a RPC **`corrigir_data_venda(negocio_id, nova_data, motivo)`**, só dono e admin, com histórico. **Não usar `reabrir_negocio`** para isso | §2.3, M3 |

**Ainda pendente com o Lucas:**
- ok para a troca das variáveis de Preview da Vercel (proposta no §8.6; o staging foi descartado em 23/11);
- aprovar este plano (§8) antes de qualquer migração ou código do MVP;
- marcar o `conciliacao_revisar.csv`;
- confirmar o 5096 com a equipe.
