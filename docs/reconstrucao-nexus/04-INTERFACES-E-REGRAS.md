# Nexus — Interfaces do core e regras que sobrevivem

19/10/2026 · só leitura · base: `03-INVENTARIO-CODIGO.md` (listas 3 e 5) + catálogo do banco de produção lido em 19/10 (`pg_class`, `pg_proc`, `pg_trigger`, `cron.job`, só SELECT). Módulos: core, vendas, estoque, avaliacao, assistencia, financeiro, rastreamento, imoveis, inteligencia, superadmin. ¹ = fora dos 10 (food: cardápio/pedidos; saude: lista de espera).

---

## Parte A — Interfaces do core

### A.1 Catálogo (240 pontos → 25 interfaces)

| ID | Interface | Entrega | Substitui (hoje) | Itens |
|---|---|---|---|---:|
| I01 | `core.v_itens` + `core.item_resumo(item_id)` | item do catálogo: nome, marca, categoria, `tipo_formulario`, variantes (`cores`, `armazenamentos`), `garantia_dias`, preço, disponível; lista de modelos Apple | `produtos`, `marcas_produtos`, `categorias_produtos` (select e embed `produtos!produto_id(nome)`); `lib/estoque-campos`; `lib/apple-modelos` | 20 |
| I02 | `core.item_salvar(empresa_id, dados jsonb)` | cria/atualiza/arquiva item; acha ou cria marca e categoria pelo nome | insert/update em `produtos`, `marcas_produtos`, `categorias_produtos` | 8 |
| I03 | `core.v_unidades` + `core.unidade_por_identificador(empresa_id, texto)` | unidade física: item, IMEI/série/placa, cor, armazenamento, bateria, condição, estado, custo, preço, status, `grupo_pdv`, `reservado_lead_id`, `reserva_expira_em`, ano, km | select em `inventario_unidades` (+ embed de produto/marca/categoria) | 13 |
| I04 | `core.unidade_transicao(unidade_id, de text[], para text, contexto jsonb)` | troca de status condicionada ao status atual (vender, reservar, liberar, desfazer, baixar saldo de lote, expirar reservas, liberar reservas de quem saiu) | update em `inventario_unidades` | 8 |
| I05 | `core.unidade_entrada(empresa_id, origem, dados jsonb)` | entrada de unidade por troca, compra recebida ou avaliação de usado (status `pendente` quando é troca) | insert em `inventario_unidades` | 5 |
| I06 | `core.v_vendas` + `core.vendas_resumo(empresa_id, periodo, agrupar_por)` | venda com contato, vendedor, item, valor, custo, lucro, forma, canal, status, `grupo_pdv`, filial, **`retida`** (grupo com troca pendente); propostas por contato | select em `vendas`, `propostas`; `inventario_unidades.grupo_pdv` para retenção; SQL do ZapIntel | 25 |
| I07 | `core.venda_registrar(empresa_id, venda jsonb, pagamentos jsonb)` | grava venda + linhas de pagamento numa transação | insert em `vendas`, `vendas_pagamentos` | 3 |
| I08 | `core.comissoes_do_mes(empresa_id, mes)` + `core.comissao_registrar(usuario_id, mes, valor, percentual)` | comissões pagas por pessoa | `comissoes` | 4 |
| I09 | `core.documento_emitir(empresa_id, documento_id, origem jsonb)` + `core.contato_campos_faltantes(contato_id, finalidade)` | documentos disponíveis, emissão, termo assinado, campos do contato que faltam para o documento | `lib/contrato-emitir`, `lib/contrato-tipos`, `lib/cliente-contrato`; `vendas_termos` | 10 |
| I10 | `core.v_fornecedores` | fornecedor (id, nome fantasia) | `fornecedores` | 3 |
| I11 | `core.contato_vinculos(contato_id)` | registros de módulo ligados ao contato: perfil de busca, negócios, fichas de financiamento, orçamentos (+ cotação), reservas | `lead_perfil_busca`, `negocios_imobiliarios`, `fichas_financiamento`, `orcamentos`, `inventario_unidades` (reservas) | 16 |
| I12 | `core.registro_resumo(modulo, registro_id)` + `core.registros(empresa_id, modulo, busca)` | referência polimórfica: título, código, local de um registro de outro módulo (imóvel numa visita, imóvel num negócio) | embed `imoveis(titulo, codigo, bairro)`, `resumoImoveis(ids)` | 7 |
| I13 | `core.indicadores(empresa_id, periodo, modulo)` | números agregados por módulo para dashboard, admin, relatórios, executivo, onboarding, ranking, financeiro e superadmin | contagens/somas em `vendas`, `propostas`, `inventario_unidades`, `produtos`, `garantias_assistencias`, `lancamentos_financeiros`, `imoveis`, `negocios_imobiliarios`; `lib/captacao-imob` | 21 |
| I14 | `core.contato_match(contato_id)` | itens ranqueados para o interesse do contato | `lib/match-imoveis`, `lib/match-veiculos`, `lead_perfil_busca`, `imoveis`, `inventario_unidades` | 7 |
| I15 | `core.meios_pagamento(empresa_id)` | taxas ativas por forma, bandeira e parcelas | `taxas_pagamento` | 6 |
| I16 | `core.lancamento_registrar(empresa_id, origem, dados jsonb)` | lançamento financeiro vindo de outro módulo (saldo de troca, comissão imobiliária) | insert em `lancamentos_financeiros`; `lib/comissao-imob` no Financeiro | 5 |
| I17 | `core.avaliacao_preco(empresa_id, modelo, armazenamento, avarias)` | valor de troca: matriz, regras da loja, referência de mercado, tolerância, chave da linha | `troca_precos`, `troca_regras`, `tabela_precos`, `lib/troca-referencia`, `lib/troca-modelos`, tipo `ValoresDoModelo` | 13 |
| I18 | `core.avaliacao_cotacao(cotacao_id)` + `core.avaliacao_cotacao_usar(cotacao_id, venda_id)` | cotação da empresa; marca como usada numa venda | `troca_cotacoes` | 2 |
| I19 | `core.empresa_modulos` + `core.modulo_ligado(empresa_id, modulo)` | módulo ligado/desligado por empresa | `segmentos_config`, `complementos_empresa.zapintel_ativo`, `menu_override` (`lib/troca-acesso`), `lib/plano`/`lib/planos` | 14 |
| I20 | `core.v_planos` | planos públicos e limites | `planos_config` | 5 |
| I21 | `core.sessao_contexto()` | empresa da sessão, impersonação ativa, superadmin, avisos ativos | `avisos_plataforma`, `encerrar_impersonacao`, `lib/superadmin`, banner de impersonação | 5 |
| I22 | `core.modulos_manifesto` (TS) | registro de cada módulo: cartões de configuração, painéis do contato, widgets, jobs do cron, exportação; componentes compartilhados do core (`SeletorDeContato`) | 20 imports de componentes/libs de outro módulo; `TABELAS[tipo]` das exportações | 20 |
| I23 | `core.evento_emitir(empresa_id, tipo, dados jsonb)` | evento entre módulos (venda registrada → inteligência; mídia retida) | trigger `zapintel_vendas_ao_vivo`; insert em `zapintel_midia_retida` | 2 |
| I24 | `core.modulo_config(modulo, empresa_id)` | configuração e uso de um módulo (global ou por empresa) | `assistente_config`, `assistente_uso`, `lib/assistente-modelos`, `fipe_referencia`, `fipe_consultas`, `lib/portal-token` | 9 |
| I25 | `core.servidor` (TS) | cliente com service key e cofre de credenciais (cifrar/decifrar) | `lib/rastreamento/db` importado por 8 arquivos de outros módulos; `lib/payments/crypto` importado por `lib/c2s` | 9 |

