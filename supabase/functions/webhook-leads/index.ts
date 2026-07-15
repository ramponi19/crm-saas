// ⚠️ Snapshot versionado da Edge Function `webhook-leads` (deploy real no Supabase,
// projeto guiuzbcqkvelqcuogxtd, v24). NÃO é buildada pelo Next — é o código-fonte
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

  // Envio WhatsApp pelo CRM — OFICIAL (Cloud API) se ativo; senao Evolution
  if (action === "send") {
    try {
      const { number, text, leadId } = body as { number: string; text: string; leadId?: string };
      if (!number || !text) return json({ error: "Parametros obrigatorios: number, text" }, 400);
      const numero = number.replace(/\D/g, "");
      const numeroFinal = numero.startsWith("55") ? numero : "55" + numero;
      const { data: offRow } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_official").single();
      const off = offRow?.valor as Record<string, string> | undefined;
      if (off?.ativo && off?.phone_number_id && off?.access_token) {
        const apiVer = off.api_version || "v19.0";
        const apiUrl = (off.api_url || "https://graph.facebook.com").replace(/\/$/, "");
        const r = await fetch(`${apiUrl}/${apiVer}/${off.phone_number_id}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${off.access_token}` },
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: numeroFinal, type: "text", text: { body: text } }),
        });
        const data = await r.json();
        if (!r.ok) { console.error("WA oficial error:", JSON.stringify(data)); return json({ error: data?.error?.message || "Erro ao enviar pelo WhatsApp oficial" }, r.status); }
        if (leadId) await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo: text, origem: "whatsapp", lida: true }]);
        return json({ success: true, provider: "oficial", data });
      }
      const { data: config } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_evolution").single();
      const ev = config?.valor as Record<string, string> | undefined;
      if (!ev) return json({ error: "Nenhum provedor de WhatsApp configurado." }, 500);
      const { instance, api_key, api_url, ativo } = ev;
      if (!ativo || !instance || !api_key || !api_url) return json({ error: "WhatsApp oficial inativo e Evolution nao esta ativa/completa." }, 500);
      const r = await fetch(`${api_url.replace(/\/$/, "")}/message/sendText/${instance}`, {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": api_key }, body: JSON.stringify({ number: numeroFinal, text }),
      });
      const data = await r.json();
      if (!r.ok) { console.error("Evolution API error:", data); return json({ error: data?.message || "Erro ao enviar mensagem" }, r.status); }
      if (leadId) await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo: text, origem: "whatsapp", lida: true }]);
      return json({ success: true, provider: "evolution", data });
    } catch (e) { console.error("send error:", e); return json({ error: (e as Error).message }, 500); }
  }

  if (action === "send_meta") {
    try {
      const { leadId, texto, canal } = body as { leadId: string; texto: string; canal: "instagram" | "messenger" };
      if (!leadId || !texto || !canal) return json({ error: "Parametros obrigatorios: leadId, texto, canal" }, 400);
      const { data: lead, error: leadErr } = await supabase.from("leads").select("origem_id").eq("id", leadId).single();
      if (leadErr || !lead?.origem_id) return json({ error: "Lead nao encontrado ou sem origem_id" }, 404);
      const chave = canal === "instagram" ? "instagram" : "messenger";
      const { data: cfg } = await supabase.from("configuracoes_sistema").select("valor").eq("chave", chave).single();
      if (!cfg?.valor) return json({ error: `Integracao ${canal} nao configurada.` }, 500);
      const pageToken = cfg.valor.token || cfg.valor.page_token || "";
      const pageId = cfg.valor.page_id || "";
      if (!pageToken || !pageId) return json({ error: `Token ou page_id do ${canal} nao configurado.` }, 500);
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${pageToken}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: lead.origem_id }, message: { text: texto }, messaging_type: "RESPONSE" }),
      });
      const data = await r.json();
      if (!r.ok) { console.error(`${canal} Graph API error:`, JSON.stringify(data)); return json({ error: data?.error?.message || `Erro ao enviar pelo ${canal}` }, r.status); }
      await supabase.from("lead_mensagens").insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "enviada", conteudo: texto, origem: canal, lida: true }]);
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
      const texto = (text?.body as string) || (image?.caption as string) || "[midia]";
      const nome = (contacts?.[0]?.profile as Record<string, unknown>)?.name as string ?? null;
      await upsertLead({ nome, telefone: phone, instagramUser: null, origem: "whatsapp", origemId: phone, texto, externalId: mid ?? null });
    }
  }
  else if (object === "page") {
    const fbToken = await getChannelToken("messenger");
    for (const entry of ((body?.entry as Record<string, unknown>[]) ?? [])) {
      for (const msg of ((entry?.messaging as Record<string, unknown>[]) ?? [])) {
        const psid = (msg.sender as Record<string, unknown>)?.id as string | undefined;
        const message = msg.message as Record<string, unknown> | undefined;
        const mid = message?.mid as string | undefined;
        const texto = (message?.text as string) || "[midia]";
        if (message?.is_echo) continue;
        if (psid) {
          let nome: string | null = null;
          if (fbToken) { const p = await fetchProfile(psid, fbToken, "name,first_name"); nome = p?.name || p?.first_name || null; }
          await upsertLead({ nome, telefone: null, instagramUser: null, origem: "messenger", origemId: psid, texto, externalId: mid ?? null });
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
      const texto = (message?.text as string) || "[midia]";
      if (message?.is_echo) continue;
      if (senderId) {
        let nome: string | null = null, username: string | null = null;
        if (igToken) { const p = await fetchProfile(senderId, igToken, "name,username"); nome = p?.name || p?.username || null; username = p?.username || null; }
        await upsertLead({ nome, telefone: null, instagramUser: username, origem: "instagram", origemId: senderId, texto, externalId: mid ?? null });
      }
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});

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

async function upsertLead({ nome, telefone, instagramUser, origem, origemId, texto, externalId }: {
  nome: string | null; telefone: string | null; instagramUser: string | null; origem: string; origemId: string; texto: string; externalId: string | null;
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
    .insert([{ empresa_id: EMPRESA_ID, lead_id: leadId, direcao: "recebida", conteudo: texto, origem, lida: false, external_id: externalId }]);
  if (msgErr) { console.log("Msg duplicada ignorada:", externalId, msgErr.message); return; }
  await supabase.rpc("incrementar_msgs_nao_lidas", { lead_id_param: leadId });
  await supabase.from("leads").update({ ultima_mensagem_at: new Date().toISOString() }).eq("id", leadId);
}
