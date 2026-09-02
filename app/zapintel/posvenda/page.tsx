"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLeads } from "@/hooks/zapintel/useLeads";
import type { Lead } from "@/types/zapintel";
import { getCrossSell } from "@/lib/zapintel/segments/segments";
import { ArrowRight, Copy } from "lucide-react";

type Offer = { product: string; reason: string; icon: string };

// Cross-sell genérico (segmentos sem mapa próprio de produto): sem citar produto,
// foca em recompra, item complementar e indicação.
const GENERIC_CROSS: Offer[] = [
  { product: "Recompra / upgrade", reason: "Cliente satisfeito compra de novo quando é lembrado na hora certa.", icon: "🔁" },
  { product: "Item complementar", reason: "Ofereça um produto ou serviço que complemente o que ele já levou.", icon: "➕" },
  { product: "Indicação premiada", reason: "Peça indicação oferecendo um benefício — o boca a boca é o canal mais barato.", icon: "🎁" },
];

// ── Referral scripts (neutros — sem produto específico) ─────────────────────────
const REFERRAL_SCRIPTS = [
  {
    label: "Pós entrega — casual",
    icon: "😊",
    text: (name: string) =>
      `${name}, tudo certo? Espero que esteja curtindo! Se você tiver algum amigo ou familiar pensando em algo parecido, me manda o contato — cuido de tudo com o mesmo cuidado que cuidei de você! 🙏`,
  },
  {
    label: "Com desconto para indicado",
    icon: "🎁",
    text: (name: string) =>
      `${name}! Tudo bem? Tenho uma novidade — toda indicação que você me fizer e fechar, você ganha um brinde especial da nossa parte! Conhece alguém que possa se interessar? 🙌`,
  },
  {
    label: "Direto e objetivo",
    icon: "🎯",
    text: (name: string) =>
      `${name}, ficou satisfeito com o atendimento? Qualquer amigo seu que precise, me passa o contato! Prometo cuidar super bem. 👊`,
  },
  {
    label: "Aproveitando novidade",
    icon: "🔥",
    text: (name: string) =>
      `${name}, chegou uma novidade aqui que eu sei que você vai querer mostrar para alguém! Conhece alguém procurando? Posso fazer um preço especial para indicação sua! 😉`,
  },
];

function detectProductKey(lead: Lead): string {
  const sources = [
    lead.manualSale?.product || "",
    ...(lead.messages || []).filter((m) => m.isStore).map((m) => m.body || ""),
  ].join(" ").toLowerCase();

  if (sources.includes("macbook")) return "macbook";
  if (sources.includes("ipad")) return "ipad";
  if (sources.includes("airpod")) return "airpods";
  if (sources.includes("apple watch") || sources.includes("watch series") || sources.includes("watch ultra")) return "apple watch";
  if (sources.includes("perfume") || sources.includes("212 vip") || sources.includes("importado")) return "perfume";
  if (sources.includes("iphone")) return "iphone";
  return "default";
}

function getProductLabel(key: string): string {
  const map: Record<string, string> = {
    iphone: "📱 iPhone", "apple watch": "⌚ Apple Watch", ipad: "📲 iPad",
    macbook: "💻 MacBook", perfume: "🌸 Perfume", airpods: "🎧 AirPods", default: "🛍️ Produto",
  };
  return map[key] || "🛍️ Produto";
}

