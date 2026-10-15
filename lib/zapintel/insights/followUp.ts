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
