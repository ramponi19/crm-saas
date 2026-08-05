import type { Classification, RawMessage } from "@/types/zapintel";

interface ClassifyInput {
  leadText: string;
  allText: string;
  leadMsgs: number;
  storeMsgs: number;
  daysInactive: number;
  messages: RawMessage[];
}

const CUSTOMER_KW = ["paguei","acabei de transferir","comprovante","recibo","nota fiscal emitida","nf emitida","entregou","chegou aqui","recebi o celular","recebi o iphone","produto chegou","imei","endereço completo","rua "];
const CONFIRMED_KW = ["combinado","confirmado","blza","blz","fechar","vou levar","pode separar","quero esse","reserva pra mim","me manda o pix","qual o pix","aceita pix","link de pagamento"];
const HOT_KW = ["quanto fica no pix","me manda o pix","qual a chave","18x","12x","nota fiscal","garantia","parcelado","saúde da bateria","disponível","tem em estoque","pronta entrega","entrega hoje","entrega amanhã","pode ser","pode sim","quando posso","vou levar","reserva","quanto fica"];
const WARM_KW = ["gostaria de saber","qual o valor","quanto está","tem o modelo","quais modelos","gostaria de","tenho interesse","me interesso","interessante","queria saber"];
const LOST_KW = ["não vou mais","desisti","não preciso mais","comprei em outro","comprei no mercado","passei","foi pra outro","não quis","cancela","cancelar"];
const NOTIFICATION_TPL = ["notification_template","vi o anúncio do iphone. tenho interesse"];

export function classifyLead({ leadText, allText, leadMsgs, storeMsgs, daysInactive, messages }: ClassifyInput): Classification {
  const lt = leadText.toLowerCase();
  const at = allText.toLowerCase();

  // Customer: clear post-sale evidence
  const custHits = CUSTOMER_KW.filter(k => at.includes(k)).length;
  if (custHits >= 2) return "customer";
  if (custHits >= 1 && at.includes("imei")) return "customer";

  // Lost
  if (LOST_KW.some(k => lt.includes(k))) return "lost";

  // Unqualified: only template / no real engagement
  const isOnlyTemplate = messages.filter(m => !m.isStore).every(m =>
    NOTIFICATION_TPL.some(t => m.body.toLowerCase().includes(t)) || m.body.trim().length < 5
  );
  if (leadMsgs === 0 || isOnlyTemplate) return "unqualified";
  if (leadMsgs <= 1 && storeMsgs <= 1) return "unqualified";

  // Score buy signals
  const hotHits = HOT_KW.filter(k => lt.includes(k)).length;
  const confirmedHits = CONFIRMED_KW.filter(k => lt.includes(k)).length;

  if (confirmedHits >= 2 || hotHits >= 4) return "hot";
  if (hotHits >= 2 && leadMsgs >= 3) return "hot";
  if (hotHits >= 1 && confirmedHits >= 1) return "hot";

  // Stalled: had engagement but gone very quiet
  if (daysInactive > 14 && hotHits >= 1) return "stalled";
  if (daysInactive > 21 && leadMsgs >= 3) return "stalled";

  // Follow-up: light engagement, needs a nudge
  if (hotHits === 0 && leadMsgs >= 1 && daysInactive >= 3) return "followup";

  // Warm: genuine interest
  const warmHits = WARM_KW.filter(k => lt.includes(k)).length;
  if (warmHits >= 1 || (leadMsgs >= 2 && hotHits >= 1)) return "warm";
  if (leadMsgs >= 2) return "warm";

  return "followup";
}
