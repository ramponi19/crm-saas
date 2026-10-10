import type { Lead, DashboardStats } from "@/types/zapintel";

/**
 * OS FATOS DE VENDA — o que substituiu `const TICKET_MEDIO = 5200`.
 *
 * Aquela linha ficou aqui por meses e alimentava os dois cartoes de dinheiro
 * mais visiveis do dashboard: "PIPELINE ESTIMADO R$ 1,2M" e "OBJECAO MAIS CARA
 * R$ 558k". Nenhuma venda entrava na conta. O ticket real da JM, medido pela
 * ponte venda->conversa em 10/10/2026, e R$ 7.045 — 35% acima do chute, e o
 * chute valia igual para a Imobiliaria, que nunca vendeu um iPhone.
 *
 * Quando isto vem `undefined` (empresa sem venda, ou o caminho legado de
 * importacao manual), os numeros em reais saem ZERADOS de proposito. Tela que
 * nao tem o dado diz que nao tem; nao arbitra.
 */
export interface FatosStats {
  /** Ticket MEDIDO das vendas concluidas. */
  ticket: number;
  /** De quantas vendas ele saiu — viaja junto para a tela poder relativizar. */
  vendas: number;
  /** Fracao das vendas que a ponte ligou a uma conversa (0 a 1). */
  cobertura: number;
  /** Mediana de dias da primeira mensagem ate a venda. */
  cicloMediano: number | null;
  /** Este lead comprovadamente gerou venda? Resolvido por quem chama. */
  comprou: (l: Lead) => boolean;
}

const REFERRAL_KW = ["indicação","indicou","me indicou","amigo indicou","pedro indicou","minha amiga","meu amigo","david me enviou","matheus pediu","passou seu contato"];

const MODELS_KW: Record<string, string> = {
  "17 pro max": "iPhone 17 Pro Max",
  "17 pro": "iPhone 17 Pro",
  "iphone 17": "iPhone 17",
  "16 pro max": "iPhone 16 Pro Max",
  "16 pro": "iPhone 16 Pro",
  "iphone 16": "iPhone 16",
  "15 pro max": "iPhone 15 Pro Max",
  "15 pro": "iPhone 15 Pro",
  "iphone 15": "iPhone 15",
  "iphone 14": "iPhone 14",
  "iphone 13": "iPhone 13",
  "iphone 12": "iPhone 12",
  "iphone 11": "iPhone 11",
  "212 vip": "Perfume 212 VIP",
  "apple watch": "Apple Watch",
};