function whatsappLink(phone: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits || digits.length < 10) return null;
  const num = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${num}`;
}

function ScriptCard({ name, phone }: { name: string; phone: string }) {
  const [copied, setCopied] = useState<number | null>(null);
  const waLink = whatsappLink(phone);
  const firstName = name.split(" ")[0];

  async function copy(idx: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {REFERRAL_SCRIPTS.map((script, i) => {
        const msg = script.text(firstName);
        return (
          <div key={i} className="card2" style={{ padding: "11px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ fontSize: 15 }}>{script.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--txt)" }}>{script.label}</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>{msg}</p>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => copy(i, msg)} style={{
                display: "flex", alignItems: "center", gap: 5,
                background: copied === i ? "rgba(34,197,94,.15)" : "var(--card)",
                border: `1px solid ${copied === i ? "rgba(34,197,94,.4)" : "var(--brd)"}`,
                color: copied === i ? "var(--green)" : "var(--dim)",
                borderRadius: 7, padding: "5px 12px", fontSize: 11, cursor: "pointer",
              }}>
                <Copy size={11} /> {copied === i ? "Copiado!" : "Copiar"}
              </button>
              {waLink && (
                <a href={`${waLink}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.35)",
                  color: "#25d166", borderRadius: 7, padding: "5px 12px", fontSize: 11, textDecoration: "none",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar no WhatsApp
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PosVendaPage() {
  const { leads, loaded, loadSample, loading, segment } = useLeads();
  const crossMap = getCrossSell(segment.id); // celulares tem mapa; demais → genérico
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, "crossell" | "indicacao">>({});

  // ── Same customers as Dashboard: all with classification === "customer" ──
  const customers = useMemo(() =>
    leads.filter(l => l.classification === "customer"),
  [leads]);

  const enriched = useMemo(() =>
    customers.map(l => ({
      lead: l,
      productKey: detectProductKey(l),
      isManual: !!l.manualSale,
    })),
  [customers]);

  const productGroups = useMemo(() => {
    const g: Record<string, number> = {};
    enriched.forEach(e => { g[e.productKey] = (g[e.productKey] || 0) + 1; });
    return g;
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter !== "all") list = list.filter(e => e.productKey === filter);
    if (search) list = list.filter(e =>
      e.lead.contact.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [enriched, filter, search]);

  function getTab(id: string) { return tab[id] || "crossell"; }
  function setLeadTab(id: string, t: "crossell" | "indicacao") {
    setTab(prev => ({ ...prev, [id]: t }));
  }

  if (!loaded) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <p style={{ color: "var(--dim)", marginBottom: 16 }}>As conversas carregam automaticamente do CRM. Use “Sincronizar agora” na barra lateral se ainda não apareceram.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={loadSample} style={{ background: "var(--card2)", border: "1px solid var(--brd2)", color: "var(--txt)", borderRadius: 9, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Carregando..." : "Ver dados de exemplo"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4 }}>Pós Venda</h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>
          {customers.length} clientes · Cross-sell e scripts de indicação prontos para usar
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
        {[
          { label: "Total de Clientes", value: customers.length, color: "var(--green)", icon: "✅" },
          { label: "Fechados Manualmente", value: customers.filter(l => l.manualSale).length, color: "var(--teal)", icon: "✍️" },
          { label: "Com Produto Detectado", value: enriched.filter(e => e.productKey !== "default").length, color: "var(--blue)", icon: "📦" },
          { label: "Oportunidades Cross-sell", value: enriched.length, color: "var(--purple-l)", icon: "🎯" },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, letterSpacing: -1, marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .5 }}>{k.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
          style={{ background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 10, padding: "8px 14px", color: "var(--txt)", fontSize: 13, outline: "none", flex: 1, minWidth: 160 }} />
        {[
          { key: "all", label: `Todos (${customers.length})` },
          ...Object.entries(productGroups).sort((a,b) => b[1]-a[1]).map(([k,v]) => ({
            key: k, label: `${getProductLabel(k)} (${v})`
          }))
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            background: filter === f.key ? "var(--purple)" : "var(--card)",
            border: `1px solid ${filter === f.key ? "var(--purple)" : "var(--brd)"}`,
            color: filter === f.key ? "#fff" : "var(--dim)",
            borderRadius: 20, padding: "6px 14px", fontSize: 12,
            fontWeight: filter === f.key ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
          }}>{f.label}</button>
        ))}
      </div>

      {/* Customer cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(({ lead, productKey, isManual }) => {
          const isExpanded = expandedId === lead.id;
          const currentTab = getTab(lead.id);
          const crossSell = crossMap ? (crossMap[productKey] || crossMap.default) : GENERIC_CROSS;

          return (
            <div key={lead.id} className="card" style={{ overflow: "hidden" }}>
              {/* Card header — always visible */}
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : lead.id)}>

                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {getProductLabel(productKey).split(" ")[0]}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{lead.contact}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {isManual
                      ? <span style={{ color: "var(--teal)" }}>✍️ {lead.manualSale!.product}{lead.manualSale!.value > 0 ? ` · R$ ${lead.manualSale!.value.toLocaleString("pt-BR")}` : ""}</span>
                      : <span style={{ color: "var(--blue)" }}>🔍 {getProductLabel(productKey)}</span>
                    }
                    {lead.manualSale?.closedAt ? ` · ${new Date(lead.manualSale.closedAt).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>

                {/* Quick action pills */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    fontSize: 10, background: "rgba(124,92,252,.12)", border: "1px solid rgba(124,92,252,.3)",
                    color: "var(--purple-l)", borderRadius: 20, padding: "3px 10px", fontWeight: 700,
                  }}>
                    🎯 {crossSell.length} sugestões
                  </span>
                  <span style={{
                    fontSize: 10, background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)",
                    color: "var(--green)", borderRadius: 20, padding: "3px 10px", fontWeight: 700,
                  }}>
                    💬 {REFERRAL_SCRIPTS.length} scripts
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)", transform: isExpanded ? "rotate(180deg)" : "none", transition: ".2s" }}>▼</span>
                </div>
              </div>

              {/* Expandable content */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--brd)", padding: "0 20px 20px" }}>

                  {/* Tabs */}
                  <div style={{ display: "flex", gap: 4, padding: "14px 0 14px", borderBottom: "1px solid var(--brd2)", marginBottom: 16 }}>
                    {([
                      { key: "crossell", icon: "🎯", label: "Cross-sell" },
                      { key: "indicacao", icon: "👥", label: "Pedir Indicação" },
                    ] as const).map(t => (
                      <button key={t.key} onClick={() => setLeadTab(lead.id, t.key)} style={{
                        background: currentTab === t.key ? "var(--purple)" : "var(--card2)",
                        border: `1px solid ${currentTab === t.key ? "var(--purple)" : "var(--brd2)"}`,
                        color: currentTab === t.key ? "#fff" : "var(--dim)",
                        borderRadius: 9, padding: "7px 16px", fontSize: 12, fontWeight: currentTab === t.key ? 700 : 400,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                      }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                    <Link href={`/zapintel/leads/${lead.id}`} style={{
                      marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                      fontSize: 11, color: "var(--dim)", textDecoration: "none",
                    }}>
                      Ver conversa <ArrowRight size={11} />
                    </Link>
                  </div>

                  {/* Tab: Cross-sell */}
                  {currentTab === "crossell" && (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>
                        Baseado no produto detectado <strong style={{ color: "var(--txt)" }}>{getProductLabel(productKey)}</strong>, esses são os produtos mais indicados para oferecer a este cliente:
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {crossSell.map((offer, i) => (
                          <div key={offer.product} className="card2" style={{ padding: "12px 14px", borderLeft: `3px solid ${i === 0 ? "var(--yellow)" : i === 1 ? "var(--purple-l)" : "var(--brd2)"}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                              <span style={{ fontSize: 18 }}>{offer.icon}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "var(--yellow)" : "var(--txt)" }}>
                                {offer.product}
                                {i === 0 && <span style={{ fontSize: 9, background: "rgba(234,179,8,.2)", color: "var(--yellow)", borderRadius: 5, padding: "1px 5px", marginLeft: 5 }}>TOP</span>}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>{offer.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tab: Pedir Indicação */}
                  {currentTab === "indicacao" && (
                    <div>
                      <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
                        <strong style={{ color: "var(--green)" }}>💡 Dica:</strong> O melhor momento para pedir indicação é logo após a entrega, quando o cliente está satisfeito. Escolha um script, copie e envie diretamente pelo WhatsApp.
                      </div>
                      <ScriptCard name={lead.contact} phone={lead.phone} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🛍️</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Nenhum cliente encontrado</div>
            <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 20 }}>
              {customers.length === 0
                ? "Marque vendas como fechadas na tela de cada lead para elas aparecerem aqui."
                : "Tente ajustar os filtros."}
            </div>
            {customers.length === 0 && (
              <Link href="/zapintel/leads" style={{ background: "var(--purple)", color: "#fff", borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Ir para Leads →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