### A.2 Por par (módulo que lê → módulo lido)

Pontos que tocam dois módulos (embed) aparecem nos dois pares; por isso a soma dos pares (250) passa de 240. "Arquivos" = arquivos distintos daquele par e interface.

#### core → imoveis — 30 pontos, 15 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lead_perfil_busca` (id, preco_min, preco_max, cidades, bairros, tipos, quartos_min, quartos_max, …); `negocios_imobiliarios` (tipo, valor, status, created_at, id, assinado_em, vistoria_em, chaves_entregues_em, …); `imoveis` | select, update, insert, upsert | 5 | 16, 17, 18, 19, 20, 57, 150, 208, 209, 211 | I11 |
| `imoveis` (titulo, codigo, bairro, id, cidade, finalidade, valor_venda, valor_locacao) | select | 5 | 2, 3, 4, 22, 43, 212 | I12 |
| `imoveis` (*, id, codigo, titulo, tipo, status, valor_venda, valor_locacao, finalidade, …); `negocios_imobiliarios` (id, tipo, valor, status, comissao_total, comissao_captador, comissao_vendedor, corretor_id, …); `lib/captacao-imob` | select, import | 4 | 23, 24, 25, 41, 42, 92, 227 | I13 |
| `lib/match-imoveis`; `lead_perfil_busca` (finalidade, tipos, cidades, bairros, preco_min, preco_max, quartos_min, vagas_min); `imoveis` (id, codigo, titulo, tipo, finalidade, status, bairro, cidade, …) | import, select | 2 | 128, 131, 132, 207 | I14 |
| `imoveis`; `negocios_imobiliarios`; `components/modules/configuracoes/portais-card` | select, import | 2 | 124, 189 | I22 |
| `lib/portal-token` | import | 1 | 100 | I24 |

#### core → vendas — 28 pontos, 17 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `vendas` (id, valor_venda, forma_pagamento, canal_venda, data_venda, status, vendedor_id, grupo_pdv, …); `propostas` (lead_id, created_at) | select | 9 | 29, 32, 36, 63, 94, 98, 117, 119, 176, 177 | I06 |
| `comissoes` (*) | select, insert | 3 | 33, 35, 37, 99 | I08 |
| `lib/cliente-contrato` | import | 2 | 21, 210 | I09 |
| `fichas_financiamento` (id, banco, valor, entrada, parcelas, taxa, status) | select, insert, update, delete | 1 | 202, 203, 204, 205 | I11 |
| `vendas` (*, valor_venda); `propostas` (status, lead_id) | select | 4 | 26, 30, 105, 199, 228 | I13 |
| `vendas`; `components/modules/configuracoes/devolucao-card`; `components/modules/configuracoes/contrato-card` | select, import | 2 | 124, 188, 192 | I22 |

#### core → estoque — 24 pontos, 16 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` (id, nome, preco) | select | 2 | 185, 223 | I01 |
| `inventario_unidades` (id, imei, numero_serie, preco_venda, cor, armazenamento, condicao, bateria, …); `produtos` (nome, marcas_produtos!marca_id); `marcas_produtos` (nome) | select | 4 | 184, 186, 220, 222, 229 | I03 |
| `inventario_unidades` | update | 1 | 123 | I04 |
| `produtos` (nome); `inventario_unidades` (grupo_pdv) | select | 5 | 29, 34, 94, 96, 119, 178 | I06 |
| `inventario_unidades` (id, cor, armazenamento, condicao, preco_venda, reserva_expira_em); `produtos` (nome) | select | 1 | 221 | I11 |
| `inventario_unidades` (*); `produtos` (*, nome) | select | 4 | 27, 30, 104, 120, 198 | I13 |
| `lib/match-veiculos`; `inventario_unidades` (id, ano, km, cor, preco_venda, status); `produtos` (nome, marcas_produtos!marca_id); `marcas_produtos` (nome); `categorias_produtos` (nome) | import, select | 2 | 129, 130, 206 | I14 |
| `components/modules/configuracoes/veiculos-portal-card` | import | 1 | 191 | I22 |

#### vendas → estoque — 20 pontos, 8 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` (nome, garantia_dias, cores, armazenamentos); `lib/estoque-campos` | select, import | 5 | 58, 75, 88, 90, 201, 226 | I01 |
| `inventario_unidades` (id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, …); `produtos`; `marcas_produtos`; `categorias_produtos` | select | 2 | 85, 86, 91, 174 | I03 |
| `inventario_unidades` (id) | update | 3 | 77, 78, 81, 82, 84, 175 | I04 |
| `inventario_unidades` | insert | 3 | 79, 113, 225 | I05 |
| `tabela_precos` (modelo, armazenamento, condicao, preco_sugerido) | select | 1 | 89 | I17 |

