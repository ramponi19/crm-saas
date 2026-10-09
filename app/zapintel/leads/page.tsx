"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { Badge, ScoreRing } from "@/components/zapintel/ui/atoms";
import { STATUS_META } from "@/types/zapintel";
import type { Lead } from "@/types/zapintel";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

const PAGE_SIZE = 100;

function whatsappLink(phone: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits || digits.length < 10) return null;
  const num = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${num}`;
}

function WAButton({ phone }: { phone: string }) {
  const link = whatsappLink(phone);
  if (!link) return <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="Abrir no WhatsApp"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.35)",
        color: "#25d166", textDecoration: "none", transition: "all .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,211,102,.28)"; e.currentTarget.style.transform = "scale(1.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(37,211,102,.12)"; e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </a>
  );
}

function detectOrigin(lead: Lead): "whatsapp" | "instagram" | "both" {
  if (lead._sources) return "both";
  if (lead._channel === "instagram") return "instagram";
  if (lead.filename?.toLowerCase().endsWith(".json")) return "instagram";
  if (lead.filename?.toLowerCase().includes("instagram")) return "instagram";
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  if (lead.phone && digits.length < 4) return "instagram";
  return "whatsapp";
}

function OrigemBadge({ lead }: { lead: Lead }) {
  const origin = detectOrigin(lead);
  if (origin === "both") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", color: "var(--green)", borderRadius: 20, padding: "1px 6px", fontWeight: 700 }}>💬 WA</span>
      <span style={{ fontSize: 9, background: "rgba(236,72,153,.12)", border: "1px solid rgba(236,72,153,.3)", color: "#ec4899", borderRadius: 20, padding: "1px 6px", fontWeight: 700 }}>📸 IG</span>
    </div>
  );
  if (origin === "instagram") return (
    <span style={{ fontSize: 9, background: "rgba(236,72,153,.12)", border: "1px solid rgba(236,72,153,.3)", color: "#ec4899", borderRadius: 20, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap" }}>📸 Instagram</span>
  );
  return (
    <span style={{ fontSize: 9, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", color: "var(--green)", borderRadius: 20, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap" }}>💬 WhatsApp</span>
  );
}

export default function LeadsPage() {
  const { leads, loaded, loadSample, loading } = useLeads();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [sort, setSort] = useState<"score" | "date_asc" | "date_desc" | "msgs">("score");
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();

  // Extended URL filter params
  const urlUrgency    = searchParams.get("urgency") || "";
  const urlSignal     = searchParams.get("signal") || "";
  const urlObjection  = searchParams.get("objection") || "";
  const urlProfile    = searchParams.get("profile") || "";
  const urlInactMin   = parseInt(searchParams.get("inactive_min") || "0");
  const urlInactMax   = parseInt(searchParams.get("inactive_max") || "9999");
  const urlScoreMin   = parseInt(searchParams.get("score_min") || "0");
  const urlScoreMax   = parseInt(searchParams.get("score_max") || "100");
  const urlGhost      = searchParams.get("ghost") === "1";
  const urlReferral   = searchParams.get("referral") === "1";
  const urlLabel      = searchParams.get("label") || "";
  const hasExtFilter  = !!(urlUrgency || urlSignal || urlObjection || urlProfile || urlGhost || urlReferral || urlInactMin > 0 || urlInactMax < 9999 || urlScoreMin > 0 || urlScoreMax < 100);

  // Apply filter from URL query param (e.g. ?filter=hot&sort=score)
  useEffect(() => {
    const f = searchParams.get("filter");
    const s = searchParams.get("sort");
    if (f) setCls(f); else setCls("all");
    if (s) setSort(s as typeof sort);
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = [...leads];
    // Text search
    if (q) list = list.filter(l =>
      l.contact.toLowerCase().includes(q.toLowerCase()) ||
      l.filename.toLowerCase().includes(q.toLowerCase())
    );
    // Classification
    if (cls !== "all") list = list.filter(l => l.classification === cls);
    // Extended filters from URL
    if (urlUrgency)   list = list.filter(l => l.urgency === urlUrgency);
    if (urlSignal)    list = list.filter(l => l.buySignals.some(s => s.toLowerCase().includes(urlSignal.toLowerCase())));
    if (urlObjection) list = list.filter(l => l.objections.some(o => o.label.toLowerCase().includes(urlObjection.toLowerCase())));
    if (urlProfile)   list = list.filter(l => l.buyerProfile === urlProfile);
    if (urlInactMin > 0)   list = list.filter(l => l.daysInactive >= urlInactMin);
    if (urlInactMax < 9999) list = list.filter(l => l.daysInactive <= urlInactMax);
    if (urlScoreMin > 0)   list = list.filter(l => l.score >= urlScoreMin);
    if (urlScoreMax < 100) list = list.filter(l => l.score <= urlScoreMax);
    // `fantasma` e `indicacao` são decididos no servidor, lendo a conversa
    // inteira. Antes esta tela varria `messages` — e só achava o que coubesse
    // nas mensagens que tinham vindo.
    if (urlGhost)    list = list.filter(l => l.fantasma);
    if (urlReferral) list = list.filter(l => l.indicacao);
    // Sort
    if (sort === "score") list.sort((a, b) => b.score - a.score);
    else if (sort === "date_desc") list.sort((a, b) => a.daysInactive - b.daysInactive);
    else if (sort === "date_asc") list.sort((a, b) => b.daysInactive - a.daysInactive);
    else list.sort((a, b) => b.totalMessages - a.totalMessages);
    return list;
  }, [leads, q, cls, sort, urlUrgency, urlSignal, urlObjection, urlProfile, urlInactMin, urlInactMax, urlScoreMin, urlScoreMax, urlGhost, urlReferral]);

  /**
   * Volta para a primeira pagina quando os filtros mudam.
   *
   * Isto era `setPage(1)` DENTRO do `useMemo` acima — escrever estado durante a
   * renderizacao, que a regra nova do React 19 (`set-state-in-render`) apontou no
   * upgrade para o Next 16. Filtrar disparava uma renderizacao dentro de outra;
   * funcionava por sorte, e em renderizacao concorrente e o tipo de coisa que
   * vira laco ou resultado descartado.
   */
  const chaveDosFiltros = [q, cls, sort, urlUrgency, urlSignal, urlObjection, urlProfile, urlInactMin, urlInactMax, urlScoreMin, urlScoreMax, urlGhost, urlReferral].join('|');
  useEffect(() => { setPage(1); }, [chaveDosFiltros]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Trava a pagina no intervalo valido: filtrar de 9 paginas para 2 deixaria a
  // lista vazia por um instante ate o efeito acima rodar.
  const paginaAtual = Math.min(page, totalPages);
  const paginated = filtered.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  if (!loaded) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <p style={{ color: "var(--dim)", marginBottom: 16 }}>Nenhum dado carregado ainda.</p>
      <button onClick={loadSample} style={{ background: "var(--purple)", color: "#fff", borderRadius: 9, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" }}>
        {loading ? "Carregando..." : "Carregar exemplo"}
      </button>
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.5 }}>
            {urlLabel ? urlLabel : "Todos os Leads"}
          </h1>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 3 }}>
            {filtered.length} conversas · página {page} de {totalPages}
          </p>
        </div>
        {(hasExtFilter || cls !== "all") && (
          <Link href="/zapintel/leads" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(124,92,252,.12)", border: "1px solid rgba(124,92,252,.35)",
            borderRadius: 9, padding: "7px 14px", textDecoration: "none",
            fontSize: 12, fontWeight: 700, color: "var(--purple-l)",
          }}>
            ✕ Limpar filtro
          </Link>
        )}
      </div>

      {/* Active filter banner */}
      {(hasExtFilter || cls !== "all") && (
        <div style={{
          background: "rgba(124,92,252,.08)", border: "1px solid rgba(124,92,252,.3)",
          borderRadius: 10, padding: "10px 16px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13 }}>🔍</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--purple-l)" }}>Filtro ativo:</span>
          {urlLabel && <span style={{ fontSize: 12, color: "var(--dim)" }}>{urlLabel}</span>}
          {cls !== "all" && !urlLabel && <span style={{ fontSize: 12, color: "var(--dim)" }}>Classificação: {cls}</span>}
          {urlUrgency && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--orange)" }}>Urgência: {urlUrgency}</span>}
          {urlSignal && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--green)" }}>Sinal: {urlSignal}</span>}
          {urlObjection && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--yellow)" }}>Objeção: {urlObjection}</span>}
          {urlProfile && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--blue)" }}>Perfil: {urlProfile}</span>}
          {urlGhost && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--muted)" }}>👻 Ghost leads</span>}
          {urlReferral && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--teal)" }}>🎁 Por indicação</span>}
          {urlInactMin > 0 && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--red)" }}>Inativo ≥{urlInactMin}d</span>}
          {urlInactMax < 9999 && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--blue)" }}>Inativo ≤{urlInactMax}d</span>}
          {urlScoreMin > 0 && <span style={{ fontSize: 11, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 20, padding: "2px 8px", color: "var(--purple-l)" }}>Score ≥{urlScoreMin}</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{filtered.length} encontrados</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", flex: 1 }}>
          <Search size={13} color="var(--muted)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou arquivo..."
            style={{ background: "transparent", border: "none", outline: "none", color: "var(--txt)", fontSize: 13, padding: "9px 0", width: "100%" }} />
        </div>
        <select value={cls} onChange={e => setCls(e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 14, color: "var(--txt)", fontSize: 12, padding: "0 10px", cursor: "pointer" }}>
          <option value="all">Todos</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 14, color: "var(--txt)", fontSize: 12, padding: "0 10px", cursor: "pointer" }}>
          <option value="score">Score</option>
          <option value="date_desc">📅 Mais recente</option>
          <option value="date_asc">📅 Mais antigo</option>
          <option value="msgs">Mensagens</option>
        </select>
      </div>

      {/* Active filter banner */}
      {cls !== "all" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
          background: "rgba(124,92,252,.08)", border: "1px solid rgba(124,92,252,.25)",
          borderRadius: 9, padding: "8px 14px",
        }}>
          <span style={{ fontSize: 12, color: "var(--purple-l)", fontWeight: 700 }}>
            Filtro ativo: {STATUS_META[cls as keyof typeof STATUS_META]?.label || cls}
          </span>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>— {filtered.length} leads</span>
          <button onClick={() => setCls("all")} style={{
            marginLeft: "auto", background: "transparent", border: "none",
            color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11,
          }}>
            <X size={12} /> Limpar filtro
          </button>
        </div>
      )}

      {/* Table — compact, no horizontal scroll */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} /> {/* Contato */}
            <col style={{ width: "36px" }} /> {/* WhatsApp */}
            <col style={{ width: "100px" }} /> {/* Origem */}
            <col style={{ width: "130px" }} /> {/* Status */}
            <col style={{ width: "48px" }} /> {/* Score */}
            <col style={{ width: "110px" }} /> {/* Último Contato */}
            <col style={{ width: "auto" }} />  {/* Próxima Ação */}
            <col style={{ width: "42px" }} />  {/* Ver */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--brd)" }}>
              {["Contato", "", "Origem", "Status", "Score", "Último Contato", "Próxima Ação", ""].map((h, i) => (
                <th key={i} style={{ padding: "10px 10px", textAlign: "left", color: "var(--muted)", fontSize: 10, fontWeight: 700, letterSpacing: .6, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map(l => (
              <tr key={l.id}
                style={{ borderBottom: "1px solid var(--card2)", transition: "background .1s", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => router.push(`/zapintel/leads/${l.id}`)}
              >
                {/* Contato */}
                <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.contact}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.sellerName && l.sellerName !== "Loja" ? `${l.sellerName} · ` : ""}
                    {l.daysInactive === 0 ? "Hoje" : l.daysInactive === 1 ? "Ontem" : `${l.daysInactive}d`}
                    {l.lastDate ? ` · ${new Date(l.lastDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}
                  </div>
                </td>

                {/* WhatsApp */}
                <td style={{ padding: "9px 6px" }} onClick={e => e.stopPropagation()}>
                  <WAButton phone={l.phone} />
                </td>

                {/* Origem */}
                <td style={{ padding: "9px 10px" }}>
                  <OrigemBadge lead={l} />
                </td>

                {/* Status */}
                <td style={{ padding: "9px 10px" }}>
                  <Badge cls={l.classification} />
                </td>

                {/* Score */}
                <td style={{ padding: "9px 10px" }}>
                  <ScoreRing score={l.score} size={36} />
                </td>

                {/* Último Contato + duração da conversa */}
                <td style={{ padding: "9px 10px" }}>
                  <div style={{ fontSize: 12, color: l.daysInactive <= 1 ? "var(--green)" : l.daysInactive <= 7 ? "var(--yellow)" : "var(--red)", fontWeight: 600 }}>
                    {l.daysInactive === 0 ? "Hoje" : l.daysInactive === 1 ? "Ontem" : `${l.daysInactive}d atrás`}
                  </div>
                  {l.conversationDays > 0 && (
                    <div style={{ fontSize: 10, color: "var(--teal)", marginTop: 2 }}>
                      🗓 {l.conversationDays}d de conversa
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                    {l.buySignals.length > 0 && (
                      <span style={{ fontSize: 9, color: "var(--green)", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 8, padding: "1px 5px" }}>✓{l.buySignals.length}</span>
                    )}
                    {l.objections.length > 0 && (
                      <span style={{ fontSize: 9, color: "var(--yellow)", background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.25)", borderRadius: 8, padding: "1px 5px" }}>⚠{l.objections.length}</span>
                    )}
                  </div>
                </td>

                {/* Próxima Ação */}
                <td style={{ padding: "9px 10px", fontSize: 11, color: "var(--dim)", overflow: "hidden" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.nextAction}
                  </div>
                </td>

                {/* Ver */}
                <td style={{ padding: "9px 10px" }} onClick={e => e.stopPropagation()}>
                  <Link href={`/zapintel/leads/${l.id}`} style={{ color: "var(--purple-l)", fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>
            Nenhum lead encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "0 4px" }}>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{
              background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 7,
              color: page === 1 ? "var(--muted)" : "var(--txt)", fontSize: 11, padding: "5px 10px", cursor: page === 1 ? "not-allowed" : "pointer",
            }}>« Primeiro</button>

            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
              background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 7,
              color: page === 1 ? "var(--muted)" : "var(--txt)", padding: "5px 10px", cursor: page === 1 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center",
            }}>
              <ChevronLeft size={14} />
            </button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button key={p} onClick={() => setPage(p)} style={{
                  background: page === p ? "var(--purple)" : "var(--card2)",
                  border: `1px solid ${page === p ? "var(--purple)" : "var(--brd2)"}`,
                  borderRadius: 7, color: page === p ? "#fff" : "var(--txt)",
                  fontSize: 12, fontWeight: page === p ? 700 : 400,
                  padding: "5px 10px", cursor: "pointer", minWidth: 32,
                }}>{p}</button>
              );
            })}

            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
              background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 7,
              color: page === totalPages ? "var(--muted)" : "var(--txt)", padding: "5px 10px", cursor: page === totalPages ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center",
            }}>
              <ChevronRight size={14} />
            </button>

            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{
              background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 7,
              color: page === totalPages ? "var(--muted)" : "var(--txt)", fontSize: 11, padding: "5px 10px", cursor: page === totalPages ? "not-allowed" : "pointer",
            }}>Último »</button>
          </div>
        </div>
      )}
    </div>
  );
}
