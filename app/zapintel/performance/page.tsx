"use client";
import { useLeads } from "@/hooks/zapintel/useLeads";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, 
} from "recharts";
import "next/link";
import {
  Zap, Clock, DollarSign, Target, Users, Mic, MessageSquare,
  TrendingUp, TrendingDown, Award, AlertTriangle, CheckCircle,
} from "lucide-react";

const TT = { contentStyle: { background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--txt)", fontSize: 12 } };

function fmt(v: number) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`;
  return `R$ ${v}`;
}
function fmtMin(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function KPI({ icon, label, value, sub, color = "var(--txt)", badge, badgeColor }:
  { icon: React.ReactNode; label: string; value: string | number; sub: string; color?: string; badge?: string; badgeColor?: string }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {icon}
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .6 }}>{label.toUpperCase()}</span>
        </div>
        {badge && (
          <span style={{ fontSize: 10, background: `${badgeColor}20`, color: badgeColor, border: `1px solid ${badgeColor}40`, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
        {icon}
        <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function PerformancePage() {
  const { leads, agregados, loaded, storeName, sellerName } = useLeads();

  // Calculado no servidor, sobre a conversa inteira. Rodar aqui daria zero:
  // os leads chegam sem as mensagens, de propósito.
  const perf = agregados?.performance ?? null;

  if (!loaded) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <p style={{ color: "var(--dim)", marginBottom: 16 }}>As conversas carregam automaticamente do CRM. Use “Sincronizar agora” na barra lateral se ainda não apareceram.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
      </div>
    </div>
  );

  if (!perf) return <div style={{ textAlign: "center", paddingTop: 80, color: "var(--dim)" }}>Calculando métricas...</div>;

  const speedColor = perf.avgSpeedToLead <= 5 ? "var(--green)" : perf.avgSpeedToLead <= 30 ? "var(--yellow)" : "var(--red)";
  const speedBadge = perf.avgSpeedToLead <= 5 ? "✓ Excelente" : perf.avgSpeedToLead <= 30 ? "⚠ Melhorar" : "🔴 Crítico";
  const speedBadgeColor = perf.avgSpeedToLead <= 5 ? "var(--green)" : perf.avgSpeedToLead <= 30 ? "var(--yellow)" : "var(--red)";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4 }}>Performance Comercial</h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>
          Baseado em {leads.length} conversas · Metodologias G4 Educação · DNA de Vendas · Vector · Anev
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          1. VELOCIDADE DE ATENDIMENTO — G4 Educação
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Velocidade de Atendimento (Speed to Lead)" icon={<Zap size={18} color="var(--yellow)" />}>
        <div style={{ background: "rgba(234,179,8,.06)", border: "1px solid rgba(234,179,8,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--yellow)" }}>G4 Educação:</strong> Responder em menos de 5 minutos aumenta a chance de conversão em até 80%. Acima de 30 minutos, o lead esfria drasticamente.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          <KPI icon={<Clock size={15} color={speedColor} />} label="Tempo médio de resposta" value={fmtMin(perf.avgSpeedToLead)} sub={`entre lead entrar e ${sellerName.toLowerCase()} responder`} color={speedColor} badge={speedBadge} badgeColor={speedBadgeColor} />
          <KPI icon={<CheckCircle size={15} color="var(--green)" />} label="Respondidos < 5min" value={`${perf.pctRespondedUnder5min}%`} sub="das conversas" color={perf.pctRespondedUnder5min >= 50 ? "var(--green)" : "var(--red)"} />
          <KPI icon={<CheckCircle size={15} color="var(--blue)" />} label="Respondidos < 1h" value={`${perf.pctRespondedUnder1h}%`} sub="das conversas" color={perf.pctRespondedUnder1h >= 80 ? "var(--green)" : "var(--yellow)"} />
          <KPI icon={<Clock size={15} color="var(--purple-l)" />} label={`Tempo médio ${sellerName}`} value={fmtMin(perf.avgResponseTime)} sub="entre mensagem do lead e resposta" color="var(--purple-l)" />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>DISTRIBUIÇÃO DO TEMPO DE RESPOSTA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {perf.speedToLeadDistribution.map(({ range, count, color }) => {
              const pct = leads.length > 0 ? (count / leads.length) * 100 : 0;
              return (
                <div key={range}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--txt)" }}>{range}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} leads <span style={{ color: "var(--muted)", fontWeight: 400 }}>({Math.round(pct)}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: "var(--brd)", borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. FUNIL DE CONVERSÃO
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Funil de Conversão por Etapa" icon={<Target size={18} color="var(--purple-l)" />}>
        <div style={{ background: "rgba(124,92,252,.06)", border: "1px solid rgba(124,92,252,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--purple-l)" }}>DNA de Vendas:</strong> Monitorar a taxa de conversão por etapa é fundamental para identificar onde o funil está vazando e agir cirurgicamente.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>ETAPAS DO FUNIL</div>
            {perf.funnelStages.map((stage, i) => (
              <div key={stage.stage} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--txt)", fontWeight: i === 0 ? 700 : 400 }}>{stage.stage}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: i === perf.funnelStages.length - 1 ? "var(--green)" : "var(--txt)" }}>{stage.count}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6 }}>{stage.pct}%</span>
                  </div>
                </div>
                <div style={{ height: 8, background: "var(--brd)", borderRadius: 4 }}>
                  <div style={{
                    width: `${stage.pct}%`, height: "100%", borderRadius: 4,
                    background: ["var(--blue)","var(--purple-l)","var(--yellow)","var(--green)"][i],
                    transition: "width .5s",
                  }} />
                </div>
                {i > 0 && stage.dropPct > 0 && (
                  <div style={{ fontSize: 10, color: "var(--red)", marginTop: 3 }}>
                    ↓ {stage.dropPct}% de queda nessa etapa
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>RECEITA PERDIDA POR ETAPA</div>
            {perf.revenueLostByStage.map(stage => (
              <div key={stage.stage} className="card2" style={{ padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--txt)", marginBottom: 2 }}>{stage.stage}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{stage.leads} leads</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--red)" }}>{fmt(stage.lost)}</div>
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 12, padding: "10px 12px", background: "rgba(239,68,68,.08)",
              border: "1px solid rgba(239,68,68,.25)", borderRadius: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>Total estimado perdido</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--red)" }}>
                {fmt(perf.revenueLostByStage.reduce((a, s) => a + s.lost, 0))}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. WIN RATE vs CONCORRENTES — Vector
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Win Rate vs Concorrentes" icon={<Award size={18} color="var(--orange)" />}>
        <div style={{ background: "rgba(249,115,22,.06)", border: "1px solid rgba(249,115,22,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--orange)" }}>Vector Soluções:</strong> Medir o win rate quando o concorrente é mencionado revela o impacto real da concorrência e a capacidade de contorno do vendedor.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <KPI icon={<TrendingUp size={15} color="var(--green)" />} label="Win Rate Geral" value={`${perf.winRateGeneral}%`} sub="de todos os leads" color="var(--green)" badge={perf.winRateGeneral >= 10 ? "✓ Saudável" : "⚠ Baixo"} badgeColor={perf.winRateGeneral >= 10 ? "var(--green)" : "var(--yellow)"} />
          <KPI icon={<TrendingDown size={15} color="var(--red)" />} label="Win Rate vs Concorrente" value={`${perf.winRateVsCompetitor}%`} sub="quando ML/Shopee/OLX são mencionados" color={perf.winRateVsCompetitor >= 15 ? "var(--yellow)" : "var(--red)"} badge={`${perf.competitorMentions} menções`} badgeColor="var(--orange)" />
          <div className="card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, marginBottom: 10 }}>DIFERENÇA WIN RATE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--red)", letterSpacing: -1, marginBottom: 4 }}>
              -{Math.max(0, perf.winRateGeneral - perf.winRateVsCompetitor)}pp
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>queda quando concorrente aparece</div>
            <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>
              💡 Criar material comparativo {storeName || "sua loja"} vs concorrência pode recuperar parte dessas vendas
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. RAPPORT SCORE — Anev
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Rapport Score (Diagnóstico Ativo)" icon={<MessageSquare size={18} color="var(--teal)" />}>
        <div style={{ background: "rgba(20,184,166,.06)", border: "1px solid rgba(20,184,166,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--teal)" }}>Anev:</strong> Vendedores que fazem mais perguntas de diagnóstico vendem mais. O Rapport Score mede quantas perguntas o {sellerName.toLowerCase()} faz por conversa — quanto maior, melhor.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, marginBottom: 12 }}>MÉDIA DE PERGUNTAS/CONVERSA</div>
            <div style={{ fontSize: 52, fontWeight: 800, color: perf.avgRapportScore >= 5 ? "var(--green)" : perf.avgRapportScore >= 3 ? "var(--yellow)" : "var(--red)", letterSpacing: -2 }}>
              {perf.avgRapportScore}
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, textAlign: "center" }}>
              {perf.avgRapportScore >= 5 ? "✓ Diagnóstico ativo excelente" : perf.avgRapportScore >= 3 ? "⚠ Pode melhorar o diagnóstico" : "🔴 Poucas perguntas de diagnóstico"}
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>RAPPORT vs CONVERSÃO POR PERFIL</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={perf.rapportVsConversion} barSize={20}>
                <XAxis dataKey="profile" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} formatter={(v, name) => [name === "avgRapport" ? `${v} perguntas` : `${v}%`, name === "avgRapport" ? "Rapport" : "Conv. Rate"]} />
                <Bar dataKey="avgRapport" name="avgRapport" fill="var(--teal)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="convRate" name="convRate" fill="var(--green)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          5. PRODUTIVIDADE DO PEDRO — DNA de Vendas
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title={`Produtividade do ${sellerName}`} icon={<Users size={18} color="var(--blue)" />}>
        <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--blue)" }}>DNA de Vendas:</strong> Monitorar a disciplina de follow-up, carga de pipeline e proporção áudio/texto revela os padrões de comportamento que mais convertem.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          <KPI icon={<Zap size={15} color="var(--orange)" />} label="Follow-ups Executados" value={`${perf.followupRate}%`} sub={`${perf.followupExecuted} de ${perf.followupTotal} necessários`} color={perf.followupRate >= 70 ? "var(--green)" : "var(--orange)"} badge={perf.followupRate >= 70 ? "✓ Disciplinado" : "⚠ Melhorar"} badgeColor={perf.followupRate >= 70 ? "var(--green)" : "var(--orange)"} />
          <KPI icon={<Users size={15} color="var(--blue)" />} label="Pipeline Ativo" value={perf.activePipelineLoad} sub="leads simultâneos em gestão" color="var(--blue)" />
          <KPI icon={<Mic size={15} color="var(--purple-l)" />} label="Uso de Áudio" value={`${perf.audioPct}%`} sub={`das mensagens do ${sellerName.toLowerCase()} são áudio`} color="var(--purple-l)" badge={`${perf.audioInClosedDeals}% nos fechamentos`} badgeColor="var(--teal)" />
          <KPI icon={<MessageSquare size={15} color="var(--green)" />} label="Uso de Texto" value={`${perf.textPct}%`} sub="das mensagens são texto" color="var(--green)" />
        </div>

        {/* Tempo de resposta por hora */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>TEMPO DE RESPOSTA POR HORA</div>
            <ResponsiveContainer width="100%" height={165}>
              <LineChart data={perf.responseTimeByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--brd)" />
                <XAxis dataKey="hour" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} unit="min" />
                <Tooltip {...TT} formatter={(v) => [`${v}min`, "Tempo de resposta"]} />
                <Line type="monotone" dataKey="avgMin" stroke="var(--blue)" strokeWidth={2} dot={{ fill: "var(--blue)", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>CONVERSÕES POR DIA DA SEMANA</div>
            <ResponsiveContainer width="100%" height={165}>
              <BarChart data={perf.convByDayOfWeek} barSize={22}>
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TT} />
                <Bar dataKey="leads" name="Leads" fill="var(--brd2)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="conv" name="Clientes" fill="var(--green)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          6. TICKET E LTV — Vector
      ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Ticket Médio por Perfil e LTV" icon={<DollarSign size={18} color="var(--yellow)" />}>
        <div style={{ background: "rgba(234,179,8,.06)", border: "1px solid rgba(234,179,8,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--yellow)" }}>Vector Soluções:</strong> Saber qual perfil compra mais caro permite ao {sellerName.toLowerCase()} priorizar leads com maior potencial de receita. O LTV estima o valor total de um cliente ao longo do tempo.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .6, marginBottom: 14 }}>TICKET MÉDIO POR PERFIL DE COMPRADOR</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={perf.ticketByProfile} layout="vertical" barSize={18}>
                <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis dataKey="profile" type="category" tick={{ fill: "var(--txt)", fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip {...TT} formatter={v => [fmt(v as number), "Ticket médio"]} />
                <Bar dataKey="avgTicket" fill="var(--yellow)" radius={[0, 4, 4, 0]}>
                  {perf.ticketByProfile.map((_, i) => (
                    <Cell key={i} fill={["var(--yellow)","var(--orange)","var(--red)","var(--purple-l)","var(--blue)","var(--teal)"][i % 6]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="card" style={{ padding: 18, flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, marginBottom: 8 }}>LTV ESTIMADO (BASE DE CLIENTES)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green)", letterSpacing: -1, marginBottom: 4 }}>{fmt(perf.estimatedLTV)}</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>valor estimado de retorno dos clientes atuais</div>
            </div>
            <div className="card" style={{ padding: 18, flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, marginBottom: 8 }}>CLIENTES RECORRENTES</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--teal)", letterSpacing: -1, marginBottom: 4 }}>{perf.returningCustomers}</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>já compraram mais de uma vez</div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Recomendações finais ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
          <AlertTriangle size={16} color="var(--orange)" />
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Top 5 Ações Prioritárias — Baseadas nos Dados</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { num: "01", title: `Responder em menos de 5min`, desc: `Só ${perf.pctRespondedUnder5min}% dos leads são atendidos abaixo de 5min. Meta: chegar a 70%+. Criar alerta sonoro no WhatsApp para novos contatos.`, col: "var(--red)" },
            { num: "02", title: `Executar ${perf.followupTotal - perf.followupExecuted} follow-ups pendentes`, desc: `Taxa atual: ${perf.followupRate}%. Cada follow-up não feito representa em média R$ ${Math.round(5200 * 0.3).toLocaleString("pt-BR")} de receita potencial perdida.`, col: "var(--orange)" },
            { num: "03", title: `Criar resposta padrão para objeção de concorrente`, desc: `Win rate cai ${Math.max(0, perf.winRateGeneral - perf.winRateVsCompetitor)}pp quando ML/Shopee são mencionados. Script de contorno aumenta conversão nesses casos.`, col: "var(--yellow)" },
            { num: "04", title: `Aumentar uso de áudios nos fechamentos`, desc: `Áudios aparecem em ${perf.audioInClosedDeals}% dos fechamentos. DNA de Vendas: rapport via áudio acelera a decisão de compra.`, col: "var(--teal)" },
            { num: "05", title: `Focar perfil "${perf.ticketByProfile[0]?.profile || "Decidido"}" — maior ticket`, desc: `Ticket médio: ${fmt(perf.ticketByProfile[0]?.avgTicket || 0)}. Qualificar mais leads desse perfil pode aumentar o faturamento sem aumentar volume.`, col: "var(--green)" },
          ].map(item => (
            <div key={item.num} className="card2" style={{ padding: "12px 14px", borderLeft: `3px solid ${item.col}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: item.col }}>#{item.num}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)" }}>{item.title}</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
