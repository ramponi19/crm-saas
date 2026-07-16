// ⚠️ Snapshot versionado da Edge Function `webhook-leads` (deploy real no Supabase,
// projeto guiuzbcqkvelqcuogxtd, v26). NÃO é buildada pelo Next — é o código-fonte
// de referência da função que recebe/envia mensagens Meta (WhatsApp/IG/Messenger).
// Para alterar em produção é preciso `supabase functions deploy webhook-leads`.
//
// Pontos conhecidos a endurecer (ver auditoria QA / docs/ARQUITETURA-OMNICHANNEL.md):
//   - EMPRESA_ID fixo (single-tenant); roteamento multi-tenant por external_id.
//   - action=send / send_meta sem validação de auth (verify_jwt:false + CORS *).
//   - webhook POST sem validação de assinatura (X-Hub-Signature-256).
//   - tokens lidos em texto puro de configuracoes_sistema (criptografia em repouso
//     exigiria decripto aqui também).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VERIFY_TOKEN = Deno.env.get("WEBHOOK_VERIFY_TOKEN") ?? "jmstore2024";
const EMPRESA_ID = 1;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response("Token invalido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400, headers: corsHeaders }); }

  const action = url.searchParams.get("action");
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Envio WhatsApp pelo CRM — OFICIAL (Cloud API) se ativo; senao Evolution.
  // Midia: midiaUrl (URL publica no bucket chat-midia) + tipoMidia image|video|audio.
  if (action === "send") {
    try {
      const { number, text, leadId, midiaUrl, tipoMidia } = body as { number: string; text?: string; leadId?: string; midiaUrl?: string; tipoMidia?: "image" | "video" | "audio" };
      if (!number || (!text && !midiaUrl)) return json({ error: "Parametros obrigatorios: number e text ou midiaUrl" }, 400);
      const comMidia = !!(midiaUrl && tipoMidia);
      const tipoDb = comMidia ? TIPO_DB[tipoMidia!] : "texto";
      const conteudo = text || (comMidia ? `[${tipoDb}]` : "");
      const numero = number.replace(/\D/g, "");
      const numeroFinal = numero.startsWith("55") ? numero : "55" + numero;
      const { data: offRow } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_official").single();
      const off = offRow?.valor as Record<string, string> | undefined;
      if (off?.ativo && off?.phone_number_id && off?.access_token) {
        const apiVer = off.api_version || "v19.0";
        const apiUrl = (off.api_url || "https://graph.facebook.com").replace(/\/$/, "");
        // Cloud API: audio nao aceita caption; imagem/video aceitam.
        const payload = comMidia
          ? { messaging_product: "whatsapp", recipient_type: "individual", to: numeroFinal, type: tipoMidia, [tipoMidia!]: tipoMidia === "audio" ? { link: midiaUrl } : (text ? { link: midiaUrl, caption: text } : { link: midiaUrl }) }
          : { messaging_product: "whatsapp", recipient_type: "individual", to: numeroFinal, type: "text", text: { body: text } };
        const r = await fetch(`${apiUrl}/${apiVer}/${off.phone_number_id}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${off.access_token}` },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) { console.error("WA oficial error:", JSON.stringify(data)); return json({ error: data?.error?.message || "Erro ao enviar pelo WhatsApp oficial" }, r.status); }
        if (leadId) await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo, origem: "whatsapp", lida: true, tipo: tipoDb, midia_url: midiaUrl ?? null, external_id: (data?.messages?.[0]?.id as string) ?? null }]);
        return json({ success: true, provider: "oficial", data });
      }
      const { data: config } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_evolution").single();
      const ev = config?.valor as Record<string, string> | undefined;
      if (!ev) return json({ error: "Nenhum provedor de WhatsApp configurado." }, 500);
      const { instance, api_key, api_url, ativo } = ev;
      if (!ativo || !instance || !api_key || !api_url) return json({ error: "WhatsApp oficial inativo e Evolution nao esta ativa/completa." }, 500);
      const evBase = api_url.replace(/\/$/, "");
      // Evolution: audio via sendWhatsAppAudio (vira PTT/nota de voz); imagem/video via sendMedia.
      const evReq = comMidia
        ? (tipoMidia === "audio"
            ? { url: `${evBase}/message/sendWhatsAppAudio/${instance}`, body: { number: numeroFinal, audio: midiaUrl } }
            : { url: `${evBase}/message/sendMedia/${instance}`, body: { number: numeroFinal, mediatype: tipoMidia, media: midiaUrl, caption: text || undefined } })
        : { url: `${evBase}/message/sendText/${instance}`, body: { number: numeroFinal, text } };
      const r = await fetch(evReq.url, {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": api_key }, body: JSON.stringify(evReq.body),
      });
      const data = await r.json();
      if (!r.ok) { console.error("Evolution API error:", data); return json({ error: data?.message || "Erro ao enviar mensagem" }, r.status); }
      if (leadId) await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo, origem: "whatsapp", lida: true, tipo: tipoDb, midia_url: midiaUrl ?? null }]);
      return json({ success: true, provider: "evolution", data });
    } catch (e) { console.error("send error:", e); return json({ error: (e as Error).message }, 500); }
  }

  if (action === "send_meta") {
    try {
      const { leadId, texto, canal, midiaUrl, tipoMidia } = body as { leadId: string; texto?: string; canal: "instagram" | "messenger"; midiaUrl?: string; tipoMidia?: "image" | "video" | "audio" };
      if (!leadId || !canal || (!texto && !midiaUrl)) return json({ error: "Parametros obrigatorios: leadId, canal e texto ou midiaUrl" }, 400);
      const { data: lead, error: leadErr } = await supabase.from("leads").select("origem_id").eq("id", leadId).single();
      if (leadErr || !lead?.origem_id) return json({ error: "Lead nao encontrado ou sem origem_id" }, 404);
      const chave = canal === "instagram" ? "instagram" : "messenger";
      const { data: cfg } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", chave).single();
      if (!cfg?.valor) return json({ error: `Integracao ${canal} nao configurada.` }, 500);
      const pageToken = cfg.valor.token || cfg.valor.page_token || "";
      const pageId = cfg.valor.page_id || "";
      if (!pageToken || !pageId) return json({ error: `Token ou page_id do ${canal} nao configurado.` }, 500);
      const comMidia = !!(midiaUrl && tipoMidia);
      const tipoDb = comMidia ? TIPO_DB[tipoMidia!] : "texto";
      // Send API nao aceita text + attachment na mesma mensagem: com midia vai so o anexo.
      const message = comMidia
        ? { attachment: { type: tipoMidia, payload: { url: midiaUrl, is_reusable: true } } }
        : { text: texto };
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${pageToken}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: lead.origem_id }, message, messaging_type: "RESPONSE" }),
      });
      const data = await r.json();
      if (!r.ok) { console.error(`${canal} Graph API error:`, JSON.stringify(data)); return json({ error: data?.error?.message || `Erro ao enviar pelo ${canal}` }, r.status); }
      // external_id = message_id da Graph: deduplica contra o echo que a Meta
      // devolve deste mesmo envio (indice unico lead_mensagens_external_id_uidx).
      await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo: texto || `[${tipoDb}]`, origem: canal, lida: true, tipo: tipoDb, midia_url: midiaUrl ?? null, external_id: (data?.message_id as string) ?? null }]);
      return json({ success: true });
    } catch (e) { console.error("send_meta error:", e); return json({ error: (e as Error).message }, 500); }
  }

  const object = body?.object as string | undefined;

  if (!object) {
    const event = body?.event as string | undefined;
    if (event === "MESSAGES_UPSERT" || event === "messages.upsert") {
      const data = body?.data as Record<string, unknown> | undefined;
      if (!data) return new Response("ok", { status: 200, headers: corsHeaders });
      const key = data.key as Record<string, unknown> | undefined;
      if (key?.fromMe) return new Response("ok", { status: 200, headers: corsHeaders });
      const remoteJid = key?.remoteJid as string | undefined;
      if (!remoteJid || remoteJid.endsWith("@g.us")) return new Response("ok", { status: 200, headers: corsHeaders });
      const mid = key?.id as string | undefined;
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "");
      const message = data.message as Record<string, unknown> | undefined;
      const messageType = data.messageType as string | undefined;
      let texto = "[midia]";
      if (messageType === "conversation") texto = (message?.conversation as string) ?? "[midia]";
      else if (messageType === "extendedTextMessage") texto = ((message?.extendedTextMessage as Record<string, unknown>)?.text as string) ?? "[midia]";
      else if (messageType === "imageMessage") texto = ((message?.imageMessage as Record<string, unknown>)?.caption as string) || "[imagem]";
      await upsertLead({ nome: (data.pushName as string) ?? null, telefone: phone, instagramUser: null, origem: "whatsapp", origemId: phone, texto, externalId: mid ?? null });
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (object === "whatsapp_business_account") {
    const entry = (body?.entry as Record<string, unknown>[])?.[0];
    const changes = (entry?.changes as Record<string, unknown>[])?.[0];
    const value = changes?.value as Record<string, unknown> | undefined;
    const messages = value?.messages as Record<string, unknown>[] | undefined;
    const contacts = value?.contacts as Record<string, unknown>[] | undefined;
    if (messages?.length) {
      const msg = messages[0];
      const mid = msg.id as string | undefined;
      const phone = msg.from as string;
      const text = msg.text as Record<string, unknown> | undefined;
      const image = msg.image as Record<string, unknown> | undefined;
      let texto = (text?.body as string) || (image?.caption as string) || "[midia]";
      let tipo = "texto"; let midiaUrl: string | null = null;
      // Midia (Cloud API): o payload traz so o media id; troca por URL autenticada e persiste no Storage.
      const tipoWa = msg.type as string | undefined;
      if (tipoWa === "image" || tipoWa === "video" || tipoWa === "audio") {
        const media = msg[tipoWa] as Record<string, unknown> | undefined;
        const salvo = await salvarMidiaWhatsApp(media?.id as string | undefined);
        if (salvo) {
          tipo = TIPO_DB[tipoWa]; midiaUrl = salvo;
          texto = (media?.caption as string) || `[${tipo}]`;
        }
      }
      const nome = (contacts?.[0]?.profile as Record<string, unknown>)?.name as string ?? null;
      await upsertLead({ nome, telefone: phone, instagramUser: null, origem: "whatsapp", origemId: phone, texto, externalId: mid ?? null, tipo, midiaUrl });
    }
  }
  else if (object === "page") {
    const fbToken = await getChannelToken("messenger");
    for (const entry of ((body?.entry as Record<string, unknown>[]) ?? [])) {
      for (const msg of ((entry?.messaging as Record<string, unknown>[]) ?? [])) {
        const psid = (msg.sender as Record<string, unknown>)?.id as string | undefined;
        const message = msg.message as Record<string, unknown> | undefined;
        const mid = message?.mid as string | undefined;
        const { tipo, midiaUrl, texto } = await extrairMidiaMeta(message);
        if (message?.is_echo) {
          // Echo = mensagem enviada pela Pagina (inbox/app/outra ferramenta OU o
          // proprio CRM — o dedup por external_id ignora a segunda copia).
          // No echo o cliente e o recipient. So anexa a lead existente; nunca cria.
          await registrarEcho((msg.recipient as Record<string, unknown>)?.id as string | undefined, mid, texto, "messenger", tipo, midiaUrl);
          continue;
        }
        if (psid) {
          let nome: string | null = null;
          if (fbToken) { const p = await fetchProfile(psid, fbToken, "name,first_name"); nome = p?.name || p?.first_name || null; }
          await upsertLead({ nome, telefone: null, instagramUser: null, origem: "messenger", origemId: psid, texto, externalId: mid ?? null, tipo, midiaUrl });
        }
      }
    }
  }
  else if (object === "instagram") {
    const igToken = await getChannelToken("instagram");
    for (const msg of (((body?.entry as Record<string, unknown>[])?.[0]?.messaging as Record<string, unknown>[]) ?? [])) {
      const senderId = (msg.sender as Record<string, unknown>)?.id as string | undefined;
      const message = msg.message as Record<string, unknown> | undefined;
      const mid = message?.mid as string | undefined;
      const { tipo, midiaUrl, texto } = await extrairMidiaMeta(message);
      if (message?.is_echo) {
        await registrarEcho((msg.recipient as Record<string, unknown>)?.id as string | undefined, mid, texto, "instagram", tipo, midiaUrl);
        continue;
      }
      if (senderId) {
        let nome: string | null = null, username: string | null = null;
        if (igToken) { const p = await fetchProfile(senderId, igToken, "name,username"); nome = p?.name || p?.username || null; username = p?.username || null; }
        await upsertLead({ nome, telefone: null, instagramUser: username, origem: "instagram", origemId: senderId, texto, externalId: mid ?? null, tipo, midiaUrl });
      }
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});

// ── Mídia ─────────────────────────────────────────────────────────────────
// Mapeia o tipo da API Meta → tipo persistido em lead_mensagens.tipo.
const TIPO_DB: Record<string, string> = { image: "imagem", video: "video", audio: "audio" };
const MIDIA_MAX_BYTES = 20 * 1024 * 1024; // 20MB — acima disso mantem so o placeholder de texto
const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm", "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav",
};