#### core → superadmin — 19 pontos, 17 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `segmentos_config` (hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout); `complementos_empresa` (zapintel_ativo); `lib/planos` | select, import | 8 | 62, 93, 102, 103, 122, 151, 173, 230 | I19 |
| `planos_config` (*, nome, preco_centavos, limite_leads, limite_usuarios, id, descricao, features, destaque, …) | select | 5 | 106, 107, 142, 154, 155 | I20 |
| `lib/superadmin`; `components/superadmin/impersonation-banner`; `avisos_plataforma` (id, titulo, corpo, tom, alvo, alvo_valor, ativo, expira_em); `encerrar_impersonacao` | import, select, rpc | 4 | 31, 59, 61, 180, 183 | I21 |
| `lib/stripe` | import | 1 | 114 | I22 |

#### assistencia → vendas — 13 pontos, 6 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `vendas` (data_venda, created_at) | select | 1 | 5, 7 | I06 |
| `vendas`; `vendas_pagamentos` | insert | 1 | 135, 136, 140 | I07 |
| `lib/contrato-emitir`; `lib/contrato-tipos`; `vendas_termos` (id, venda_id, tipo, arquivo_url); `vendas` | import, select, update | 4 | 50, 51, 52, 53, 55, 125, 126, 127 | I09 |

#### assistencia → estoque — 13 pontos, 7 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` (id, nome) | select | 5 | 8, 9, 49, 54, 153 | I01 |
| `inventario_unidades` (id, grupo_pdv, imei, preco_custo, observacoes, preco_venda, condicao, status, …); `produtos` (nome) | select | 4 | 6, 56, 71, 138 | I03 |
| `inventario_unidades` (id) | update | 1 | 139 | I04 |
| `inventario_unidades` | insert | 1 | 134 | I05 |
| `produtos` | select | 1 | 55 | I09 |
| `tabela_precos` (modelo, armazenamento, condicao, preco_sugerido) | select | 1 | 72 | I17 |

#### inteligencia → vendas — 11 pontos, 9 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `vendas` (valor_venda, id, data_venda, created_at, valor_custo, lucro, forma_pagamento, canal_venda, …) | select, select (SQL) | 8 | 163, 166, 170, 182, 232, 235, 236, 237, 238, 239 | I06 |
| `vendas` | trigger SQL | 1 | 231 | I23 |

#### assistencia → avaliacao — 9 pontos, 4 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `components/modules/orcamentos/avaliar-aparelho`; `lib/troca-modelos`; `troca_precos` (modelo, armazenamento, na_troca, descontos); `troca_regras` (bonus_seminovo, corte_bateria) | import, select | 2 | 67, 69, 70, 73, 74 | I17 |
| `troca_cotacoes` (id) | select | 1 | 141 | I18 |
| `lib/troca-acesso` | import | 2 | 65, 68 | I19 |
| `components/modules/orcamentos/troca-modal` | import | 1 | 66 | I22 |

#### food¹ → estoque — 8 pontos, 4 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` (id, nome, categoria_id, preco, descricao, foto_url, disponivel); `categorias_produtos` (id, nome) | select | 3 | 14, 15, 133, 152 | I01 |
| `produtos` | insert, update | 1 | 10, 11, 12, 13 | I02 |

#### core → financeiro — 8 pontos, 4 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lancamentos_financeiros` (id, data_venc, descricao, categoria, tipo, valor, status) | select | 1 | 95 | I13 |
| `taxas_pagamento` (forma_pagamento, bandeira, parcelas, percentual_taxa, ativo) | select, delete, insert | 2 | 97, 194, 195, 196, 197 | I15 |
| `components/modules/configuracoes/meios-pagamento-card` | import | 1 | 187 | I22 |
| `lib/payments/crypto` | import | 1 | 172 | I25 |

#### core → avaliacao — 8 pontos, 3 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `troca_cotacoes` | select | 1 | 217 | I11 |
| `components/modules/orcamentos/avaliar-aparelho`; `lib/troca-modelos`; `troca_precos` (modelo, armazenamento, na_troca, descontos); `troca_regras` (bonus_seminovo, corte_bateria) | import, select | 1 | 215, 216, 218, 219 | I17 |
| `lib/fipe`; `components/modules/configuracoes/troca-card`; `components/modules/orcamentos/troca-modal` | import | 3 | 115, 193, 214 | I22 |

#### avaliacao → estoque — 6 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/apple-modelos` | import | 1 | 181 | I01 |
| `marcas_produtos`; `produtos` (id) | escreve, select, insert | 1 | 108, 109, 110, 111 | I02 |
| `inventario_unidades` | insert | 1 | 112 | I05 |

#### superadmin → inteligencia — 6 pontos, 3 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/assistente-modelos`; `lib/assistente-erros`; `assistente_uso` (empresa_id, created_at, tokens_in, tokens_out); `assistente_config` (ativo, limite_por_min, modelo, system_extra) | import, select, upsert | 3 | 143, 144, 145, 146, 156, 157 | I24 |

#### financeiro → imoveis — 5 pontos, 3 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `imoveis` (id, codigo, titulo) | select | 1 | 48 | I12 |
| `lib/comissao-imob`; `negocios_imobiliarios` (id, tipo, valor, status, assinado_em, created_at, percentual, comissao_total, …) | import, select | 3 | 44, 45, 47, 200 | I16 |

#### inteligencia → rastreamento — 5 pontos, 5 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/rastreamento/db` | import | 5 | 162, 164, 165, 167, 168 | I25 |

#### core → assistencia — 4 pontos, 3 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `orcamentos` | select | 1 | 217 | I11 |
| `garantias_assistencias` (*) | select | 2 | 28, 121 | I13 |
| `components/modules/orcamentos/orcamento-editor-modal` | import | 1 | 213 | I22 |

#### inteligencia → superadmin — 4 pontos, 4 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `complementos_empresa` (empresa_id, zapintel_ativo) | select, select (SQL) | 4 | 118, 169, 233, 234 | I19 |

