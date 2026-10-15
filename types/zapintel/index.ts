
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
   * `body` veio de TRANSCRIÇÃO de áudio, não do que a pessoa digitou.
   *
   * Os motores tratam os dois igual de propósito — fala é fala. Mas a TELA
   * não pode: transcrição automática erra ("no prato" por "preto"), e mostrar
   * isso como se fosse texto digitado seria pôr na boca de alguém o que a
   * máquina entendeu. Requisito do Lucas em 13/10/2026.
   */
  transcrito?: boolean;
  /**
   * De qual canal a mensagem veio, quando a conversa é fruto de FUSÃO.
   *
   * Escrito em `lib/zapintel/merge/matchEngine.ts`, ao juntar o histórico de
   * WhatsApp com o de Instagram do mesmo contato. Ausente em conversa de um
   * canal só — ali o canal é o do lead inteiro.
   */
  source?: "whatsapp" | "instagram";
}

/**
 * O QUE O CRM REGISTRA SOBRE O LEAD — fato, não dedução.
 *
 * Tudo que está aqui foi gravado pelo sistema ou digitado por gente. Tudo que
 * está fora daqui, no `Lead`, foi deduzido da conversa pelo ZapIntel.
 *
 * A separação é o contrato: quando os dois discordarem — e eles discordam, o
 * kanban diz 66 convertidos e o registro de vendas diz 33 — a tela mostra a
 * divergência em vez de escolher um e calar o outro.
 */
export interface FatosDoCrm {
  leadId: number;
  filialId: number | null;
  /** `leads.origem`: whatsapp | instagram | messenger | manual… */
  canal: string;
  /** Etapa do funil, movida por gente. */
  kanbanStatus: string | null;
  /** Rótulo escolhido por quem perdeu o lead ("Comprou com concorrente"…). */
  motivoPerda: string | null;
  perdidoEm: string | null;
  produtoInteressado: string | null;
  responsavelId: string | null;
  /** Id do cliente, quando o lead virou cadastro. */
  convertidoEm: number | null;
  /** De qual anúncio o lead veio (Meta). */
  anuncio: Record<string, unknown> | null;
  criadoEm: string;
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

  /**
   * O que o CRM já registra sobre este lead. Ver `FatosDoCrm`.
   *
   * Opcional só porque o caminho de importação manual não tem CRM por trás —
   * e esse caminho está saindo. Quando sair, isto vira obrigatório e o
   * compilador passa a garantir que nenhuma tela leia dedução onde existe fato.
   */
  crm?: FatosDoCrm;
}

export interface Objection {
  type: "price" | "timing" | "authority" | "product" | "competitor" | "trust";
  label: string;
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

