# Arquitetura Omnichannel — CRM SaaS

> Documento de projeto para transformar o módulo de Leads/Mensagens num CRM
> omnichannel **oficial, multi-tenant e de nível de produção**.
> Status: **proposta para revisão**. Nada aqui foi aplicado ao banco ainda.
>
> A **Fase 0** (entrega real de mensagens pelo chat) já foi implementada e está
> em produção. As Fases 1–5 abaixo são a reestruturação propriamente dita.

---

## 1. Objetivo

Sair de um "disparador com caixa de entrada single-tenant" para um CRM
omnichannel comparável a Kommo/Intercom:

- **Oficial**: WhatsApp Cloud API, Instagram Messaging, Messenger Platform.
- **Multi-tenant de verdade**: cada empresa conecta as próprias contas; o
  webhook roteia sozinho para o tenant certo.
- **Contato unificado**: a mesma pessoa em WhatsApp + Instagram + Messenger é
  **um** contato, com uma timeline só.
- **Confiável**: idempotência, status de entrega, mídia, janela de 24h,
  tokens criptografados e webhook assinado.

---

## 2. Estado atual (resumo do diagnóstico)

**Funciona hoje (não jogar fora):**
- Edge Function `webhook-leads` recebe WhatsApp/Instagram/Messenger e grava
  em `leads` / `lead_mensagens`. Saudável (188 msgs/7 dias).
- RLS multi-tenant (`tenant_isolamento`) em todas as tabelas.
- Chat com realtime e kanban no front.
- Backend de envio (`?action=send` / `?action=send_meta`) correto.

**Limitações estruturais (o que esta arquitetura resolve):**

| # | Problema | Resolvido em |
|---|---|---|
| 1 | `leads` mistura contato + conversa + oportunidade | Fase 2 / 3 |
| 2 | Identidade de canal única por lead (sem contato unificado) | Fase 2 |
| 3 | Tokens em `configuracoes_sistema` como JSON solto e **sem criptografia** | Fase 1 |
| 4 | Multi-tenant implícito; webhook não roteia por página/número | Fase 1 |
| 5 | Dois caminhos de envio (Next API + Edge Function) | Fase 4 |
| 6 | `lead_mensagens` sem `external_id` (idempotência) nem `status` | Fase 4 |
| 7 | Sem mídia, sem janela de 24h, sem templates | Fase 4 |
| 8 | Webhook não valida `X-Hub-Signature-256` | Fase 1 |
| 9 | WhatsApp via Evolution (não-oficial, risco de ban) | Fase 5 |

---

## 3. Princípios de design

1. **Migração, não rewrite.** Há dados vivos (106 contatos, 524 msgs, webhook
   recebendo hoje). Cada fase é uma migração reversível; o sistema nunca sai do ar.
2. **Multi-tenant explícito.** `empresa_id` em toda tabela, RLS `tenant_isolamento`,
   e roteamento de webhook por identificador externo do canal — nunca por trigger
   escondido.
3. **Segredos nunca em texto puro.** Tokens criptografados com AES-256-GCM,
   reaproveitando o padrão de `lib/payments/crypto.ts`.
4. **Idempotência por design.** Toda mensagem externa carrega o ID da Meta;
   `UNIQUE(empresa_id, external_id)` impede duplicatas em retries de webhook.
5. **Um único serviço de canais.** Envio e recebimento passam a ter uma só
   implementação lógica (`lib/channels`), sem duplicação entre Next API e Edge.
6. **Conceitos separados.** Contato ≠ Conversa ≠ Negócio. É a base de um CRM sério.

---

## 4. Modelo de dados alvo

Visão geral:

```
empresas ─┬─ canais_conectados        (1 por canal conectado; token cripto; external_id roteia webhook)
          ├─ contatos                 (a PESSOA, unificada)
          │     └─ contato_identidades (IG/Messenger/WhatsApp do mesmo contato)
          ├─ conversas                 (1 thread por contato × canal; janela 24h; status; atribuição)
          │     └─ mensagens           (+ external_id, status, tipo, mídia)
          └─ negocios                  (a OPORTUNIDADE; o kanban vive aqui; N por contato)
```