#### estoque → vendas — 3 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `fornecedores` (id, nome_fantasia) | select | 2 | 38, 39, 40 | I10 |

#### core → inteligencia — 3 pontos, 3 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `components/assistente/assistente-widget`; `lib/zapintel/ponte` | import | 2 | 60, 116 | I22 |
| `zapintel_midia_retida` | insert | 1 | 179 | I23 |

#### vendas → avaliacao — 3 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/troca-referencia` | import | 2 | 76, 83 | I17 |
| `troca_cotacoes` | update | 1 | 80 | I18 |

#### superadmin → avaliacao — 3 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/fipe` | import | 1 | 149 | I22 |
| `fipe_referencia` (codigo, mes, atualizado_em); `fipe_consultas` (*) | select | 1 | 160, 161 | I24 |

#### avaliacao → assistencia — 2 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `app/(dashboard)/orcamentos/cliente-autocomplete` | import | 2 | 64, 224 | I22 |

#### superadmin → rastreamento — 2 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/rastreamento/db` | import | 2 | 147, 158 | I25 |

#### superadmin → vendas — 2 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `vendas` (*) | select | 1 | 159 | I13 |
| `vendas` | select | 1 | 148 | I22 |

#### inteligencia → estoque — 2 pontos, 2 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` (id, nome) | select, select (SQL) | 2 | 171, 240 | I01 |

#### core → saude¹ — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `components/modules/saude/lista-espera` | import | 1 | 1 | I22 |

#### financeiro → vendas — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `vendas` (valor_venda) | select | 1 | 46 | I13 |

#### vendas → financeiro — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `taxas_pagamento` (*) | select | 1 | 87 | I15 |

#### core → rastreamento — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lib/rastreamento/db` | import | 1 | 101 | I25 |

#### assistencia → financeiro — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `lancamentos_financeiros` | insert | 1 | 137 | I16 |

#### superadmin → estoque — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `produtos` | select | 1 | 148 | I22 |

#### superadmin → imoveis — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `imoveis` | select | 1 | 148 | I22 |

#### superadmin → financeiro — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `cobrancas` | select | 1 | 148 | I22 |

#### core → food¹ — 1 pontos, 1 arquivos

| Tabela (colunas) | Operação | Arquivos | Itens da lista 3 | Interface |
|---|---|---:|---|---|
| `components/modules/configuracoes/cardapio-card` | import | 1 | 190 | I22 |


---

## Parte B — Regras que sobrevivem

Destino: **(1)** função/trigger SQL · **(2)** função TypeScript em `lib/` chamada por rota · **(3)** configuração em tabela (campo personalizado, regra em jsonb). **SEG** = depende de segmento hoje (7). **PROD** = existe só no banco de produção, sem DDL no repo.

### B.1 As 62 regras da lista 5

