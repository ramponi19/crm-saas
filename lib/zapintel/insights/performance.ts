import type { Lead, PerformanceStats } from "@/types/zapintel";

const TICKET_MEDIO = 5200;
const COMPETITOR_KW = ["mercado livre", "shopee", "olx", "americanas", "magazine", "magalu", "outro lugar", "achei mais barato", "encontrei por menos", "comprei em outro"];
const AUDIO_TYPES = ["recorded audio", "audio", "ptt", "forwarded audio"];
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
  return Math.abs((b.getTime() - a.getTime()) / 60000);
}

export function computePerformance(leads: Lead[]): PerformanceStats {
  const customers = leads.filter(l => l.classification === "customer");
  const engaged = leads.filter(l => !["unqualified"].includes(l.classification));

  // ── Speed to Lead ─────────────────────────────────────────────────────────
  const speedSamples: number[] = [];
  for (const lead of leads) {
    const msgs = lead.messages;
    const firstLead = msgs.find(m => !m.isStore);
    const firstStore = msgs.find(m => m.isStore);
    if (firstLead && firstStore) {
      const tLead = parseDateTime(firstLead.date, firstLead.time);
      const tStore = parseDateTime(firstStore.date, firstStore.time);
      if (tLead && tStore && tStore > tLead) {
        const diff = diffMinutes(tLead, tStore);
        if (diff < 1440) speedSamples.push(diff); // ignore >24h
      }
    }
  }
  const avgSpeedToLead = speedSamples.length > 0
    ? Math.round(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length)
    : 0;

  const speedDist = [
    { range: "< 5min",   color: "#22c55e", max: 5   },
    { range: "5–15min",  color: "#4ade80", max: 15  },
    { range: "15–60min", color: "#eab308", max: 60  },
    { range: "1–4h",     color: "#f97316", max: 240 },
    { range: "4h+",      color: "#ef4444", max: 9999},
  ];
  const speedToLeadDistribution = speedDist.map((b, i) => ({
    range: b.range,
    color: b.color,
    count: speedSamples.filter(s => s < b.max && (i === 0 || s >= speedDist[i-1].max)).length,
  }));
  const pctRespondedUnder5min = speedSamples.length > 0
    ? Math.round((speedSamples.filter(s => s < 5).length / speedSamples.length) * 100) : 0;
  const pctRespondedUnder1h = speedSamples.length > 0
    ? Math.round((speedSamples.filter(s => s < 60).length / speedSamples.length) * 100) : 0;

  // ── Funil por etapa ───────────────────────────────────────────────────────
  const total = leads.length;
  const engagedCount = leads.filter(l => l.leadMessages >= 1).length;
  const proposalCount = leads.filter(l => l.buySignals.length >= 1).length;
  const closedCount = customers.length;

  const funnelStages = [
    { stage: "Leads Totais",    count: total,         pct: 100 },
    { stage: "Engajaram",       count: engagedCount,  pct: Math.round((engagedCount / total) * 100) },
    { stage: "Receberam proposta", count: proposalCount, pct: Math.round((proposalCount / total) * 100) },
    { stage: "Fecharam",        count: closedCount,   pct: Math.round((closedCount / total) * 100) },
  ].map((s, i, arr) => ({
    ...s,
    dropPct: i > 0 ? Math.round(((arr[i-1].count - s.count) / arr[i-1].count) * 100) : 0,
  }));

  // ── Receita perdida por etapa ─────────────────────────────────────────────
  const lostInEngagement = leads.filter(l => l.leadMessages >= 1 && l.classification === "lost").length;
  const lostInProposal   = leads.filter(l => l.buySignals.length >= 1 && ["lost","stalled"].includes(l.classification)).length;
  const lostInClose      = leads.filter(l => l.classification === "stalled" && l.score >= 60).length;

  const revenueLostByStage = [
    { stage: "Desistiram sem engajar", leads: total - engagedCount,  lost: (total - engagedCount) * TICKET_MEDIO * 0.1  },
    { stage: "Engajaram mas sumiram",  leads: lostInEngagement,      lost: lostInEngagement * TICKET_MEDIO * 0.3        },
    { stage: "Tiveram proposta e saíram", leads: lostInProposal,     lost: lostInProposal * TICKET_MEDIO * 0.6          },
    { stage: "Quase fecharam (estagnados)", leads: lostInClose,      lost: lostInClose * TICKET_MEDIO * 0.8             },
  ].map(s => ({ ...s, lost: Math.round(s.lost) }));

  // ── Win rate vs concorrente ───────────────────────────────────────────────
  const withCompetitor = leads.filter(l => {
    const txt = l.messages.map(m => m.body).join(" ").toLowerCase();
    return COMPETITOR_KW.some(k => txt.includes(k));
  });
  const wonWithCompetitor = withCompetitor.filter(l => l.classification === "customer").length;
  const winRateGeneral = total > 0 ? Math.round((closedCount / total) * 100) : 0;
  const winRateVsCompetitor = withCompetitor.length > 0
    ? Math.round((wonWithCompetitor / withCompetitor.length) * 100) : 0;

  // ── Rapport Score ─────────────────────────────────────────────────────────
  // Count questions (?) asked by store per conversation
  const rapportScores = leads.map(l => {
    const storeMsgs = l.messages.filter(m => m.isStore);
    const questions = storeMsgs.filter(m => m.body.includes("?")).length;
    const isCustomer = l.classification === "customer";
    return { profile: l.buyerProfile, rapport: questions, converted: isCustomer };
  });
  const avgRapportScore = rapportScores.length > 0
    ? Math.round(rapportScores.reduce((a, r) => a + r.rapport, 0) / rapportScores.length * 10) / 10 : 0;

  const profileRapport: Record<string, { total: number; count: number; converted: number }> = {};
  for (const r of rapportScores) {
    if (!profileRapport[r.profile]) profileRapport[r.profile] = { total: 0, count: 0, converted: 0 };
    profileRapport[r.profile].total += r.rapport;
    profileRapport[r.profile].count += 1;
    if (r.converted) profileRapport[r.profile].converted += 1;
  }
  const rapportVsConversion = Object.entries(profileRapport)
    .map(([profile, v]) => ({
      profile,
      avgRapport: Math.round((v.total / v.count) * 10) / 10,
      convRate: Math.round((v.converted / v.count) * 100),
    }))
    .sort((a, b) => b.avgRapport - a.avgRapport);

  // ── Follow-up executado ───────────────────────────────────────────────────
  // Leads that needed followup = followup + stalled + warm
  const needFollowup = leads.filter(l => ["followup","stalled","warm"].includes(l.classification));
  // Executed = store sent a message after 1+ days gap
  const executedFollowup = needFollowup.filter(l => {
    const msgs = l.messages;
    for (let i = 1; i < msgs.length; i++) {
      if (!msgs[i].isStore) continue;
      const prev = msgs[i-1];
      const tPrev = parseDateTime(prev.date, prev.time);
      const tCurr = parseDateTime(msgs[i].date, msgs[i].time);
      if (tPrev && tCurr && diffMinutes(tPrev, tCurr) > 60 * 18) return true;
    }
    return false;
  });
  const followupRate = needFollowup.length > 0
    ? Math.round((executedFollowup.length / needFollowup.length) * 100) : 0;

  // ── Ticket médio por perfil ───────────────────────────────────────────────
  const profileTickets: Record<string, number[]> = {};
  for (const lead of leads) {
    const txt = lead.messages.map(m => m.body).join(" ").toLowerCase();
    // Extract price from messages like "R$5.995,00" or "r$4.995"
    const prices = [...txt.matchAll(/r\$[\s]?([\d.,]+)/g)]
      .map(m => parseFloat(m[1].replace(/\./g, "").replace(",", ".")))
      .filter(p => p > 500 && p < 50000);
    if (prices.length > 0) {
      const maxPrice = Math.max(...prices);
      if (!profileTickets[lead.buyerProfile]) profileTickets[lead.buyerProfile] = [];
      profileTickets[lead.buyerProfile].push(maxPrice);
    }
  }
  const ticketByProfile = Object.entries(profileTickets)
    .map(([profile, tickets]) => ({
      profile,
      avgTicket: Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length),
      count: tickets.length,
    }))
    .sort((a, b) => b.avgTicket - a.avgTicket);

  // ── LTV / recorrentes ─────────────────────────────────────────────────────
  const returningCustomers = leads.filter(l => {
    const txt = l.messages.map(m => m.body).join(" ").toLowerCase();
    return l.classification === "customer" &&
      ["já comprei", "cliente antigo", "última vez", "comprei antes", "outro celular com vocês", "peguei com vocês"].some(k => txt.includes(k));
  }).length;
  const estimatedLTV = Math.round(customers.length * TICKET_MEDIO * 1.4); // 40% chance segunda compra

  // ── Áudio vs texto ────────────────────────────────────────────────────────
  let totalStoreMsgs = 0, audioStoreMsgs = 0, audioInClosed = 0;
  for (const lead of leads) {
    const storeMsgs = lead.messages.filter(m => m.isStore);
    totalStoreMsgs += storeMsgs.length;
    const audios = storeMsgs.filter(m => AUDIO_TYPES.some(t => m.mediaType?.toLowerCase().includes(t) || m.body?.toLowerCase().includes("opus")));
    audioStoreMsgs += audios.length;
    if (lead.classification === "customer" && audios.length > 0) audioInClosed++;
  }
  const audioPct = totalStoreMsgs > 0 ? Math.round((audioStoreMsgs / totalStoreMsgs) * 100) : 0;
  const textPct = 100 - audioPct;
  const audioInClosedDeals = customers.length > 0
    ? Math.round((audioInClosed / customers.length) * 100) : 0;

  // ── Tempo de resposta Pedro ───────────────────────────────────────────────
  const responseTimes: number[] = [];
  const responseByHour: Record<string, number[]> = {};
  for (const lead of leads) {
    const msgs = lead.messages;
    for (let i = 1; i < msgs.length; i++) {
      if (!msgs[i].isStore || msgs[i-1].isStore) continue;
      const tPrev = parseDateTime(msgs[i-1].date, msgs[i-1].time);
      const tCurr = parseDateTime(msgs[i].date, msgs[i].time);
      if (tPrev && tCurr) {
        const diff = diffMinutes(tPrev, tCurr);
        if (diff < 480) {
          responseTimes.push(diff);
          const hour = msgs[i].time?.split(":")?.[0] || "0";
          if (!responseByHour[hour]) responseByHour[hour] = [];
          responseByHour[hour].push(diff);
        }
      }
    }
  }
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
  const responseTimeByHour = Object.entries(responseByHour)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([hour, times]) => ({
      hour: `${hour}h`,
      avgMin: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    }));

  // ── Conversões por dia da semana ──────────────────────────────────────────
  const convByDay: Record<number, { conv: number; leads: number }> = {};
  for (let i = 0; i < 7; i++) convByDay[i] = { conv: 0, leads: 0 };
  for (const lead of leads) {
    if (!lead.firstDate) continue;
    try {
      const [y, m, d] = lead.firstDate.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      convByDay[dow].leads++;
      if (lead.classification === "customer") convByDay[dow].conv++;
    } catch { /* skip */ }
  }
  const convByDayOfWeek = DAYS_PT.map((day, i) => ({
    day,
    conv: convByDay[i].conv,
    leads: convByDay[i].leads,
  }));

  return {
    avgSpeedToLead,
    speedToLeadDistribution,
    pctRespondedUnder5min,
    pctRespondedUnder1h,
    funnelStages,
    revenueLostByStage,
    winRateGeneral,
    winRateVsCompetitor,
    competitorMentions: withCompetitor.length,
    avgRapportScore,
    rapportVsConversion,
    followupExecuted: executedFollowup.length,
    followupTotal: needFollowup.length,
    followupRate,
    ticketByProfile,
    returningCustomers,
    estimatedLTV,
    audioPct,
    textPct,
    audioInClosedDeals,
    avgResponseTime,
    responseTimeByHour,
    activePipelineLoad: engaged.length,
    convByDayOfWeek,
  };
}
