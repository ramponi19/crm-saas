
export type Classification =
  | "customer"
  | "hot"
  | "warm"
  | "followup"
  | "stalled"
  | "lost"
  | "unqualified";

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
  daysInactive: number;
  conversationDays: number; // dias entre primeira e última mensagem
  firstDate: string;
  lastDate: string;
  totalMessages: number;
  leadMessages: number;
  storeMessages: number;
  /** O responsável do CRM (`leads.responsavel_id`). Fato, nunca dedução do texto. */
  sellerName: string | null;
  /** Canal de origem do lead (`leads.origem`). */
  _channel?: "whatsapp" | "instagram";

  /**
   * O que o CRM já registra sobre este lead. Ver `FatosDoCrm`.
   *
   * Opcional por herança do caminho de importação manual, que saiu em 10/10.
   */
  crm?: FatosDoCrm;
}

// ── Performance Stats ─────────────────────────────────────────────────────

