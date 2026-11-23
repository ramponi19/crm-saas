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
- `responsavel`: `vendedor_do_negocio` | `responsavel_do_contato` | `responsavel_da_loja` | `usuario:<uuid>`.

**Responsável padrão por loja (D9, 23/11).** É a configuração `posvenda.responsavel_padrao`, com um usuário por loja; na JM, um para Guaçu (3) e um para Jaguariúna (6).
- **Nenhum acompanhamento ou chamado nasce sem responsável.** A função `posvenda_resolver_responsavel(p_empresa, p_filial, p_regra, p_negocio)` decide nesta ordem:
  1. a regra do passo (o vendedor do negócio, o responsável do contato ou um usuário fixo), **desde que** o usuário esteja ativo na empresa (`empresa_usuarios.ativo`) e veja a loja;
  2. senão (sem vendedor, vendedor inativo ou sem acesso à loja), o **responsável padrão da loja** do negócio;
  3. senão, o responsável padrão da empresa (valor sem loja da mesma chave);
  4. senão, o **dono** da empresa. É a última rede: o dono sempre existe.
- `responsavel_id` é **NOT NULL** em `posvenda_acompanhamentos` e `posvenda_chamados`.
- **Instalação:** o módulo só liga com o responsável padrão preenchido para cada loja ativa. A tela de configuração mostra quem está vazio.
- **Responsável desligado da empresa:** ao desativar um usuário em `empresa_usuarios`, os passos pendentes e os chamados abertos dele vão para o responsável padrão da loja, pela mesma função. Fica o registro em `posvenda_chamado_eventos`, e no acompanhamento a observação "reatribuído".
- **Nos passos da régua da JM:** D+1 e D+330 ficam com o `vendedor_do_negocio`. NPS e o chamado de nota baixa ficam com o `responsavel_da_loja`.
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
  - Recusa: negócio que não é ganho, data futura, motivo com menos de 5 caracteres e data igual à atual.
  - **Grava em `negocio_historico`** a ação `data_venda_corrigida`, com `por_usuario` e `detalhe` = data anterior, data nova e motivo.
  - **Libera o gatilho da M1** com uma exceção própria (`nexus.corrigir_data_venda` = id do negócio), que permite **só** trocar `ganho_em` com o status continuando ganho.
  - **Hora gravada:** meio-dia no fuso da empresa; se for hoje, o instante atual.
  - **Efeitos:** recalcula o ciclo de vida. Com o módulo ligado, **reancora os passos pendentes** da jornada; os já feitos ficam como estão. Também muda a janela de roteamento da Edge, porque ela lê `ganho_em`.
  - **Tela:** o botão "Corrigir data da venda" aparece na lista de ganhos e na aba Compras da ficha, só para dono e admin.
  - **Primeiro caso:** o 5096, se a equipe confirmar que a venda é a de 15/10.

### Recompra no meio da régua

- **`substituir`** (padrão nas réguas de aparelho): a compra nova da mesma régua, ou de régua com prioridade maior ou igual, **cancela os passos pendentes** da jornada antiga (`status = cancelado`, motivo `recompra`) e começa a nova do zero.
- **`manter`** (padrão em acessório e perfume): as duas jornadas correm juntas, mas valem as regras anti-excesso abaixo.
- **`pausar`**: a antiga congela e volta quando a nova termina. É raro; fica para casos especiais.

**Regras anti-excesso** (chaves da empresa):
- `posvenda.intervalo_minimo_dias`, padrão 3: no máximo 1 contato proativo por cliente nesse intervalo. Os passos que colidem são empurrados para depois.
- Várias compras no mesmo dia geram **uma jornada**: a da régua de maior prioridade.
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
- O chamado vai para `posvenda.nps_responsavel_chamado`: `responsavel_da_loja` (padrão, **D9**) | `vendedor` | `usuario:<uuid>`. A resolução segue a mesma função do §2.3; o chamado nunca nasce sem responsável.
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
- `nps_limite_detrator` (6), `nps_responsavel_chamado` (responsavel_da_loja);
- `envio_automatico` (false), `categorias_aparelho` ([1,2,3,4]), `sem_resposta_tentar_em_dias` (2).
- No core: `ciclo_dias_entre_compras` (7), `ciclo_nota_promotor` (9), `ciclo_validade_nps_meses` (12), `ciclo_inativo_meses` (null = desligado), `pos_venda_dias` (já existe, 30).
- No módulo também: `responsavel_padrao` (por loja; **D9**) e `janela_acompanhamento_dias` (3; roteamento da M7, §2.6).

**Armazenamento provisório e a migração para o `empresa_config` (D6, 23/11).** Enquanto o `empresa_config` do PDV v2 não existir, as chaves ficam em `configuracoes_sistema`, a tabela que já existe com `empresa_id`, `chave` e `valor` jsonb, sem loja. As convenções são escolhidas para a migração ser mecânica.

1. **Uma linha por chave**, com o nome `<modulo>.<chave>`, igual ao par `(modulo, chave)` do `empresa_config`. Exemplos: `posvenda.intervalo_minimo_dias`, `posvenda.responsavel_padrao`, `core.ciclo_dias_entre_compras`.
   - Nunca um jsonb "saco de chaves" como o `retorno_cliente` de hoje: ele força a migração a desmontar o objeto e a conhecer cada campo.
2. **O valor sempre no mesmo envelope:**

   ```json
   {"empresa": <valor ou null>, "lojas": {"<filial_id>": <valor>}}
   ```

   Exemplo (D9): `posvenda.responsavel_padrao` = `{"empresa": null, "lojas": {"3": "<uuid Guaçu>", "6": "<uuid Jaguariúna>"}}`.
   - O envelope tem exatamente o formato das linhas do `empresa_config`: `filial_id` nulo é a empresa, cada loja é uma linha.
