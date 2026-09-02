"use client";
import { useState, useMemo } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { Badge } from "@/components/zapintel/ui/atoms";
import { STATUS_META } from "@/types/zapintel";
import type { Lead } from "@/types/zapintel";
import { FileSpreadsheet, UserCheck, Search } from "lucide-react";

function WAButton({ phone }: { phone: string }) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const num = digits.startsWith("55") ? digits : `55${digits}`;
  const link = `https://wa.me/${num}`;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="Abrir conversa no WhatsApp"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.35)",
        color: "#25d166", borderRadius: 8, padding: "4px 10px",
        textDecoration: "none", fontSize: 11, fontWeight: 700, transition: "all .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,211,102,.25)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(37,211,102,.12)"; }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </a>
  );
}
import Link from "next/link";

function formatPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 13)
    return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`;
  if (digits.startsWith("55") && digits.length === 12)
    return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,8)}-${digits.slice(8)}`;
  if (digits.length === 11)
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  return raw;
}

function getChannel(lead: Lead): "whatsapp" | "instagram" | "both" {
  if (lead._sources) return "both";
  if (lead._channel === "instagram") return "instagram";
  if (lead.filename?.toLowerCase().endsWith(".json")) return "instagram";
  if (lead.filename?.toLowerCase().includes("instagram")) return "instagram";
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  if (lead.phone && digits.length < 4) return "instagram";
  return "whatsapp";
}

function channelLabel(ch: ReturnType<typeof getChannel>) {
  if (ch === "both") return "💬 📸";
  if (ch === "instagram") return "📸";
  return "💬";
}

// ── Excel export (pure JS, no library needed) ────────────────────────────────
function exportExcel(leads: Lead[]) {
  // Build CSV with BOM for Excel compatibility
  const rows = [
    ["Nome", "Telefone", "Status", "Score", "Canal", "Perfil", "Primeiro Contato", "Último Contato", "Sinais de Compra", "Objeções"]
  ];
  for (const lead of leads) {
    rows.push([
      lead.contact,
      formatPhone(lead.phone),
      STATUS_META[lead.classification as keyof typeof STATUS_META]?.label || lead.classification,
      String(lead.score),
      channelLabel(getChannel(lead)),
      lead.buyerProfile,
      lead.firstDate,
      lead.lastDate,
      lead.buySignals.join("; "),
      lead.objections.map((o) => o.label).join("; "),
    ]);
  }

  const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ZapIntel_Contatos.csv";
  a.click(); URL.revokeObjectURL(url);
}

