import type { Lead, RawMessage } from "@/types/zapintel";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDateTime(date: string, time: string): Date | null {
  try {
    if (!date || !time) return null;
    const [y, m, d] = date.split("-").map(Number);
    const [h, min, s] = time.split(":").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, h || 0, min || 0, s || 0);
  } catch { return null; }
}

function diffMinutes(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const EXIT_INTENT_KW = [
  "vou pensar", "deixa eu pensar", "vou dar uma pensada",
  "depois eu te falo", "depois a gente vê", "vou ver",
  "to vendo outras opções", "tô pesquisando", "vou pesquisar",
  "sem pressa", "não to com pressa", "não precisa me chamar",
  "por enquanto não", "agora não", "mais pra frente",
  "tô sem dinheiro", "to sem grana", "não tenho condição",
  "vou falar com", "preciso falar com",
];

const PRICE_REQUEST_KW = [
  "quanto", "valor", "preço", "custa", "como fica",
  "qual o preço", "me passa o valor", "qual o valor",
  "me manda o preço", "tem por quanto",
];

const SENTIMENT_POSITIVE = [
  "ótimo","perfeito","show","top","bom","gostei","adorei","amei","legal","bacana",
  "quero","tenho interesse","vou comprar","pode ser","tô dentro","fechado","sim",
  "me interessa","quero sim","pode mandar","manda","vamos","pode ser","confirmado",
];
const SENTIMENT_NEGATIVE = [
  "não","caro","muito","saudade","desisti","não quero","não tenho","sem condição",
  "não vou","não posso","tô sem","deixa","não preciso","obrigado não",
  "não vou conseguir","infelizmente","tô sem",
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SellerResponseSpeed {
  leadId: string;
  contact: string;
  avgMinutes: number;
  samples: number;
  rating: "excellent" | "good" | "slow" | "very_slow";
}

export interface LeadResponseRate {
  leadId: string;
  contact: string;
  leadMessages: number;
  storeMessages: number;
  ratio: number; // lead msgs per store msg — higher = more engaged
  classification: string;
}

export interface ConversationSentiment {
  leadId: string;
  contact: string;
  classification: string;
  arc: "warming" | "cooling" | "stable_positive" | "stable_negative" | "volatile";
  arcLabel: string;
  arcColor: string;
  startSentiment: "positive" | "neutral" | "negative";
  endSentiment: "positive" | "neutral" | "negative";
  positiveHits: number;
  negativeHits: number;
  sentimentScore: number; // -100 to +100
}

export interface DynamicScore {
  leadId: string;
  contact: string;
  baseScore: number;
  adjustedScore: number;
  decay: number;       // penalty for inactivity
  engagementBonus: number;
  exitPenalty: number;
  trend: "rising" | "stable" | "falling" | "critical";
}

export interface FunnelStageTime {
  stage: string;
  count: number;
  pct: number;
  avgDaysInStage: number;
  dropPct: number;
  color: string;
}

export interface ExitIntentAlert {
  leadId: string;
  contact: string;
  phrase: string;
  daysAgo: number;
  classification: string;
  score: number;
  urgency: string;
}

export interface HeatmapCell {
  day: string;      // "Seg", "Ter"...
  dayIndex: number;
  hour: number;     // 0–23
  leadCount: number;
  conversionCount: number;
  conversionRate: number;
}

export interface TalkRatio {
  leadId: string;
  contact: string;
  classification: string;
  leadWords: number;
  storeWords: number;
  leadPct: number;
  storePct: number;
  health: "healthy" | "warning" | "critical"; // lead should talk more
}

export interface PriceResponseTime {
  leadId: string;
  contact: string;
  classification: string;
  minutesToRespond: number;
  converted: boolean;
}

export interface Performance2Stats {
  // 1. Seller response speed
  avgSellerResponseMinutes: number;
  sellerSpeedByLead: SellerResponseSpeed[];
  speedDistribution: { range: string; count: number; color: string }[];
  pctUnder5min: number;
  pctUnder30min: number;

  // 2. Lead response rate
  avgLeadResponseRatio: number;
  leadResponseByLead: LeadResponseRate[];
  ghostRisk: number; // % leads where Pedro sends 3+ msgs with no response

  // 3. Conversation sentiment
  sentimentSummary: { warming: number; cooling: number; stable_positive: number; stable_negative: number; volatile: number };
  sentimentByLead: ConversationSentiment[];
  avgSentimentScore: number;

  // 4. Dynamic lead scoring
  dynamicScores: DynamicScore[];
  avgDecay: number;
  criticalLeads: number;

  // 5. Funnel with time per stage
  funnelWithTime: FunnelStageTime[];

  // 6. Exit intent detection
  exitIntentAlerts: ExitIntentAlert[];
  exitIntentTotal: number;

  // 7. Heatmap
  heatmap: HeatmapCell[];
  bestDayToClose: string;
  bestHourToClose: number;
  worstDay: string;

  // 8. Talk ratio
  avgLeadTalkPct: number;
  talkRatios: TalkRatio[];
  healthyConversations: number;

  // 9. Price response time
  avgPriceResponseMinutes: number;
  priceResponseByLead: PriceResponseTime[];
  priceResponseImpact: { fast: number; slow: number }; // conversion rate fast (<10min) vs slow
}

// ── Main compute function ─────────────────────────────────────────────────────
export function computePerformance2(leads: Lead[]): Performance2Stats {

  // ── 1. Seller Response Speed ───────────────────────────────────────────────
  const sellerSpeedByLead: SellerResponseSpeed[] = [];
  const allSpeedSamples: number[] = [];

  for (const lead of leads) {
    const msgs = lead.messages;
    const samples: number[] = [];
    for (let i = 0; i < msgs.length - 1; i++) {
      if (!msgs[i].isStore && msgs[i + 1]?.isStore) {
        const t1 = parseDateTime(msgs[i].date, msgs[i].time);
        const t2 = parseDateTime(msgs[i + 1].date, msgs[i + 1].time);
        if (t1 && t2) {
          const diff = diffMinutes(t1, t2);
          if (diff >= 0 && diff < 1440) { samples.push(diff); allSpeedSamples.push(diff); }
        }
      }
    }
    if (samples.length > 0) {
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      sellerSpeedByLead.push({
        leadId: lead.id, contact: lead.contact, avgMinutes: avg, samples: samples.length,
        rating: avg < 5 ? "excellent" : avg < 30 ? "good" : avg < 120 ? "slow" : "very_slow",
      });
    }
  }

  const avgSellerResponseMinutes = allSpeedSamples.length > 0
    ? Math.round(allSpeedSamples.reduce((a, b) => a + b, 0) / allSpeedSamples.length) : 0;

  const speedBuckets = [
    { range: "< 5min",   color: "#22c55e", min: 0,   max: 5   },
    { range: "5–30min",  color: "#86efac", min: 5,   max: 30  },
    { range: "30–120min",color: "#eab308", min: 30,  max: 120 },
    { range: "2–6h",     color: "#f97316", min: 120, max: 360 },
    { range: "6h+",      color: "#ef4444", min: 360, max: 99999 },
  ];
  const speedDistribution = speedBuckets.map(b => ({
    range: b.range, color: b.color,
    count: allSpeedSamples.filter(s => s >= b.min && s < b.max).length,
  }));
  const pctUnder5min  = allSpeedSamples.length > 0 ? Math.round((allSpeedSamples.filter(s => s < 5).length / allSpeedSamples.length) * 100) : 0;
  const pctUnder30min = allSpeedSamples.length > 0 ? Math.round((allSpeedSamples.filter(s => s < 30).length / allSpeedSamples.length) * 100) : 0;

  // ── 2. Lead Response Rate ──────────────────────────────────────────────────
  const leadResponseByLead: LeadResponseRate[] = leads.map(lead => {
    const lm = lead.leadMessages || lead.messages.filter(m => !m.isStore).length;
    const sm = lead.storeMessages || lead.messages.filter(m => m.isStore).length;
    const ratio = sm > 0 ? Math.round((lm / sm) * 100) / 100 : 0;
    return { leadId: lead.id, contact: lead.contact, leadMessages: lm, storeMessages: sm, ratio, classification: lead.classification };
  }).sort((a, b) => b.ratio - a.ratio);

  const avgLeadResponseRatio = leadResponseByLead.length > 0
    ? Math.round((leadResponseByLead.reduce((s, l) => s + l.ratio, 0) / leadResponseByLead.length) * 100) / 100 : 0;

  // Ghost risk: Pedro sent 3+ msgs in a row with no response
  const ghostRisk = leads.filter(lead => {
    let streak = 0;
    for (const m of lead.messages) {
      if (m.isStore) streak++;
      else streak = 0;
      if (streak >= 3) return true;
    }
    return false;
  }).length;

  // ── 3. Conversation Sentiment ──────────────────────────────────────────────
  function scoreSentiment(msgs: RawMessage[]): number {
    const text = msgs.filter(m => !m.isStore).map(m => m.body || "").join(" ").toLowerCase();
    const pos = SENTIMENT_POSITIVE.filter(w => text.includes(w)).length;
    const neg = SENTIMENT_NEGATIVE.filter(w => text.includes(w)).length;
    const total = pos + neg;
    if (total === 0) return 0;
    return Math.round(((pos - neg) / total) * 100);
  }

  const sentimentByLead: ConversationSentiment[] = leads.map(lead => {
    const msgs = lead.messages;
    const half = Math.floor(msgs.length / 2);
    const firstHalf = msgs.slice(0, Math.max(1, half));
    const secondHalf = msgs.slice(half);

    const startScore = scoreSentiment(firstHalf);
    const endScore   = scoreSentiment(secondHalf);
    const fullScore  = scoreSentiment(msgs);

    const startSent: "positive"|"neutral"|"negative" = startScore > 20 ? "positive" : startScore < -20 ? "negative" : "neutral";
    const endSent:   "positive"|"neutral"|"negative" = endScore   > 20 ? "positive" : endScore   < -20 ? "negative" : "neutral";

    let arc: ConversationSentiment["arc"];
    if (endScore > startScore + 20) arc = "warming";
    else if (endScore < startScore - 20) arc = "cooling";
    else if (fullScore > 10) arc = "stable_positive";
    else if (fullScore < -10) arc = "stable_negative";
    else arc = "volatile";

    const arcLabels = {
      warming: "Aquecendo 🔥", cooling: "Esfriando 🧊",
      stable_positive: "Positivo estável ✅", stable_negative: "Negativo estável ⚠",
      volatile: "Volátil 🎢",
    };
    const arcColors = {
      warming: "#f97316", cooling: "#60a5fa",
      stable_positive: "#22c55e", stable_negative: "#ef4444", volatile: "#a78bfa",
    };

    const leadText = msgs.filter(m => !m.isStore).map(m => m.body || "").join(" ").toLowerCase();
    const pos = SENTIMENT_POSITIVE.filter(w => leadText.includes(w)).length;
    const neg = SENTIMENT_NEGATIVE.filter(w => leadText.includes(w)).length;

    return {
      leadId: lead.id, contact: lead.contact, classification: lead.classification,
      arc, arcLabel: arcLabels[arc], arcColor: arcColors[arc],
      startSentiment: startSent, endSentiment: endSent,
      positiveHits: pos, negativeHits: neg, sentimentScore: fullScore,
    };
  });

  const sentimentSummary = { warming: 0, cooling: 0, stable_positive: 0, stable_negative: 0, volatile: 0 };
  sentimentByLead.forEach(s => { sentimentSummary[s.arc]++; });

  const avgSentimentScore = sentimentByLead.length > 0
    ? Math.round(sentimentByLead.reduce((s, l) => s + l.sentimentScore, 0) / sentimentByLead.length) : 0;

  // ── 4. Dynamic Lead Scoring ────────────────────────────────────────────────
  const dynamicScores: DynamicScore[] = leads.map(lead => {
    const base = lead.score;

    // Decay: -2 points per day inactive after 3 days
    const decay = Math.min(40, Math.max(0, (lead.daysInactive - 3) * 2));

    // Engagement bonus: lead talks more than Pedro
    const lm = lead.messages.filter(m => !m.isStore).length;
    const sm = lead.messages.filter(m => m.isStore).length;
    const engagementBonus = lm > sm ? Math.min(15, Math.round((lm / Math.max(sm, 1)) * 5)) : 0;

    // Exit intent penalty
    const leadText = lead.messages.filter(m => !m.isStore).map(m => m.body || "").join(" ").toLowerCase();
    const exitHits = EXIT_INTENT_KW.filter(k => leadText.includes(k)).length;
    const exitPenalty = Math.min(30, exitHits * 10);

    const adjusted = Math.max(0, Math.min(100, base - decay + engagementBonus - exitPenalty));

    const diff = adjusted - base;
    const trend: DynamicScore["trend"] = adjusted < 30 ? "critical" : diff <= -15 ? "falling" : diff >= 10 ? "rising" : "stable";

    return { leadId: lead.id, contact: lead.contact, baseScore: base, adjustedScore: adjusted, decay, engagementBonus, exitPenalty, trend };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore);

  const avgDecay = dynamicScores.length > 0
    ? Math.round(dynamicScores.reduce((s, d) => s + d.decay, 0) / dynamicScores.length) : 0;
  const criticalLeads = dynamicScores.filter(d => d.trend === "critical").length;

  // ── 5. Funnel With Time Per Stage ─────────────────────────────────────────
  const total = leads.length;
  const classified = (cls: string[]) => leads.filter(l => cls.includes(l.classification));

  const funnelDefs = [
    { stage: "Leads Totais",       leads: leads,                                                   color: "#7c5cfc" },
    { stage: "Engajaram",          leads: leads.filter(l => l.leadMessages >= 2),                  color: "#3b82f6" },
    { stage: "Demonstraram interesse", leads: leads.filter(l => l.buySignals.length >= 1),         color: "#14b8a6" },
    { stage: "Receberam proposta", leads: leads.filter(l => l.score >= 50),                        color: "#eab308" },
    { stage: "Quentes (fechar)",   leads: classified(["hot", "customer"]),                         color: "#f97316" },
    { stage: "Fecharam",           leads: classified(["customer"]),                                color: "#22c55e" },
  ];

  const funnelWithTime: FunnelStageTime[] = funnelDefs.map((def, i, arr) => {
    const count = def.leads.length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const prevCount = i > 0 ? arr[i - 1].leads.length : count;
    const dropPct = prevCount > 0 && i > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
    const avgDaysInStage = def.leads.length > 0
      ? Math.round(def.leads.reduce((s, l) => s + (l.conversationDays || 0), 0) / def.leads.length)
      : 0;
    return { stage: def.stage, count, pct, avgDaysInStage, dropPct, color: def.color };
  });

  // ── 6. Exit Intent Detection ───────────────────────────────────────────────
  const exitIntentAlerts: ExitIntentAlert[] = [];
  for (const lead of leads) {
    if (lead.classification === "customer") continue;
    const leadMsgs = lead.messages.filter(m => !m.isStore);
    for (const msg of leadMsgs.slice(-10)) {
      const body = (msg.body || "").toLowerCase();
      const matched = EXIT_INTENT_KW.find(k => body.includes(k));
      if (matched) {
        const msgDate = parseDateTime(msg.date, msg.time);
        const daysAgo = msgDate ? Math.round((Date.now() - msgDate.getTime()) / 86400000) : 0;
        exitIntentAlerts.push({
          leadId: lead.id, contact: lead.contact, phrase: matched,
          daysAgo, classification: lead.classification,
          score: lead.score, urgency: lead.urgency,
        });
        break;
      }
    }
  }
  exitIntentAlerts.sort((a, b) => a.daysAgo - b.daysAgo);
  const exitIntentTotal = exitIntentAlerts.length;

  // ── 7. Heatmap (day × hour) ────────────────────────────────────────────────
  const heatmapMap = new Map<string, { leads: Set<string>; conversions: Set<string> }>();

  for (const lead of leads) {
    for (const msg of lead.messages) {
      if (msg.isStore) continue;
      const dt = parseDateTime(msg.date, msg.time);
      if (!dt) continue;
      const day = dt.getDay();
      const hour = dt.getHours();
      const key = `${day}_${hour}`;
      if (!heatmapMap.has(key)) heatmapMap.set(key, { leads: new Set(), conversions: new Set() });
      const cell = heatmapMap.get(key)!;
      cell.leads.add(lead.id);
      if (lead.classification === "customer") cell.conversions.add(lead.id);
    }
  }

  const heatmap: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = heatmapMap.get(`${d}_${h}`);
      const leadCount = cell?.leads.size || 0;
      const convCount = cell?.conversions.size || 0;
      heatmap.push({
        day: DAYS_PT[d], dayIndex: d, hour: h,
        leadCount, conversionCount: convCount,
        conversionRate: leadCount > 0 ? Math.round((convCount / leadCount) * 100) : 0,
      });
    }
  }

  // Best/worst day/hour by conversion rate (min 2 leads)
  const byDayConv = DAYS_PT.map((day, d) => {
    const cells = heatmap.filter(c => c.dayIndex === d);
    const tLeads = cells.reduce((s, c) => s + c.leadCount, 0);
    const tConv  = cells.reduce((s, c) => s + c.conversionCount, 0);
    return { day, rate: tLeads >= 2 ? Math.round((tConv / tLeads) * 100) : 0, leads: tLeads };
  });
  const bestDayObj  = [...byDayConv].sort((a, b) => b.rate - a.rate)[0];
  const worstDayObj = [...byDayConv].filter(d => d.leads >= 2).sort((a, b) => a.rate - b.rate)[0];
  const bestDayToClose = bestDayObj?.day || "–";
  const worstDay       = worstDayObj?.day || "–";

  const byHour = Array.from({ length: 24 }, (_, h) => {
    const cells = heatmap.filter(c => c.hour === h);
    const tLeads = cells.reduce((s, c) => s + c.leadCount, 0);
    const tConv  = cells.reduce((s, c) => s + c.conversionCount, 0);
    return { hour: h, rate: tLeads >= 2 ? (tConv / tLeads) : 0 };
  });
  const bestHourToClose = byHour.sort((a, b) => b.rate - a.rate)[0]?.hour ?? 0;

  // ── 8. Talk Ratio ──────────────────────────────────────────────────────────
  const talkRatios: TalkRatio[] = leads.map(lead => {
    const leadWords  = lead.messages.filter(m => !m.isStore).reduce((s, m) => s + (m.body || "").split(/\s+/).length, 0);
    const storeWords = lead.messages.filter(m =>  m.isStore).reduce((s, m) => s + (m.body || "").split(/\s+/).length, 0);
    const total = leadWords + storeWords;
    const leadPct  = total > 0 ? Math.round((leadWords  / total) * 100) : 0;
    const storePct = total > 0 ? Math.round((storeWords / total) * 100) : 0;
    const health: TalkRatio["health"] = leadPct >= 40 ? "healthy" : leadPct >= 25 ? "warning" : "critical";
    return { leadId: lead.id, contact: lead.contact, classification: lead.classification, leadWords, storeWords, leadPct, storePct, health };
  }).sort((a, b) => b.leadPct - a.leadPct);

  const avgLeadTalkPct = talkRatios.length > 0
    ? Math.round(talkRatios.reduce((s, t) => s + t.leadPct, 0) / talkRatios.length) : 0;
  const healthyConversations = talkRatios.filter(t => t.health === "healthy").length;

  // ── 9. Price Response Time ─────────────────────────────────────────────────
  const priceResponseByLead: PriceResponseTime[] = [];

  for (const lead of leads) {
    const msgs = lead.messages;
    for (let i = 0; i < msgs.length - 1; i++) {
      const m = msgs[i];
      if (m.isStore) continue;
      const body = (m.body || "").toLowerCase();
      if (!PRICE_REQUEST_KW.some(k => body.includes(k))) continue;
      // Find next store response
      for (let j = i + 1; j < msgs.length; j++) {
        if (!msgs[j].isStore) continue;
        const t1 = parseDateTime(m.date, m.time);
        const t2 = parseDateTime(msgs[j].date, msgs[j].time);
        if (t1 && t2) {
          const diff = diffMinutes(t1, t2);
          if (diff >= 0 && diff < 1440) {
            priceResponseByLead.push({
              leadId: lead.id, contact: lead.contact,
              classification: lead.classification,
              minutesToRespond: Math.round(diff),
              converted: lead.classification === "customer",
            });
          }
        }
        break;
      }
      break; // only first price request per lead
    }
  }

  const avgPriceResponseMinutes = priceResponseByLead.length > 0
    ? Math.round(priceResponseByLead.reduce((s, p) => s + p.minutesToRespond, 0) / priceResponseByLead.length) : 0;

  const fastResponses = priceResponseByLead.filter(p => p.minutesToRespond <= 10);
  const slowResponses = priceResponseByLead.filter(p => p.minutesToRespond > 10);
  const priceResponseImpact = {
    fast: fastResponses.length > 0 ? Math.round((fastResponses.filter(p => p.converted).length / fastResponses.length) * 100) : 0,
    slow: slowResponses.length > 0 ? Math.round((slowResponses.filter(p => p.converted).length / slowResponses.length) * 100) : 0,
  };

  return {
    avgSellerResponseMinutes, sellerSpeedByLead, speedDistribution, pctUnder5min, pctUnder30min,
    avgLeadResponseRatio, leadResponseByLead, ghostRisk,
    sentimentSummary, sentimentByLead, avgSentimentScore,
    dynamicScores, avgDecay, criticalLeads,
    funnelWithTime,
    exitIntentAlerts, exitIntentTotal,
    heatmap, bestDayToClose, bestHourToClose, worstDay,
    avgLeadTalkPct, talkRatios, healthyConversations,
    avgPriceResponseMinutes, priceResponseByLead, priceResponseImpact,
  };
}
