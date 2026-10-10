"use client";
import { useState, useMemo, useEffect } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { ScoreRing, UrgencyDot } from "@/components/zapintel/ui/atoms";
import { STATUS_META } from "@/types/zapintel";
import type { RawMessage } from "@/types/zapintel";
import Link from "next/link";
import {
  CalendarDays, CheckCircle2, MessageSquare, Sparkles,
  RefreshCw, Copy, ChevronRight, Plus, X, ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Column = "urgente" | "hoje" | "agendado" | "concluido";

interface KanbanCard {
  id: string;
  leadId: string;
  contact: string;
  phone: string;
  classification: string;
  score: number;
  urgency: string;
  daysInactive: number;
  nextAction: string;
  insight: string;
  column: Column;
  aiSuggestion: string;
  aiLoading: boolean;
  copiedMsg: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────
const urgOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const COLUMNS: { id: Column; label: string; emoji: string; color: string; bg: string; border: string }[] = [
  { id: "urgente",   label: "Urgente",   emoji: "🔥", color: "#ef4444", bg: "rgba(239,68,68,.07)",  border: "rgba(239,68,68,.3)"  },
  { id: "hoje",      label: "Hoje",      emoji: "📅", color: "#f97316", bg: "rgba(249,115,22,.07)", border: "rgba(249,115,22,.3)" },
  { id: "agendado",  label: "Agendado",  emoji: "⏳", color: "#eab308", bg: "rgba(234,179,8,.07)",  border: "rgba(234,179,8,.3)"  },
  { id: "concluido", label: "Concluído", emoji: "✅", color: "#22c55e", bg: "rgba(34,197,94,.07)",  border: "rgba(34,197,94,.3)"  },
];

function buildWaLink(phone: string, msg: string) {
  const d = phone.replace(/\D/g, "");
  if (!d || d.length < 4) return null;
  return `https://wa.me/55${d}?text=${encodeURIComponent(msg)}`;
}

interface AICtx { storeName: string; sellerName: string; segmentName: string; followupContext: string }

async function fetchAISuggestion(card: KanbanCard, messages: RawMessage[], ctx: AICtx): Promise<string> {
  const recent = messages
    .filter((m) => m.body?.trim())
    .slice(-8)
    .map((m) => `[${m.isStore ? ctx.sellerName : card.contact}] ${m.body.trim()}`)
    .join("\n");

  const prompt = `Você é ${ctx.sellerName.toLowerCase()} experiente da ${ctx.storeName} (segmento: ${ctx.segmentName}). ${ctx.followupContext}

Gere UMA mensagem de follow-up DIRETA e HUMANA para enviar AGORA no WhatsApp para ${card.contact}.

Status: ${card.classification} | Inativo: ${card.daysInactive}d | Score: ${card.score}/100
Situação: ${card.insight}
Próxima ação: ${card.nextAction}

Últimas mensagens:
${recent || "(sem histórico disponível)"}

Regras: máx 3 linhas, tom informal brasileiro, específico ao contexto, só a mensagem sem explicação.`;

  const res = await fetch("/zapintel/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text?.trim() || "";
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { leads, loaded, storeName, sellerName, segment } = useLeads();
  const aiCtx = { storeName: storeName || "sua empresa", sellerName, segmentName: segment.name, followupContext: segment.followupContext };
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddModal, setShowAddModal] = useState<Column | null>(null);
  const [search, setSearch] = useState("");

  // Auto-populate on first load
  useEffect(() => {
    if (!loaded || !leads.length || initialized) return;
    const initial: KanbanCard[] = leads
      .filter(l =>
        l.urgency === "critical" ||
        l.classification === "hot" ||
        l.classification === "followup" ||
        l.classification === "warm"
      )
      .sort((a, b) => urgOrder[a.urgency] - urgOrder[b.urgency])
      .slice(0, 24)
      .map(l => ({
        id: Math.random().toString(36).slice(2),
        leadId: l.id, contact: l.contact, phone: l.phone,
        classification: l.classification, score: l.score,
        urgency: l.urgency, daysInactive: l.daysInactive,
        nextAction: l.nextAction, insight: l.insight,
        column: (
          l.urgency === "critical" ? "urgente" :
          l.classification === "hot" ? "hoje" :
          l.classification === "followup" ? "hoje" :
          "agendado"
        ) as Column,
        aiSuggestion: "", aiLoading: false, copiedMsg: false,
      }));
    setCards(initial);
    setInitialized(true);
  }, [loaded, leads, initialized]);

  const colCounts = useMemo(() => {
    const c: Record<Column, number> = { urgente: 0, hoje: 0, agendado: 0, concluido: 0 };
    cards.forEach(card => { c[card.column]++; });
    return c;
  }, [cards]);

  function moveCard(id: string, to: Column) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, column: to } : c));
  }
  function removeCard(id: string) {
    setCards(prev => prev.filter(c => c.id !== id));
  }
  function addLead(leadId: string, col: Column) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || cards.some(c => c.leadId === leadId)) return;
    setCards(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      leadId: lead.id, contact: lead.contact, phone: lead.phone,
      classification: lead.classification, score: lead.score,
      urgency: lead.urgency, daysInactive: lead.daysInactive,
      nextAction: lead.nextAction, insight: lead.insight,
      column: col, aiSuggestion: "", aiLoading: false, copiedMsg: false,
    }]);
    setShowAddModal(null); setSearch("");
  }

  async function generateSuggestion(cardId: string) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, aiLoading: true, aiSuggestion: "" } : c));
    try {
      // A sugestão só presta se a IA ler a conversa — e a conversa não vem na
      // lista (são 54 mil mensagens; mandá-las foi o que obrigou a truncar a
      // análise). Busca-se esta, no momento em que alguém pede a sugestão.
      const lead = leads.find(l => l.id === card.leadId);
      let mensagens: RawMessage[] = [];
      if (lead?.leadId) {
        const r = await fetch(`/zapintel/api/conversa?lead=${lead.leadId}`, { cache: "no-store" });
        const d = await r.json();
        mensagens = (d?.lead?.messages ?? []) as RawMessage[];
      }
      const suggestion = await fetchAISuggestion(card, mensagens, aiCtx);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, aiLoading: false, aiSuggestion: suggestion } : c));
    } catch {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, aiLoading: false, aiSuggestion: "Erro — verifique a chave da API." } : c));
    }
  }

  async function copySuggestion(cardId: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, copiedMsg: true } : c));
    setTimeout(() => setCards(prev => prev.map(c => c.id === cardId ? { ...c, copiedMsg: false } : c)), 2000);
  }

  const availableLeads = useMemo(() =>
    leads.filter(l => !cards.some(c => c.leadId === l.id)), [leads, cards]);
  const filteredLeads = useMemo(() =>
    availableLeads.filter(l => l.contact.toLowerCase().includes(search.toLowerCase())).slice(0, 8),
    [availableLeads, search]);

  if (!loaded) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <CalendarDays size={40} color="var(--purple)" />
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>Agenda de Follow-ups</h2>
      <p style={{ color: "var(--dim)", fontSize: 13 }}>Importe leads para começar.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1340, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <CalendarDays size={22} color="var(--purple)" /> Agenda de Follow-ups
        </h1>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>
          {cards.length} leads no kanban · clique em <strong style={{ color: "var(--purple-l)" }}>Sugestão com IA</strong> para gerar a mensagem certa para cada lead
        </p>
      </div>

      {/* Kanban */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, alignItems: "start" }}>
        {COLUMNS.map(col => {
          const colCards = cards
            .filter(c => c.column === col.id)
            .sort((a, b) => urgOrder[a.urgency] - urgOrder[b.urgency]);

          return (
            <div key={col.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Column header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 14px", borderRadius: "12px 12px 0 0",
                background: col.bg, border: `1px solid ${col.border}`, borderBottom: "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 16 }}>{col.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: col.color }}>{col.label}</span>
                  <span style={{ fontSize: 10, background: col.color, color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>
                    {colCounts[col.id]}
                  </span>
                </div>
                <button
                  onClick={() => setShowAddModal(col.id)}
                  style={{
                    background: "transparent", border: `1px solid ${col.border}`,
                    borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                    color: col.color, display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700,
                  }}
                >
                  <Plus size={10} /> Lead
                </button>
              </div>

              {/* Column body */}
              <div style={{
                background: "var(--card)", border: `1px solid ${col.border}`,
                borderTop: "none", borderRadius: "0 0 12px 12px",
                padding: "8px", minHeight: 140,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {colCards.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
                    {col.id === "concluido" ? "✅ Nenhum concluído ainda" : "Nenhum lead aqui"}
                    <br />
                    <button onClick={() => setShowAddModal(col.id)} style={{ color: col.color, background: "none", border: "none", cursor: "pointer", fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                      + Adicionar lead
                    </button>
                  </div>
                ) : colCards.map(card => (
                  <CardItem
                    key={card.id}
                    card={card}
                    col={col}
                    allColumns={COLUMNS}
                    onMove={moveCard}
                    onRemove={removeCard}
                    onGenerate={generateSuggestion}
                    onCopy={copySuggestion}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) { setShowAddModal(null); setSearch(""); } }}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--brd)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                {COLUMNS.find(c => c.id === showAddModal)?.emoji} Adicionar lead — {COLUMNS.find(c => c.id === showAddModal)?.label}
              </div>
              <button onClick={() => { setShowAddModal(null); setSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lead pelo nome..."
              autoFocus
              style={{ width: "100%", background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 9, padding: "9px 12px", fontSize: 13, color: "var(--txt)", marginBottom: 12 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
              {filteredLeads.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
                  {availableLeads.length === 0 ? "Todos os leads já estão no kanban" : "Nenhum resultado"}
                </div>
              ) : filteredLeads.map(lead => {
                const meta = STATUS_META[lead.classification as keyof typeof STATUS_META];
                return (
                  <button key={lead.id} onClick={() => addLead(lead.id, showAddModal)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 9,
                      cursor: "pointer", textAlign: "left", transition: "border-color .15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--purple)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--brd2)"}
                  >
                    <ScoreRing score={lead.score} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{lead.contact}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {meta && <span style={{ fontSize: 9, color: meta.color }}>{meta.label}</span>}
                        <span style={{ fontSize: 9, color: "var(--muted)" }}>{lead.daysInactive}d inativo · score {lead.score}</span>
                      </div>
                    </div>
                    <ArrowRight size={13} color="var(--purple)" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card Component ────────────────────────────────────────────────────────────
function CardItem({
  card, col, allColumns, onMove, onRemove, onGenerate, onCopy,
}: {
  card: KanbanCard;
  col: typeof COLUMNS[0];
  allColumns: typeof COLUMNS;
  onMove: (id: string, to: Column) => void;
  onRemove: (id: string) => void;
  onGenerate: (id: string) => void;
  onCopy: (id: string, text: string) => void;
}) {
  const meta = STATUS_META[card.classification as keyof typeof STATUS_META];
  const isDone = card.column === "concluido";
  const wa = buildWaLink(card.phone, card.aiSuggestion || card.nextAction);
  const nextCols = allColumns.filter(c => c.id !== card.column);

  return (
    <div style={{
      background: "var(--card2)", border: `1px solid var(--brd2)`,
      borderLeft: `3px solid ${isDone ? "var(--green)" : col.color}`,
      borderRadius: 10, padding: "10px 11px",
      opacity: isDone ? .6 : 1, transition: "opacity .2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
        <ScoreRing score={card.score} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.contact}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
            {meta && (
              <span style={{ fontSize: 9, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 20, padding: "1px 6px", fontWeight: 700 }}>
                {meta.label}
              </span>
            )}
            <span style={{ fontSize: 9, color: "var(--muted)" }}>{card.daysInactive}d inativo</span>
          </div>
        </div>
        <button onClick={() => onRemove(card.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, flexShrink: 0 }}>
          <X size={11} />
        </button>
      </div>

      {/* Next action */}
      <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 8, lineHeight: 1.5 }}>
        <UrgencyDot urgency={card.urgency} />
        {card.nextAction}
      </div>

      {/* AI Suggestion */}
      {!isDone && (
        <div style={{ marginBottom: 8 }}>
          {!card.aiSuggestion && !card.aiLoading && (
            <button
              onClick={() => onGenerate(card.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "linear-gradient(135deg,rgba(124,92,252,.12),rgba(67,56,202,.08))",
                border: "1px solid rgba(124,92,252,.28)", borderRadius: 7,
                color: "var(--purple-l)", fontSize: 10, fontWeight: 700,
                padding: "6px 0", cursor: "pointer", transition: "border-color .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--purple)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(124,92,252,.28)"}
            >
              <Sparkles size={10} /> Sugestão com IA
            </button>
          )}

          {card.aiLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", fontSize: 10, color: "var(--muted)" }}>
              <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} /> Gerando...
            </div>
          )}

          {card.aiSuggestion && !card.aiLoading && (
            <div style={{ background: "var(--card2)", border: "1px solid rgba(124,92,252,.28)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--purple-l)", fontWeight: 700, letterSpacing: .5, marginBottom: 5 }}>💬 MENSAGEM SUGERIDA</div>
              <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: "0 0 7px" }}>
                {card.aiSuggestion}
              </p>
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  onClick={() => onCopy(card.id, card.aiSuggestion)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    background: card.copiedMsg ? "rgba(34,197,94,.15)" : "rgba(124,92,252,.12)",
                    border: `1px solid ${card.copiedMsg ? "rgba(34,197,94,.4)" : "rgba(124,92,252,.28)"}`,
                    borderRadius: 6, color: card.copiedMsg ? "var(--green)" : "var(--purple-l)",
                    fontSize: 10, fontWeight: 700, padding: "5px 0", cursor: "pointer",
                  }}
                >
                  {card.copiedMsg ? <><CheckCircle2 size={10} /> Copiado!</> : <><Copy size={10} /> Copiar</>}
                </button>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    background: "#075e54", borderRadius: 6,
                    textDecoration: "none", fontSize: 10, fontWeight: 700, color: "#fff", padding: "5px 0",
                  }}>
                    <MessageSquare size={10} /> WhatsApp
                  </a>
                )}
                <button
                  onClick={() => onGenerate(card.id)}
                  title="Gerar outra mensagem"
                  style={{ background: "transparent", border: "1px solid var(--brd2)", borderRadius: 6, color: "var(--muted)", padding: "5px 7px", cursor: "pointer" }}
                >
                  <RefreshCw size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer: link + move buttons */}
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/zapintel/leads/${card.leadId}`} style={{ fontSize: 10, color: "var(--purple-l)", textDecoration: "none", flex: 1 }}>
          Ver conversa →
        </Link>
        {nextCols.map(nc => (
          <button
            key={nc.id}
            onClick={() => onMove(card.id, nc.id)}
            title={`Mover para ${nc.label}`}
            style={{
              background: nc.bg, border: `1px solid ${nc.border}`,
              borderRadius: 6, padding: "3px 7px",
              fontSize: 9, color: nc.color, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 2,
            }}
          >
            {nc.emoji}<ChevronRight size={8} />
          </button>
        ))}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