// ── vCard export ─────────────────────────────────────────────────────────────
function exportVCard(leads: Lead[]) {
  const vcards = leads.map(lead => {
    const phone = lead.phone?.replace(/\D/g, "") || "";
    const nameParts = lead.contact.trim().split(" ");
    const firstName = nameParts[0] || lead.contact;
    const lastName = nameParts.slice(1).join(" ") || "";
    const note = `ZapIntel | ${STATUS_META[lead.classification as keyof typeof STATUS_META]?.label || lead.classification} | Score: ${lead.score} | ${lead.buyerProfile}`;

    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${lastName};${firstName};;;`,
      `FN:${lead.contact}`,
      phone ? `TEL;TYPE=CELL:+${phone.startsWith("55") ? "" : "55"}${phone}` : "",
      `NOTE:${note}`,
      `CATEGORIES:${STATUS_META[lead.classification as keyof typeof STATUS_META]?.label || lead.classification}`,
      "END:VCARD",
    ].filter(Boolean).join("\r\n");
  }).join("\r\n");

  const blob = new Blob([vcards], { type: "text/vcard;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ZapIntel_Contatos.vcf";
  a.click(); URL.revokeObjectURL(url);
}

export default function ContactsPage() {
  const { leads, loaded, loadSample, loading } = useLeads();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());


  // Only leads with a valid phone number (Brazilian format: 10+ digits, or starts with 55)
  const leadsWithPhone = useMemo(() =>
    leads.filter(l => {
      const digits = (l.phone || "").replace(/[^0-9]/g, "");
      // Must have at least 10 digits (2 area code + 8/9 number)
      // or 12-13 with country code 55
      if (digits.length < 10) return false;
      // Reject if the phone field has letters (it's a username, not a number)
      const hasLetters = /[a-zA-ZÀ-ÿ]/.test(l.phone || "");
      if (hasLetters) return false;
      return true;
    }),
  [leads]);

  const filtered = useMemo(() => {
    let list = [...leadsWithPhone];
    if (q) list = list.filter(l =>
      l.contact.toLowerCase().includes(q.toLowerCase()) ||
      l.phone?.includes(q)
    );
    if (cls !== "all") list = list.filter(l => l.classification === cls);
    return list;
  }, [leads, q, cls]);

  const withPhone = leadsWithPhone.length;
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };
  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const exportTargets = selected.size > 0
    ? leads.filter(l => selected.has(l.id))
    : filtered;

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
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.5, marginBottom: 4 }}>Contatos</h1>
          <p style={{ fontSize: 12, color: "var(--dim)" }}>
            {leads.length} contatos · {withPhone} com telefone · {selected.size > 0 ? `${selected.size} selecionados` : `${filtered.length} filtrados`}
          </p>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportExcel(exportTargets)} style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)",
            color: "var(--green)", borderRadius: 9, padding: "9px 16px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            <FileSpreadsheet size={15} />
            Exportar Excel
            <span style={{ fontSize: 11, opacity: .7 }}>({exportTargets.length})</span>
          </button>

          <button onClick={() => exportVCard(exportTargets.filter(l => !!l.phone))} style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.35)",
            color: "var(--blue)", borderRadius: 9, padding: "9px 16px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            <UserCheck size={15} />
            Exportar vCard
            <span style={{ fontSize: 11, opacity: .7 }}>({exportTargets.filter(l => !!l.phone).length} com tel.)</span>
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)",
        borderRadius: 10, padding: "10px 16px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--dim)",
      }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <div>
          <strong style={{ color: "var(--blue)" }}>vCard</strong> — importa direto no iPhone/Android como contato.
          {" "}<strong style={{ color: "var(--green)" }}>Excel</strong> — abre no Numbers, Google Sheets ou Excel com todos os dados.
          Selecione contatos específicos para exportar só eles, ou deixe em branco para exportar todos os filtrados.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", flex: 1, minWidth: 160 }}>
          <Search size={13} color="var(--muted)" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar nome ou telefone..."
            style={{ background: "transparent", border: "none", outline: "none", color: "var(--txt)", fontSize: 13, padding: "10px 0", width: "100%" }}
          />
        </div>

        <select value={cls} onChange={e => setCls(e.target.value)} style={{
          background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 14,
          color: "var(--txt)", fontSize: 12, padding: "0 12px", cursor: "pointer",
        }}>
          <option value="all">Todos os status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>


      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--brd)" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", width: 36 }}>
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  style={{ cursor: "pointer", accentColor: "var(--purple)", width: 15, height: 15 }}
                />
              </th>
              {["Nome", "Telefone", "Canal", "Status", "Score", "Perfil", "Primeiro Contato", "Sinais"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "var(--muted)", fontSize: 10, fontWeight: 700, letterSpacing: .7 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => {
              const ch = getChannel(lead);
              const isSelected = selected.has(lead.id);
              return (
                <tr key={lead.id}
                  style={{ borderBottom: "1px solid var(--card2)", background: isSelected ? "rgba(124,92,252,.06)" : "transparent", cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--card2)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => toggle(lead.id)}
                >
                  <td style={{ padding: "10px 14px" }}>
                    <input
                      type="checkbox" checked={isSelected}
                      onChange={() => toggle(lead.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: "pointer", accentColor: "var(--purple)", width: 15, height: 15 }}
                    />
                  </td>

                  <td style={{ padding: "10px 12px" }}>
                    <Link href={`/zapintel/leads/${lead.id}`} onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)" }}>{lead.contact}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{lead.filename}</div>
                    </Link>
                  </td>

                  <td style={{ padding: "10px 12px" }}>
                    {lead.phone ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 12, color: "var(--txt)", fontFamily: "monospace" }}>
                          {formatPhone(lead.phone)}
                        </div>
                        <WAButton phone={lead.phone} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>não detectado</span>
                    )}
                  </td>

                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {ch === "both" || ch === "whatsapp" ? (
                        <span style={{ fontSize: 9, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", color: "var(--green)", borderRadius: 20, padding: "2px 7px", fontWeight: 700 }}>💬 WA</span>
                      ) : null}
                      {ch === "both" || ch === "instagram" ? (
                        <span style={{ fontSize: 9, background: "rgba(236,72,153,.12)", border: "1px solid rgba(236,72,153,.3)", color: "#ec4899", borderRadius: 20, padding: "2px 7px", fontWeight: 700 }}>📸 IG</span>
                      ) : null}
                    </div>
                  </td>

                  <td style={{ padding: "10px 12px" }}><Badge cls={lead.classification} /></td>

                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      fontSize: 13, fontWeight: 800,
                      color: lead.score >= 70 ? "var(--green)" : lead.score >= 45 ? "var(--yellow)" : "var(--red)",
                    }}>{lead.score}</span>
                  </td>

                  <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--dim)" }}>{lead.buyerProfile}</td>

                  <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--dim)" }}>{lead.firstDate || "—"}</td>

                  <td style={{ padding: "10px 12px" }}>
                    {lead.buySignals.length > 0 ? (
                      <span style={{
                        background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)",
                        color: "var(--green)", borderRadius: 10, padding: "2px 8px", fontSize: 10,
                      }}>✓ {lead.buySignals.length}</span>
                    ) : <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {leadsWithPhone.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>
            Nenhum contato encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      {/* Selection actions */}
      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--panel)", border: "1px solid var(--purple)",
          borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,.5)", zIndex: 100,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--purple-l)" }}>
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div style={{ width: 1, height: 20, background: "var(--brd)" }} />
          <button onClick={() => exportExcel(exportTargets)} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)",
            color: "var(--green)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={() => exportVCard(exportTargets.filter((l) => !!l.phone))} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.4)",
            color: "var(--blue)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <UserCheck size={14} /> vCard
          </button>
          <button onClick={() => setSelected(new Set())} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 12, cursor: "pointer",
          }}>
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