export function computeStats(leads: Lead[], fatos?: FatosStats | null): DashboardStats {
  const count = (cls: string) => leads.filter(l => l.classification === cls).length;

  // Quem comprou, de verdade. Vazio quando nao ha ponte — e ai os numeros que
  // dependem disto saem zerados em vez de sairem errados.
  const compradores = fatos ? leads.filter(fatos.comprou) : [];
  const ehComprador = new Set(compradores);

  const objCount: Record<string, number> = {};
  const signalCount: Record<string, number> = {};
  const profileCount: Record<string, number> = {};
  /** Por sinal: em quantos compradores (c) e em quantos demais (n) ele aparece. */
  const sinalPorGrupo: Record<string, { c: number; n: number }> = {};
  for (const lead of leads) {
    for (const obj of lead.objections) objCount[obj.label] = (objCount[obj.label] || 0) + 1;
    for (const sig of lead.buySignals) {
      signalCount[sig] = (signalCount[sig] || 0) + 1;
      const d = sinalPorGrupo[sig] ?? (sinalPorGrupo[sig] = { c: 0, n: 0 });
      if (ehComprador.has(lead)) d.c++; else d.n++;
    }
    profileCount[lead.buyerProfile] = (profileCount[lead.buyerProfile] || 0) + 1;
  }

  // 1. CONVERSAO — agora de venda registrada, nao de palavra na conversa.
  //
  // Era `customer / total`, e `customer` saia de uma regra que lia o texto dos
  // DOIS lados: dos 130 leads assim marcados em 09/10/2026, so 27 tinham prova
  // de pagamento, e o gatilho n1 era "imei" (101) — pergunta de cotacao de
  // troca, o oposto de venda fechada. Dava 6%. O real e 1,6%.
  const conversionRate = leads.length > 0 && fatos
    ? Math.round((compradores.length / leads.length) * 1000) / 10
    : 0;

  // 2. Tempo médio para fechar
  const customers = leads.filter(l => l.classification === "customer");
  const avgDaysToClose = fatos?.cicloMediano != null ? fatos.cicloMediano
    : customers.length > 0
    ? Math.round(customers.reduce((a, l) => {
        const start = l.firstDate ? new Date(l.firstDate).getTime() : 0;
        const end = l.lastDate ? new Date(l.lastDate).getTime() : 0;
        return a + (start && end ? Math.max(0, Math.round((end - start) / 86400000)) : 3);
      }, 0) / customers.length)
    : 3;

  // 3. Pipeline
  const hotLeads = leads.filter(l => l.classification === "hot");
  const warmLeads = leads.filter(l => l.classification === "warm");
  // ── PIPELINE — as DUAS metades da formula eram inventadas ────────────────
  //
  // Era `quentes x 5200 x 0,70 + mornos x 5200 x 0,25`. Trocar o 5200 pelo
  // ticket medido consertou metade; a outra metade era pior. Medido em
  // 10/10/2026 contra as vendas de verdade:
  //
  //     quentes ... 217 leads, 6 compraram ....  2,8%   (a formula dizia 70%)
  //     mornos .... 287 leads, 0 compraram ....  0,0%   (a formula dizia 25%)
  //
  // Vinte e cinco vezes de diferenca. "PIPELINE R$ 1,58M" eram R$ 43 mil.
  //
  // A taxa agora e medida por classificacao. E dividida pela cobertura da
  // ponte (0,69 na JM) porque 31% das vendas nao tem conversa ligada — sem
  // isso a taxa sairia subestimada na mesma proporcao. Essa correcao supoe que
  // a venda nao-ligada se parece com a ligada; e suposicao, mas e UMA, e esta
  // escrita aqui.
  const taxaDaClasse = (cls: string): number => {
    if (!fatos || !fatos.cobertura) return 0;
    const naClasse = leads.filter((l) => l.classification === cls);
    if (!naClasse.length) return 0;
    const compraram = naClasse.filter((l) => ehComprador.has(l)).length;
    return Math.min(1, compraram / naClasse.length / fatos.cobertura);
  };
  const taxaHot = taxaDaClasse("hot");
  const taxaWarm = taxaDaClasse("warm");
  const pipelineValue = fatos
    ? Math.round(hotLeads.length * fatos.ticket * taxaHot + warmLeads.length * fatos.ticket * taxaWarm)
    : 0;

  // 4. Ghost
  const ghostLeads = leads.filter(l => {
    const hasTemplate = l.messages.some(m => m.body.toLowerCase().includes("notification_template") || m.body.toLowerCase().includes("vi o anúncio do iphone. tenho interesse"));
    return hasTemplate || l.classification === "unqualified";
  });
  const ghostRate = leads.length > 0 ? Math.round((ghostLeads.length / leads.length) * 100) : 0;

  // 5. Semáforo
  const inactivityTraffic = [
    { range: "Hoje",  count: leads.filter(l => l.daysInactive === 0).length,                          color: "#22c55e" },
    { range: "1–2d",  count: leads.filter(l => l.daysInactive >= 1 && l.daysInactive <= 2).length,   color: "#4ade80" },
    { range: "3–7d",  count: leads.filter(l => l.daysInactive >= 3 && l.daysInactive <= 7).length,   color: "#eab308" },
    { range: "8–14d", count: leads.filter(l => l.daysInactive >= 8 && l.daysInactive <= 14).length,  color: "#f97316" },
    { range: "15–30d",count: leads.filter(l => l.daysInactive >= 15 && l.daysInactive <= 30).length, color: "#ef4444" },
    { range: "30d+",  count: leads.filter(l => l.daysInactive > 30).length,                          color: "#7f1d1d" },
  ];

  // 6. Objeção mais cara
  const lostStalled = leads.filter(l => ["lost","stalled"].includes(l.classification));
  const expObjCount: Record<string, number> = {};
  for (const lead of lostStalled) for (const obj of lead.objections) expObjCount[obj.label] = (expObjCount[obj.label] || 0) + 1;
  const mostExpEntry = Object.entries(expObjCount).sort((a, b) => b[1] - a[1])[0];
  const mostExpensiveObjection = mostExpEntry
    // ── POR QUE ISTO DEIXOU DE SER UM VALOR EM REAIS ───────────────────────
    //
    // Era `contagem x TICKET_MEDIO x 0,6` — e os tres fatores eram problema. O
    // ticket agora e medido, mas o 0,6 supunha que 60% dos leads travados por
    // aquela objecao teriam comprado. Medido em 10/10/2026: lead `stalled`
    // compra em 1,0% dos casos e `lost` em 0,0%. Nao em 60%.
    //
    // E nao ha como medir o contrafactual: ninguem sabe quantos COMPRARIAM se
    // a objecao fosse resolvida. Entao o cartao passa a responder a pergunta
    // que TEM resposta — qual objecao trava mais negocio — e responde com a
    // contagem, que e fato. Valor em reais aqui so poderia ser chute com cara
    // de medida, que e o defeito que este arquivo inteiro veio corrigir.
    ? { label: mostExpEntry[0], leads: mostExpEntry[1] }
    : { label: "Nenhuma detectada", leads: 0 };

  // 7. Indicações
  const referralCount = leads.filter(l => {
    const allText = l.messages.map(m => m.body).join(" ").toLowerCase();
    return REFERRAL_KW.some(kw => allText.includes(kw));
  }).length;

  // 8. Modelos mais pedidos
  const modelCount: Record<string, number> = {};
  for (const lead of leads) {
    const allText = lead.messages.map(m => m.body).join(" ").toLowerCase();
    const matched = new Set<string>();
    for (const [kw, label] of Object.entries(MODELS_KW)) {
      if (allText.includes(kw) && !matched.has(label)) {
        matched.add(label);
        modelCount[label] = (modelCount[label] || 0) + 1;
      }
    }
  }
  const topModels = Object.entries(modelCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([model, count]) => ({ model, count }));

  // 9. Horário de pico
  const hourCount: Record<string, number> = {};
  for (const lead of leads) {
    for (const msg of lead.messages) {
      if (!msg.isStore && msg.time) {
        const hour = msg.time.split(":")[0];
        if (hour) hourCount[hour] = (hourCount[hour] || 0) + 1;
      }
    }
  }
  const peakHours = Object.entries(hourCount)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([hour, count]) => ({ hour: `${hour}h`, count }));

  // 10. Taxa de reativação
  const reactivated = leads.filter(l => {
    if (!["followup","warm","hot"].includes(l.classification)) return false;
    const msgs = l.messages;
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i-1].date; const curr = msgs[i].date;
      if (prev && curr && (new Date(curr).getTime() - new Date(prev).getTime()) / 86400000 >= 3 && !msgs[i].isStore) return true;
    }
    return false;
  });
  const stalledFollowup = leads.filter(l => ["stalled","followup"].includes(l.classification));
  const reactivationRate = stalledFollowup.length > 0 ? Math.round((reactivated.length / stalledFollowup.length) * 100) : 0;

  // ── Seller distribution ──────────────────────────────────────────────────────
  const sellerCount: Record<string, number> = {};
  for (const lead of leads) {
    const seller = lead.sellerName || "Loja";
    sellerCount[seller] = (sellerCount[seller] || 0) + 1;
  }
  const sellerDistribution = Object.entries(sellerCount)
    .sort((a, b) => b[1] - a[1])
    .map(([seller, count]) => ({ seller, count }));

  // ── 11. Chamou pelo nome ─────────────────────────────────────────────────────
  // Detect if seller used the contact's first name in any message
  const calledByName = leads.filter(l => {
    const firstName = l.contact.split(" ")[0].toLowerCase().trim();
    if (firstName.length < 3) return false;
    return l.messages.some(m => m.isStore && m.body.toLowerCase().includes(firstName));
  }).length;

  // ── 12. Pediu indicação ───────────────────────────────────────────────────────
  const REFERRAL_ASK_KW = [
    "indica", "indicação", "indicar", "me indica", "conhece alguém",
    "tem alguém", "alguém que queira", "amigo que queira", "familiar",
    "você conhece", "nos indica", "nos recomendar", "recomenda"
  ];
  const askedReferral = leads.filter(l =>
    l.messages.some(m => m.isStore && REFERRAL_ASK_KW.some(kw => m.body.toLowerCase().includes(kw)))
  ).length;

  // ── 13. Última mensagem da loja ───────────────────────────────────────────────
  // Conversations where the LAST message was from the store (good practice)
  // vs last message was from the lead (store didn't close the conversation)
  const lastMsgStore = leads.filter(l => {
    const msgs = l.messages.filter(m => m.body && m.body.trim());
    if (msgs.length === 0) return false;
    return msgs[msgs.length - 1].isStore;
  }).length;
  const lastMsgLead = leads.length - lastMsgStore;
  const lastMsgStorePct = leads.length > 0 ? Math.round((lastMsgStore / leads.length) * 100) : 0;

  // ── Qual sinal PREVE, e nao apenas aparece ───────────────────────────────
  //
  // A lista `topBuySignals` ordena por frequencia, e frequencia engana: "Pediu
  // 18x" e o 3o mais contado (396 leads) e aparece em 21% de quem comprou
  // contra 19% de quem nao comprou — nao separa nada. "Perguntou sobre
  // entrega" aparece em 39% contra 7%: e o mais forte, e estava enterrado na
  // lista por ser menos comum.
  //
  // `diferenca` e correlacao, nao causa. Serve para PRIORIZAR atendimento,
  // nunca para afirmar que perguntar de entrega faz comprar.
  const nDemais = leads.length - compradores.length;
  const signalLift = fatos && compradores.length > 0
    ? Object.entries(sinalPorGrupo)
        .filter(([, d]) => d.c + d.n >= 25)
        .map(([label, d]) => {
          const pctCompradores = Math.round((d.c / compradores.length) * 100);
          const pctDemais = nDemais > 0 ? Math.round((d.n / nDemais) * 100) : 0;
          return { label, compradores: d.c, pctCompradores, pctDemais, diferenca: pctCompradores - pctDemais };
        })
        .sort((a, b) => b.diferenca - a.diferenca)
        .slice(0, 8)
    : null;

  return {
    total: leads.length,
    customer: count("customer"), hot: count("hot"), warm: count("warm"),
    followup: count("followup"), stalled: count("stalled"), lost: count("lost"), unqualified: count("unqualified"),
    avgScore: leads.length > 0 ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0,
    avgDaysInactive: leads.length > 0 ? Math.round(leads.reduce((a, l) => a + l.daysInactive, 0) / leads.length) : 0,
    topObjections: Object.entries(objCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count })),
    topBuySignals: Object.entries(signalCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count })),
    profileDistribution: Object.entries(profileCount).sort((a, b) => b[1] - a[1]).map(([profile, count]) => ({ profile, count })),
    inactivityRanges: inactivityTraffic.map(({ range, count }) => ({ range, count })),
    conversionRate, avgDaysToClose, pipelineValue, ghostRate,
    inactivityTraffic, mostExpensiveObjection, referralCount, topModels, peakHours, reactivationRate,
    sellerDistribution,
    calledByName, calledByNamePct: leads.length > 0 ? Math.round((calledByName / leads.length) * 100) : 0,
    askedReferral, askedReferralPct: leads.length > 0 ? Math.round((askedReferral / leads.length) * 100) : 0,
    lastMsgStore, lastMsgLead, lastMsgStorePct,
    // Os tres viajam juntos de proposito: valor sem origem e valor sem defesa.
    ticketMedido: fatos?.ticket ?? null,
    vendasNaConta: fatos?.vendas ?? 0,
    coberturaDaPonte: fatos?.cobertura ?? 0,
    compradoresComprovados: compradores.length,
    signalLift,
    // As taxas viajam para a tela poder MOSTRAR de onde o pipeline saiu. Numero
    // em reais sem a taxa ao lado e exatamente o que estava errado antes.
    taxaFechamentoHot: Math.round(taxaHot * 1000) / 10,
    taxaFechamentoWarm: Math.round(taxaWarm * 1000) / 10,
  };
}

