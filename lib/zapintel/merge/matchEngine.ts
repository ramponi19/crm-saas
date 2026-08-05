import type { Lead } from "@/types/zapintel";

export interface MatchSuggestion {
  id: string;
  whatsappLead: Lead;
  instagramLead: Lead;
  confidence: number;          // 0–100
  reasons: string[];           // why we think they match
  status: "pending" | "confirmed" | "rejected";
}

// ── Normalize a name for comparison ──────────────────────────────────────────
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove accents
    .replace(/[^a-z0-9\s]/g, " ")      // underscores, dots → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ── Token overlap: how many words are shared ──────────────────────────────────
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(t => t.length > 2));
  const tb = new Set(b.split(" ").filter(t => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  const shared = [...ta].filter(t => tb.has(t)).length;
  return shared / Math.max(ta.size, tb.size);
}

// ── Main scoring function ─────────────────────────────────────────────────────
function scoreMatch(wa: Lead, ig: Lead): { confidence: number; reasons: string[] } {
  const waName = normalize(wa.contact);
  const igName = normalize(ig.contact);
  const reasons: string[] = [];
  let score = 0;

  // 1. Exact match after normalization
  if (waName === igName) {
    score += 70;
    reasons.push("Nome idêntico após normalização");
  } else {
    // 2. Token overlap (shared words)
    const overlap = tokenOverlap(waName, igName);
    if (overlap >= 0.8) { score += 50; reasons.push(`${Math.round(overlap*100)}% das palavras do nome coincidem`); }
    else if (overlap >= 0.5) { score += 30; reasons.push(`${Math.round(overlap*100)}% das palavras do nome coincidem`); }

    // 3. One name contains the other
    if (waName.includes(igName) || igName.includes(waName)) {
      score += 25;
      reasons.push("Um nome está contido no outro");
    }

    // 4. Levenshtein similarity
    const maxLen = Math.max(waName.length, igName.length);
    if (maxLen > 0) {
      const dist = levenshtein(waName, igName);
      const sim = 1 - dist / maxLen;
      if (sim >= 0.85) { score += 20; reasons.push(`Escrita muito parecida (${Math.round(sim*100)}% similar)`); }
      else if (sim >= 0.70) { score += 10; }
    }
  }

  // 5. Same phone number in messages (strongest signal)
  const waNums = wa.messages.map(m => m.phone).filter(Boolean);
  const igNums = ig.messages.map(m => m.phone).filter(Boolean);
  if (waNums.some(n => igNums.includes(n))) {
    score += 40;
    reasons.push("Mesmo número de telefone detectado");
  }

  // 6. Same date of first contact (within 7 days)
  if (wa.firstDate && ig.firstDate) {
    const diff = Math.abs(new Date(wa.firstDate).getTime() - new Date(ig.firstDate).getTime()) / 86400000;
    if (diff <= 3) { score += 10; reasons.push("Primeiro contato na mesma semana"); }
  }

  // 7. Similar buy signals (both hot or both interested in same product)
  const waSignals = new Set(wa.buySignals);
  const igSignals = new Set(ig.buySignals);
  const sharedSigs = [...waSignals].filter(s => igSignals.has(s)).length;
  if (sharedSigs >= 2) { score += 8; reasons.push(`${sharedSigs} sinais de compra em comum`); }

  return { confidence: Math.min(100, score), reasons };
}

// ── Main: generate suggestions ────────────────────────────────────────────────
export function generateMatchSuggestions(
  whatsappLeads: Lead[],
  instagramLeads: Lead[],
  minConfidence = 45
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  const usedIG = new Set<string>();

  for (const wa of whatsappLeads) {
    let bestScore = 0;
    let bestIG: Lead | null = null;
    let bestReasons: string[] = [];

    for (const ig of instagramLeads) {
      if (usedIG.has(ig.id)) continue;
      const { confidence, reasons } = scoreMatch(wa, ig);
      if (confidence > bestScore) {
        bestScore = confidence;
        bestIG = ig;
        bestReasons = reasons;
      }
    }

    if (bestIG && bestScore >= minConfidence) {
      usedIG.add(bestIG.id);
      suggestions.push({
        id: `match-${wa.id}-${bestIG.id}`,
        whatsappLead: wa,
        instagramLead: bestIG,
        confidence: bestScore,
        reasons: bestReasons,
        status: "pending",
      });
    }
  }

  // Sort by confidence desc
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

// ── Merge two leads into one unified profile ──────────────────────────────────
export function mergeLeads(wa: Lead, ig: Lead): Lead {
  // Combine messages, tag each with source
  const waMessages = wa.messages.map(m => ({ ...m, source: "whatsapp" as const }));
  const igMessages = ig.messages.map(m => ({ ...m, source: "instagram" as const }));

  // Sort all messages chronologically
  const allMessages = [...waMessages, ...igMessages].sort((a, b) => {
    const ta = new Date(`${a.date}T${a.time || "00:00:00"}`).getTime();
    const tb = new Date(`${b.date}T${b.time || "00:00:00"}`).getTime();
    return ta - tb;
  });

  // Combine buy signals & objections (deduplicate)
  const buySignals = [...new Set([...wa.buySignals, ...ig.buySignals])];
  const objLabels = new Set(wa.objections.map(o => o.label));
  const objections = [
    ...wa.objections,
    ...ig.objections.filter(o => !objLabels.has(o.label)),
  ];

  // Pick the higher score
  const score = Math.max(wa.score, ig.score);

  // Prefer whatsapp classification unless instagram is stronger
  const classification = wa.score >= ig.score ? wa.classification : ig.classification;

  return {
    ...wa,
    id: `merged-${wa.id}-${ig.id}`,
    messages: allMessages,
    buySignals,
    objections,
    score,
    classification,
    totalMessages: allMessages.length,
    leadMessages: allMessages.filter(m => !m.isStore).length,
    storeMessages: allMessages.filter(m => m.isStore).length,
    conversationDays: (() => {
      const dates = allMessages.map(m => m.date).filter(Boolean).sort();
      if (dates.length < 2) return 0;
      try {
        const parse = (s: string) => { const p = s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); };
        return Math.max(0, Math.round((parse(dates[dates.length-1]).getTime() - parse(dates[0]).getTime()) / 86400000));
      } catch { return 0; }
    })(),
    // Keep both sources
    _sources: { whatsapp: wa, instagram: ig },
  } as Lead & { _sources: { whatsapp: Lead; instagram: Lead } };
}
