# Módulo Rastreamento (atribuição de anúncio → WhatsApp → venda → CAPI)

Fecha o loop que o Pixel do navegador não fecha: o clique no anúncio leva ao
WhatsApp (que sai do navegador sem passar por servidor da Meta), e este módulo
reencontra a visita no webhook e reporta a conversão de volta pela Conversions API.

## O que foi criado

### Banco (migration `rastreamento_core_tables`, já aplicada no crm-saas)
- `rastreamento_config` — pixel token público + pixel_id Meta + token CAPI cifrado, por empresa
- `rastreamento_links` — links rastreáveis (slug, destino, UTMs)
- `rastreamento_visitas` — pageviews (tracking_id, visitor_code, UTM/fbclid/gclid, fbp/fbc)
- `rastreamento_eventos` — pageview/lead/purchase + status do envio CAPI
- RLS no padrão do projeto: leitura tenant via `get_empresa_id()`, escrita owner/admin, superadmin via `is_super_admin()`. Escrita do pixel/webhook é via service role.

### Código (Next.js)
- `lib/rastreamento/` — types, db (service client), capi (Conversions API), atribuicao (métricas + marcador), pixel (gerador do track.js)
- `app/track.js` — serve o pixel first-party
- `app/i/[codigo]` — link rastreável público (redireciona carimbando o código no wa.me)
- `app/api/rastreamento/lead-origin` · `/purchase` · `/config` · `/links` · `/links/[id]`
- `app/admin/rastreamento` (dono): dashboard, `/links`, `/config`
- `app/superadmin/rastreamento` (plataforma): visão global
- Menu: grupo "Rastreamento" em `admin-shell.tsx` e item em `superadmin-shell.tsx`
- `middleware.ts`: `/track.js`, `/i/`, `/api/rastreamento/` liberados como público

### Edge function (PENDENTE DE DEPLOY)
- `supabase/functions/webhook-leads/index.ts` recebeu a **ponte de atribuição**:
  extrai `[@código]` da mensagem recebida, limpa o marcador do texto e chama
  `reconciliarVisita()` para colar o lead na visita. Edit aditivo e blindado (try/catch).

## Checklist para subir

1. **Env vars** (Vercel → Settings → Environment Variables, escopo Server):
   - `NEXT_PUBLIC_APP_URL` — URL pública do app (usada no snippet do pixel e no `/i/`)
   - `CHANNEL_ENCRYPTION_KEY` — já usada pelos canais; o token CAPI reusa o mesmo cofre
   - `META_GRAPH_VERSION` — já existe (v25.0)
2. **Deploy do webhook** (processa WhatsApp real — revisar antes):
   ```
   supabase functions deploy webhook-leads --no-verify-jwt
   ```
3. **Deploy do app** (Vercel) — commit + push normal.
4. **Configurar por empresa** em `/admin/rastreamento/config`:
   - copiar o snippet do pixel para a LP/loja do cliente, ou usar links `/i/<id>`
   - (opcional) pixel_id + token CAPI para enviar conversões à Meta

## Fluxo end-to-end
1. Anúncio → clique → LP com `track.js` (ou link `/i/<id>`) → grava visita + cookie `ta_tid`
2. Botão wa.me ganha ` [@código]` na mensagem
3. Cliente manda no WhatsApp → webhook-leads cria o lead e `reconciliarVisita` cola a visita
4. Venda na página de obrigado → `TrackerPixel.purchase({...})` → evento + CAPI para a Meta
5. Dashboards em `/admin/rastreamento` (empresa) e `/superadmin/rastreamento` (plataforma)