3. **Ninguém lê `configuracoes_sistema` direto para essas chaves.** O SQL usa a função **`config_valor_emp(p_empresa, p_modulo, p_chave, p_filial)`**, `STABLE` e `SECURITY DEFINER`.
   - Ordem de leitura: valor da loja, valor da empresa, `null`. É a mesma do `config_valor` do PDV v2 §A; o padrão fica no chamador (`coalesce` com o padrão do manifesto).
   - Para a sessão, há o atalho `config_valor(p_modulo, p_chave, p_filial)`, que usa `get_empresa_id()`, com o mesmo nome e a mesma assinatura do PDV v2.
   - A escrita passa só por `config_salvar(p_modulo, p_chave, p_valor, p_filial)`. Ela confere dono ou admin, sessão que pode escrever e loja da própria empresa, e grava no envelope (com `atualizado_por` e `atualizado_em`). **Não** exige o módulo ligado: a D9 pede o responsável padrão preenchido antes de ligar o pós-venda.
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
| M6 | `posvenda_modulo` | As 10 tabelas `posvenda_*` com RLS (responsável NOT NULL), `posvenda_resolver_responsavel`, `posvenda_iniciar_jornadas` (gatilho no ganho; passos vencidos nascem `pulado`), `posvenda_registrar`, `posvenda_chamado_abrir`/`_mover` (SLA em horas corridas), reatribuição ao desativar usuário, e as sementes na instalação: status e categorias de chamado, SLA padrão, pesquisa NPS e régua "iPhone e aparelhos" com o D+90 seminovo ligado e o seguro desligado | módulo | M2, M4 |
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
| **B** | M4 + M5 + telas do ciclo de vida e quadro só com abertos (itens 3 e 4) |
| **C** | M6 + M7 + `/pos-venda` + Configurações › Pós-venda + aba Pós-venda na ficha (item 5). A vitrine vem por último, dentro da C ou depois |
| Fora das entregas | Triagem (item 1), em paralelo, e o desligamento da etapa (item 6), só depois da triagem aplicada |

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
     - responsável padrão por loja, obrigatório para ligar o módulo (D9);
     - régua iPhone (passos, ligar e desligar);
     - intervalo mínimo e teto diário;
     - limite do NPS;
     - status, categorias e SLA de chamado.
   - Fila `/pos-venda` em três abas: Atrasados, Hoje e Próximos 7 dias. Ações: Abrir WhatsApp com o texto montado, Registrar resultado, NPS manual, Reagendar, Pular e Abrir chamado.
   - Chamados: lista com filtros (sem realtime), abrir e mover, SLA em horas corridas. Nota de NPS ≤ 6 abre chamado para o responsável da loja.
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
| Acompanhamento ou chamado sem dono (110 de 112 negócios "sem registro" e os 38 da etapa Pós Venda estão sem responsável) | Responsável padrão por loja + reserva no dono; `responsavel_id` NOT NULL (D9) |
| Mexer em `core_negocio_do_canal` muda o recebimento de todos os canais e empresas | Migração com rollback, teste com contato de teste por canal, conferência de `negocio_historico` nas primeiras horas (zona sensível da Meta) |
| Régua com dados ruins: 84% dos ganhos sem produto ou categoria | Campos obrigatórios no ganho (checados também no servidor) e uma régua "Geral" de reserva |
| Fila inchada no dia da importação ou da instalação | Passos vencidos nascem `pulado`; teto diário por responsável; histórico de mais de 12 meses vai para público, não para fila |
| Excesso de mensagens ao cliente (várias réguas) | Intervalo mínimo entre contatos; uma jornada por dia de compra; prioridade entre réguas |
| Mensagem pelo wa.me não fica no Nexus | A tela avisa; preferir o chat do Nexus dentro da janela e o modelo aprovado fora dela |
| Política da Meta (modelo MARKETING exige opt-in, custo por conversa) | v1 manual; o automático só com modelo aprovado e chave por empresa desligada de fábrica |
| Contato duplicado por loja divide o histórico do mesmo cliente | A ficha soma pelo telefone (D2); a fusão de contatos já existe (`lib/fusao-contatos.ts`) |
| Dependência do motor de configuração do PDV v2 | Chave provisória em `configuracoes_sistema` (D6) |

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
| D9 | Responsável padrão dos passos | Vendedor do negócio no D+1 e no D+330; NPS e nota baixa com o **responsável da loja**. Configuração **"responsável padrão por loja"** (Guaçu e Jaguariúna), que recebe todo passo sem vendedor ou com vendedor inativo. **Nada nasce sem responsável** | §2.3, §2.4, §8.1 |
| D10 | Quem pode "Reabrir venda"? | **Dono e admin por enquanto;** gerente quando o cargo existir | §2.5.4 |
| D11 | Triagem dos negócios da etapa Pós Venda | **Feita pelo Matheus**, na planilha `triagem_pos_venda.csv` (38 negócios, com sugestão), aplicada por script | §2.5.4, §8.3 |
| D12 | Estágio `inativo` | **Desligado no MVP** (18 meses quando ligar, Fase 3) | §2.1, §8.3 |
| — | Data da venda no ganho | **Mantida no modal de ganho** (hoje como padrão). Para datas já gravadas, a RPC **`corrigir_data_venda(negocio_id, nova_data, motivo)`**, só dono e admin, com histórico. **Não usar `reabrir_negocio`** para isso | §2.3, M3 |

**Ainda pendente com o Lucas:**
- aprovar este plano (§8) antes de qualquer migração ou código do MVP;
- marcar o `conciliacao_revisar.csv`;
- confirmar o 5096 com a equipe.
