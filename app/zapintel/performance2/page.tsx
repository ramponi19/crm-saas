"use client";
import { useMemo, useState } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { computePerformance2 } from "@/lib/zapintel/insights/performance2";
import { ScoreRing, UrgencyDot } from "@/components/zapintel/ui/atoms";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadialBarChart, RadialBar, PieChart, Pie,
} from "recharts";
import {
  Zap, TrendingUp, TrendingDown, Minus, AlertTriangle,
  MessageSquare, Activity, Clock, BarChart2, Flame,
} from "lucide-react";

const TT = { contentStyle: { background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--txt)", fontSize: 12 } };

function fmtMin(m: number) {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function DeltaBadge({ value, invert = false, suffix = "" }: { value: number; invert?: boolean; suffix?: string }) {
  const up = invert ? value < 0 : value > 0;
  const neutral = value === 0;
  const color = neutral ? "var(--muted)" : up ? "var(--green)" : "var(--red)";
  const Icon = neutral ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color }}>
      <Icon size={11} />{Math.abs(value)}{suffix}
    </span>
  );
}

const SECTION_TABS = [
  { id: "speed",     label: "⚡ Velocidade",    icon: Zap },
  { id: "engage",    label: "💬 Engajamento",   icon: MessageSquare },
  { id: "sentiment", label: "🧠 Sentimento",    icon: Activity },
  { id: "scoring",   label: "🎯 Score Dinâmico",icon: Flame },
  { id: "funnel",    label: "🔽 Funil",          icon: BarChart2 },
  { id: "exit",      label: "🚪 Saída",          icon: AlertTriangle },
  { id: "heatmap",   label: "🗓 Mapa de Calor",  icon: Clock },
  { id: "talk",      label: "🗣 Proporção Fala", icon: MessageSquare },
  { id: "price",     label: "💰 Tempo de Preço", icon: TrendingUp },
];

