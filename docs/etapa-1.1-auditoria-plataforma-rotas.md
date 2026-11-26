# Etapa 1.1c: escritas com chave de serviço e a Auditoria da plataforma (inventário de 26/11/2026)

Gerado por leitura do código da main `c6df8245` (arquivos que usam `createServiceClient()` ou `rastrDb()` e gravam: insert, update, upsert, delete, rpc, storage ou auth.admin). Decisão e desenho: `docs/etapa-1.1-plano.md` §3.4.

## Como a cobertura funciona

- **Um ponto só:** `createServiceClient()` e `rastrDb()` usam o `fetch` de `lib/supabase/usuario-na-escrita.ts`.
  - Nas escritas feitas dentro de uma requisição com sessão **e** com o cookie de impersonação, ele manda o id do usuário, conferido em `auth.getUser()`, no cabeçalho `x-nexus-usuario`.
  - O gatilho `zz_plataforma_auditar` (função `plataforma_auditar_escrita`, migração `20261126000100`) só aceita o cabeçalho vindo de `service_role`. Também só aceita se o id for de um superadmin com impersonação ativa.
  - A linha gravada tem a tabela, o id e os nomes dos campos (D-A1), com origem `gatilho servico`.
- **Não depende de cada rota:** toda rota nova que usar `createServiceClient()` já entra.
  - `npm run check` (`check:servico`) falha se alguém criar cliente com a chave de serviço por fora.
- **Testes:**
  - `teste-auditoria-plataforma-servico.sql`: gatilho, com 9 casos.
  - `tests/usuario-na-escrita.test.ts`: o `fetch`, com 12 casos.
  - `tests/integracao/plataforma-servico-local.test.ts`: rotas reais pelo PostgREST local (`/api/equipe/roleta`, `/api/empresa/fuso`, `/api/empresa`), mais os casos negativos.

## Classificação

| Tipo | Acionável por superadmin dentro de uma empresa? | Coberto |
|---|---|---|
| CRM com sessão | **sim** | sim, automático pelo `fetch`; a última coluna mostra a tabela que continua sem gatilho depois da 0100/0200 |
| Biblioteca (chamada por rotas) | quando a rota que chama é do CRM | sim, pelo mesmo `fetch` |
| Painel superadmin | não: é a plataforma fora da empresa; tem o log próprio `superadmin_logs` | fora do escopo |
| Público (link, token, cadastro), webhook, rotina | não: não há sessão de superadmin na empresa | fora do escopo |

**Tabelas sem gatilho tocadas por rotas do CRM:**
- `empresas`, `diagnostico_canais` e `assistente_config` ganharam o gatilho na `20261126000100`.
- `usuarios` ganhou na `20261126000200`, separada, sem contar a linha do próprio superadmin.
- Ficam de fora:
  - `consulta_fipe_*`: cache global da FIPE, não é dado da empresa;
  - `superadmin_logs`: o próprio log da plataforma.


### biblioteca (chamada por rotas) (12)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `lib/canais/renovacao.ts` | canais.update | — | — |
| `lib/empresa-segredos.ts` | empresa_segredos.upsert | — | — |
| `lib/fipe.ts` | consulta_fipe_referencia.update, consulta_fipe_consultas.upsert | — | consulta_fipe_referencia, consulta_fipe_consultas |
| `lib/modulos-instalacao.ts` | empresa_modulos.update, modulo_pedidos.update | — | — |
| `lib/push.ts` | push_subscriptions.delete | — | — |
| `lib/roleta.ts` | configuracoes_sistema.upsert | — | — |
| `lib/sem-dono.ts` | — | core_sem_dono_aplicar | — |
| `lib/stripe.ts` | empresas.update | — | — |
| `lib/superadmin-preview.ts` | empresas.update | set_impersonation | — |
| `lib/superadmin.ts` | superadmin_logs.insert | — | superadmin_logs |
| `lib/whatsapp/index.ts` | — | filial_gravacao, mensagem_registrar | — |
| `lib/zapintel/ia.ts` | assistente_uso.insert | — | — |

