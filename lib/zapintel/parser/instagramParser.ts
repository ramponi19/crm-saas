import type { RawMessage } from "@/types/zapintel";

// Instagram exports text encoded as latin1 bytes stored as unicode
// "OlÃ¡" → "Olá". This fixes it.
function fixEncoding(str: string): string {
  if (!str) return "";
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

interface IGMessage {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  share?: { link?: string; share_text?: string };
  photos?: { uri: string; creation_timestamp?: number }[];
  videos?: { uri: string }[];
  audio_files?: { uri: string }[];
  reactions?: { reaction: string; actor: string }[];
  type?: string;
}

interface IGConversation {
  participants: { name: string }[];
  messages: IGMessage[];
  title: string;
  thread_path?: string;
}

export function parseInstagramJSON(raw: string, filename: string): {
  contact: string;
  messages: RawMessage[];
} | null {
  try {
    const data: IGConversation = JSON.parse(raw);
    if (!data.messages || !Array.isArray(data.messages)) return null;

    const participantNames = data.participants.map(p => fixEncoding(p.name));
    const title = fixEncoding(data.title || "");

    // Count messages per sender to find who is the store (most messages)
    const msgCount: Record<string, number> = {};
    for (const m of data.messages) {
      const name = fixEncoding(m.sender_name || "");
      msgCount[name] = (msgCount[name] || 0) + 1;
    }

    // Store = participant with most messages
    const storeName = Object.entries(msgCount).sort((a, b) => b[1] - a[1])[0]?.[0] || participantNames[0];
    const contactName = participantNames.find(n => n !== storeName) || title || filename.replace(".json", "");

    const messages: RawMessage[] = data.messages
      .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
      .map(m => {
        const dt = new Date(m.timestamp_ms);
        const date = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
        const time = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}`;
        const senderFixed = fixEncoding(m.sender_name || "");
        const isStore = senderFixed === storeName;

        let body = fixEncoding(m.content || "");
        let mediaType = "";
        let mediaCaption = "";

        if (m.photos?.length)      { mediaType = "image";         mediaCaption = "Foto enviada";   if (!body) body = "[Foto]"; }
        if (m.videos?.length)      { mediaType = "video";         mediaCaption = "Vídeo enviado";  if (!body) body = "[Vídeo]"; }
        if (m.audio_files?.length) { mediaType = "recorded audio";mediaCaption = "Áudio enviado";  if (!body) body = "[Áudio]"; }
        if (m.share?.link)         { mediaType = "link"; body = fixEncoding(m.share.share_text || m.share.link); }

        return {
          date, time,
          phone: isStore ? "5519998862028" : senderFixed,
          name: senderFixed,
          body,
          mediaType,
          mediaCaption,
          quotedMessage: "",
          isStore,
        };
      });

    return { contact: contactName, messages };
  } catch (e) {
    console.error("Instagram JSON parse error:", e);
    return null;
  }
}

// Handle Chrome extension CSV exports
export function parseInstagramExtensionCSV(raw: string, filename: string): {
  contact: string;
  messages: RawMessage[];
} | null {
  try {
    const lines = raw.split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;
    const header = lines[0].toLowerCase();
    if (!header.includes("sender") && !header.includes("timestamp") && !header.includes("instagram")) return null;

    const cols = header.split(",");
    const get = (row: string[], name: string) => {
      const i = cols.findIndex(c => c.includes(name));
      return i >= 0 ? (row[i] || "").replace(/^"|"$/g, "").trim() : "";
    };

    const contact = filename.replace(".csv", "").replace(/_/g, " ");
    const messages: RawMessage[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      const sender = get(row, "sender") || get(row, "from") || get(row, "user");
      const body = get(row, "message") || get(row, "content") || get(row, "text");
      const ts = get(row, "timestamp") || get(row, "date") || get(row, "time");
      let date = "", time = "";
      if (ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          time = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:00`;
        }
      }
      messages.push({
        date, time, phone: sender, name: sender, body,
        mediaType: "", mediaCaption: "", quotedMessage: "",
        isStore: sender.toLowerCase() === "me" || sender === "you",
      });
    }
    return messages.length > 0 ? { contact, messages } : null;
  } catch { return null; }
}

// Auto-detect format
export function parseInstagramFile(raw: string, filename: string): {
  contact: string;
  messages: RawMessage[];
} | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseInstagramJSON(raw, filename);
  }
  return parseInstagramExtensionCSV(raw, filename);
}

export const INSTAGRAM_EXPORT_GUIDE = [
  {
    method: "Exportação Oficial do Instagram (Recomendado)",
    steps: [
      "Abra o Instagram no celular ou web",
      "Vá em Perfil → ⚙️ Configurações",
      "Acesse 'Centro de Contas' → 'Suas informações e permissões'",
      "Clique em 'Baixar suas informações'",
      "Selecione APENAS 'Mensagens' e escolha formato JSON",
      "Aguarde o e-mail com o link (pode levar até 48h)",
      "Baixe o ZIP → extraia → abra a pasta messages/inbox",
      "Entre na pasta de uma conversa e importe o arquivo message_1.json",
    ],
    format: "JSON",
    time: "até 48h",
  },
  {
    method: "Múltiplas conversas de uma vez (script Python)",
    steps: [
      "Baixe o script combinar_instagram.py",
      "Coloque na mesma pasta que contém a pasta 'messages'",
      "No Terminal: arraste a pasta para depois de 'cd ' e pressione Enter",
      "Execute: python3 combinar_instagram.py",
      "Importe o arquivo instagram_combinadas.csv gerado",
    ],
    format: "CSV combinado",
    time: "imediato",
  },
];