### 4.1 `canais_conectados`
Substitui as chaves soltas de `configuracoes_sistema` (`instagram`, `messenger`,
`whatsapp_*`).

```sql
create table canais_conectados (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references empresas(id) on delete cascade,
  tipo            text   not null check (tipo in ('whatsapp_cloud','whatsapp_evolution','instagram','messenger')),
  -- Identificador que CHEGA no webhook e roteia para o tenant certo:
  -- whatsapp_cloud -> phone_number_id ; instagram -> ig account id ; messenger -> page_id
  external_id     text   not null,
  nome_exibicao   text,
  -- Token CRIPTOGRAFADO (AES-256-GCM). Nunca em texto puro.
  access_token_enc text  not null,
  token_expira_em timestamptz,
  waba_id         text,                       -- só whatsapp_cloud
  status          text   not null default 'ativo' check (status in ('ativo','expirado','erro','desativado')),
  ultimo_erro     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tipo, external_id)                  -- roteamento determinístico do webhook
);
create index on canais_conectados (empresa_id);
```

### 4.2 `contatos` + `contato_identidades`

```sql
create table contatos (
  id          bigint generated always as identity primary key,
  empresa_id  bigint not null references empresas(id) on delete cascade,
  nome        text,
  foto_url    text,
  email       text,
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on contatos (empresa_id);

create table contato_identidades (
  id          bigint generated always as identity primary key,
  empresa_id  bigint not null references empresas(id) on delete cascade,
  contato_id  bigint not null references contatos(id) on delete cascade,
  canal_tipo  text   not null check (canal_tipo in ('whatsapp','instagram','messenger')),
  -- PSID (Messenger), IGSID (Instagram) ou telefone E.164 (WhatsApp)
  identidade  text   not null,
  display     text,
  unique (empresa_id, canal_tipo, identidade) -- a "chave" que unifica a pessoa
);
create index on contato_identidades (contato_id);
```

Unificação: a mesma pessoa em dois canais = um `contato` com duas
`contato_identidades`. (O "merge" pode ser manual no início; heurísticas
automáticas — mesmo telefone, mesmo @ — entram depois.)

### 4.3 `conversas`

```sql
create table conversas (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references empresas(id) on delete cascade,
  contato_id      bigint not null references contatos(id) on delete cascade,
  canal_id        bigint not null references canais_conectados(id),
  status          text   not null default 'aberta' check (status in ('aberta','pendente','fechada')),
  atribuido_a     uuid   references usuarios(id),
  nao_lidas       int    not null default 0,
  -- Janela de 24h da Meta: até quando dá para mandar texto livre (fora disso, só template)
  janela_expira_em timestamptz,
  ultima_mensagem_em timestamptz,
  created_at      timestamptz not null default now(),
  unique (contato_id, canal_id)
);
create index on conversas (empresa_id, ultima_mensagem_em desc);
```

### 4.4 `mensagens`
Sucessora enriquecida de `lead_mensagens`.

```sql
create table mensagens (
  id           bigint generated always as identity primary key,
  empresa_id   bigint not null references empresas(id) on delete cascade,
  conversa_id  bigint not null references conversas(id) on delete cascade,
  direcao      text   not null check (direcao in ('recebida','enviada')),
  tipo         text   not null default 'texto' check (tipo in ('texto','imagem','audio','video','documento','sticker','localizacao','template')),
  conteudo     text,
  media_url    text,                         -- Supabase Storage
  -- ID da mensagem na Meta — idempotência + casamento de status
  external_id  text,
  status       text   not null default 'enviada' check (status in ('enviando','enviada','entregue','lida','falhou')),
  erro         text,
  autor_id     uuid   references usuarios(id), -- quem enviou (null = cliente)
  created_at   timestamptz not null default now(),
  unique (empresa_id, external_id)           -- bloqueia duplicata em retry de webhook
);
create index on mensagens (conversa_id, created_at);
```

### 4.5 `negocios` (pipeline)
O kanban sai de `leads` e passa a ser oportunidade de venda — um contato pode
ter vários negócios ao longo do tempo.