// Baixa a midia (URL do CDN da Meta expira!) e persiste no bucket publico
// chat-midia. Retorna a URL publica ou null — null = comportamento antigo
// (placeholder de texto), nunca erro.
async function salvarMidia(url: string, bearer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
    if (!res.ok) { console.error("midia download error:", res.status); return null; }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MIDIA_MAX_BYTES) { console.log("midia acima do limite, mantendo placeholder:", buf.byteLength); return null; }
    const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    const ext = EXT_POR_MIME[ct] ?? "bin";
    const path = `${EMPRESA_ID}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("chat-midia").upload(path, buf, { contentType: ct });
    if (error) { console.error("midia upload error:", error.message); return null; }
    return supabase.storage.from("chat-midia").getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error("salvarMidia error:", e); return null; }
}

// Cloud API do WhatsApp: o webhook traz so o media id; GET /{id} devolve uma
// URL valida por ~5min que exige o Bearer token para o download.
async function salvarMidiaWhatsApp(mediaId: string | undefined): Promise<string | null> {
  try {
    if (!mediaId) return null;
    const { data: offRow } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_official").single();
    const token = (offRow?.valor as Record<string, string> | undefined)?.access_token;
    if (!token) return null;
    const info = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!info.ok) { console.error("WA media info error:", await info.text()); return null; }
    const meta = await info.json();
    if (!meta?.url) return null;
    return await salvarMidia(meta.url as string, token);
  } catch (e) { console.error("salvarMidiaWhatsApp error:", e); return null; }
}

// IG/Messenger: anexos chegam com URL direta de CDN em message.attachments.
// Devolve { tipo, midiaUrl, texto } — em qualquer falha degrada para o
// comportamento antigo (tipo texto + placeholder), nunca lanca erro.
async function extrairMidiaMeta(message: Record<string, unknown> | undefined): Promise<{ tipo: string; midiaUrl: string | null; texto: string }> {
  const textoBase = (message?.text as string) || "[midia]";
  try {
    const atts = message?.attachments as Record<string, unknown>[] | undefined;
    const a = atts?.[0];
    const aType = a?.type as string | undefined;
    const aUrl = (a?.payload as Record<string, unknown> | undefined)?.url as string | undefined;
    if (a && aType && TIPO_DB[aType] && aUrl) {
      const salvo = await salvarMidia(aUrl);
      if (salvo) return { tipo: TIPO_DB[aType], midiaUrl: salvo, texto: (message?.text as string) || `[${TIPO_DB[aType]}]` };
    }
  } catch (e) { console.error("extrairMidiaMeta error:", e); }
  return { tipo: "texto", midiaUrl: null, texto: textoBase };
}

// Grava mensagem ENVIADA por fora do CRM (echo da Meta) na conversa do lead.
// Regras de seguranca: exige mid (sem ele nao ha dedup → ignora), so anexa a
// lead ja existente (nunca cria lead a partir de envio) e nunca lanca erro
// (um echo com problema nao pode derrubar os demais eventos do batch).
async function registrarEcho(recipientId: string | undefined, mid: string | undefined, texto: string, origem: "instagram" | "messenger", tipo = "texto", midiaUrl: string | null = null) {
  try {
    if (!recipientId || !mid) return;
    const { data: lead } = await supabase.from("leads").select("id").eq("origem_id", recipientId).eq("ativo", true).maybeSingle();
    if (!lead?.id) return;
    const { error } = await supabase.from("lead_mensagens")
      .insert([{ empresa_id: EMPRESA_ID, lead_id: lead.id, direcao: "enviada", conteudo: texto, origem, lida: true, external_id: mid, tipo, midia_url: midiaUrl }]);
    if (error) console.log("Echo duplicado ignorado:", mid, error.message);
  } catch (e) { console.error("registrarEcho error:", e); }
}

async function getChannelToken(chave: string): Promise<string | null> {
  const { data } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", chave).single();
  const v = data?.valor as Record<string, string> | undefined;
  return (v?.token || v?.page_token) ?? null;
}

async function fetchProfile(id: string, token: string, fields: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=${fields}&access_token=${token}`);
    if (!res.ok) { console.error("profile fetch error:", id, await res.text()); return null; }
    return await res.json();
  } catch (e) { console.error("fetchProfile error:", e); return null; }
}

