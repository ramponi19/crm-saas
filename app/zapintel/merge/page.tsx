"use client";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X, Zap, ArrowRight, Users, Search } from "lucide-react";
import { Badge, ScoreRing } from "@/components/zapintel/ui/atoms";
import Link from "next/link";

export default function MergePage() {
  const {
    matchSuggestions, matchesLoading,
    confirmMatch, rejectMatch, confirmAllMatches, applyMatches,
    hasWhatsapp, hasInstagram,
    whatsappLeads, instagramLeads,
    runMatchSuggestions,
  } = useLeads();
  const router = useRouter();
  const [done, setDone] = useState(false);

  const pending   = matchSuggestions.filter(m => m.status === "pending");
  const confirmed = matchSuggestions.filter(m => m.status === "confirmed");
  const rejected  = matchSuggestions.filter(m => m.status === "rejected");

  function finish() {
    applyMatches();
    setDone(true);
    setTimeout(() => router.push("/zapintel/leads"), 1000);
  }

  // Neither source loaded
  if (!hasWhatsapp && !hasInstagram) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>📥</div>
      <p style={{ color: "var(--dim)", fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
        As conversas do CRM (WhatsApp, Instagram e Messenger) já entram unificadas automaticamente. Esta tela só é usada em importações manuais.
      </p>
      <Link href="/zapintel" style={{ background: "var(--purple)", color: "#fff", borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
        Voltar ao Dashboard
      </Link>
    </div>
  );

  // Only one source loaded
  if (!hasWhatsapp || !hasInstagram) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Importe os dois canais para unificar</h2>
      <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 20px" }}>
        {hasWhatsapp
          ? `WhatsApp carregado (${whatsappLeads.length} leads). Falta importar o Instagram.`
          : `Instagram carregado (${instagramLeads.length} leads). Falta importar o WhatsApp.`}
      </p>
      <Link href="/zapintel" style={{ background: "var(--purple)", color: "#fff", borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
        Voltar ao Dashboard →
      </Link>
    </div>
  );

  // Both loaded — show button to start matching
  if (matchSuggestions.length === 0 && !matchesLoading) return (
    <div style={{ maxWidth: 600, margin: "0 auto", paddingTop: 40, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Pronto para unificar perfis</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>{whatsappLeads.length}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>💬 leads WhatsApp</div>
        </div>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ec4899", marginBottom: 4 }}>{instagramLeads.length}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>📸 leads Instagram</div>
        </div>
      </div>
      <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
        O sistema vai comparar os nomes dos contatos e sugerir pares para você confirmar ou rejeitar.
        Dependendo do volume, pode levar alguns segundos.
      </p>
      <button onClick={runMatchSuggestions} style={{
        background: "var(--purple)", border: "none", color: "#fff",
        borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700,
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
      }}>
        <Search size={16} /> Buscar matches
      </button>
    </div>
  );

  // Loading matches
  if (matchesLoading) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Analisando {whatsappLeads.length + instagramLeads.length} leads...</h2>
      <p style={{ color: "var(--dim)", fontSize: 13 }}>Comparando nomes entre WhatsApp e Instagram</p>
    </div>
  );

  // No matches found
  if (matchSuggestions.length === 0) return (
    <div style={{ maxWidth: 600, margin: "0 auto", paddingTop: 40, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Nenhum match encontrado</h2>
      <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
        Não encontramos contatos em comum com similaridade suficiente entre os {whatsappLeads.length} leads do WhatsApp
        e os {instagramLeads.length} do Instagram.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={runMatchSuggestions} style={{ background: "var(--card2)", border: "1px solid var(--brd2)", color: "var(--dim)", borderRadius: 9, padding: "9px 18px", fontSize: 12, cursor: "pointer" }}>
          Tentar novamente
        </button>
        <Link href="/zapintel/leads" style={{ background: "var(--purple)", color: "#fff", borderRadius: 9, padding: "9px 18px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
          Ver todos os leads →
        </Link>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>
        {confirmed.length} perfis unificados!
      </h2>
      <p style={{ color: "var(--dim)", fontSize: 13 }}>Redirecionando para os leads...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Users size={20} color="var(--purple-l)" />
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.5 }}>
            Unificar Perfis WhatsApp + Instagram
          </h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--dim)" }}>
          {matchSuggestions.length} pares sugeridos entre {whatsappLeads.length} leads WA e {instagramLeads.length} leads IG
        </p>
      </div>

      {/* Summary bar */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 20, padding: "12px 16px",
        background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 12, alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          <Pill label="Pendentes" count={pending.length} color="var(--yellow)" />
          <Pill label="Confirmados" count={confirmed.length} color="var(--green)" />
          <Pill label="Rejeitados" count={rejected.length} color="var(--dim)" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {pending.length > 0 && (
            <button onClick={confirmAllMatches} style={{
              background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)",
              color: "var(--green)", borderRadius: 8, padding: "6px 14px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              <Check size={13} /> Confirmar todos
            </button>
          )}
          <button onClick={finish} style={{
            background: "var(--purple)", border: "none", color: "#fff",
            borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
            Aplicar e ver leads <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* Match cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {matchSuggestions.map(match => (
          <MatchCard key={match.id} match={match}
            onConfirm={() => confirmMatch(match.id)}
            onReject={() => rejectMatch(match.id)}
          />
        ))}
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={finish} style={{
          background: "var(--purple)", border: "none", color: "#fff",
          borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
        }}>
          <Zap size={15} /> Aplicar {confirmed.length} merge{confirmed.length !== 1 ? "s" : ""} e continuar
        </button>
      </div>
    </div>
  );
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
    </div>
  );
}

function MatchCard({ match, onConfirm, onReject }: { match: any; onConfirm: () => void; onReject: () => void }) {
  const { whatsappLead: wa, instagramLead: ig, confidence, reasons, status } = match;
  const borderColor = status === "confirmed" ? "rgba(34,197,94,.4)" : status === "rejected" ? "rgba(107,114,128,.3)" : "var(--brd)";
  const confColor = confidence >= 80 ? "var(--green)" : confidence >= 60 ? "var(--yellow)" : "var(--orange)";

  return (
    <div style={{ background: "var(--card)", border: `1px solid ${borderColor}`, borderRadius: 14, padding: "16px 20px", opacity: status === "rejected" ? 0.5 : 1, transition: "all .2s" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        <ContactCard label="💬 WhatsApp" lead={wa} labelColor="var(--green)" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 110, flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: confColor }}>{confidence}%</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>confiança</div>
          {reasons.map((r: string) => (
            <div key={r} style={{ fontSize: 9, color: "var(--dim)", background: "var(--card2)", borderRadius: 6, padding: "2px 7px", textAlign: "center" }}>✓ {r}</div>
          ))}
        </div>
        <ContactCard label="📸 Instagram" lead={ig} labelColor="#ec4899" />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0 }}>
          {status === "pending" && (
            <>
              <button onClick={onConfirm} style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)", color: "var(--green)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Check size={13} /> Unificar
              </button>
              <button onClick={onReject} style={{ background: "rgba(107,114,128,.1)", border: "1px solid rgba(107,114,128,.3)", color: "var(--dim)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <X size={13} /> Não é o mesmo
              </button>
            </>
          )}
          {status === "confirmed" && (
            <div style={{ textAlign: "center" }}>
              <Check size={22} color="var(--green)" />
              <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, marginTop: 4 }}>Unificado</div>
              <button onClick={onReject} style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 10, cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>desfazer</button>
            </div>
          )}
          {status === "rejected" && (
            <div style={{ textAlign: "center" }}>
              <X size={22} color="var(--dim)" />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Separados</div>
              <button onClick={onConfirm} style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 10, cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>desfazer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({ label, lead, labelColor }: { label: string; lead: any; labelColor: string }) {
  return (
    <div style={{ flex: 1, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <ScoreRing score={lead.score} size={38} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{lead.contact}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>{lead.phone || lead.filename}</div>
        </div>
      </div>
      <Badge cls={lead.classification} />
      <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
        <div style={{ fontSize: 10, color: "var(--dim)" }}><span style={{ fontWeight: 700, color: "var(--txt)" }}>{lead.totalMessages}</span> msgs</div>
        <div style={{ fontSize: 10, color: "var(--dim)" }}>inativo há <span style={{ fontWeight: 700, color: "var(--txt)" }}>{lead.daysInactive === 0 ? "hoje" : `${lead.daysInactive}d`}</span></div>
      </div>
    </div>
  );
}