| # | Regra | Arquivo:linha | Entrada → saída | Destino | Marca |
|---|---|---|---|:-:|---|
| 1 | Taxa da linha de pagamento | `lib/pdv-pagamentos.ts:36`, `:52` | linha {forma, valor, bandeira, parcelas} + taxas → % e valor com acréscimo simples | 2 | |
| 2 | Pagamento dividido fecha o total | `lib/pdv-pagamentos.ts:70` | linhas + total + taxas → {coberto, cobrado, falta, juros, fechado (falta < R$ 0,01)} | 2 | |
| 3 | Forma e parcelas gravadas na venda | `lib/pdv-pagamentos.ts:90`, `:97` | linhas → `dinheiro` / forma única / `multiplo`; parcelas só com 1 linha | 2 | |
| 4 | Parcelas disponíveis | `lib/pdv-pagamentos.ts:146` | linha + taxas → parcelas cadastradas em ordem | 2 | |
| 5 | Texto do pagamento | `lib/pdv-pagamentos.ts:126` | pagamentos gravados → "Crédito 3x + Dinheiro" | 2 | |
| 6 | Simular parcela | `components/modules/simular-parcela/simular-parcela-view.tsx:49-62` | valor, tipo, bandeira, taxas → linhas {parcelas, taxa, parcela, total} | 2 | |
| 7 | Simular financiamento (Price/SAC) | `components/modules/simular-financiamento/simular-financiamento-view.tsx:21-38` | valor, entrada, prazo, taxa a.m., sistema → {pv, primeira, última, total, juros} | 2 | |
| 8 | Rateio do desconto entre itens | `app/(dashboard)/pdv/components/pdv-view.tsx:454-471` | carrinho + desconto → desconto e valor por venda, sobra na última | 2 | |
| 9 | Troca é pagamento, não desconto | `app/(dashboard)/pdv/components/pdv-view.tsx:351-359`, `:412-413` | subtotal, desconto, trocas → valor da venda ou bloqueio | 2 | |
| 10 | Troca acima da referência exige aceite | `lib/troca-referencia.ts:31`, `:68`, `:82` | texto do aparelho, tabela de preços, valor, tolerância → {referência, excedente, exigeAceite} | 2 | |
| 11 | Estado da venda e da unidade no fechamento (desfaz em falha) | `app/(dashboard)/pdv/components/pdv-view.tsx:436-441`, `:477`, `:487`, `:777` | carrinho, entrega pendente → vendas + pagamentos + unidades atualizadas | 1 | SEG |
| 12 | Aparelho da troca entra pendente; cotação marcada como usada | `app/(dashboard)/pdv/components/pdv-view.tsx:596`, `:618` | trocas → unidade `usado/troca/pendente` + `troca_cotacoes.usada_em` | 1 | |
| 13 | Valor da cotação de troca (servidor refaz a conta) | `lib/troca-avarias.ts:97`; `app/api/troca/cotacoes/route.ts:41` | base, descontos, avarias marcadas, bônus → total + cotação numerada | 2 | |
| 14 | Matriz de troca (null ≠ 0; família) | `app/api/troca/precos/route.ts:40`; `app/api/troca/precos/familia/route.ts:38` | {modelo, armazenamento, na_troca, descontos} → linhas em `troca_precos` | 3 | SEG |
| 15 | Regras da loja para troca | `app/api/troca/regras/route.ts:19` | {bonus_seminovo ≥ 0, corte_bateria 0..100, padrão 80} → `troca_regras` | 3 | |
| 16 | Busca de cotação por código | `app/api/troca/cotacoes/buscar/route.ts:28` | "42" / "#42" / "TR-42" → cotação + aviso `ja_usada` | 2 | |
| 17 | Cotação de troca liberada por empresa | `lib/troca-acesso.ts:20` | empresa da sessão → boolean (`menu_override`) | 3 | |
| 18 | Validação de IMEI (Luhn, 15 dígitos) | `lib/imei.ts:44`, `:72` | texto → {dígitos, válido, motivo}; máscara 2-6-6-1 | 2 | |
| 19 | Campos da unidade pela categoria | `lib/estoque-campos.ts:71` | `tipo_formulario` → campos a mostrar | 3 | |
| 20 | Garantia padrão da loja | `lib/contrato-emitir.ts:30` | empresa → dias (config ou 90) | 3 | |
| 21 | Emissão de contrato | `lib/contrato-emitir.ts:182`, `:152`, `:161` | dados da venda + documento → HTML arquivado + campos faltantes | 2 | |
| 22 | Mescla do modelo `{{chave}}` | `lib/contrato-modelo.ts:157`, `:306`, `:349` | modelo + dados → HTML A4 | 2 | |
| 23 | Valor por extenso | `lib/contrato-extenso.ts:54` | número → texto em português | 2 | |
| 24 | Cadastro do comprador completo (11 campos) | `lib/cliente-contrato.ts:44` | contato → rótulos faltantes | 3 | |
| 25 | Importar PDF como modelo | `lib/contrato-importar-pdf.ts:312`; `lib/contrato-molde-campos.ts:72`, `:87` | PDF → páginas com blocos e marcadores sugeridos | 2 | |
| 26 | Limite de leads (navegador) | `components/modules/leads/new-lead-modal.tsx:63-71`; `app/(dashboard)/clientes/components/cliente-modal.tsx:153-163` | empresa + contagem de ativos → bloqueio (`empresas.limite_leads`) | 1 | PROD (ver B.3) |
| 27 | Inscrição em cadência ao entrar na etapa | `lib/cadencia.ts:32`, `:19` | empresa, lead, etapa → inscrição no 1º passo | 1 | |
| 28 | Executar passo da cadência | `app/api/cadencias/acao/route.ts:21`; `lib/cadencia.ts:26` | {inscrição, tipo, resultado, canal} → inscrição avançada/concluída + chamada | 2 | |
| 29 | Fila do dia | `app/(dashboard)/fila/page.tsx:15-23` | usuário, empresa → inscrições vencidas até 23:59 (máx. 200) | 1 | |
| 30 | Régua de follow-up: marca única antes da tarefa | `app/api/cron/[job]/route.ts:129`, `:121-125`; `app/api/admin/regua-followup/route.ts:6` | {empresa, lead, regra, chave} → `followups_gerados` + `tarefas` | 2 | |
| 31 | Régua: primeiro contato (24 h a 7 dias em `novo`) | `app/api/cron/[job]/route.ts:151-162` | leads → tarefa + marca | 3 | |
| 32 | Régua: pós-visita (3 a 14 dias) | `app/api/cron/[job]/route.ts:166-212` | etapas + visitas → tarefa + marca | 3 | |
| 33 | Régua: confirmação D-1 | `app/api/cron/[job]/route.ts:214-234` | visitas de amanhã → tarefa + marca | 3 | |
| 34 | Campanhas de fidelidade | `app/api/cron/[job]/route.ts:236-281` | `campanhas_fidelidade` + clientes/vendas/visitas → tarefas | 3 | |
| 35 | Automação "parado X horas" | `app/api/cron/[job]/route.ts:283-315` | `automacoes` → ação + marca por entrada na etapa | 3 | |
| 36 | Ações de automação (nunca enviam mensagem) | `lib/automacoes.ts:35`, `:70` | empresa, lead, ação, config → tarefas | 2 | |
| 37 | Distribuição por regras | `lib/distribuicao.ts:39`, `:22`, `:77` | empresa, lead {origem, valor, filial} → responsável | 2 | |
| 38 | Roleta (round-robin por loja) | `lib/roleta.ts:23`, `:72` | empresa, filial → próximo responsável (ponteiro em `configuracoes_sistema`) | 1 | |
| 39 | Lead score 0–100 | `lib/lead-score.ts:68`, `:49`, `:37` | sinais do lead + config → {score, quente/morno/frio} | 2 | |
| 40 | Gatilho por score | `lib/scoring-server.ts:19` | empresa → {avaliados, enfileirados} | 2 | |
| 41 | Lead parado (dias e gravidade) | `lib/lead-parado.ts:64`, `:51`, `:44` | datas do lead → dias + {gravidade, prioridade} | 2 | |
| 42 | Reativação (win-back) | `lib/reativacao.ts:19` | empresa → {reativados} | 2 | |
| 43 | Esteira de devolução | `lib/esteira.ts:30`, `:130`, `:114` | empresa → {devolvidos, avaliados} | 2 | |
| 44 | Minutos úteis (fuso fixo) | `lib/horario-util.ts:57`, `:21` | de, até, horário da loja → minutos | 2 | |
| 45 | Encomenda: criação | `components/modules/pdv/encomenda-form.tsx:254`, `:276-280`, `:299`, `:360` | cliente, itens, previsão, entrada → pedido + vendas `encomenda` + unidade de troca | 1 | |
| 46 | Situação da encomenda | `lib/encomendas.ts:93`, `:57`, `:135`, `:121` | encomenda aberta → {situação, dias, rótulo} | 2 | |
| 47 | Entrega da encomenda | `lib/encomendas.ts:181` | venda + pagamento na entrega → venda concluída, unidade vendida | 1 | |
| 48 | Reserva de 48 h | `app/api/reservas/route.ts:8`, `:10`, `:20`, `:69` | {unidade, lead} → reserva com expiração / 409 | 1 | |
| 49 | Troca pendente retém venda e comissão | `lib/ranking.ts:80-112`; `app/api/estoque/confirmar-chegada/route.ts:12` | vendas + unidades pendentes → vendas e faturamento retidos | 1 | |
| 50 | Transferência entre lojas | `app/api/estoque/transferir/route.ts:27` | {ids, filial destino} → unidades `pendente` + 2 movimentações | 1 | |
| 51 | Orçamento aprovado pelo link público | `app/api/orcamento/[token]/route.ts:8`, `:57-150`, `:153-200` | token + aprovar/recusar → OS ou venda + pagamento + lançamento | 1 | |
| 52 | Comissão imobiliária | `lib/comissao-imob.ts:103`, `:84`, `:52`, `:129` | tipo, valor, taxas, cashback, papéis → {total, captador, vendedor, casa} | 2 | |
| 53 | Match de imóveis | `lib/match-imoveis.ts:45`, `:88` | perfil de busca + imóveis → ranking 0–100 | 2 | SEG |
| 54 | Match de veículos | `lib/match-veiculos.ts:45`, `:93` | interesse + veículos → ranking 0–100 | 2 | SEG |
| 55 | Motivos de perda (semente + obrigatório) | `lib/motivos-perda.ts:80`, `:20`; `components/modules/leads/motivo-perda-modal.tsx:33` | segmento → lista; etapa perdido → exige motivo | 3 | SEG |
| 56 | Ranking (pontuação por métrica) | `lib/ranking.ts:52`, `:47`, `:132`, `:139` | empresa, mês → linhas com score e progresso de meta | 2 | SEG |
| 57 | Captação de imóveis por pessoa | `lib/captacao-imob.ts:15` | empresa, janela → contagem por usuário | 1 | SEG |
| 58 | Conversão do funil | `lib/conversao.ts:27` | empresa → funil, gargalo, tempo ao 1º contato | 1 | |
| 59 | FIPE (cache e referência diária) | `lib/fipe.ts:91`, `:63`, `:53`, `:45` | {tipo, marca, modelo, ano} → valor FIPE | 2 | |
| 60 | Chave do imóvel | `lib/chave-imovel.ts:42`, `:56`, `:64` | chaves → estado, atrasada, com quem | 2 | |
| 61 | Ponte venda ↔ conversa | `lib/zapintel/ponte.ts:150`, `:56`, `:136`, `:253` | empresa → `zapintel_venda_lead` | 2 | |
| 62 | Acesso por plano (matriz em dois arquivos) | `lib/plano.ts:11`; `lib/planos.ts:22` | plano, recurso → boolean | 3 | |