async function upsertLead({ nome, telefone, instagramUser, origem, origemId, texto, externalId, tipo = "texto", midiaUrl = null }: {
  nome: string | null; telefone: string | null; instagramUser: string | null; origem: string; origemId: string; texto: string; externalId: string | null; tipo?: string; midiaUrl?: string | null;
}) {
  let existente: { id: number; nome: string | null; instagram: string | null } | null = null;
  const { data: byId } = await supabase.from("leads").select("id, nome, instagram").eq("origem_id", origemId).eq("ativo", true).maybeSingle();
  existente = byId ?? null;

  // Fallback WhatsApp: lead criado manualmente tem telefone mas origem_id nulo.
  // So tenta quando NAO achou por origem_id. E aditivo — nao altera o match direto.
  if (!existente && origem === "whatsapp") {
    const last8 = origemId.replace(/\D/g, "").slice(-8);
    if (last8.length >= 8) {
      const { data: cands } = await supabase.from("leads")
        .select("id, nome, instagram, telefone, origem_id")
        .eq("ativo", true).is("origem_id", null).ilike("telefone", `%${last8}%`).limit(20);
      const match = (cands ?? []).find((l) => {
        const d = (l.telefone || "").replace(/\D/g, "");
        return d === origemId || d.slice(-8) === last8;
      });
      if (match) {
        existente = { id: match.id, nome: match.nome, instagram: match.instagram };
        // Fixa o origem_id no lead manual para a proxima mensagem casar direto.
        await supabase.from("leads").update({ origem_id: origemId }).eq("id", match.id);
      }
    }
  }

  let leadId = existente?.id ?? null;
  if (!leadId) {
    const { data: novo, error } = await supabase.from("leads")
      .insert([{ empresa_id: EMPRESA_ID, nome, telefone, instagram: instagramUser, origem, origem_id: origemId, primeira_msg: texto, kanban_status: "novo", ativo: true }])
      .select("id").single();
    if (error) {
      const { data: again } = await supabase.from("leads").select("id").eq("origem_id", origemId).eq("ativo", true).maybeSingle();
      leadId = again?.id ?? null;
      if (!leadId) { console.error("Erro ao criar/rebuscar lead:", error); return; }
    } else { leadId = novo.id; }
  } else {
    const patch: Record<string, unknown> = {};
    if (nome && !existente?.nome) patch.nome = nome;
    if (instagramUser && !existente?.instagram) patch.instagram = instagramUser;
    if (Object.keys(patch).length) await supabase.from("leads").update(patch).eq("id", leadId);
  }

  const { error: msgErr } = await supabase.from("lead_mensagens")
    .insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "recebida", conteudo: texto, origem, lida: false, external_id: externalId, tipo, midia_url: midiaUrl }]);
  if (msgErr) { console.log("Msg duplicada ignorada:", externalId, msgErr.message); return; }
  await supabase.rpc("incrementar_msgs_nao_lidas", { lead_id_param: leadId });
  await supabase.from("leads").update({ ultima_mensagem_at: new Date().toISOString() }).eq("id", leadId);
}
