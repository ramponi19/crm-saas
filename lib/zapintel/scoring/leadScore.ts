import type { Classification } from "@/types/zapintel";

interface ScoreInput {
  classification: Classification;
  leadText: string;
  allText: string;
  leadMsgs: number;
  daysInactive: number;
}

const BASE: Record<Classification, number> = {
  customer: 90, hot: 72, warm: 48, followup: 35, stalled: 28, lost: 10, unqualified: 8,
};

const BOOSTERS = [
  { kw: "paguei",            pts: 15 },
  { kw: "comprovante",       pts: 15 },
  { kw: "imei",              pts: 12 },
  { kw: "nota fiscal",       pts: 10 },
  { kw: "combinado",         pts:  9 },
  { kw: "blza",              pts:  8 },
  { kw: "me manda o pix",    pts:  8 },
  { kw: "18x",               pts:  7 },
  { kw: "12x",               pts:  7 },
  { kw: "reserva",           pts:  7 },
  { kw: "saúde da bateria",  pts:  6 },
  { kw: "pronta entrega",    pts:  5 },
  { kw: "disponível",        pts:  4 },
  { kw: "garantia",          pts:  4 },
  { kw: "entrega",           pts:  3 },
  { kw: "parcel",            pts:  3 },
  { kw: "vou levar",         pts:  6 },
  { kw: "pode ser",          pts:  3 },
  { kw: "fechou",            pts:  7 },
];

const PENALTIES = [
  { kw: "notification_template", pts: -15 },
  { kw: "vou pensar",            pts:  -5 },
  { kw: "vou pesquisar",         pts:  -4 },
  { kw: "mais barato",           pts:  -3 },
  { kw: "mercado livre",         pts:  -3 },
  { kw: "não preciso",           pts:  -8 },
  { kw: "desisti",               pts: -10 },
];

export function scoreLead({ classification, leadText, allText, leadMsgs, daysInactive }: ScoreInput): number {
  let score = BASE[classification];
  const combined = leadText + " " + allText;

  for (const { kw, pts } of BOOSTERS) if (combined.includes(kw)) score += pts;
  for (const { kw, pts } of PENALTIES) if (combined.includes(kw)) score += pts; // pts already negative

  // Engagement bonus
  if (leadMsgs >= 5) score += 6;
  else if (leadMsgs >= 3) score += 3;
  else if (leadMsgs === 0) score -= 8;

  // Inactivity penalty
  if (daysInactive > 30) score -= 12;
  else if (daysInactive > 14) score -= 7;
  else if (daysInactive > 7) score -= 3;
  else if (daysInactive <= 1) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}