```sql
create table negocios (
  id             bigint generated always as identity primary key,
  empresa_id     bigint not null references empresas(id) on delete cascade,
  contato_id     bigint not null references contatos(id) on delete cascade,
  titulo         text,
  etapa          text   not null default 'novo',   -- ex-kanban_status
  ordem          int,                              -- ex-kanban_ordem
  valor_estimado numeric,
  responsavel_id uuid   references usuarios(id),
  produto_interessado text,
  status         text   not null default 'aberto' check (status in ('aberto','ganho','perdido')),
  motivo_perda   text,
  created_at     timestamptz not null default now(),
  fechado_em     timestamptz
);
create index on negocios (empresa_id, etapa, ordem);
```

### 4.6 RLS
Toda tabela nova herda o padrão existente:

```sql
alter table <tabela> enable row level security;
create policy tenant_isolamento on <tabela>
  using (empresa_id = get_empresa_id())
  with check (empresa_id = get_empresa_id());
```
`canais_conectados.access_token_enc` nunca é lido pelo cliente — só pelo
servidor (Edge Function / API com service role) na hora de enviar/decifrar.

---

## 5. Mapeamento atual → alvo

| Hoje (`leads`) | Vira |
|---|---|
| `nome`, `instagram`, `telefone` | `contatos` + `contato_identidades` |
| `origem`, `origem_id` | `contato_identidades.canal_tipo` + `identidade` |
| `msgs_nao_lidas`, `ultima_mensagem_at`, `responsavel_id` | `conversas` |
| `kanban_status`, `kanban_ordem`, `valor_estimado`, `produto_interessado`, `convertido_em` | `negocios` |
| `lead_mensagens.*` | `mensagens.*` (+ `external_id`, `status`, `tipo`, `media_url`) |
| `configuracoes_sistema['instagram'|'messenger'|...]` | `canais_conectados` (token criptografado) |

Compat durante a transição: manter `leads`/`lead_mensagens` como **views**
sobre o modelo novo até o front migrar 100%, evitando big-bang.

---

## 6. Roteamento de webhook multi-tenant

Hoje o `upsertLead` grava sem `empresa_id` (depende de mecanismo implícito de
1 tenant). Alvo:

1. Webhook chega → extrair o identificador do destinatário:
   - WhatsApp Cloud: `entry[].changes[].value.metadata.phone_number_id`
   - Messenger: `entry[].id` (page id)
   - Instagram: `entry[].id` (ig account id)
2. `select empresa_id, id from canais_conectados where tipo=? and external_id=?`
3. Toda escrita usa esse `empresa_id`. Sem match → 404/ignora (não cria lixo).

Isso é o que destrava 2+ clientes no mesmo app Meta.

---

## 7. Segurança

- **Assinatura do webhook**: validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo
  cru com o App Secret) antes de processar qualquer POST. Hoje ausente.
- **Tokens criptografados**: `access_token_enc` via AES-256-GCM
  (`lib/payments/crypto.ts`; usar `CHANNEL_ENCRYPTION_KEY` própria ou reusar a
  existente). Decifra só no servidor, na hora do envio.
- **RLS** mantém isolamento por tenant; coluna de token nunca exposta ao client.

---

## 8. Idempotência, status e mídia

- **Idempotência**: gravar `external_id` da Meta; `UNIQUE(empresa_id, external_id)`
  → retries da Meta não duplicam.
- **Status de entrega**: a Meta envia eventos `statuses[]` (sent/delivered/read/
  failed). Mapear para `mensagens.status`. Hoje não há rastreio.
- **Mídia**: baixar o binário da Graph API e salvar no Supabase Storage;
  `mensagens.media_url` aponta para lá. Hoje vira `"[imagem]"`.

---

## 9. Janela de 24h e templates

A Meta só permite texto livre dentro de 24h da última mensagem do cliente.
`conversas.janela_expira_em` rastreia isso. Fora da janela:
- WhatsApp: exige **template aprovado (HSM)**.
- Instagram/Messenger: tags específicas / janela diferente.

O front desabilita o texto livre e oferece template quando a janela fechou
(hoje o envio simplesmente falharia sem explicação).

---

## 10. Consolidação do envio (`lib/channels`)

Unificar os dois caminhos de envio numa só abstração, espelhando o padrão que já
existe em `lib/whatsapp` e `lib/payments`:

```
lib/channels/
  index.ts        -> enviarMensagem({ empresaId, conversaId, texto, midia? })
  types.ts
  meta.ts         -> Instagram + Messenger + WhatsApp Cloud (Graph API)
  evolution.ts    -> WhatsApp não-oficial (legado, removível na Fase 5)
  crypto.ts       -> decifra token do canal
```

A Edge Function continua sendo o **ingestor** público do webhook (precisa ser
sempre-on e sem cold start de framework). O **envio** e a lógica de negócio
migram para a app Next (onde há chaves de cripto, contexto RLS e testes), com a
Edge chamando essa lógica ou compartilhando o módulo.

---

## 11. WhatsApp oficial (Fase 5)

Migrar de Evolution (QR/Baileys, risco de ban) para **WhatsApp Cloud API**:
- `canais_conectados.tipo = 'whatsapp_cloud'` com `phone_number_id` + `waba_id`.
- Recebimento já suportado no webhook (`object = whatsapp_business_account`).
- Manter Evolution como opção de fallback até a Cloud API estar redonda.

---

## 12. Onboarding de clientes — Embedded Signup (futuro)

Para "ser como a Kommo" (cliente conecta a própria conta em 1 clique):
- **Facebook Login for Business** + **Embedded Signup** da Meta.
- O fluxo devolve o token do cliente → grava em `canais_conectados`
  (criptografado) → assina o webhook automaticamente.
- Requer status de **Tech Provider** e a App Review aprovada (a que estamos
  destravando agora).

---

## 13. Plano de migração faseado

> Cada fase: migração SQL reversível + deploy independente + sistema no ar.

- **Fase 0 — Envio real** ✅ *(feito)*
  Chat entrega de verdade via Edge Function. Destrava a App Review da Meta.

- **Fase 1 — Espinha multi-tenant + segurança**
  `canais_conectados` (token criptografado); backfill a partir de
  `configuracoes_sistema`; roteamento do webhook por `external_id`; validação de
  `X-Hub-Signature-256`. Limpar chaves legadas (`meta_instagram`/`meta_messenger`).

- **Fase 2 — Contato unificado + conversas**
  `contatos`, `contato_identidades`, `conversas`; backfill 1 lead → 1 contato +
  1 identidade + 1 conversa. `leads` vira view durante a transição.

- **Fase 3 — Pipeline**
  `negocios` separado da conversa; migrar kanban; UI de Inbox separada da UI de
  Pipeline.

- **Fase 4 — Robustez**
  `mensagens` com `external_id` + `status` + `tipo` + `media_url`; idempotência;
  status de entrega; mídia no Storage; janela de 24h + templates; consolidar
  `lib/channels`.

- **Fase 5 — Oficial e limpeza**
  WhatsApp Cloud API; aposentar Evolution; remover `lead`/`lead_mensagens`
  legados; (opcional) Embedded Signup.

---

## 14. Esboço de backfill (Fase 2)

```sql
-- 1 lead -> 1 contato
insert into contatos (empresa_id, nome, created_at)
select empresa_id, nome, created_at from leads;

-- identidade do canal de origem
insert into contato_identidades (empresa_id, contato_id, canal_tipo, identidade, display)
select l.empresa_id, c.id, l.origem, l.origem_id, coalesce(l.instagram, l.telefone)
from leads l join contatos c on /* casar por chave estável de migração */ ...
where l.origem in ('whatsapp','instagram','messenger') and l.origem_id is not null;

-- conversa + mensagens análogas...
```
(O casamento usa uma coluna temporária `legacy_lead_id` para garantir
rastreabilidade e reversibilidade.)

---

## 15. Definição de pronto (qualidade)

- [ ] Toda escrita carrega `empresa_id` explícito (zero dependência de trigger oculto).
- [ ] Nenhum token em texto puro no banco.
- [ ] Webhook rejeita POST sem assinatura válida.
- [ ] Reenvio de webhook da Meta não duplica mensagem.
- [ ] Status de entrega refletido na UI (enviada/entregue/lida/falhou).
- [ ] Mídia recebida visível no chat.
- [ ] Fora da janela de 24h: UI orienta template, não falha silenciosa.
- [ ] `type-check` + `lint` limpos; migrações reversíveis testadas em branch Supabase.
- [ ] Dois tenants de teste provam isolamento ponta a ponta.
```