### B.2 As 7 que dependem de segmento → configuração por empresa

| # | Hoje | Vira |
|---|---|---|
| 11 | `SEGMENTOS[...].capacidades.usaComanda` liga o fluxo de comanda no PDV (`pdv-view.tsx:99`) | módulo "comanda" em `empresa_modulos`; o PDV pergunta `core.modulo_ligado(empresa, 'comanda')` |
| 14 | catálogo fixo de iPhone (`lib/troca-modelos.ts:26` → `lib/apple-modelos.ts`) e matriz liberada por `menu_override` | modelos da matriz vêm dos itens da empresa (`core.v_itens`) e a avaliação liga por `empresa_modulos('avaliacao')` |
| 53 | caminho padrão do match quando `matchVeiculo` está desligado | matcher registrado pelo módulo `imoveis` quando ligado em `empresa_modulos` |
| 54 | `capacidades.matchVeiculo` desvia o match (`app/api/match/lead/[id]/route.ts:26`) | matcher do `estoque` para itens com `tipo_formulario = veiculo`, campos de interesse como campo personalizado do contato |
| 55 | `MOTIVOS_POR_SEGMENTO` semeia os motivos no cadastro | lista inicial escolhida pelos módulos ligados no onboarding; depois só a tabela `motivos_perda` da empresa |
| 56 | ranking só soma imóveis captados se `captacaoDeImovel` (`ranking/page.tsx:77-80`) | pesos e métricas do ranking em jsonb por empresa; a métrica de captação existe quando `imoveis` está ligado |
| 57 | contagem chamada só com `captacaoDeImovel` (`ranking/page.tsx:78`) | métrica de `core.indicadores(empresa, periodo, 'imoveis')`, disponível quando o módulo está ligado |

### B.3 Regras que existem só no banco de produção (sem DDL em `supabase/`)

Corpo lido em `pg_proc` em 19/10. Nenhuma tem arquivo em `supabase/`; DDL = **só em produção** para todas.

