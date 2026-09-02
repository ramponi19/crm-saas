import type { RawMessage, Lead } from "@/types/zapintel";
import { classifyLead } from "@/lib/zapintel/classification/engine";
import { scoreLead } from "@/lib/zapintel/scoring/leadScore";
import { inferProfile } from "@/lib/zapintel/insights/profile";
import { generateNextAction } from "@/lib/zapintel/insights/followUp";

const STORE_PHONE = "5519998862028";

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ";" && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Detect seller name from store messages ────────────────────────────────────
// Sellers identify with: "Me chamo Pedro", "sou a Ana", "aqui é o João"
const NAME_PATTERNS = [
  /me chamo\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
  /meu nome[eé]\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
  /aqui[eé]\s+(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
  /aqui\s+(?:é\s+)?([A-ZÀ-Ú][a-zà-ú]+)\s+da/i,
  /sou\s+(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
  /fala\s+(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
];
const KNOWN_SELLERS = ["pedro","matheus","ana","joão","joao","lucas","gabriel","rafael","carlos","fernanda","julia","júlia","maria","beatriz"];

function detectSeller(messages: { body: string; isStore: boolean; name?: string }[]): string {
  // First: check if seller introduces by name in store messages
  for (const msg of messages) {
    if (!msg.isStore) continue;
    const body = msg.body || "";
    for (const pattern of NAME_PATTERNS) {
      const match = body.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  // Second: look for known seller names in any store message
  for (const msg of messages) {
    if (!msg.isStore) continue;
    const lower = (msg.body || "").toLowerCase();
    for (const name of KNOWN_SELLERS) {
      if (lower.includes(name)) {
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  }
  // Third: extract name from store username field
  const storeMsg = messages.find(m => m.isStore && m.name);
  if (storeMsg && storeMsg.name) {
    const storeName: string = storeMsg.name;
    // "JM Store 5519998862028" → ignore generic names
    if (!storeName.match(/^\d+$/) && !storeName.toLowerCase().includes("store")) {
      const firstName = storeName.split(" ")[0];
      if (firstName.length > 2) return firstName;
    }
  }
  return "Loja";
}

export function parseCombinedCSV(raw: string): Lead[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : ",";
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = headerLine.split(sep).map(h => h.trim().replace(/"/g, ""));

  const col = (row: string[], name: string) => {
    const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    return i >= 0 ? (row[i] || "").replace(/^"|"$/g, "").trim() : "";
  };

  // Group rows by filename/contact
  const groups = new Map<string, { contact: string; messages: RawMessage[] }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = sep === ";" ? parseCSVLine(line) : line.split(",");

    const arquivo = col(row, "arquivo") || col(row, "filename") || "unknown";
    const contato = col(row, "contato") || col(row, "contact") || arquivo.replace(".csv", "");
    const phone = col(row, "userphone") || col(row, "phone") || "";
    const body = col(row, "messagebody") || col(row, "message") || col(row, "mensagem") || "";
    const date = col(row, "date2") || col(row, "date") || col(row, "data") || "";
    const time = col(row, "time") || col(row, "hora") || "";
    const name = col(row, "username") || col(row, "name") || "";
    const mediaType = col(row, "mediatype") || "";
    const mediaCaption = col(row, "mediacaption") || col(row, "legenda") || "";
    const quotedMessage = col(row, "quotedmessage") || "";

    const isStore = phone.includes(STORE_PHONE) || name.toLowerCase().includes("jm store");

    const msg: RawMessage = { date, time, phone, name, body, mediaType, mediaCaption, quotedMessage, isStore };

    if (!groups.has(arquivo)) groups.set(arquivo, { contact: contato, messages: [] });
    groups.get(arquivo)!.messages.push(msg);
  }

  // Convert to leads
  const leads: Lead[] = [];
  let idx = 0;
  for (const [filename, { contact, messages }] of groups) {
    if (messages.length === 0) continue;

    const leadMsgs = messages.filter(m => !m.isStore);
    const storeMsgs = messages.filter(m => m.isStore);
    const dates = messages.map(m => m.date).filter(Boolean);
    const firstDate = dates[0] || "";
    const lastDate = dates[dates.length - 1] || "";

    // Days since last activity
    const daysInactive = calcDaysInactive(lastDate);

    // Conversation span: days between first and last message
    const conversationDays = (() => {
      if (!firstDate || !lastDate) return 0;
      try {
        const parse = (s: string) => {
          const p = s.split("-");
          return new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
        };
        const diff = Math.round((parse(lastDate).getTime() - parse(firstDate).getTime()) / 86400000);
        return Math.max(0, diff);
      } catch { return 0; }
    })();

    const allText = messages.map(m => m.body).join(" ").toLowerCase();
    const leadText = leadMsgs.map(m => m.body).join(" ").toLowerCase();

    const classification = classifyLead({ leadText, allText, leadMsgs: leadMsgs.length, storeMsgs: storeMsgs.length, daysInactive, messages });
    const score = scoreLead({ classification, leadText, allText, leadMsgs: leadMsgs.length, daysInactive });
    const buyerProfile = inferProfile(leadText, allText);
    const { nextAction, urgency, insight, lossRisk } = generateNextAction({ classification, score, daysInactive, leadText, allText, contact });
    const buySignals = extractBuySignals(leadText);
    const objections = extractObjections(leadText);

    const sellerName = detectSeller(messages.map(m => ({ body: m.body, isStore: m.isStore, name: m.name })));
    leads.push({
      id: `lead-${idx++}`,
      contact,
      phone: leadMsgs[0]?.phone || "",
      filename,
      sellerName,
      messages,
      classification,
      score,
      buyerProfile,
      buySignals,
      objections,
      daysInactive,
      conversationDays,
      firstDate,
      lastDate,
      totalMessages: messages.length,
      leadMessages: leadMsgs.length,
      storeMessages: storeMsgs.length,
      nextAction,
      urgency,
      insight,
      lossRisk,
    });
  }

  return leads.sort((a, b) => b.score - a.score);
}

function calcDaysInactive(lastDate: string): number {
  if (!lastDate) return 999;
  try {
    const parts = lastDate.split("-");
    if (parts.length !== 3) return 999;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const diff = Date.now() - d.getTime();
    return Math.max(0, Math.floor(diff / 86400000));
  } catch { return 999; }
}

const BUY_SIGNALS_MAP: Record<string, string> = {
  "pix": "Pediu chave Pix",
  "cartão": "Mencionou cartão",
  "parcel": "Pediu parcelamento",
  "18x": "Pediu 18x",
  "12x": "Pediu 12x",
  "reserva": "Pediu reserva",
  "nota fiscal": "Pediu nota fiscal",
  "nf": "Pediu NF",
  "garantia": "Perguntou sobre garantia",
  "entrega": "Perguntou sobre entrega",
  "fechar": "Sinalizou fechamento",
  "blz": "Concordou (Blz)",
  "combinado": "Confirmou (Combinado)",
  "confirmado": "Confirmou compra",
  "paguei": "Disse que pagou",
  "transferi": "Confirmou transferência",
  "quero esse": "Declarou interesse direto",
  "pode separar": "Pediu para separar",
  "saúde da bateria": "Pediu saúde da bateria",
  "imei": "Perguntou IMEI",
  "disponível": "Verificou disponibilidade",
};

function extractBuySignals(leadText: string): string[] {
  return Object.entries(BUY_SIGNALS_MAP)
    .filter(([kw]) => leadText.includes(kw))
    .map(([, label]) => label)
    .slice(0, 6);
}

import type { Objection } from "@/types/zapintel";

function extractObjections(leadText: string): Objection[] {
  const objs: Objection[] = [];
  const priceKW = ["caro","salgado","mais barato","desconto","mercado livre","shopee","olx","concorrência","abaixa","menor valor"];
  const timingKW = ["vou pensar","deixa eu ver","vou ver","mais tarde","depois","não decidi","vou pesquisar","vou analisar","vou estudar","por enquanto"];
  const authKW = ["minha esposa","meu marido","meu pai","minha mãe","patroa","preciso ver com","vou ver com"];
  const trustKW = ["seminovo","usado","original","procedência","garantia","seguro","confiável"];
  const competitorKW = ["mercado livre","shopee","olx","comprei em outro","achei mais barato"];

  if (priceKW.some(k => leadText.includes(k))) objs.push({ type: "price", label: "Preço / Concorrência" });
  if (timingKW.some(k => leadText.includes(k))) objs.push({ type: "timing", label: "Indecisão / Timing" });
  if (authKW.some(k => leadText.includes(k))) objs.push({ type: "authority", label: "Depende de terceiro" });
  if (trustKW.some(k => leadText.includes(k))) objs.push({ type: "trust", label: "Dúvida sobre produto" });
  if (competitorKW.some(k => leadText.includes(k))) objs.push({ type: "competitor", label: "Concorrente" });
  return objs;
}

export function parseSingleConversation(raw: string, filename: string): Lead[] {
  const withHeader = `Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime\n` +
    raw.split("\n").map(l => `${filename.replace(".csv","")};${filename};${l}`).join("\n");
  return parseCombinedCSV(withHeader);
}