// ── Period Comparison ─────────────────────────────────────────────────────────
export interface PeriodStats {
  total: number;
  customers: number;
  hot: number;
  conversionRate: number;
  avgScore: number;
  pipelineValue: number;
  avgDaysInactive: number;
}

export interface PeriodComparison {
  current: PeriodStats;
  previous: PeriodStats;
  deltas: { [K in keyof PeriodStats]: number }; // positive = melhora
}

function buildPeriodStats(leads: Lead[], ticket: number, taxaHot: number, taxaWarm: number): PeriodStats {
  const customers = leads.filter(l => l.classification === "customer").length;
  const hot       = leads.filter(l => l.classification === "hot").length;
  const hotL      = leads.filter(l => l.classification === "hot");
  const warmL     = leads.filter(l => l.classification === "warm");
  // Mesmo ticket e mesmas taxas MEDIDAS do painel. Aqui tambem era 5200 com
  // 70%/25% escritos a mao — e o real e 2,8% e 0,0%.
  const pipeline  = Math.round(hotL.length * ticket * taxaHot + warmL.length * ticket * taxaWarm);
  return {
    total: leads.length,
    customers,
    hot,
    conversionRate: leads.length > 0 ? Math.round((customers / leads.length) * 100) : 0,
    avgScore: leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0,
    pipelineValue: pipeline,
    avgDaysInactive: leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.daysInactive, 0) / leads.length) : 0,
  };
}

