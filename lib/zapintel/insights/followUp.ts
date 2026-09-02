import type { Classification } from "@/types/zapintel";

interface ActionInput {
  classification: Classification;
  score: number;
  daysInactive: number;
  leadText: string;
  allText: string;
  contact: string;
}

interface ActionOutput {
  nextAction: string;
  urgency: "critical" | "high" | "medium" | "low";
  insight: string;
  lossRisk: number;
}

const ACTIONS: Record<Classification, string> = {
  customer:    "Solicitar avaliação e indicação. Oferecer próximo produto.",
  hot:         "FECHAR AGORA — confirmar pagamento e finalizar pedido.",
  warm:        "Enviar nova condição ou foto do produto. Retomar o interesse.",
  followup:    "Reativar com mensagem contextual e natural.",
  stalled:     "Tentar alternativa: outro modelo, entrada diferente, ou nova condição.",
  lost:        "Agradecer pelo contato e entender o que faltou.",
  unqualified: "Arquivar — sem perfil de comprador ativo no momento.",
};

export function generateNextAction({ classification, daysInactive, leadText, contact }: ActionInput): ActionOutput {
  const urgencyMap: Record<Classification, ActionOutput["urgency"]> = {
    customer: "low", hot: "critical", warm: "high",
    followup: "high", stalled: "medium", lost: "low", unqualified: "low",
  };

  let lossRisk = 0;
  if (classification === "hot" && daysInactive >= 3) lossRisk = 75;
  else if (classification === "hot") lossRisk = 30;
  else if (classification === "warm" && daysInactive >= 7) lossRisk = 60;
  else if (classification === "warm") lossRisk = 25;
  else if (classification === "stalled") lossRisk = 80;
  else if (classification === "followup" && daysInactive >= 5) lossRisk = 55;
  else if (classification === "lost") lossRisk = 95;
  else if (classification === "unqualified") lossRisk = 40;

  // Detect specific context for richer insight
  const lt = leadText.toLowerCase();
  let insight = "";

  if (lt.includes("vou pensar")) insight = "Lead sinalizou indecisão — enviar prova social ou condição limitada.";
  else if (lt.includes("caro") || lt.includes("mais barato")) insight = "Objeção de preço — mostrar custo-benefício vs. Mercado Livre.";
  else if (lt.includes("minha esposa") || lt.includes("patroa")) insight = "Decisão depende de terceiro — oferecer material para mostrar ao cônjuge.";
  else if (lt.includes("vou pesquisar")) insight = "Lead está comparando — agir rápido com diferencial claro.";
  else if (lt.includes("bateria")) insight = "Preocupação com saúde da bateria — reforçar garantia de 6 meses.";
  else if (classification === "customer") insight = "Cliente convertido! Excelente momento para pedir indicação.";
  else if (classification === "hot") insight = "Sinais de compra fortes detectados — não deixar esfriar!";
  else if (daysInactive > 14) insight = "Lead inativo por muito tempo — mensagem curta e pessoal para reativar.";
  else insight = `${contact} tem potencial — follow-up personalizado aumenta chance de conversão.`;

  return {
    nextAction: ACTIONS[classification],
    urgency: urgencyMap[classification],
    insight,
    lossRisk,
  };
}

// ── Copilot de Vendas ─────────────────────────────────────────────────────────

export interface CopilotStrategy {
  id: string;
  label: string;
  tone: string;
  toneColor: string;
  emoji: string;
  message: string;
  reasoning: string;
}

export interface CopilotResult {
  diagnosis: {
    momentum: "heating" | "cooling" | "cold" | "converted";
    momentumLabel: string;
    turningPoint: string;
    recommendedApproach: string;
    riskAlert: string | null;
  };
  strategies: CopilotStrategy[];
}