### CRM com sessão (48)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `app/(dashboard)/pos-venda/page.tsx` | — | config_valor_emp | — |
| `app/api/admin/filiais/route.ts` | filiais.insert, filiais.update, empresa_usuarios.update | — | — |
| `app/api/admin/importar-imoveis/route.ts` | configuracoes_sistema.upsert, imoveis_imoveis.insert | — | — |
| `app/api/aparencia/route.ts` | empresa_branding.upsert | — | — |
| `app/api/assistente/meu-dia/route.ts` | assistente_uso.insert | — | — |
| `app/api/assistente/route.ts` | assistente_uso.insert, assistente_uso.update, assistente_config.update | — | — |
| `app/api/automatize/route.ts` | configuracoes_sistema.upsert, automacoes.insert | — | — |
| `app/api/canais/[id]/route.ts` | canais.delete, canais.update | — | — |
| `app/api/canais/diagnostico/route.ts` | diagnostico_canais.insert | — | — |
| `app/api/canais/instagram/retorno/route.ts` | canais.upsert, canais.update | filial_gravacao | — |
| `app/api/canais/meta/route.ts` | canais.upsert, canais.update | filial_atual | — |
| `app/api/canais/whatsapp/route.ts` | canais.upsert, canais.update | filial_atual | — |
| `app/api/chat/upload/route.ts` | — (storage) | — | — |
| `app/api/clientes/route.ts` | — | filial_gravacao | — |
| `app/api/empresa/fuso/route.ts` | configuracoes_sistema.delete, configuracoes_sistema.upsert | — | — |
| `app/api/empresa/route.ts` | empresas.update, empresa_branding.upsert | — | — |
| `app/api/equipe/atualizar-usuario/route.ts` | usuarios.update | — | — |
| `app/api/equipe/criar-usuario/route.ts` | empresa_usuarios.update, usuarios.update, empresa_usuarios.insert (auth.admin) | — | — |
| `app/api/equipe/remover-usuario/route.ts` | empresa_usuarios.update, estoque_unidades.update | — | — |
| `app/api/equipe/roleta/route.ts` | empresa_usuarios.update | — | — |
| `app/api/estoque/transferir/route.ts` | estoque_unidades.update, estoque_movimentacoes.insert | — | — |
| `app/api/filial/selecionar/route.ts` | usuarios.update | — | — |
| `app/api/funil/route.ts` | funil_etapas.update, funil_etapas.insert, negocios.update, funil_etapas.delete | — | — |
| `app/api/funis/route.ts` | funis.insert, funil_etapas.insert, funis.update, funis.delete | — | — |
| `app/api/imob/comissao-config/route.ts` | configuracoes_sistema.upsert | — | — |
| `app/api/imob/negocios/route.ts` | imoveis_negocios.insert, imoveis_imoveis.update, imoveis_negocios.update | — | — |
| `app/api/importacao/route.ts` | contatos.insert, negocios.insert, contatos.update, etiquetas.insert | filial_gravacao | — |
| `app/api/leads/atribuir/route.ts` | — | negocio_atribuir | — |
| `app/api/leads/etiquetas/aplicar/route.ts` | — | etiquetas_aplicar | — |
| `app/api/leads/liberar-lote/route.ts` | — | core_liberar_lote_esteira | — |
| `app/api/leads/mover/route.ts` | contatos.update, negocios.update | core_venda_categorias, config_valor, core_venda_campos, reabrir_negocio | — |
| `app/api/leads/route.ts` | — | filial_gravacao | — |
| `app/api/metas/route.ts` | metas_comissoes.insert | — | — |
| `app/api/modelos/[id]/route.ts` | modelos_mensagem.delete | — | — |
| `app/api/modulos/pedido/route.ts` | modulo_pedidos.insert | — | — |
| `app/api/permissoes/route.ts` | empresas.update | — | — |
| `app/api/pos-venda/chamados/route.ts` | — | posvenda_chamado_abrir, posvenda_chamado_mover | — |
| `app/api/pos-venda/config/route.ts` | posvenda_cadencias.update, posvenda_cadencia_passos.update, posvenda_categorias_venda.update, campos_personalizados.update, posvenda_chamado_categorias.update, posvenda_chamado_sla.insert | config_valor_emp, config_salvar | — |
| `app/api/pos-venda/nps/route.ts` | — | posvenda_nps_registrar | — |
| `app/api/pos-venda/registrar/route.ts` | — | posvenda_nps_registrar, posvenda_registrar | — |
| `app/api/pos-venda/uso/route.ts` | — | posvenda_uso_registrar | — |
| `app/api/publicos/route.ts` | publicos.insert, publicos.update, publicos.delete | transmissao_origens, filiais_visiveis, publicos_previa | — |
| `app/api/rastreamento/config/route.ts` | rastreamento_config.upsert | — | — |
| `app/api/rastreamento/links/[id]/route.ts` | rastreamento_links.update, rastreamento_links.delete | — | — |
| `app/api/reservas/route.ts` | estoque_unidades.update, negocios.update | — | — |
| `app/api/scoring/route.ts` | configuracoes_sistema.upsert | — | — |
| `app/api/transmissao/route.ts` | transmissoes.insert, transmissoes.update, transmissao_envios.update, transmissoes.delete, configuracoes_sistema.upsert | transmissao_numeros, transmissao_origens, filiais_visiveis, transmissao_previa, transmissao_montar | — |
| `app/zapintel/api/perfil/pendentes/route.ts` | — | zapintel_analises_pendentes | — |