export function comparePeriods(
  leads: Lead[],
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date,
  /** Ticket medido (stats.ticketMedido). Sem ele o pipeline do periodo e zero. */
  ticket = 0,
  /** Taxas MEDIDAS de fechamento, em fracao (stats.taxaFechamento* / 100). */
  taxaHot = 0,
  taxaWarm = 0,
): PeriodComparison {
  function inRange(l: Lead, s: Date, e: Date) {
    if (!l.firstDate) return false;
    const d = new Date(l.firstDate);
    return d >= s && d <= e;
  }
  const curr = leads.filter(l => inRange(l, currentStart, currentEnd));
  const prev = leads.filter(l => inRange(l, previousStart, previousEnd));
  const c = buildPeriodStats(curr, ticket, taxaHot, taxaWarm);
  const p = buildPeriodStats(prev, ticket, taxaHot, taxaWarm);

  // Positive delta = improvement for all metrics except daysInactive (lower = better)
  const delta = (ck: keyof PeriodStats, invert = false) => {
    const diff = c[ck] - p[ck];
    return invert ? -diff : diff;
  };

  return {
    current: c, previous: p,
    deltas: {
      total:           delta("total"),
      customers:       delta("customers"),
      hot:             delta("hot"),
      conversionRate:  delta("conversionRate"),
      avgScore:        delta("avgScore"),
      pipelineValue:   delta("pipelineValue"),
      avgDaysInactive: delta("avgDaysInactive", true), // lower inactive = better
    },
  };
}