export async function generateCopilot(lead: {
  contact: string;
  classification: string;
  score: number;
  buyerProfile: string;
  insight: string;
  daysInactive: number;
  buySignals: string[];
  objections: { label: string; type: string }[];
  messages: { body: string; isStore: boolean; date?: string; time?: string }[];
}): Promise<CopilotResult> {
  const allMsgs = lead.messages
    .filter(m => m.body?.trim())
    .map(m => `[${m.isStore ? "PEDRO/JM Store" : lead.contact.toUpperCase()}] ${m.body.trim()}`)
    .join("\n");

  const recentMsgs = lead.messages
    .filter(m => m.body?.trim())
    .slice(-12)
    .map(m => `[${m.isStore ? "PEDRO" : lead.contact}] ${m.body.trim()}`)
    .join("\n");

  const system = `Você é o Copilot de Vendas da JM Store — especialista em vendas consultivas de iPhones seminovos e perfumes importados no Brasil.
Loja: JM Store, Mogi Guaçu SP. Vendedor: Pedro. Dono: Matheus.
Contexto comercial: Parcela em até 18x, aceita iPhone usado como entrada, garantia de 6 meses na bateria, concorre com Mercado Livre e outras lojas físicas.
Tom: sempre humano, informal brasileiro, caloroso. NUNCA robótico ou genérico.
Responda SOMENTE com JSON válido, sem markdown, sem explicação fora do JSON.`;

  const prompt = `Analise esta conversa de vendas e gere um diagnóstico + 3 estratégias de mensagem para Pedro enviar AGORA.

=== DADOS DO LEAD ===
Nome: ${lead.contact}
Status: ${lead.classification} | Score: ${lead.score}/100
Perfil de comprador: ${lead.buyerProfile}
Inativo há: ${lead.daysInactive} dia(s)
Sinais de compra: ${lead.buySignals.join(", ") || "nenhum detectado"}
Objeções: ${lead.objections.map(o => o.label).join(", ") || "nenhuma"}
Análise do sistema: ${lead.insight}

=== ÚLTIMAS MENSAGENS ===
${recentMsgs}

=== CONVERSA COMPLETA (contexto) ===
${allMsgs.slice(0, 3000)}

Retorne EXATAMENTE este JSON (sem markdown):
{
  "diagnosis": {
    "momentum": "heating|cooling|cold|converted",
    "momentumLabel": "frase curta descrevendo o momento da conversa (ex: 'Interesse real, mas esfriou após preço')",
    "turningPoint": "frase descrevendo o momento chave da conversa (o que mudou o rumo)",
    "recommendedApproach": "frase direta: qual é a melhor jogada agora e por quê",
    "riskAlert": "alerta crítico se houver (ex: 'Lead citou concorrente — risco de perda em 24h') ou null"
  },
  "strategies": [
    {
      "id": "urgency",
      "label": "Criar Urgência",
      "tone": "Urgente",
      "toneColor": "#ef4444",
      "emoji": "🔥",
      "message": "mensagem real para Pedro copiar e enviar — máx 4 linhas, informal, específica ao contexto",
      "reasoning": "1 frase explicando por que essa abordagem funciona pra esse lead agora"
    },
    {
      "id": "reconnect",
      "label": "Reconexão Pessoal",
      "tone": "Caloroso",
      "toneColor": "#f59e0b",
      "emoji": "💛",
      "message": "mensagem real — foco em retomar o vínculo humano, sem pressão de venda direta",
      "reasoning": "1 frase de justificativa"
    },
    {
      "id": "objection",
      "label": "Quebrar Objeção",
      "tone": "Consultivo",
      "toneColor": "#3b82f6",
      "emoji": "🎯",
      "message": "mensagem real — aborda diretamente a principal objeção detectada com argumento forte",
      "reasoning": "1 frase de justificativa"
    }
  ]
}`;

  const res = await fetch("/zapintel/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  let raw = data.text?.trim() || "";
  // Strip possible markdown fences
  raw = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(raw) as CopilotResult;
  } catch {
    throw new Error("IA retornou formato inválido. Tente novamente.");
  }
}

// ── Legacy single follow-up (kept for compatibility) ──────────────────────────
export async function generateAIFollowup(lead: {
  contact: string;
  classification: string;
  insight: string;
  daysInactive: number;
  buySignals: string[];
  objections: { label: string }[];
  messages: { body: string; isStore: boolean }[];
}): Promise<string> {
  const recentMsgs = lead.messages
    .slice(-8)
    .map(m => `${m.isStore ? "Pedro (JM Store)" : lead.contact}: ${m.body}`)
    .join("\n");

  const prompt = `Você é especialista em vendas consultivas de iPhones seminovos e perfumes importados no Brasil. Loja: JM Store, Mogi Guaçu SP. Vendedor: Pedro.

Crie UMA mensagem de follow-up para Pedro enviar AGORA pelo WhatsApp para ${lead.contact}.

Regras: máximo 3 linhas, tom brasileiro informal, específico ao contexto, só a mensagem sem aspas.

Status: ${lead.classification} | Inativo há: ${lead.daysInactive} dia(s)
Sinais de compra: ${lead.buySignals.join(", ") || "nenhum"}
Objeções: ${lead.objections.map(o => o.label).join(", ") || "nenhuma"}
Contexto: ${lead.insight}

Últimas mensagens:
${recentMsgs}`;

  const res = await fetch("/zapintel/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text?.trim() || "Não foi possível gerar a mensagem.";
}
