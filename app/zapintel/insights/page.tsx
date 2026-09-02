"use client";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SectionTitle } from "@/components/zapintel/ui/atoms";
import Link from "next/link";
import { MessageSquare, Star, ArrowLeftRight, TrendingUp, AlertTriangle, Users } from "lucide-react";

const TT = { contentStyle: { background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--txt)", fontSize: 12 } };

function MetricCard({ icon, title, value, pct, sub, color, tip, tipColor = "var(--dim)" }: {
  icon: React.ReactNode; title: string; value: number; pct: number;
  sub: string; color: string; tip: string; tipColor?: string;
}) {
  const circumference = 2 * Math.PI * 28;
  const dash = (pct / 100) * circumference;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Donut */}
        <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
          <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="35" cy="35" r="28" fill="none" stroke="var(--brd)" strokeWidth="5" />
            <circle cx="35" cy="35" r="28" fill="none" stroke={color} strokeWidth="5"
              strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{pct}%</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1, marginBottom: 2 }}>{value}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{sub}</div>
          <div style={{ fontSize: 11, color: tipColor, lineHeight: 1.6, padding: "6px 10px", background: `${tipColor}10`, borderRadius: 7, border: `1px solid ${tipColor}20` }}>
            {tip}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const { leads, stats, loaded, sellerName } = useLeads();
  const vend = sellerName.toLowerCase();

  if (!loaded || !stats) return (
    <div style={{ textAlign: "center", paddingTop: 80, color: "var(--dim)" }}>
      As conversas carregam automaticamente do CRM. Use “Sincronizar agora” na barra lateral.
    </div>
  );

  const s = stats;

  // Chart data
  const objData = s.topObjections.map(o => ({ name: o.label.split(" / ")[0], value: o.count, full: o.label }));

  const riskBuckets = [
    { name: "Baixo (0–30%)", value: leads.filter(l => l.lossRisk <= 30).length, color: "var(--green)" },
    { name: "Médio (31–60%)", value: leads.filter(l => l.lossRisk > 30 && l.lossRisk <= 60).length, color: "var(--yellow)" },
    { name: "Alto (61–80%)", value: leads.filter(l => l.lossRisk > 60 && l.lossRisk <= 80).length, color: "var(--orange)" },
    { name: "Crítico (81%+)", value: leads.filter(l => l.lossRisk > 80).length, color: "var(--red)" },
  ];

  const topLeads = [...leads].sort((a, b) => b.score - a.score).slice(0, 6);

  // Leads where last message was from the lead (need follow-up)
  const pendingClose = leads.filter(l => {
    const msgs = l.messages.filter(m => m.body?.trim());
    if (msgs.length === 0) return false;
    return !msgs[msgs.length - 1].isStore;
  }).slice(0, 5);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4 }}>Inteligência Comercial</h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>Padrões detectados em {s.total} conversas</p>
      </div>

      {/* ══ 3 NOVAS MÉTRICAS DE QUALIDADE DO ATENDIMENTO ═══════════════════ */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
          <Star size={18} color="var(--yellow)" />
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Qualidade do Atendimento — {sellerName}</h2>
        </div>
        <div style={{ background: "rgba(234,179,8,.06)", border: "1px solid rgba(234,179,8,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--yellow)" }}>DNA de Vendas + Anev:</strong> Chamar pelo nome cria rapport. Pedir indicação no momento certo multiplica clientes. Sempre fechar a conversa pela loja garante a última impressão positiva.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

          {/* Métrica 1: Chamou pelo nome */}
          <MetricCard
            icon={<MessageSquare size={16} color="var(--teal)" />}
            title="Chamou pelo Nome"
            value={s.calledByName}
            pct={s.calledByNamePct}
            sub={`de ${s.total} conversas`}
            color="var(--teal)"
            tip={s.calledByNamePct >= 70
              ? "✓ Excelente rapport! Chamar pelo nome é o primeiro passo para criar conexão."
              : s.calledByNamePct >= 40
              ? "⚠ Pode melhorar. Meta: usar o nome do cliente em pelo menos 70% das conversas."
              : "🔴 Crítico. Usar o nome do cliente aumenta a taxa de resposta em até 35%."}
            tipColor={s.calledByNamePct >= 70 ? "var(--green)" : s.calledByNamePct >= 40 ? "var(--yellow)" : "var(--red)"}
          />

          {/* Métrica 2: Pediu indicação */}
          <MetricCard
            icon={<TrendingUp size={16} color="var(--purple-l)" />}
            title="Pediu Indicação"
            value={s.askedReferral}
            pct={s.askedReferralPct}
            sub={`de ${s.total} conversas`}
            color="var(--purple-l)"
            tip={s.askedReferralPct >= 30
              ? "✓ Boa prática! Indicações custam zero e convertem muito mais."
              : s.askedReferralPct >= 10
              ? "⚠ Poucos pedidos de indicação. Perguntar após a venda pode trazer 2–3 novos leads por cliente."
              : "🔴 Quase nenhuma indicação solicitada. Esse é o canal mais barato de aquisição — explorar mais!"}
            tipColor={s.askedReferralPct >= 30 ? "var(--green)" : s.askedReferralPct >= 10 ? "var(--yellow)" : "var(--red)"}
          />

          {/* Métrica 3: Última mensagem da loja */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <ArrowLeftRight size={16} color="var(--orange)" />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Finalização da Conversa</span>
            </div>

            {/* Split visual */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>✅ Loja fechou</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green)" }}>{s.lastMsgStore} ({s.lastMsgStorePct}%)</span>
              </div>
              <div style={{ height: 10, background: "var(--brd)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${s.lastMsgStorePct}%`, height: "100%", background: "var(--green)", transition: "width .6s" }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>⚠ Cliente falou por último</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--red)" }}>{s.lastMsgLead} ({100 - s.lastMsgStorePct}%)</span>
              </div>
              <div style={{ height: 10, background: "var(--brd)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${100 - s.lastMsgStorePct}%`, height: "100%", background: "var(--red)", transition: "width .6s" }} />
              </div>
            </div>

            <div style={{ fontSize: 11, lineHeight: 1.6, padding: "8px 10px", borderRadius: 7,
              background: s.lastMsgStorePct >= 60 ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)",
              border: `1px solid ${s.lastMsgStorePct >= 60 ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`,
              color: s.lastMsgStorePct >= 60 ? "var(--green)" : "var(--red)",
            }}>
              {s.lastMsgStorePct >= 60
                ? "✓ Boa prática! A loja está finalizando a maioria das conversas."
                : `⚠ ${s.lastMsgLead} conversas com o lead falando por último — o ${vend} precisa retornar essas!`}
            </div>
          </div>
        </div>
      </div>

      {/* Seller distribution */}
      {s.sellerDistribution.length > 1 && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Users size={15} color="var(--blue)" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Atendentes Identificados</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {s.sellerDistribution.map(({ seller, count }) => (
              <div key={seller} className="card2" style={{ padding: "10px 16px", textAlign: "center", minWidth: 100 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--blue)", marginBottom: 4 }}>{count}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)" }}>{seller}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>conversas</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single seller note */}
      {s.sellerDistribution.length === 1 && (
        <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "var(--dim)", display: "flex", gap: 8, alignItems: "center" }}>
          <Users size={13} color="var(--blue)" />
          Atendente identificado: <strong style={{ color: "var(--txt)" }}>{s.sellerDistribution[0]?.seller}</strong> · {s.sellerDistribution[0]?.count} conversas
        </div>
      )}

      {/* Lista de conversas sem resposta da loja */}
      {pendingClose.length > 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={15} color="var(--red)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>
              Conversas aguardando resposta da loja — fechar o loop!
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {pendingClose.map(l => {
              const lastMsg = [...l.messages].reverse().find(m => m.body?.trim());
              return (
                <Link key={l.id} href={`/zapintel/leads/${l.id}`} style={{ textDecoration: "none" }}>
                  <div className="card2" style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "border-color .15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--red)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--brd2)"}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{l.contact}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        “{lastMsg?.body?.substring(0, 80)}{(lastMsg?.body?.length || 0) > 80 ? "…" : ""}”
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, flexShrink: 0 }}>
                      {l.daysInactive === 0 ? "Hoje" : `${l.daysInactive}d sem resposta`}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--purple-l)" }}>Responder →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ CHARTS ══════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
          <AlertTriangle size={18} color="var(--orange)" />
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Riscos e Oportunidades</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <SectionTitle>Risco de perda dos leads</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={riskBuckets} barSize={32}>
                <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TT} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {riskBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <SectionTitle>Top objeções detectadas</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={objData} layout="vertical" barSize={18}>
                <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: "var(--txt)", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip formatter={(v, _, p) => [v, p.payload.full]} {...TT} />
                <Bar dataKey="value" fill="var(--yellow)" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ══ INSIGHTS + AÇÕES ════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>🏆 Leads com maior score</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topLeads.map((l, _i) => (
              <Link key={l.id} href={`/zapintel/leads/${l.id}`} style={{ textDecoration: "none" }}>
                <div className="card2" style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--purple)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--brd2)")}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--purple-l)", width: 28, textAlign: "center" }}>{l.score}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{l.contact}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{l.buyerProfile}</div>
                  </div>
                  <span style={{ fontSize: 10, color: l.daysInactive <= 2 ? "var(--green)" : "var(--red)" }}>
                    {l.daysInactive === 0 ? "Hoje" : `${l.daysInactive}d`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>🎯 Ações recomendadas para esta semana</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { num: s.lastMsgLead, label: "conversas aguardando resposta da loja", col: "var(--red)" },
              { num: leads.filter(l => l.classification === "hot").length, label: "leads quentes para fechar esta semana", col: "var(--orange)" },
              { num: s.total - s.calledByName, label: `leads que o ${vend} ainda não chamou pelo nome`, col: "var(--teal)" },
              { num: s.total - s.askedReferral, label: "conversas sem pedido de indicação", col: "var(--purple-l)" },
              { num: leads.filter(l => l.classification === "customer").length, label: "clientes para pedir indicação e recompra", col: "var(--green)" },
            ].map(({ num, label, col }) => (
              <div key={label} className="card2" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: col, width: 36, textAlign: "center", flexShrink: 0 }}>{num}</div>
                <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