| # | Objeto | Gatilho / chamada | Entrada → saída | Destino | DDL no repo |
|---|---|---|---|:-:|---|
| P1 | `enforce_lead_limit()` | trigger `trg_enforce_lead_limit` em `leads` | insert de lead → `RAISE 'LEAD_LIMIT_REACHED'` quando `count(*)` de **todos** os leads da empresa ≥ `planos_config.limite_leads` do plano (`empresas.plano`); sem limite no plano, passa. O navegador (regra 26) usa outra coluna (`empresas.limite_leads`) e conta só ativos; `new-lead-modal.tsx:90` trata a mensagem do trigger | 1 | só em produção |
| P2 | `numerar_cotacao_troca()` | trigger `troca_cotacoes_numerar` | cotação sem número → `max(numero)+1` por empresa, com `pg_advisory_xact_lock`; número informado é respeitado | 1 | só em produção |
| P3 | `marcar_cliente_proprietario()` | trigger `trg_imoveis_marca_proprietario` | imóvel com `proprietario_id` → `clientes.proprietario = true` | 1 | só em produção |
| P4 | `fundir_clientes(p_empresa, p_principal, p_secundario)` | RPC em `app/api/clientes/fundir/route.ts:36` | dois clientes da mesma empresa → secundário fundido no principal, jsonb do que foi movido | 1 | só em produção |
| P5 | `refresh_status_atrasados()` | sem chamador no código e sem job no `pg_cron` | lançamentos `pendente` com `data_venc` < hoje → `atrasado` | 1 | só em produção |
| P6 | `sincronizar_nao_lidas()` | triggers `nao_lidas_sincroniza` e `nao_lidas_sincroniza_upd` em `lead_mensagens` | mensagem → `leads.msgs_nao_lidas` = recebidas não lidas (só grava se mudou) | 1 | só em produção |
| P7 | `tg_lead_marcos_conversa()` | trigger `lead_marcos_conversa` em `lead_mensagens` | mensagem → `leads.ultima_recebida_at` / `ultima_enviada_at` (nunca volta) | 1 | só em produção |
| P8 | `filial_gravacao(p_empresa)` + `preencher_filial()` + `preencher_filial_do_lead()` + `propagar_filial_do_lead()` | 33 triggers (27 `*_preencher_filial`, 5 `filial_do_lead`, 1 `filial_desce_para_os_filhos`) | registro sem loja → loja do topo, senão a do usuário, senão matriz, senão qualquer ativa; loja do lead desce para mensagens, perfil, follow-ups, inscrições e cliente | 1 | só em produção |
| P9 | `prevent_privilege_escalation()` | trigger `trg_prevent_privilege_escalation` em `usuarios` | quem não é superadmin não muda `is_super_admin`, `impersonando_empresa_id`, `role`, `modulos_acesso`, `permissoes` | 1 | só em produção |
| P10 | `handle_new_user()` | trigger `on_auth_user_created` em `auth.users` | usuário do Auth → linha em `usuarios` (nome do metadata ou do e-mail) | 1 | só em produção |
| P11 | `hard_delete_empresa(p_empresa_id)` | RPC em `app/api/superadmin/empresas/[id]/excluir/route.ts:54` | empresa → apaga filhos em ordem topológica numa transação; só superadmin | 1 | só em produção |
| P12 | `rate_limit_bump(p_chave, p_janela)` | RPC em `lib/rate-limit.ts:59`, `:93` | chave + janela → contador; limpa janelas com mais de 1 dia | 1 | só em produção |
| P13 | `chat_marcar_lido(p_conversa)` + `chat_nao_lidas_por_conversa()` | RPC em `hooks/use-chat-nao-lidas.ts:75` | conversa → `lido_ate` que nunca anda para trás; não lidas por conversa do chat interno | 1 | só em produção |
| P14 | `set_impersonation(p_empresa_id, p_ttl_seconds)` + `encerrar_impersonacao()` + `set_super_admin(p_target, p_value)` | RPC (superadmin) e `lib/supabase/server.ts:67` | empresa + TTL → impersonação com prazo; liga/desliga superadmin | 1 | só em produção |
| P15 | `get_empresa_id()`, `is_super_admin()`, `is_empresa_admin(emp)`, `filial_atual()`, `filiais_visiveis()` | políticas de RLS e funções acima | sessão → empresa, papel e lojas visíveis | 1 | só em produção |

---

## Parte C — Drift schema × repo

O repo não tem `supabase/migrations`. O "equivalente" lido: `supabase/funcoes/*.sql`, `supabase/views/*.sql`, `supabase/pendentes/*.sql`, `supabase/functions/` (Edge Function, sem DDL). Produção lida no catálogo em 19/10 (schema `public`; funções de extensão fora).

### C.1 Contagem

| Objeto | Produção (lido 19/10) | Número informado | Com DDL no repo | Sem DDL no repo |
|---|---:|---:|---:|---:|
| Tabelas em `public` | 95 | 95 | 1 (`zapintel_conversa_cache`, em `supabase/funcoes/zapintel_conversa.sql`) | 94 |
| Funções em `public` | 53 | 52 | 25 (`assistente_status_conversas`, `buscar_lead_por_numero`, 20 `zapintel_*`, 3 `tg_zapintel_*`) | 28 |
| Triggers em `public` | 49 | 48 | 3 (`zapintel_ao_vivo`, `zapintel_ficha_ao_vivo`, `zapintel_vendas_ao_vivo`) | 46 |
| Trigger em `auth` | 1 (`on_auth_user_created`) | — | 0 | 1 |
| Views em `public` | 5 | 5 | 1 (`storage_orfaos`) | 4 |
| Jobs `pg_cron` | 1 (`zapintel-conversa-aquecer`, `0 5 * * *`) | 1 | 1 (`supabase/funcoes/zapintel_conversa.sql:472`) | 0 |
| **Total** | **204** | | **31** | **173** |

### C.2 Tabelas sem DDL (94)

| Módulo | Nº | Tabelas sem DDL no repo |
|---|---:|---|
| core | 37 | `acessos`, `automacoes`, `cadencia_execucoes`, `cadencia_inscricoes`, `cadencia_passos`, `cadencias`, `campanhas_fidelidade`, `canais_conectados`, `chamadas`, `chat_leituras`, `clientes`, `configuracoes_sistema`, `diagnostico_canais`, `distribuicao_regras`, `empresa_usuarios`, `empresas`, `filiais`, `followups_gerados`, `funil_etapas`, `funis`, `historico_bruto`, `integracao_eventos`, `lead_atribuicoes`, `lead_mensagens`, `leads`, `mensagens_internas`, `metas`, `metas_comissoes`, `modelos_mensagem`, `motivos_perda`, `notificacao_prefs`, `push_subscriptions`, `rate_limit`, `solicitacoes_marketing`, `tarefas`, `usuarios`, `visitas` |
| vendas | 13 | `comissoes`, `contrato_documentos`, `contrato_modelos`, `contratos_venda`, `fichas_financiamento`, `fornecedores`, `pedidos_compra`, `pre_vendas`, `propostas`, `vendas`, `vendas_alertas`, `vendas_pagamentos`, `vendas_termos` |
| estoque | 9 | `categorias_produtos`, `imei_consultas`, `inventario_unidades`, `marcas_produtos`, `movimentacao_estoque`, `produtos`, `subcategorias_produtos`, `tabela_precos`, `veiculo_dados` |
| avaliacao | 6 | `avaliacoes_usados`, `fipe_consultas`, `fipe_referencia`, `troca_cotacoes`, `troca_precos`, `troca_regras` |
| assistencia | 3 | `garantias_assistencias`, `orcamentos`, `servicos_reparo` |
| financeiro | 5 | `cobrancas`, `lancamentos_financeiros`, `payment_webhook_eventos`, `taxas_pagamento`, `tenant_payment_config` |
| rastreamento | 4 | `rastreamento_config`, `rastreamento_eventos`, `rastreamento_links`, `rastreamento_visitas` |
| imoveis | 4 | `chaves_imoveis`, `imoveis`, `lead_perfil_busca`, `negocios_imobiliarios` |
| inteligencia | 5 | `assistente_config`, `assistente_uso`, `zapintel_lead_perfil`, `zapintel_midia_retida`, `zapintel_venda_lead` |
| superadmin | 6 | `avisos_plataforma`, `complementos_empresa`, `planos_config`, `segmentos_config`, `stripe_eventos`, `superadmin_logs` |
| fora dos 10 | 2 | `lista_espera`, `pedidos` |


