"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/hooks/zapintel/useLeads";
import type { Lead } from "@/types/zapintel";
import type { Ficha } from "@/lib/zapintel/ficha";
import { Badge, ScoreRing, UrgencyDot } from "@/components/zapintel/ui/atoms";
import { generateCopilot, type CopilotResult, type CopilotStrategy } from "@/lib/zapintel/insights/followUp";
import { getProducts } from "@/lib/zapintel/segments/segments";
import { ArrowLeft, Copy, RefreshCw, Sparkles, CheckCircle2, X, Bot, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { ManualSale } from "@/types/zapintel";

// ── Manual Sale Modal ─────────────────────────────────────────────────────────
function SaleModal({ contact, products, onConfirm, onClose }: {
  contact: string;
  products: string[];
  onConfirm: (sale: ManualSale) => void;
  onClose: () => void;
}) {
  const [product, setProduct] = useState("");
  const [customProduct, setCustomProduct] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit() {
    const prod = product === "Outro" ? customProduct : product;
    if (!prod) return;
    onConfirm({
      product: prod,
      value: parseFloat(value.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0,
      notes,
      closedAt: new Date().toISOString().split("T")[0],
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--panel)", border: "1px solid var(--brd)", borderRadius: 16,
        padding: 28, width: "100%", maxWidth: 460,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>✅ Marcar Venda Fechada</h2>
            <p style={{ fontSize: 12, color: "var(--dim)" }}>{contact}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, display: "block", marginBottom: 6 }}>PRODUTO VENDIDO *</label>
            <select value={product} onChange={e => setProduct(e.target.value)} style={{
              width: "100%", background: "var(--card)", border: "1px solid var(--brd2)",
              borderRadius: 9, padding: "9px 12px", color: product ? "var(--txt)" : "var(--muted)",
              fontSize: 13, cursor: "pointer",
            }}>
              <option value="">Selecione o produto...</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {product === "Outro" && (
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, display: "block", marginBottom: 6 }}>QUAL PRODUTO?</label>
              <input value={customProduct} onChange={e => setCustomProduct(e.target.value)}
                placeholder="Descreva o produto vendido..."
                style={{ width: "100%", background: "var(--card)", border: "1px solid var(--brd2)", borderRadius: 9, padding: "9px 12px", color: "var(--txt)", fontSize: 13 }} />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, display: "block", marginBottom: 6 }}>VALOR DA VENDA (R$)</label>
            <input value={value} onChange={e => setValue(e.target.value)}
              placeholder="Ex: 5995,00"
              style={{ width: "100%", background: "var(--card)", border: "1px solid var(--brd2)", borderRadius: 9, padding: "9px 12px", color: "var(--txt)", fontSize: 13 }} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: .6, display: "block", marginBottom: 6 }}>OBSERVAÇÃO (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Pagou à vista, entregue na loja, cliente fidelizado..."
              rows={3}
              style={{ width: "100%", background: "var(--card)", border: "1px solid var(--brd2)", borderRadius: 9, padding: "9px 12px", color: "var(--txt)", fontSize: 13, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 9,
              padding: "11px 0", fontSize: 13, color: "var(--dim)", cursor: "pointer",
            }}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!product || (product === "Outro" && !customProduct)} style={{
              flex: 2, background: "var(--green)", border: "none", borderRadius: 9,
              padding: "11px 0", fontSize: 13, fontWeight: 700, color: "#fff",
              cursor: !product ? "not-allowed" : "pointer", opacity: !product ? .5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
              <CheckCircle2 size={16} /> Confirmar Venda Fechada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function whatsappLink(phone: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const num = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${num}`;
}

type Tab = "whatsapp" | "instagram" | "all";

export default function LeadDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { leads, markSaleClosed, storeName, sellerName, segment, calculadoEm } = useLeads();
  const saleProducts = [...getProducts(segment.id), "Outro"];
  const resumo = leads.find(l => l.id === id);

  /**
   * A CONVERSA NÃO VEM NA LISTA — É BUSCADA AQUI.
   *
   * O painel manda 2.039 leads sem o texto das conversas; mandá-lo todo seria
   * 4 MB e foi o que obrigava a truncar a análise. Esta tela é a única que
   * precisa das mensagens de verdade, então pede exatamente uma conversa.
   *
   * Caminho único desde 10/10/2026: a importação manual saiu do produto, e com
   * ela o segundo caminho que existia aqui (texto já no navegador, sem a quem
   * pedir). Um caminho só é um resultado só.
   */
  const [conversa, setConversa] = useState<Lead | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  /**
   * O histórico começa FECHADO.
   *
   * Era o padrão abrir, e com ele a ficha virou enfeite: continuava mais
   * rápido rolar 41 mensagens do que confiar no resumo. Fechado, a ficha
   * precisa se bastar — e quando não bastar, a conversa está a um clique,
   * porque esconder a fonte é como se perde confiança no número.
   */
  const [verConversa, setVerConversa] = useState(false);
  const [falhouConversa, setFalhouConversa] = useState(false);

  useEffect(() => {
    if (!resumo?.leadId) return;
    let vivo = true;
    fetch(`/zapintel/api/conversa?lead=${resumo.leadId}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!vivo) return;
        if (d?.lead) { setConversa(d.lead as Lead); setFicha((d.ficha as Ficha) ?? null); }
        else setFalhouConversa(true);
      })
      .catch(() => { if (vivo) setFalhouConversa(true); });
    return () => { vivo = false; };
  }, [resumo?.leadId]);

  // Derivado, não guardado: "está carregando" é exatamente "tem o que buscar e
  // ainda não chegou". Um estado separado só poderia divergir disso.
  const carregandoConversa = !!resumo?.leadId && !conversa && !falhouConversa;

  // O resumo (score, classificação, perfil) vem da lista e aparece na hora; as
  // mensagens chegam depois. Enquanto não chegam, a conversa fica vazia — e a
  // tela diz que está carregando, em vez de afirmar que não há nada.
  const lead: Lead | null = (resumo
    ? { ...(resumo as unknown as Lead), messages: conversa?.messages ?? [] }
    : null);

  const [tab, setTab] = useState<Tab>("all");
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [copilot, setCopilot] = useState<CopilotResult | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{id:string;type:string;description:string;timestamp:string}[]>([]);

  function logAction(type: string, description: string) {
    setActionLog(prev => [{id:Math.random().toString(36).slice(2),type,description,timestamp:new Date().toISOString()},...prev].slice(0,50));
  }

  if (!lead) return (
    <div style={{ textAlign: "center", paddingTop: 80, color: "var(--dim)" }}>
      Lead não encontrado.{" "}
      <button onClick={() => router.back()} style={{ color: "var(--purple-l)", background: "none", border: "none", cursor: "pointer" }}>
        Voltar
      </button>
    </div>
  );

  // Detect if this lead has both sources
  const sources = (lead as Lead)._sources;
  const isMerged = !!sources;

  // Filter messages by tab
  const displayMessages = (() => {
    if (!isMerged || tab === "all") return lead.messages;
    return lead.messages.filter((m) => (m.source ?? "whatsapp") === tab);
  })();

  const waMessages = isMerged ? lead.messages.filter((m) => m.source === "whatsapp") : lead.messages;
  const igMessages = isMerged ? lead.messages.filter((m) => m.source === "instagram") : [];

  async function runCopilot() {
    if (!lead) return;
    setCopilotLoading(true); setCopilotError(""); setCopilot(null);
    try {
      const result = await generateCopilot(lead);
      setCopilot(result);
      logAction("copilot", "Copilot ativado — diagnóstico e 3 estratégias geradas");
    } catch (e) {
      setCopilotError(e instanceof Error ? e.message : "Erro ao gerar. Verifique a chave da API.");
    }
    setCopilotLoading(false);
  }

  async function copyMsg(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    logAction("message_copied", `Mensagem copiada: estratégia "${id}"`);

    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function regenStrategy(stratId: string) {
    if (!lead || !copilot) return;
    setRegenId(stratId);
    try {
      const fresh = await generateCopilot(lead);
      const updated = fresh.strategies.find(s => s.id === stratId);
      if (updated) {
        setCopilot(prev => prev ? {
          ...prev,
          strategies: prev.strategies.map(s => s.id === stratId ? updated : s),
        } : prev);
      }
    } catch { /* keep old */ }
    setRegenId(null);
  }

  const urgColors: Record<string, string> = {
    critical: "var(--red)", high: "var(--orange)", medium: "var(--yellow)", low: "var(--dim)",
  };
  const urgCol = urgColors[lead.urgency] || "var(--dim)";

  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      <button onClick={() => router.back()} style={{
        display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
        color: "var(--dim)", cursor: "pointer", fontSize: 13, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Voltar
      </button>

      {/*
        A FICHA — o que aconteceu nesta conversa, antes de qualquer número.

        Pedida pelo Lucas em 10/10/2026: "ao invés de trazer o histórico de
        chats, trazer como foi ou está sendo a conversa". É o mesmo princípio
        que as ferramentas do segmento chamam de revisar trechos em vez de
        médias — o número acha o momento, o trecho mostra o que fazer.

        Fica ACIMA do score e da classificação de propósito: hoje sabemos que
        a classificação quase não ordena nada fora de `customer` e `hot`
        (medido em 10/10: `unqualified` converte a 1,2% e `followup` a 0,2%).
        O relato diz mais do que o rótulo.
      */}
      {ficha && (
        <div className="card" style={{ padding: 20, marginBottom: 14, borderLeft: "3px solid var(--purple)" }}>
          {/*
            A DATA AO LADO DO TÍTULO, e não escondida no rodapé.

            Esta tela mistura duas idades sem avisar: o cabeçalho (score,
            classificação, dias inativo) vem do painel em cache, que só é
            refeito quando alguém clica em "Sincronizar agora"; a ficha é
            calculada AGORA, a cada abertura, direto da conversa. Duas verdades
            na mesma tela, com aparências idênticas — que é exatamente o modo
            de falha deste módulo. Enquanto as duas não vierem do mesmo lugar,
            cada uma diz de quando é.
          */}
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            gap: 10, marginBottom: 8,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .5 }}>
              O QUE ACONTECEU
            </div>
            <div style={{ fontSize: 10, color: "var(--dim)" }}>
              analisado agora · conversa até{" "}
              {ficha.ultimaEm
                ? new Date(`${ficha.ultimaEm}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                : "—"}
              {calculadoEm && (
                <> · números do painel de{" "}
                  {new Date(calculadoEm).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--txt)", marginBottom: 14 }}>
            {ficha.relato}
          </div>

          {/*
            OS TRÊS MOMENTOS. É o que alguém procuraria rolando a conversa:
            o que ele pediu, o que foi oferecido, e como ficou. Sem eles a
            ficha é resumo — e resumo obriga a abrir as duas coisas.
          */}
          {(ficha.primeiraFalaDoCliente || ficha.ultimaOferta || ficha.fraseAntesDoSilencio) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {ficha.primeiraFalaDoCliente && (
                <Momento rotulo="Ele abriu com" texto={ficha.primeiraFalaDoCliente} cor="var(--blue)" />
              )}
              {ficha.ultimaOferta && (
                <Momento rotulo="A loja ofereceu" texto={ficha.ultimaOferta} cor="var(--yellow)" />
              )}
              {ficha.fraseAntesDoSilencio && (
                <Momento rotulo="Última coisa dita" texto={ficha.fraseAntesDoSilencio} cor="var(--orange)" />
              )}
              {ficha.aguardandoLoja && (
                <Momento rotulo="Parou em" texto="a última fala foi dele — a loja deve resposta" cor="var(--red)" />
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: "var(--muted)" }}>
            <span><b style={{ color: "var(--txt)" }}>{ficha.mensagensLead}</b> dele · <b style={{ color: "var(--txt)" }}>{ficha.mensagensLoja}</b> da loja</span>
            <span><b style={{ color: "var(--txt)" }}>{ficha.trocasDeTurno}</b> trocas de turno</span>
            {ficha.respostaMedianaMin != null && (
              <span>responde em <b style={{ color: ficha.respostaMedianaMin > 60 ? "var(--orange)" : "var(--txt)" }}>
                {ficha.respostaMedianaMin < 60 ? `${ficha.respostaMedianaMin} min` : `${Math.round(ficha.respostaMedianaMin / 60)}h`}
              </b></span>
            )}
            {/* Monólogo: o equivalente em texto do "longest monologue" que o
                Gong mede em chamada. Acima de 3 já é apresentação, não conversa. */}
            {ficha.monologoLoja >= 3 && (
              <span>maior sequência da loja sem resposta: <b style={{ color: "var(--orange)" }}>{ficha.monologoLoja}</b></span>
            )}
            <span><b style={{ color: ficha.perguntasDaLoja === 0 ? "var(--red)" : "var(--txt)" }}>{ficha.perguntasDaLoja}</b> perguntas da loja</span>
            {ficha.tentativasDeRetomada > 0 && (
              <span><b style={{ color: "var(--txt)" }}>{ficha.tentativasDeRetomada}</b> tentativas de retomada</span>
            )}
          </div>
        </div>
      )}

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>{lead.contact}</h1>
              {/* Source badges */}
              {isMerged ? (
                <div style={{ display: "flex", gap: 5 }}>
                  <SourceBadge type="whatsapp" />
                  <SourceBadge type="instagram" />
                </div>
              ) : (
                <SourceBadge type={lead._channel === "instagram" ? "instagram" : "whatsapp"} />
              )}
            </div>
            <p style={{ color: "var(--dim)", fontSize: 12, marginBottom: 10 }}>
              {lead.phone || lead.filename} · {storeName || sellerName}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Badge cls={lead.classification} />
              {lead.phone && (() => {
                const link = whatsappLink(lead.phone);
                return link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "#075e54", borderRadius: 10,
                    padding: "7px 16px", textDecoration: "none",
                    transition: "all .2s", border: "none",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "#128c7e"}
                    onMouseLeave={e => e.currentTarget.style.background = "#075e54"}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Responder no WhatsApp</span>
                  </a>
                ) : null;
              })()}
            </div>
          </div>
          <ScoreRing score={lead.score} size={54} />
        </div>

        {/* Merged info banner */}
        {isMerged && (
          <div style={{
            background: "rgba(124,92,252,.08)", border: "1px solid rgba(124,92,252,.3)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 10, fontSize: 12,
          }}>
            <span style={{ fontSize: 16 }}>🔗</span>
            <div style={{ color: "var(--dim)" }}>
              Perfil unificado —
              <span style={{ color: "var(--green)", fontWeight: 700 }}> 💬 {waMessages.length} mensagens WhatsApp</span>
              {" "}+
              <span style={{ color: "#ec4899", fontWeight: 700 }}> 📸 {igMessages.length} mensagens Instagram</span>
            </div>
          </div>
        )}

        {/* Insight */}
        <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--purple-l)", letterSpacing: .7, marginBottom: 5 }}>ANÁLISE DE IA</div>
          <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>{lead.insight}</p>
        </div>

        {/* Meta cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
          {[
            { l: "Perfil", v: lead.buyerProfile, c: "var(--txt)" },
            { l: "Duração da conversa", v: lead.conversationDays === 0 ? "1 dia" : `${lead.conversationDays}d`, c: "var(--teal)", tip: "dias entre 1ª e última mensagem" },
            { l: "Inativo há", v: lead.daysInactive === 0 ? "Hoje" : `${lead.daysInactive}d`, c: lead.daysInactive <= 2 ? "var(--green)" : lead.daysInactive <= 7 ? "var(--yellow)" : "var(--red)" },
            { l: "Mensagens", v: String(lead.totalMessages), c: "var(--blue)" },
            { l: "Risco de perda", v: `${lead.lossRisk}%`, c: lead.lossRisk > 60 ? "var(--red)" : "var(--yellow)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="card2" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .5, marginBottom: 3 }}>{l.toUpperCase()}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Buy signals */}
        {lead.buySignals.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .7, marginBottom: 8 }}>SINAIS DE COMPRA</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {lead.buySignals.map(s => (
                <span key={s} style={{ background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)", color: "var(--green)", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>✓ {s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Objections */}
        {lead.objections.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .7, marginBottom: 8 }}>OBJEÇÕES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {lead.objections.map(o => (
                <span key={o.label} style={{ background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)", color: "var(--yellow)", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>⚠ {o.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Next action */}
        <div style={{ background: "var(--card2)", border: `1px solid ${urgCol}50`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: urgCol, letterSpacing: .7, marginBottom: 5 }}>
            <UrgencyDot urgency={lead.urgency} />
            PRÓXIMA AÇÃO · {lead.urgency.toUpperCase()}
          </div>
          <p style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.6 }}>{lead.nextAction}</p>
        </div>
      </div>

      {/* ── Marcar Venda Fechada ───────────────────────────────────────────── */}
      {lead.classification !== "customer" && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Venda fechada fora do chat?</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Marque manualmente e o dashboard será atualizado.</div>
            </div>
            <button onClick={() => setShowSaleModal(true)} style={{
              background: "var(--green)", border: "none", borderRadius: 10,
              padding: "10px 18px", fontSize: 13, fontWeight: 700, color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
              transition: "opacity .15s",
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = ".85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <CheckCircle2 size={15} /> Marcar como Venda Fechada
            </button>
          </div>
        </div>
      )}

      {/* Manual sale badge if already marked */}
      {lead.classification === "customer" && lead.manualSale && (
        <div style={{
          background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.3)",
          borderRadius: 12, padding: "12px 18px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <CheckCircle2 size={18} color="var(--green)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
              ✅ Venda fechada manualmente — {lead.manualSale.product}
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              {lead.manualSale.value > 0 ? `R$ ${lead.manualSale.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · ` : ""}
              {lead.manualSale.closedAt}
              {lead.manualSale.notes ? ` · ${lead.manualSale.notes}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ── Copilot de Vendas ───────────────────────────────────────────── */}
      <SalesCopilot
        lead={lead}
        copilot={copilot}
        loading={copilotLoading}
        error={copilotError}
        copiedId={copiedId}
        regenId={regenId}
        onRun={runCopilot}
        onCopy={copyMsg}
        onRegen={regenStrategy}
      />

      {/* ── Histórico de Ações ──────────────────────────────────────────── */}
      <ActionLogPanel log={actionLog} />

      {/* ── Conversation history with tabs ──────────────────────────────── */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          {/*
            Vira botão: a conversa é a FONTE, não a tela. Quem confia na ficha
            não abre; quem quiser conferir, confere.
          */}
          <button
            onClick={() => setVerConversa(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: "none",
              border: "none", padding: 0, cursor: "pointer", color: "var(--txt)",
              fontSize: 14, fontWeight: 700,
            }}
          >
            {verConversa ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {verConversa ? "Esconder a conversa" : "Ver a conversa"}
            {!carregandoConversa && lead.messages.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                {lead.messages.length} mensagens
              </span>
            )}
          </button>

          {/* Tabs — only show if merged */}
          {isMerged && verConversa && (
            <div style={{ display: "flex", gap: 4, background: "var(--card2)", borderRadius: 10, padding: 4 }}>
              {([
                { key: "all", label: "Tudo", count: lead.messages.length },
                { key: "whatsapp", label: "💬 WhatsApp", count: waMessages.length },
                { key: "instagram", label: "📸 Instagram", count: igMessages.length },
              ] as { key: Tab; label: string; count: number }[]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  background: tab === t.key ? "var(--card)" : "transparent",
                  border: tab === t.key ? "1px solid var(--brd)" : "1px solid transparent",
                  borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: tab === t.key ? 700 : 400,
                  color: tab === t.key ? "var(--txt)" : "var(--muted)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {t.label}
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>({t.count})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          A conversa chega depois do resumo: a lista de leads vem sem o texto
          das mensagens, e esta tela pede a dela. Dizer "carregando" é o que
          impede a tela de afirmar que a conversa está vazia enquanto ela vem.
        */}
        {carregandoConversa && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[70, 48, 62].map((largura, i) => (
              <div key={i} style={{
                alignSelf: i % 2 ? "flex-end" : "flex-start",
                width: `${largura}%`, height: 44, borderRadius: 13,
                background: "linear-gradient(90deg, var(--card2) 0%, var(--brd) 50%, var(--card2) 100%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
              }} />
            ))}
            <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Buscando a conversa…
            </div>
          </div>
        )}

        {falhouConversa && (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", padding: "18px 0" }}>
            Não consegui carregar a conversa agora.
          </div>
        )}

        {/* Messages */}
        <div style={{ display: verConversa ? "flex" : "none", flexDirection: "column", gap: 9 }}>
          {displayMessages.map((msg, i) => {
            const msgSource: "whatsapp" | "instagram" = msg.source || "whatsapp";
            return (
              <div key={i} style={{ display: "flex", justifyContent: msg.isStore ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "75%",
                  background: msg.isStore
                    ? (msgSource === "instagram" ? "#fce4f0" : "#dcf8c6")
                    : (msgSource === "instagram" ? "#f3eefb" : "#eef1f5"),
                  border: `1px solid ${msg.isStore
                    ? (msgSource === "instagram" ? "rgba(236,72,153,.25)" : "rgba(34,197,94,.2)")
                    : (msgSource === "instagram" ? "rgba(236,72,153,.15)" : "var(--brd2)")}`,
                  borderRadius: msg.isStore ? "13px 4px 13px 13px" : "4px 13px 13px 13px",
                  padding: "9px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 9 }}>{msgSource === "instagram" ? "📸" : "💬"}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: msg.isStore ? (msgSource === "instagram" ? "#ec4899" : "var(--green)") : (msgSource === "instagram" ? "#ec4899" : "var(--purple-l)") }}>
                      {msg.isStore ? (lead.sellerName || storeName || "Loja") : lead.contact}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {msg.body || (msg.mediaType ? `[${msg.mediaType}]` : "")}
                    {msg.mediaCaption ? ` — ${msg.mediaCaption}` : ""}
                  </p>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                    {msg.date} {msg.time}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Sale modal */}
      {showSaleModal && (
        <SaleModal
          contact={lead.contact}
          products={saleProducts}
          onConfirm={sale => { markSaleClosed(lead.id, sale); setShowSaleModal(false); }}
          onClose={() => setShowSaleModal(false)}
        />
      )}
    </div>
  );
}

// ── Copilot de Vendas Component ─────────────────────────────────────────────
function SalesCopilot({
  lead, copilot, loading, error, copiedId, regenId, onRun, onCopy, onRegen,
}: {
  lead: Lead;
  copilot: CopilotResult | null;
  loading: boolean;
  error: string;
  copiedId: string | null;
  regenId: string | null;
  onRun: () => void;
  onCopy: (id: string, text: string) => void;
  onRegen: (id: string) => void;
}) {
  const [diagOpen, setDiagOpen] = useState(true);

  const momentumConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    heating:   { icon: <span style={{ fontSize: 16 }}>🔥</span>, color: "#f97316", bg: "rgba(249,115,22,.08)" },
    cooling:   { icon: <span style={{ fontSize: 16 }}>🧊</span>, color: "#60a5fa", bg: "rgba(96,165,250,.08)" },
    cold:      { icon: <span style={{ fontSize: 16 }}>❄️</span>, color: "#94a3b8", bg: "rgba(148,163,184,.08)" },
    converted: { icon: <span style={{ fontSize: 16 }}>✅</span>, color: "#22c55e", bg: "rgba(34,197,94,.08)" },
  };

  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "16px 22px",
        background: "linear-gradient(135deg, rgba(124,92,252,.12), rgba(67,56,202,.08))",
        borderBottom: "1px solid var(--brd)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg,#7c5cfc,#4338ca)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bot size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -.3 }}>Copilot de Vendas</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>IA analisa a conversa e sugere as melhores abordagens</div>
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={loading}
          style={{
            padding: "9px 18px",
            background: loading ? "var(--brd)" : "linear-gradient(135deg,#7c5cfc,#4338ca)",
            border: "none", borderRadius: 10, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6, transition: "opacity .15s",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = ".85"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          {loading
            ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Analisando...</>
            : copilot ? <><RefreshCw size={13} /> Reanalisar</> : <><Sparkles size={13} /> Ativar Copilot</>
          }
        </button>
      </div>

      {/* Empty / Error state */}
      {!copilot && !loading && (
        <div style={{ padding: "32px 22px", textAlign: "center" }}>
          {error ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={22} color="var(--red)" />
              <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>{error}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Verifique se a chave ANTHROPIC_API_KEY está no .env.local</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 32 }}>🤖</div>
              <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7, maxWidth: 380 }}>
                Clique em <strong style={{ color: "var(--purple-l)" }}>Ativar Copilot</strong> para a IA ler toda a conversa de {lead.contact} e gerar 3 estratégias de abordagem personalizadas.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ padding: "24px 22px" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              height: 100, borderRadius: 12, marginBottom: 10,
              background: "linear-gradient(90deg, var(--card2) 0%, var(--brd) 50%, var(--card2) 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }} />
          ))}
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            Lendo {lead.messages.length} mensagens da conversa...
          </div>
        </div>
      )}

      {/* Copilot result */}
      {copilot && !loading && (
        <div style={{ padding: "0 0 4px" }}>

          {/* Diagnóstico */}
          <div style={{ borderBottom: "1px solid var(--brd)" }}>
            <button
              onClick={() => setDiagOpen(o => !o)}
              style={{
                width: "100%", padding: "14px 22px",
                background: "transparent", border: "none",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--txt)", letterSpacing: -.2 }}>
                  🔍 Diagnóstico da Conversa
                </span>
              </div>
              {diagOpen ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
            </button>

            {diagOpen && (() => {
              const d = copilot.diagnosis;
              const mc = momentumConfig[d.momentum] || momentumConfig.cold;
              return (
                <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Momentum badge */}
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: mc.bg, border: `1px solid ${mc.color}30`,
                    borderRadius: 10, padding: "8px 14px", alignSelf: "flex-start",
                  }}>
                    {mc.icon}
                    <span style={{ fontSize: 13, fontWeight: 700, color: mc.color }}>{d.momentumLabel}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: .7, marginBottom: 5 }}>PONTO DE VIRADA</div>
                      <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{d.turningPoint}</div>
                    </div>
                    <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--purple-l)", letterSpacing: .7, marginBottom: 5 }}>MELHOR JOGADA AGORA</div>
                      <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{d.recommendedApproach}</div>
                    </div>
                  </div>

                  {d.riskAlert && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)",
                      borderRadius: 10, padding: "9px 14px",
                    }}>
                      <AlertTriangle size={14} color="var(--red)" />
                      <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600 }}>{d.riskAlert}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Strategies */}
          <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: .7 }}>ESTRATÉGIAS — escolha e copie</div>
            {copilot.strategies.map(s => (
              <StrategyCard
                key={s.id}
                strategy={s}
                copied={copiedId === s.id}
                regening={regenId === s.id}
                onCopy={() => onCopy(s.id, s.message)}
                onRegen={() => onRegen(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </div>
  );
}

function StrategyCard({ strategy: s, copied, regening, onCopy, onRegen }: {
  strategy: CopilotStrategy;
  copied: boolean;
  regening: boolean;
  onCopy: () => void;
  onRegen: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{
      border: `1px solid ${s.toneColor}30`,
      borderRadius: 12,
      overflow: "hidden",
      background: `${s.toneColor}06`,
      transition: "border-color .2s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${s.toneColor}60`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = `${s.toneColor}30`)}
    >
      {/* Strategy header */}
      <button
        onClick={() => setExpanded(o => !o)}
        style={{
          width: "100%", padding: "12px 14px",
          background: "transparent", border: "none",
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{s.emoji}</span>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)", marginBottom: 1 }}>{s.label}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: s.toneColor, letterSpacing: .5 }}>{s.tone.toUpperCase()}</div>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Message bubble */}
          <div style={{
            background: "var(--card2)", border: "1px solid var(--brd2)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 10,
          }}>
            <p style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>{s.message}</p>
          </div>

          {/* Reasoning chip */}
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
            <span style={{ color: s.toneColor, fontWeight: 700 }}>Por que funciona: </span>{s.reasoning}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onCopy}
              style={{
                flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: copied ? "rgba(34,197,94,.15)" : `${s.toneColor}18`,
                border: `1px solid ${copied ? "rgba(34,197,94,.4)" : `${s.toneColor}40`}`,
                borderRadius: 8, color: copied ? "var(--green)" : s.toneColor,
                fontSize: 12, fontWeight: 700, padding: "7px 0", cursor: "pointer",
                transition: "all .2s",
              }}
            >
              {copied ? <><CheckCircle2 size={13} /> Copiado!</> : <><Copy size={13} /> Copiar mensagem</>}
            </button>
            <button
              onClick={onRegen}
              disabled={regening}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "transparent", border: "1px solid var(--brd2)",
                borderRadius: 8, color: "var(--muted)", fontSize: 11, padding: "7px 0",
                cursor: regening ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={11} style={{ animation: regening ? "spin 1s linear infinite" : "none" }} />
              {regening ? "Gerando..." : "Regenerar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Um momento da conversa, citado.
 *
 * Citação curta e com rótulo é o que permite fechar o histórico sem perder o
 * que importa: a pessoa reconhece a própria conversa em uma linha. O texto vem
 * cortado em 180 caracteres lá na ficha — bloco inteiro de preço vira parágrafo
 * e desfaz justamente a economia de leitura que isto veio trazer.
 */
function Momento({ rotulo, texto, cor }: { rotulo: string; texto: string; cor: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, color: cor, letterSpacing: .4,
        minWidth: 92, textAlign: "right", paddingTop: 3, textTransform: "uppercase",
      }}>
        {rotulo}
      </span>
      <span style={{
        fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5, flex: 1,
        borderLeft: `2px solid ${cor}`, paddingLeft: 10,
      }}>
        {texto}
      </span>
    </div>
  );
}

function SourceBadge({ type }: { type: "whatsapp" | "instagram" }) {
  const isIG = type === "instagram";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: isIG ? "rgba(236,72,153,.12)" : "rgba(34,197,94,.12)",
      border: `1px solid ${isIG ? "rgba(236,72,153,.35)" : "rgba(34,197,94,.35)"}`,
      color: isIG ? "#ec4899" : "var(--green)",
      borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700,
    }}>
      {isIG ? "📸 Instagram" : "💬 WhatsApp"}
    </span>
  );
}

// ── Action Log Panel ──────────────────────────────────────────────────────────
function ActionLogPanel({ log }: { log: {id:string;type:string;description:string;timestamp:string}[] }) {
  const [open, setOpen] = useState(false);
  if (log.length === 0) return null;
  const fmt = (ts: string) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  const icons: Record<string,string> = {
    copilot:"🤖", message_copied:"📋", sale_closed:"✅", note:"📝", default:"⚡"
  };
  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:"100%", padding:"14px 20px", background:"transparent", border:"none",
        display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:14 }}>📋</span>
          <span style={{ fontSize:13, fontWeight:700 }}>Histórico de Ações</span>
          <span style={{ fontSize:11, background:"var(--purple)", color:"#fff", borderRadius:10, padding:"1px 7px" }}>{log.length}</span>
        </div>
        <span style={{ fontSize:12, color:"var(--muted)" }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ borderTop:"1px solid var(--brd)", padding:"12px 20px", display:"flex", flexDirection:"column", gap:6 }}>
          {log.map(entry => (
            <div key={entry.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid var(--brd)" }}>
              <span style={{ fontSize:14 }}>{icons[entry.type] || icons.default}</span>
              <span style={{ flex:1, fontSize:12, color:"var(--dim)" }}>{entry.description}</span>
              <span style={{ fontSize:10, color:"var(--muted)", flexShrink:0 }}>{fmt(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
