"use client";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { SectionTitle, ScoreRing, Badge, UrgencyDot } from "@/components/zapintel/ui/atoms";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, 
} from "recharts";
import Link from "next/link";
import { ArrowRight, TrendingUp, TrendingDown, Clock, DollarSign, Ghost, Users, ShoppingBag, Zap } from "lucide-react";

const PIE_COLORS = ["#4ade80","#f87171","#facc15","#fb923c","#c084fc","#9ca3af","#6b7280"];
const TT = { contentStyle: { background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--txt)", fontSize: 12 } };

function formatCurrency(v: number) {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v/1000).toFixed(0)}k`;
  return `R$ ${v}`;
}

export default function DashboardPage() {
  const { leads, stats, loaded, loading, loadSample, storeName, lojas, lojaAtiva } = useLeads();

  // Com o recorte por loja, o título precisa dizer QUAL recorte está na tela —
  // senão "Dashboard — JM Store Importados" fica no alto enquanto os números
  // embaixo são só os de Jaguariúna.
  const ondeEstou = lojaAtiva == null
    ? storeName
    : (lojas.find(l => l.id === lojaAtiva)?.nome ?? storeName);

  if (!loaded) return <EmptyState loading={loading} onLoad={loadSample} />;

  const s = stats!;

  const pieData = [
    { name: "Clientes",   value: s.customer },
    { name: "Quentes",    value: s.hot },
    { name: "Mornos",     value: s.warm },
    { name: "Follow-up",  value: s.followup },
    { name: "Estagnados", value: s.stalled },
    { name: "Perdidos",   value: s.lost },
    { name: "Sem engaj.", value: s.unqualified },
  ].filter(d => d.value > 0);

  const urgent = leads
    .filter(l => l.urgency === "critical" || l.classification === "hot")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4 }}>
          Dashboard{ondeEstou ? ` — ${ondeEstou}` : ""}
        </h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>
          {s.total} conversas · Score médio {s.avgScore}/100 · Inatividade média {s.avgDaysInactive}d
        </p>
      </div>

      {/* ── Alert bar ──────────────────────────────────────────────────────── */}
      {leads.filter(l => l.urgency === "critical").length > 0 && (
        <div style={{
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)",
          borderRadius: 12, padding: "11px 16px", marginBottom: 18,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <strong style={{ color: "var(--red)", fontSize: 13 }}>
            {leads.filter(l => l.urgency === "critical").length} leads críticos
          </strong>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>precisam de ação imediata</span>
          <Link href="/zapintel/leads?filter=hot" style={{
            marginLeft: "auto", background: "var(--red)", color: "#fff", borderRadius: 8,
            padding: "5px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none",
            display: "flex", alignItems: "center", gap: 5,
          }}>Ver leads <ArrowRight size={13} /></Link>
        </div>
      )}

      {/* ── KPI Grid principal ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        <ClickStat href="/zapintel/leads?label=Todos+os+Leads"                                                     label="Total Analisado"   value={s.total}    sub={`${s.total} conversas`}     />
        <ClickStat href="/zapintel/leads?filter=customer&label=Clientes+✅"                                        label="Clientes"          value={s.customer} sub="já compraram ✅" color="var(--green)"    />
        <ClickStat href="/zapintel/leads?filter=hot&label=Leads+Quentes+🔥"                                        label="Leads Quentes"     value={s.hot}      sub="fechar agora 🔥" color="var(--red)"      />
        <ClickStat href="/zapintel/leads?filter=followup&label=Follow-up+⚡"                                       label="Follow-up"         value={s.followup} sub="ação urgente ⚡" color="var(--orange)"   />
        <ClickStat href="/zapintel/leads?filter=warm&label=Leads+Mornos"                                           label="Leads Mornos"      value={s.warm}     sub="nutrir"          color="var(--yellow)"   />
        <ClickStat href="/zapintel/leads?filter=stalled&label=Leads+Estagnados"                                    label="Estagnados"        value={s.stalled}  sub="risco de perda"  color="var(--purple-l)" />
        <ClickStat href="/zapintel/leads?filter=lost&label=Leads+Perdidos"                                         label="Perdidos"          value={s.lost}     sub="não fecharam"    color="var(--dim)"      />
        <ClickStat href="/zapintel/leads?score_min=70&label=Score+Alto+%28≥70%29"                                  label="Score Médio"       value={s.avgScore} sub="de 100"           color="var(--blue)"     />
      </div>

      {/* ── NOVAS MÉTRICAS — Row 1 ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>

        {/* Taxa de Conversão */}
        <ClickMetricCard
          href="/zapintel/leads?filter=customer&label=Clientes+Convertidos"
          icon={<TrendingUp size={16} color="#22c55e" />}
          label="Taxa de Conversão"
          value={`${s.conversionRate}%`}
          sub={`${s.customer} de ${s.total} viraram clientes`}
          color="var(--green)"
          detail={s.conversionRate >= 10 ? "✓ Acima da média" : "⚠ Abaixo de 10%"}
          detailColor={s.conversionRate >= 10 ? "var(--green)" : "var(--yellow)"}
        />

        {/* Tempo médio para fechar */}
        <ClickMetricCard
          href="/zapintel/leads?filter=customer&label=Clientes+%E2%80%94+ciclo+de+venda"
          icon={<Clock size={16} color="var(--blue)" />}
          label="Tempo p/ Fechar"
          value={`${s.avgDaysToClose}d`}
          sub="média entre contato e compra"
          color="var(--blue)"
          detail={s.avgDaysToClose <= 7 ? "✓ Dentro do ciclo" : "⚠ Acima do esperado"}
          detailColor={s.avgDaysToClose <= 7 ? "var(--green)" : "var(--orange)"}
        />

        {/* Pipeline */}
        <ClickMetricCard
          href="/zapintel/leads?filter=hot&label=Leads+Quentes+—+Pipeline"
          icon={<DollarSign size={16} color="var(--yellow)" />}
          label="Pipeline Estimado"
          value={formatCurrency(s.pipelineValue)}
          sub={`${s.hot + s.warm} leads com potencial`}
          color="var(--yellow)"
          detail="70% hot · 25% morno"
          detailColor="var(--muted)"
        />

        {/* Ghost Rate */}
        <ClickMetricCard
          href="/zapintel/leads?ghost=1&label=Ghost+Leads+%28sem+engajamento%29"
          icon={<Ghost size={16} color="var(--dim)" />}
          label="Taxa de Ghost"
          value={`${s.ghostRate}%`}
          sub="responderam só com template"
          color={s.ghostRate > 25 ? "var(--red)" : "var(--yellow)"}
          detail={s.ghostRate > 25 ? "⚠ Automação bloqueando leads" : "✓ Aceitável"}
          detailColor={s.ghostRate > 25 ? "var(--red)" : "var(--green)"}
        />

        {/* Indicações */}
        <ClickMetricCard
          href="/zapintel/leads?referral=1&label=Leads+por+Indicação"
          icon={<Users size={16} color="var(--teal)" />}
          label="Leads por Indicação"
          value={s.referralCount}
          sub="contatos via indicação"
          color="var(--teal)"
          detail="Efeito boca a boca ativo"
          detailColor="var(--teal)"
        />
      </div>

      {/* ── NOVAS MÉTRICAS — Row 2 ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>

        {/* Objeção mais cara */}
        <Link href={`/zapintel/leads?objection=${encodeURIComponent(s.mostExpensiveObjection.label)}&label=Objeção+mais+cara%3A+${encodeURIComponent(s.mostExpensiveObjection.label)}`} style={{ textDecoration: "none" }}>
          <div className="card" style={{ padding: 18, cursor: "pointer", transition: "border-color .15s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--red)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--brd)")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <TrendingDown size={15} color="var(--red)" />
              <SectionTitle>Objeção mais cara</SectionTitle>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--red)", marginBottom: 4 }}>
              {formatCurrency(s.mostExpensiveObjection.estimatedLoss)}
            </div>
            <div style={{ fontSize: 13, color: "var(--txt)", marginBottom: 4 }}>{s.mostExpensiveObjection.label}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              Ver leads com essa objeção →
            </div>
          </div>
        </Link>

        {/* Taxa de reativação */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Zap size={15} color="var(--orange)" />
            <SectionTitle>Taxa de Reativação</SectionTitle>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange)", marginBottom: 4 }}>
            {s.reactivationRate}%
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
            leads frios que voltaram a responder
          </div>
          <div style={{ height: 6, background: "var(--brd)", borderRadius: 3 }}>
            <div style={{ width: `${s.reactivationRate}%`, height: "100%", background: "var(--orange)", borderRadius: 3, transition: "width .5s" }} />
          </div>
        </div>

        {/* Modelos mais pedidos preview */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ShoppingBag size={15} color="var(--purple-l)" />
            <SectionTitle>Top 3 Modelos Pedidos</SectionTitle>
          </div>
          {s.topModels.slice(0, 3).map((m, i) => (
            <Link key={m.model} href={`/zapintel/leads?signal=${encodeURIComponent(m.model)}&label=Modelo%3A+${encodeURIComponent(m.model)}`} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: i < 2 ? "1px solid var(--brd)" : "none", cursor: "pointer", borderRadius: 4, transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, width: 16 }}>#{i+1}</span>
                  <span style={{ fontSize: 12, color: "var(--txt)" }}>{m.model}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--purple-l)" }}>{m.count} →</span>
              </div>
            </Link>
          ))}
          <Link href="/zapintel/insights" style={{ fontSize: 11, color: "var(--purple-l)", marginTop: 10, display: "block", textDecoration: "none" }}>
            Ver todos os modelos →
          </Link>
        </div>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Pipeline pie */}
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>Pipeline — {s.total} leads</SectionTitle>
          <ResponsiveContainer width="100%" height={155}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="45%" cy="50%" outerRadius={63} innerRadius={33}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...TT} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 6 }}>
            {pieData.map((d, i) => {
              const clsMap: Record<string,string> = {
                "Clientes":"customer","Quentes":"hot","Mornos":"warm",
                "Follow-up":"followup","Estagnados":"stalled","Perdidos":"lost","Sem engaj.":"unqualified"
              };
              const cls = clsMap[d.name] || "all";
              return (
                <Link key={d.name} href={`/zapintel/leads?filter=${cls}&label=Pipeline%3A+${encodeURIComponent(d.name)}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 4px", borderRadius: 4, transition: "background .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ fontSize: 10, color: "var(--dim)" }}>{d.name}: <strong style={{ color: "var(--txt)" }}>{d.value}</strong></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Semáforo de inatividade */}
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>🚦 Semáforo de Inatividade</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
            {s.inactivityTraffic.map(({ range, count, color }) => {
              const pct = s.total > 0 ? (count / s.total) * 100 : 0;
              // Parse range to get inactive_min/max
              const rangeToParams = (r: string) => {
                if (r.includes("Hoje")) return "inactive_max=0";
                if (r.includes("1–3")) return "inactive_min=1&inactive_max=3";
                if (r.includes("4–7")) return "inactive_min=4&inactive_max=7";
                if (r.includes("8–14")) return "inactive_min=8&inactive_max=14";
                return "inactive_min=15";
              };
              return (
                <Link key={range} href={`/zapintel/leads?${rangeToParams(range)}&label=Inatividade%3A+${encodeURIComponent(range)}`} style={{ textDecoration: "none" }}>
                  <div style={{ cursor: "pointer", marginBottom: 4, padding: "3px 4px", borderRadius: 6, transition: "background .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>{range}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} <span style={{ fontSize: 10, color: "var(--muted)" }}>({Math.round(pct)}%)</span></span>
                    </div>
                    <div style={{ height: 5, background: "var(--brd)", borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .5s" }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Horário de pico + Modelos completo ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Horário de pico */}
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>⏰ Horário de Pico dos Leads</SectionTitle>
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={s.peakHours} barSize={14}>
              <XAxis dataKey="hour" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TT} />
              <Bar dataKey="count" fill="var(--purple)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {s.peakHours.length > 0 && (() => {
            const peak = [...s.peakHours].sort((a, b) => b.count - a.count)[0];
            return <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>Pico: <strong style={{ color: "var(--purple-l)" }}>{peak.hour}</strong> com {peak.count} mensagens</div>;
          })()}
        </div>

        {/* Modelos mais pedidos */}
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>📱 Modelos Mais Pedidos</SectionTitle>
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={s.topModels} layout="vertical" barSize={14}>
              <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="model" type="category" tick={{ fill: "var(--txt)", fontSize: 9 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip {...TT} />
              <Bar dataKey="count" fill="var(--blue)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Prioritários + Objeções ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>🔥 Prioritários — fechar agora</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {urgent.map(l => (
              <Link key={l.id} href={`/zapintel/leads/${l.id}`} style={{ textDecoration: "none" }}>
                <div className="card2" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "border-color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--purple)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--brd2)")}
                >
                  <ScoreRing score={l.score} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{l.contact}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <UrgencyDot urgency={l.urgency} />{l.nextAction}
                    </div>
                  </div>
                  <Badge cls={l.classification} />
                </div>
              </Link>
            ))}
          </div>
          <Link href="/zapintel/leads" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 12, color: "var(--purple-l)", fontSize: 12, textDecoration: "none" }}>
            Ver todos os leads <ArrowRight size={13} />
          </Link>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <SectionTitle>⚠ Objeções Reais Detectadas</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
            {s.topObjections.map(({ label, count }) => (
              <Link key={label} href={`/zapintel/leads?objection=${encodeURIComponent(label)}&label=Objeção%3A+${encodeURIComponent(label)}`} style={{ textDecoration: "none" }}>
                <div className="card2" style={{ padding: "8px 12px", cursor: "pointer", transition: "border-color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--yellow)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--brd2)")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--txt)" }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--yellow)" }}>{count}</span>
                  </div>
                  <div style={{ height: 3, background: "var(--brd)", borderRadius: 2 }}>
                    <div style={{ width: `${(count / s.total) * 100}%`, height: "100%", background: "var(--yellow)", borderRadius: 2 }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <SectionTitle>🧠 Perfis de compradores</SectionTitle>
          {s.profileDistribution.slice(0, 5).map(({ profile, count }) => (
            <Link key={profile} href={`/zapintel/leads?profile=${encodeURIComponent(profile)}&label=Perfil%3A+${encodeURIComponent(profile)}`} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 4px", borderBottom: "1px solid var(--brd)", cursor: "pointer", borderRadius: 4, transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 11, color: "var(--dim)" }}>{profile}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)" }}>{count} →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Sinais de compra ───────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <SectionTitle>✅ Sinais de Compra Mais Detectados</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {s.topBuySignals.map(({ label, count }) => (
            <Link key={label} href={`/zapintel/leads?signal=${encodeURIComponent(label)}&label=Sinal+de+compra%3A+${encodeURIComponent(label)}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)",
                borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6,
                cursor: "pointer", transition: "background .15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(34,197,94,.2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(34,197,94,.1)")}
              >
                <span style={{ fontSize: 12, color: "var(--green)" }}>✓ {label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", opacity: .8 }}>{count}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function ClickStat({ href, label, value, sub, color = "var(--txt)" }: {
  href: string; label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div className="card" style={{
        padding: "14px 16px", cursor: "pointer",
        transition: "border-color .15s, transform .1s",
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--purple)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.transform = "none"; }}
      >
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .7, marginBottom: 6 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1, marginBottom: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>}
        <div style={{ fontSize: 9, color: "var(--purple-l)", marginTop: 5, opacity: .7 }}>Ver leads →</div>
      </div>
    </Link>
  );
}

function ClickMetricCard({ href, icon, label, value, sub, color, detail, detailColor }: {
  href: string; icon: React.ReactNode; label: string; value: string | number;
  sub: string; color: string; detail: string; detailColor: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div className="card" style={{
        padding: "14px 16px", cursor: "pointer",
        transition: "border-color .15s, transform .1s",
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--purple)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.transform = "none"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          {icon}
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .6 }}>{label.toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1, marginBottom: 4 }}>{value}</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{sub}</div>
        <div style={{ fontSize: 10, color: detailColor, fontWeight: 600 }}>{detail}</div>
        <div style={{ fontSize: 9, color: "var(--purple-l)", marginTop: 6, opacity: .7 }}>Ver leads →</div>
      </div>
    </Link>
  );
}

function EmptyState({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: 20 }}>
      <div style={{ fontSize: 48 }}>💬</div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          {loading ? "Sincronizando conversas do CRM…" : "Nenhuma conversa ainda"}
        </h2>
        <p style={{ color: "var(--dim)", fontSize: 14, maxWidth: 440, lineHeight: 1.7 }}>
          {loading
            ? "Carregando as conversas reais dos seus leads."
            : "O ZapIntel analisa automaticamente as conversas dos leads do CRM. Assim que houver conversas, elas aparecem aqui. Use “Sincronizar agora” na barra lateral para atualizar."}
        </p>
      </div>
      {!loading && (
        <button onClick={onLoad} style={{ background: "var(--card2)", border: "1px solid var(--brd2)", color: "var(--txt)", borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Ver dados de exemplo
        </button>
      )}
    </div>
  );
}