### C.3 Funções sem DDL (28)

| Grupo | Funções |
|---|---|
| Acesso e sessão (RLS) | `get_empresa_id`, `is_super_admin`, `is_empresa_admin`, `filial_atual`, `filiais_visiveis` |
| Superadmin | `set_impersonation`, `encerrar_impersonacao`, `set_super_admin`, `hard_delete_empresa` |
| Lojas (filial) | `filial_gravacao`, `preencher_filial`, `preencher_filial_do_lead`, `propagar_filial_do_lead` |
| Regras de negócio | `enforce_lead_limit`, `numerar_cotacao_troca`, `marcar_cliente_proprietario`, `fundir_clientes`, `refresh_status_atrasados` |
| Conversa e chat | `sincronizar_nao_lidas`, `tg_lead_marcos_conversa`, `incrementar_msgs_nao_lidas` (corpo vazio: `perform 1`), `chat_marcar_lido`, `chat_nao_lidas_por_conversa` |
| Infra | `handle_new_user`, `prevent_privilege_escalation`, `rate_limit_bump`, `update_updated_at`, `set_planos_config_updated_at` |

### C.4 Triggers sem DDL (47)

| Função chamada | Nº | Triggers (tabela) |
|---|---:|---|
| `preencher_filial` | 27 | `avaliacoes_usados_preencher_filial`, `chamadas_…`, `cobrancas_…`, `comissoes_…`, `contratos_venda_…`, `fichas_financiamento_…`, `garantias_assistencias_…`, `inventario_unidades_…`, `lancamentos_financeiros_…`, `lead_atribuicoes_…`, `leads_…`, `metas_comissoes_…`, `metas_…`, `movimentacao_estoque_…`, `orcamentos_…`, `pedidos_compra_…`, `pedidos_…`, `pre_vendas_…`, `propostas_…`, `servicos_reparo_…`, `tarefas_…`, `troca_cotacoes_…`, `vendas_alertas_…`, `vendas_pagamentos_…`, `vendas_…`, `vendas_termos_…`, `visitas_preencher_filial` |
| `preencher_filial_do_lead` | 5 | `filial_do_lead` em `clientes`, `lead_mensagens`, `lead_perfil_busca`, `followups_gerados`, `cadencia_inscricoes` |
| `propagar_filial_do_lead` | 1 | `filial_desce_para_os_filhos` (`leads`) |
| `update_updated_at` | 5 | `trg_empresas_updated_at`, `trg_imoveis_updated_at`, `trg_lancamentos_updated`, `trg_perfil_busca_updated_at`, `trg_visitas_updated_at` |
| `sincronizar_nao_lidas` | 2 | `nao_lidas_sincroniza`, `nao_lidas_sincroniza_upd` (`lead_mensagens`) |
| `enforce_lead_limit` | 1 | `trg_enforce_lead_limit` (`leads`) |
| `numerar_cotacao_troca` | 1 | `troca_cotacoes_numerar` (`troca_cotacoes`) |
| `marcar_cliente_proprietario` | 1 | `trg_imoveis_marca_proprietario` (`imoveis`) |
| `tg_lead_marcos_conversa` | 1 | `lead_marcos_conversa` (`lead_mensagens`) |
| `prevent_privilege_escalation` | 1 | `trg_prevent_privilege_escalation` (`usuarios`) |
| `set_planos_config_updated_at` | 1 | `trg_planos_config_updated_at` (`planos_config`) |
| `handle_new_user` | 1 | `on_auth_user_created` (`auth.users`) |

### C.5 Views sem DDL (4)

| View |
|---|
| `v_empresas_plano` |
| `v_inventario_veiculo` |
| `v_leads_nao_lidas` |
| `v_orfaos_chat_midia` |

### C.6 Divergências de nome entre código, repo e produção

| Objeto | Situação |
|---|---|
| `proprietarios` | citado como tabela em `app/api/superadmin/empresas/[id]/exportar/route.ts:10`; não existe em produção |
| `canais_conectados`, `contatos`, `contato_identidades`, `conversas`, `mensagens`, `negocios` | `create table` em `docs/ARQUITETURA-OMNICHANNEL.md:87-188` (esboço de desenho, não DDL de produção); só `canais_conectados` existe em produção |
| `backup.funcoes_zapintel_pre_*`, `backup.permissoes_funcoes_pre_*`, `backup.politicas_pre_*`, `backup.rls_politicas_*` | DDL em `supabase/pendentes/00_instantaneo.sql` e `03_rls_uma_vez_por_consulta.sql`, schema `backup` (fora de `public`) |
| `supabase/pendentes/03_rls_uma_vez_por_consulta.sql`, `04_funcoes_fora_da_api.sql` | pendentes, não aplicadas (`supabase/pendentes/APLICADAS.md`) |
| Limite de leads | produção: trigger por `planos_config.limite_leads`, todos os leads; navegador: `empresas.limite_leads`, só ativos (B.1 #26 × B.3 P1) |

---

## Contagem

| Parte | Número |
|---|---|
| A — interfaces | **25** (23 SQL + 2 TS), atendendo 240 pontos em 35 pares |
| B — regras por destino (62 da lista 5) | **(1) SQL: 14** · **(2) TS: 35** · **(3) configuração: 13** |
| B — dependem de segmento | 7 (#11, 14, 53, 54, 55, 56, 57) |
| B — só no banco de produção | 15 (P1–P15), todas destino (1) |
| C — objetos de produção sem DDL no repo | **173** (94 tabelas, 28 funções, 47 triggers, 4 views, 0 jobs) |