export default function Performance2Page() {
  const { leads, loaded, loadSample, sellerName } = useLeads();
  const vend = sellerName.toLowerCase();
  const [activeTab, setActiveTab] = useState("speed");

  const stats = useMemo(() => loaded && leads.length ? computePerformance2(leads) : null, [leads, loaded]);

  if (!loaded) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <BarChart2 size={40} color="var(--purple)" />
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>Performance II</h2>
      <p style={{ color: "var(--dim)", fontSize: 13 }}>Importe leads para ver os indicadores avançados.</p>
      <button onClick={loadSample} style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        Carregar dados de exemplo
      </button>
    </div>
  );

  if (!stats) return null;

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpis = [
    { label: "Resposta média",    value: fmtMin(stats.avgSellerResponseMinutes), color: stats.avgSellerResponseMinutes < 30 ? "var(--green)" : "var(--red)", emoji: "⚡" },
    { label: "Ratio engaj. lead", value: `${stats.avgLeadResponseRatio}x`,       color: stats.avgLeadResponseRatio >= 1 ? "var(--green)" : "var(--yellow)", emoji: "💬" },
    { label: "Sentimento médio",  value: `${stats.avgSentimentScore > 0 ? "+" : ""}${stats.avgSentimentScore}`, color: stats.avgSentimentScore >= 0 ? "var(--green)" : "var(--red)", emoji: "🧠" },
    { label: "Leads críticos",    value: String(stats.criticalLeads),             color: stats.criticalLeads > 0 ? "var(--red)" : "var(--green)", emoji: "🔥" },
    { label: "Intenção de saída", value: String(stats.exitIntentTotal),           color: stats.exitIntentTotal > 0 ? "var(--orange)" : "var(--green)", emoji: "🚪" },
    { label: "Fala do lead",      value: `${stats.avgLeadTalkPct}%`,              color: stats.avgLeadTalkPct >= 40 ? "var(--green)" : "var(--yellow)", emoji: "🗣" },
    { label: "Tempo p/ preço",    value: fmtMin(stats.avgPriceResponseMinutes),  color: stats.avgPriceResponseMinutes < 10 ? "var(--green)" : "var(--orange)", emoji: "💰" },
    { label: "Melhor dia",        value: stats.bestDayToClose,                    color: "var(--purple-l)", emoji: "📅" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart2 size={22} color="var(--purple)" /> Performance II
        </h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>9 indicadores avançados de comportamento comercial — baseados nas melhores práticas do mercado</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 8, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 16, marginBottom: 6 }}>{k.emoji}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: k.color, letterSpacing: -.5, marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", lineHeight: 1.4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {SECTION_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: activeTab === t.id ? 700 : 400,
            background: activeTab === t.id ? "var(--purple)" : "var(--card2)",
            border: `1px solid ${activeTab === t.id ? "var(--purple)" : "var(--brd2)"}`,
            color: activeTab === t.id ? "#fff" : "var(--dim)", cursor: "pointer", transition: "all .15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── 1. VELOCIDADE DE RESPOSTA ───────────────────────────────────────── */}
      {activeTab === "speed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {/* Speed dist */}
            <div className="card" style={{ padding: 20, gridColumn: "span 2" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>⚡ Distribuição de Velocidade de Resposta</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.speedDistribution} barSize={28}>
                  <XAxis dataKey="range" tick={{ fill: "var(--dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...TT} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.speedDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Summary */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📊 Resumo</div>
              {[
                { label: "Respondidos em < 5min",  value: `${stats.pctUnder5min}%`,  color: stats.pctUnder5min >= 50 ? "var(--green)" : "var(--red)" },
                { label: "Respondidos em < 30min", value: `${stats.pctUnder30min}%`, color: stats.pctUnder30min >= 70 ? "var(--green)" : "var(--yellow)" },
                { label: "Média geral",            value: fmtMin(stats.avgSellerResponseMinutes), color: "var(--blue)" },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: r.color }}>{r.value}</span>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6, borderTop: "1px solid var(--brd)", paddingTop: 10, marginTop: 4 }}>
                💡 Leads respondidos em menos de 5min têm até <strong style={{ color: "var(--green)" }}>9x mais chance</strong> de converter.
              </div>
            </div>
          </div>

          {/* Top slow leads */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🐢 Conversas com resposta mais lenta (média)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
              {stats.sellerSpeedByLead.filter(s => s.rating === "slow" || s.rating === "very_slow").slice(0, 8).map(s => (
                <Link key={s.leadId} href={`/zapintel/leads/${s.leadId}`} style={{ textDecoration: "none" }}>
                  <div className="card2" style={{ padding: "10px 12px", borderLeft: `3px solid ${s.rating === "very_slow" ? "var(--red)" : "var(--orange)"}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{s.contact}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.rating === "very_slow" ? "var(--red)" : "var(--orange)" }}>{fmtMin(s.avgMinutes)}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>média · {s.samples} respostas</div>
                  </div>
                </Link>
              ))}
              {stats.sellerSpeedByLead.filter(s => s.rating === "slow" || s.rating === "very_slow").length === 0 && (
                <div style={{ color: "var(--green)", fontSize: 13 }}>✅ Todas as respostas dentro do tempo ideal!</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. TAXA DE RESPOSTA DO LEAD ────────────────────────────────────── */}
      {activeTab === "engage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💬 Ratio de Engajamento</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>mensagens do lead ÷ mensagens do {vend} — maior = mais engajado</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: stats.avgLeadResponseRatio >= 1 ? "var(--green)" : "var(--yellow)", marginBottom: 4 }}>
                {stats.avgLeadResponseRatio}x
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 14 }}>média geral — ideal acima de 1x</div>
              <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 Quando o {vend} manda mais do que o lead responde, o lead está <strong style={{ color: "var(--yellow)" }}>desengajado</strong>. Revisar abordagem.
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>⚠ Risco de Ghost</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: stats.ghostRisk > 5 ? "var(--red)" : "var(--green)", marginBottom: 4 }}>
                {stats.ghostRisk}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
                leads onde o {vend} enviou 3+ msgs seguidas sem resposta
              </div>
              <div style={{ height: 6, background: "var(--brd)", borderRadius: 3 }}>
                <div style={{ width: `${Math.min(100, (stats.ghostRisk / leads.length) * 100)}%`, height: "100%", background: "var(--red)", borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
                {Math.round((stats.ghostRisk / leads.length) * 100)}% do total de leads
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📋 Engajamento por Lead — Top 15</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {stats.leadResponseByLead.slice(0, 15).map(l => {
                const total = l.leadMessages + l.storeMessages;
                const leadPct = total > 0 ? Math.round((l.leadMessages / total) * 100) : 0;
                const isHealthy = l.ratio >= 1;
                return (
                  <div key={l.leadId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link href={`/zapintel/leads/${l.leadId}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", textDecoration: "none", width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.contact}
                    </Link>
                    <div style={{ flex: 1, height: 8, background: "var(--brd)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ display: "flex", height: "100%" }}>
                        <div style={{ width: `${leadPct}%`, background: isHealthy ? "var(--green)" : "var(--yellow)", transition: "width .5s" }} />
                        <div style={{ flex: 1, background: "var(--brd2)" }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isHealthy ? "var(--green)" : "var(--yellow)", width: 32, textAlign: "right" }}>{l.ratio}x</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", width: 80, textAlign: "right" }}>{l.leadMessages}↑ {l.storeMessages}↓</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. SENTIMENTO ──────────────────────────────────────────────────── */}
      {activeTab === "sentiment" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Arc distribution */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🧠 Arco de Sentimento das Conversas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {([
                  { key: "warming",         label: "Aquecendo 🔥",          color: "#f97316" },
                  { key: "stable_positive", label: "Positivo estável ✅",   color: "#22c55e" },
                  { key: "volatile",        label: "Volátil 🎢",             color: "#a78bfa" },
                  { key: "cooling",         label: "Esfriando 🧊",           color: "#60a5fa" },
                  { key: "stable_negative", label: "Negativo estável ⚠",    color: "#ef4444" },
                ] as const).map(({ key, label, color }) => {
                  const count = stats.sentimentSummary[key];
                  const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} <span style={{ color: "var(--muted)", fontSize: 10 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 5, background: "var(--brd)", borderRadius: 3 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Score card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📊 Score de Sentimento Médio</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: stats.avgSentimentScore >= 20 ? "var(--green)" : stats.avgSentimentScore <= -20 ? "var(--red)" : "var(--yellow)", marginBottom: 8, letterSpacing: -2 }}>
                {stats.avgSentimentScore > 0 ? "+" : ""}{stats.avgSentimentScore}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>escala de -100 (negativo) a +100 (positivo)</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
                {stats.avgSentimentScore >= 20
                  ? "✅ Leads demonstrando interesse real nas conversas."
                  : stats.avgSentimentScore <= -20
                  ? "⚠ Maioria das conversas com tom negativo — revisar abordagem."
                  : "➡ Sentimento neutro — oportunidade de aquecimento."}
              </div>
            </div>
          </div>

          {/* Top leads by sentiment */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--green)" }}>✅ Conversas mais positivas</div>
              {stats.sentimentByLead.filter(s => s.sentimentScore > 0).slice(0, 6).map(s => (
                <Link key={s.leadId} href={`/zapintel/leads/${s.leadId}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)" }}>{s.contact}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.arcLabel}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--green)" }}>+{s.sentimentScore}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--red)" }}>⚠ Conversas em risco</div>
              {stats.sentimentByLead.filter(s => s.arc === "cooling" || s.arc === "stable_negative").slice(0, 6).map(s => (
                <Link key={s.leadId} href={`/zapintel/leads/${s.leadId}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)" }}>{s.contact}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.arcLabel}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>{s.sentimentScore}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. DYNAMIC SCORING ─────────────────────────────────────────────── */}
      {activeTab === "scoring" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[
              { label: "Decaimento médio", value: `-${stats.avgDecay}pts`, color: "var(--orange)", tip: "pontos perdidos por inatividade" },
              { label: "Leads críticos",   value: String(stats.criticalLeads), color: "var(--red)", tip: "score ajustado abaixo de 30" },
              { label: "Score dinâmico",   value: `${stats.dynamicScores[0]?.adjustedScore ?? 0}`, color: "var(--purple-l)", tip: "melhor score ajustado atual" },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{k.tip}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🎯 Score Base vs Score Ajustado (Top 20)</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>Score ajustado leva em conta: inatividade (-pts), engajamento (+pts), intenção de saída (-pts)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {stats.dynamicScores.slice(0, 20).map(d => {
                const diff = d.adjustedScore - d.baseScore;
                const trendColor = d.trend === "rising" ? "var(--green)" : d.trend === "falling" ? "var(--orange)" : d.trend === "critical" ? "var(--red)" : "var(--muted)";
                const trendEmoji = d.trend === "rising" ? "↑" : d.trend === "falling" ? "↓" : d.trend === "critical" ? "⚠" : "→";
                return (
                  <div key={d.leadId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link href={`/zapintel/leads/${d.leadId}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", textDecoration: "none", width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.contact}
                    </Link>
                    <div style={{ flex: 1, position: "relative", height: 8, background: "var(--brd)", borderRadius: 4 }}>
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${d.baseScore}%`, background: "var(--brd2)", borderRadius: 4 }} />
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${d.adjustedScore}%`, background: trendColor, borderRadius: 4, opacity: .8 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted)", width: 28, textAlign: "right" }}>{d.baseScore}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: trendColor, width: 40, textAlign: "right" }}>{trendEmoji}{d.adjustedScore}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. FUNIL COM TEMPO ─────────────────────────────────────────────── */}
      {activeTab === "funnel" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20 }}>🔽 Funil de Conversão com Tempo Médio por Etapa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {stats.funnelWithTime.map((stage, i) => (
                <div key={stage.stage}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0" }}>
                    {/* Bar */}
                    <div style={{ width: `${Math.max(4, stage.pct)}%`, minWidth: 4, height: 36, background: stage.color, borderRadius: 6, transition: "width .5s", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{stage.stage}</div>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>{stage.count} leads <span style={{ color: stage.color, fontWeight: 700 }}>({stage.pct}%)</span></span>
                        <span style={{ fontSize: 11, color: "var(--teal)" }}>⏱ {stage.avgDaysInStage}d em média nesta etapa</span>
                        {i > 0 && stage.dropPct > 0 && (
                          <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>↓ {stage.dropPct}% abandono</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: stage.color, minWidth: 50, textAlign: "right" }}>{stage.count}</div>
                  </div>
                  {i < stats.funnelWithTime.length - 1 && <div style={{ height: 1, background: "var(--brd)" }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Bottleneck insight */}
          {(() => {
            const bottleneck = stats.funnelWithTime.slice(1).sort((a, b) => b.dropPct - a.dropPct)[0];
            if (!bottleneck) return null;
            return (
              <div style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <AlertTriangle size={18} color="var(--red)" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 2 }}>Gargalo principal: {bottleneck.stage}</div>
                  <div style={{ fontSize: 12, color: "var(--dim)" }}>{bottleneck.dropPct}% dos leads abandonam nesta etapa — foco aqui tem maior impacto na conversão.</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 6. INTENÇÃO DE SAÍDA ───────────────────────────────────────────── */}
      {activeTab === "exit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🚪 Leads com intenção de saída detectada</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: stats.exitIntentTotal > 0 ? "var(--orange)" : "var(--green)", marginBottom: 4 }}>
                {stats.exitIntentTotal}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>leads com frase de abandono nas últimas mensagens</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
                Frases como "vou pensar", "depois te falo" e "to pesquisando" são sinais de que o lead está saindo. Intervir nas próximas 24h dobra a chance de reconversão.
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📋 Frases de saída mais comuns</div>
              {(() => {
                const counts: Record<string, number> = {};
                stats.exitIntentAlerts.forEach(a => { counts[a.phrase] = (counts[a.phrase] || 0) + 1; });
                return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([phrase, count]) => (
                  <div key={phrase} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--brd)" }}>
                    <span style={{ fontSize: 12, color: "var(--dim)" }}>"{phrase}"</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--orange)" }}>{count}x</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>⚠ Leads para agir AGORA</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.exitIntentAlerts.length === 0 ? (
                <div style={{ color: "var(--green)", fontSize: 13 }}>✅ Nenhuma intenção de saída detectada recentemente!</div>
              ) : stats.exitIntentAlerts.slice(0, 10).map(alert => (
                <Link key={alert.leadId} href={`/zapintel/leads/${alert.leadId}`} style={{ textDecoration: "none" }}>
                  <div className="card2" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, borderLeft: "3px solid var(--orange)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{alert.contact}</div>
                      <div style={{ fontSize: 11, color: "var(--orange)" }}>"{alert.phrase}" · {alert.daysAgo === 0 ? "hoje" : `${alert.daysAgo}d atrás`}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }}>Score: {alert.score}</div>
                      <UrgencyDot urgency={alert.urgency as any} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 7. MAPA DE CALOR ───────────────────────────────────────────────── */}
      {activeTab === "heatmap" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 4 }}>
            {[
              { label: "Melhor dia", value: stats.bestDayToClose, color: "var(--green)", tip: "maior taxa de conversão" },
              { label: "Melhor horário", value: `${stats.bestHourToClose}h`, color: "var(--purple-l)", tip: "mais conversões registradas" },
              { label: "Dia mais fraco", value: stats.worstDay, color: "var(--red)", tip: "menor taxa de conversão" },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{k.tip}</div>
              </div>
            ))}
          </div>

          {/* Heatmap grid — hours 8-22, Mon-Sat */}
          <div className="card" style={{ padding: 20, overflowX: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🗓 Mapa de Calor — Leads por Dia e Horário</div>
            <div style={{ display: "grid", gridTemplateColumns: "40px repeat(7,1fr)", gap: 3, minWidth: 500 }}>
              {/* Header */}
              <div />
              {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => (
                <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textAlign: "center", paddingBottom: 4 }}>{d}</div>
              ))}
              {/* Rows: hours 7–22 */}
              {Array.from({ length: 16 }, (_, hi) => hi + 7).map(hour => (
                <>
                  <div key={`h${hour}`} style={{ fontSize: 9, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>{hour}h</div>
                  {[0,1,2,3,4,5,6].map(dayIdx => {
                    const cell = stats.heatmap.find(c => c.dayIndex === dayIdx && c.hour === hour);
                    const count = cell?.leadCount || 0;
                    const maxCount = Math.max(1, ...stats.heatmap.map(c => c.leadCount));
                    const intensity = count / maxCount;
                    const bg = count === 0
                      ? "var(--brd)"
                      : `rgba(124,92,252,${0.1 + intensity * 0.85})`;
                    return (
                      <div key={`${dayIdx}_${hour}`} title={`${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dayIdx]} ${hour}h — ${count} leads`}
                        style={{ height: 28, borderRadius: 4, background: bg, display: "flex", alignItems: "center", justifyContent: "center", cursor: count > 0 ? "default" : undefined }}>
                        {count > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: intensity > .5 ? "#fff" : "var(--purple-l)" }}>{count}</span>}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>Cor mais intensa = mais leads naquele horário</div>
          </div>
        </div>
      )}

      {/* ── 8. PROPORÇÃO FALA ──────────────────────────────────────────────── */}
      {activeTab === "talk" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[
              { label: "Fala média do lead",    value: `${stats.avgLeadTalkPct}%`,      color: stats.avgLeadTalkPct >= 40 ? "var(--green)" : "var(--yellow)", tip: "% das palavras que são do lead" },
              { label: "Conversas saudáveis",   value: String(stats.healthyConversations), color: "var(--green)", tip: "lead fala 40%+ do total" },
              { label: `Fala média do ${sellerName}`,   value: `${100 - stats.avgLeadTalkPct}%`, color: "var(--blue)", tip: `% das palavras do ${vend}` },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{k.tip}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🗣 Proporção de Fala por Lead</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
              🟢 Saudável (lead 40%+) · 🟡 Atenção (25-40%) · 🔴 Crítico (lead &lt; 25%)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {stats.talkRatios.slice(0, 20).map(t => {
                const healthColor = t.health === "healthy" ? "var(--green)" : t.health === "warning" ? "var(--yellow)" : "var(--red)";
                return (
                  <div key={t.leadId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 10, width: 8, height: 8, borderRadius: "50%", background: healthColor, flexShrink: 0, display: "inline-block" }} />
                    <Link href={`/zapintel/leads/${t.leadId}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", textDecoration: "none", width: 120, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.contact}
                    </Link>
                    <div style={{ flex: 1, height: 10, background: "var(--brd)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ display: "flex", height: "100%" }}>
                        <div style={{ width: `${t.leadPct}%`, background: healthColor, transition: "width .5s" }} title={`Lead: ${t.leadPct}%`} />
                        <div style={{ flex: 1, background: "var(--blue)", opacity: .5 }} title={`${sellerName}: ${t.storePct}%`} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: healthColor, width: 38, textAlign: "right" }}>{t.leadPct}%</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", width: 36, textAlign: "right" }}>/{t.storePct}%</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 10, color: "var(--muted)" }}>
              <span>🟩 Lead fala · 🟦 {sellerName} fala</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 9. TEMPO DE RESPOSTA AO PREÇO ──────────────────────────────────── */}
      {activeTab === "price" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[
              { label: "Tempo médio pra responder preço", value: fmtMin(stats.avgPriceResponseMinutes), color: stats.avgPriceResponseMinutes < 10 ? "var(--green)" : "var(--orange)" },
              { label: "Conversão: resposta < 10min",      value: `${stats.priceResponseImpact.fast}%`,  color: "var(--green)" },
              { label: "Conversão: resposta > 10min",      value: `${stats.priceResponseImpact.slow}%`,  color: "var(--red)" },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", lineHeight: 1.4 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {stats.priceResponseImpact.fast > 0 && stats.priceResponseImpact.slow > 0 && (
            <div style={{
              background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.25)",
              borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 28 }}>⚡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", marginBottom: 2 }}>
                  Resposta rápida converte {stats.priceResponseImpact.fast - stats.priceResponseImpact.slow}% mais
                </div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>
                  Quando o {vend} responde o preço em menos de 10 minutos, a conversão sobe de {stats.priceResponseImpact.slow}% para {stats.priceResponseImpact.fast}%.
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>💰 Resposta ao Preço por Lead</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {stats.priceResponseByLead.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma pergunta de preço detectada nas conversas.</div>
              ) : stats.priceResponseByLead.sort((a, b) => a.minutesToRespond - b.minutesToRespond).slice(0, 15).map(p => {
                const fast = p.minutesToRespond <= 10;
                const color = fast ? "var(--green)" : p.minutesToRespond <= 30 ? "var(--yellow)" : "var(--red)";
                return (
                  <div key={p.leadId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link href={`/zapintel/leads/${p.leadId}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", textDecoration: "none", width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.contact}
                    </Link>
                    <div style={{ flex: 1, height: 6, background: "var(--brd)", borderRadius: 3 }}>
                      <div style={{ width: `${Math.min(100, (p.minutesToRespond / 120) * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color, width: 60, textAlign: "right" }}>{fmtMin(p.minutesToRespond)}</span>
                    <span style={{ fontSize: 10, width: 60, textAlign: "right", color: p.converted ? "var(--green)" : "var(--muted)" }}>
                      {p.converted ? "✅ Fechou" : "❌ Não fechou"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
