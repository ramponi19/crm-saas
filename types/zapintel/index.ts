export interface ManualSale {
  product: string;
  value: number;
  notes: string;
  closedAt: string; // ISO date
}

export type Classification =
  | "customer"
  | "hot"
  | "warm"
  | "followup"
  | "stalled"
  | "lost"
  | "unqualified";

export type BuyerProfile =
  | "Decidido"
  | "Sensível ao Preço"
  | "Analítico"
  | "Dependente de Aprovação"
  | "Urgente"
  | "Explorador"
  | "Sem Engajamento";

export interface RawMessage {
  date: string;
  time: string;
  phone: string;
  name: string;
  body: string;
  mediaType: string;
  mediaCaption: string;
  quotedMessage: string;
  isStore: boolean;
  /**
   * De qual canal a mensagem veio, quando a conversa é fruto de FUSÃO.
   *
   * Escrito em `lib/zapintel/merge/matchEngine.ts`, ao juntar o histórico de
   * WhatsApp com o de Instagram do mesmo contato. Ausente em conversa de um
   * canal só — ali o canal é o do lead inteiro.
   */
  source?: "whatsapp" | "instagram";
}

export interface Lead {
  id: string;
  contact: string;
  phone: string;
  filename: string;
  messages: RawMessage[];
  classification: Classification;
  score: number;
  buyerProfile: BuyerProfile;
  buySignals: string[];
  objections: Objection[];
  daysInactive: number;
  conversationDays: number; // dias entre primeira e última mensagem
  firstDate: string;
  lastDate: string;
  totalMessages: number;
  leadMessages: number;
  storeMessages: number;
  nextAction: string;
  urgency: "critical" | "high" | "medium" | "low";
  insight: string;
  lossRisk: number;
  manualSale?: ManualSale;
  sellerName: string;
  /**
   * Canal de origem, gravado na IMPORTAÇÃO (`hooks/zapintel/useLeads.tsx`).
   *
   * Existia em tempo de execução sem estar declarado aqui, e o resultado foram
   * 47 `as any` espalhados pelo módulo — cada um um ponto onde o compilador
   * parava de proteger o objeto INTEIRO, não só este campo.
   */
  _channel?: "whatsapp" | "instagram";
  /**
   * As duas conversas originais, quando este lead é fruto de FUSÃO.
   *
   * Presença de `_sources` é o que significa "veio dos dois canais" — é assim
   * que as telas decidem mostrar a etiqueta "both". Escrito em
   * `lib/zapintel/merge/matchEngine.ts`.
   */
  _sources?: { whatsapp: Lead; instagram: Lead };
}

export interface Objection {
  type: "price" | "timing" | "authority" | "product" | "competitor" | "trust";
  label: string;
}

export interface DashboardStats {
  total: number;
  customer: number;
  hot: number;
  warm: number;
  followup: number;
  stalled: number;
  lost: number;
  unqualified: number;
  avgScore: number;
  avgDaysInactive: number;
  topObjections: { label: string; count: number }[];
  topBuySignals: { label: string; count: number }[];
  profileDistribution: { profile: string; count: number }[];
  inactivityRanges: { range: string; count: number }[];
  // New metrics
  conversionRate: number;
  avgDaysToClose: number;
  pipelineValue: number;
  ghostRate: number;
  inactivityTraffic: { range: string; count: number; color: string }[];
  mostExpensiveObjection: { label: string; estimatedLoss: number };
  referralCount: number;
  topModels: { model: string; count: number }[];
  peakHours: { hour: string; count: number }[];
  reactivationRate: number;
  calledByName: number;
  calledByNamePct: number;
  askedReferral: number;
  askedReferralPct: number;
  lastMsgStore: number;
  lastMsgLead: number;
  lastMsgStorePct: number;
  sellerDistribution: { seller: string; count: number }[];
}

export const STATUS_META: Record<
  Classification,
  { label: string; color: string; bg: string; border: string }
> = {
  customer:    { label: "Cliente ✅",         color: "#4ade80", bg: "rgba(34,197,94,.12)",  border: "rgba(34,197,94,.35)"  },
  hot:         { label: "Lead Quente 🔥",     color: "#f87171", bg: "rgba(239,68,68,.12)",  border: "rgba(239,68,68,.35)"  },
  warm:        { label: "Lead Morno",         color: "#facc15", bg: "rgba(234,179,8,.12)",  border: "rgba(234,179,8,.35)"  },
  followup:    { label: "Follow-up ⚡",       color: "#fb923c", bg: "rgba(249,115,22,.12)", border: "rgba(249,115,22,.35)" },
  stalled:     { label: "Estagnado",          color: "#c084fc", bg: "rgba(124,92,252,.12)", border: "rgba(124,92,252,.35)" },
  lost:        { label: "Perdido",            color: "#9ca3af", bg: "rgba(107,114,128,.1)", border: "rgba(107,114,128,.3)" },
  unqualified: { label: "Sem Engajamento",    color: "#64748b", bg: "rgba(51,65,85,.12)",   border: "rgba(51,65,85,.35)"   },
};

// ── Performance Stats ─────────────────────────────────────────────────────
export interface PerformanceStats {
  // Speed to Lead
  avgSpeedToLead: number;        // minutos
  speedToLeadDistribution: { range: string; count: number; color: string }[];
  pctRespondedUnder5min: number;
  pctRespondedUnder1h: number;

  // Funil por etapa
  funnelStages: { stage: string; count: number; pct: number; dropPct: number }[];

  // Receita perdida por etapa
  revenueLostByStage: { stage: string; lost: number; leads: number }[];

  // Win rate vs concorrente
  winRateGeneral: number;
  winRateVsCompetitor: number;
  competitorMentions: number;

  // Rapport Score
  avgRapportScore: number;
  rapportVsConversion: { profile: string; avgRapport: number; convRate: number }[];

  // Taxa de follow-up executado
  followupExecuted: number;
  followupTotal: number;
  followupRate: number;

  // Ticket médio por perfil
  ticketByProfile: { profile: string; avgTicket: number; count: number }[];

  // LTV / recorrentes
  returningCustomers: number;
  estimatedLTV: number;

  // Áudio vs texto
  audioPct: number;
  textPct: number;
  audioInClosedDeals: number;

  // Tempo de resposta Pedro
  avgResponseTime: number;      // minutos
  responseTimeByHour: { hour: string; avgMin: number }[];

  // Carga de pipeline
  activePipelineLoad: number;
  convByDayOfWeek: { day: string; conv: number; leads: number }[];
}

// ── Agenda ────────────────────────────────────────────────────────────────────
export interface FollowUpTask {
  id: string;
  leadId: string;
  contact: string;
  phone: string;
  classification: Classification;
  score: number;
  urgency: "critical" | "high" | "medium" | "low";
  scheduledFor: string; // ISO date YYYY-MM-DD
  note: string;
  done: boolean;
  createdAt: string;
  nextAction: string;
  daysInactive: number;
  conversationDays: number; // dias entre primeira e última mensagem
}

// ── Scripts ───────────────────────────────────────────────────────────────────
export interface Script {
  id: string;
  title: string;
  category: "price" | "reconnect" | "closing" | "referral" | "followup" | "custom";
  situation: string;
  message: string;
  usageCount: number;
  createdAt: string;
}

// ── Action Log ────────────────────────────────────────────────────────────────
export interface ActionLog {
  id: string;
  leadId: string;
  contact: string;
  type: "followup_sent" | "sale_closed" | "script_used" | "status_changed" | "note_added" | "task_created";
  description: string;
  timestamp: string;
}