### painel superadmin (fora da empresa) (10)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `app/api/superadmin/assistente/route.ts` | assistente_config.upsert | — | — |
| `app/api/superadmin/avisos/route.ts` | avisos_plataforma.insert, avisos_plataforma.update, avisos_plataforma.delete | — | avisos_plataforma |
| `app/api/superadmin/empresas/[id]/addons/route.ts` | empresa_modulos.insert | — | — |
| `app/api/superadmin/empresas/[id]/excluir/route.ts` | usuarios.delete (storage, auth.admin) | hard_delete_empresa | — |
| `app/api/superadmin/empresas/[id]/route.ts` | empresas.update | — | — |
| `app/api/superadmin/modulos/pedidos/[id]/route.ts` | modulo_pedidos.update | — | — |
| `app/api/superadmin/planos/route.ts` | planos_config.update | — | planos_config |
| `app/api/superadmin/precos/route.ts` | precos_adicionais.upsert | — | precos_adicionais |
| `app/api/superadmin/presets/route.ts` | presets_onboarding.upsert | — | presets_onboarding |
| `app/superadmin/empresas/[id]/page.tsx` | — | acompanhamento_empresa | — |

### público (link/token/cadastro) (9)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `app/api/agendar/[slug]/route.ts` | agenda_visitas.insert | — | — |
| `app/api/menu/[slug]/pedido/route.ts` | cardapio_pedidos.insert | — | — |
| `app/api/orcamento/[token]/route.ts` | orcamentos_orcamentos.update, assistencia_garantias.insert, estoque_unidades.insert, vendas_vendas.insert, vendas_pagamentos.insert, financeiro_lancamentos.insert, estoque_unidades.update | — | — |
| `app/api/orcamentos/route.ts` | orcamentos_orcamentos.update, orcamentos_orcamentos.insert, orcamentos_orcamentos.delete | — | — |
| `app/api/os/[token]/route.ts` | assistencia_garantias.update, tarefas.insert | — | — |
| `app/api/rastreamento/lead-origin/route.ts` | rastreamento_visitas.insert, rastreamento_eventos.insert | — | — |
| `app/api/rastreamento/purchase/route.ts` | rastreamento_eventos.insert, rastreamento_eventos.update | — | — |
| `app/api/register/route.ts` | empresas.insert, empresa_branding.insert, filiais.delete, usuarios.upsert, filiais.insert, empresa_usuarios.insert (auth.admin) | — | — |
| `app/i/[codigo]/route.ts` | rastreamento_visitas.insert, rastreamento_visitas.update | — | — |

### rotina (cron/edge interna) (1)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `app/api/cron/[job]/route.ts` | empresas.update, stripe_eventos.delete | — | — |

### webhook externo (2)

| Arquivo | Grava (tabela.operação) | RPC | Tabela sem gatilho de plataforma |
|---|---|---|---|
| `app/api/payments/webhook/[provider]/route.ts` | financeiro_webhook_eventos.insert, financeiro_lancamentos.insert | — | financeiro_webhook_eventos |
| `app/api/stripe/webhook/route.ts` | empresas.update | — | — |

