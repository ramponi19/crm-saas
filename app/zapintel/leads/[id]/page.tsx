"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/hooks/zapintel/useLeads";
import type { Lead } from "@/types/zapintel";
import type { Ficha } from "@/lib/zapintel/ficha";
import type { Travou } from "@/lib/zapintel/travou";
import type { PerfilIA } from "@/lib/zapintel/perfil";
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

/**
 * O SELO DE ORIGEM — e por que ele mora AQUI FORA.
 *
 * Nasceu dentro do componente da página, onde ficava mais perto de quem o
 * usa. O `react-hooks/static-components` reclamou, e com razão: um componente
 * declarado dentro de outro é um TIPO novo a cada render, então o React
 * desmonta e remonta a subárvore inteira em vez de atualizá-la — e aqui a
 * subárvore inclui o ícone que gira enquanto a IA analisa, que recomeçaria a
 * animação a cada tecla digitada em qualquer campo da tela.
 *
 * Quanto ao conteúdo: o rótulo precisa dizer de onde veio o texto, sempre.
 * Esta tela chamou de "ANÁLISE DE IA" uma cadeia de `if` por meses. Enquanto
 * os dois caminhos coexistirem, cada bloco diz qual dos dois escreveu aquilo.
 */
function SeloIA({ rotulo, ia, analisando }: { rotulo: string; ia: boolean; analisando: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: ia ? "var(--purple-l)" : "var(--muted)", letterSpacing: .7 }}>
        {rotulo}
      </span>
      {ia ? <EtiquetaIA /> : (
        <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: .3 }}>regra automática</span>
      )}
      {analisando && (
        <span style={{ fontSize: 9, color: "var(--dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={9} className="spin" /> analisando a conversa…
        </span>
      )}
    </div>
  );
}

/** A etiqueta sozinha, para os blocos que já têm título próprio. */
function EtiquetaIA() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700,
      background: "rgba(124,92,252,.12)", border: "1px solid rgba(124,92,252,.3)",
      color: "var(--purple-l)", borderRadius: 20, padding: "1px 7px", letterSpacing: .3,
    }}>
      <Sparkles size={9} /> ESCRITO POR IA
    </span>
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
   * ONDE A CONVERSA TRAVOU — calculado no servidor, junto da ficha.
   *
   * Vem com o ÍNDICE da mensagem, e a marcação compara por referência
   * (`lead.messages[indice] === msg`). Procurar a frase de volta por texto
   * acharia a errada toda vez que a loja repete a mesma mensagem, que é
   * justamente o caso da frase de retomada. Ver `lib/zapintel/travou.ts`.
   */
  const [travou, setTravou] = useState<Travou | null>(null);

  /**
   * A FICHA ESCRITA POR IA — o que esta tela afirma, do Copiloto para cima.
   *
   * `/zapintel/api/conversa` traz de graça a que já estava guardada (uma
   * consulta por chave primária), e a tela a mostra na hora, mesmo que tenha
   * sido escrita antes das últimas mensagens.
   *
   * ⚠ A TELA NUNCA PEDE UMA NOVA SOZINHA — DESDE 14/10/2026.
   *
   * Até ali, abrir um lead com conversa nova disparava a IA na hora ("o que
   * for de IA sempre será automático", 13/10). O Lucas reviu no dia seguinte:
   * *"se nao toda vez que abrir o zapintel a ia vai analisar tudo consumindo
   * token sem precisar. Ai se sofreu alteracao coloca um aviso, nova analise
   * disponivel"*. Abrir para dar uma olhada não pode custar uma chamada.
   *
   * Agora a ficha guardada aparece com o aviso de que a conversa andou, e a
   * IA só escreve quando alguém aperta "Gerar nova análise" — aqui ou no robô
   * do canto da tela, que mostra todos os leads nessa situação.
   */
  const [perfilIA, setPerfilIA] = useState<PerfilIA | null>(null);
  const [perfilAtual, setPerfilAtual] = useState(true);
  const [perfilEm, setPerfilEm] = useState<string | null>(null);
  /** Mensagens que chegaram depois da ficha guardada — o "quanto mudou". */
  const [novasDesde, setNovasDesde] = useState(0);
  const [analisando, setAnalisando] = useState(false);
  const [erroPerfil, setErroPerfil] = useState("");
  /**
   * A IA do CRM está configurada e ligada? Vem do servidor, não daqui.
   *
   * Enquanto não estiver, a tela não pede análise nenhuma — nem automática
   * nem por botão. As fichas que já existem continuam aparecendo normalmente;
   * o que some é a promessa de gerar o que não dá para gerar.
   */
  const [iaLigada, setIaLigada] = useState(true);

  const [sugestao, setSugestao] = useState<string>("");
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState("");
  const [copiouSugestao, setCopiouSugestao] = useState(false);
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
        if (d?.lead) {
          setConversa(d.lead as Lead);
          setFicha((d.ficha as Ficha) ?? null);
          setTravou((d.travou as Travou) ?? null);
          const g = d.perfil as { perfil: PerfilIA; atual: boolean; geradoEm: string; mensagensNaFicha?: number } | null;
          if (g?.perfil) {
            setPerfilIA(g.perfil);
            setPerfilAtual(g.atual);
            setPerfilEm(g.geradoEm);
            const total = (d.lead as Lead).messages?.length ?? 0;
            setNovasDesde(Math.max(0, total - (g.mensagensNaFicha ?? total)));
          }
          // Não pede nada: ver "A TELA NUNCA PEDE UMA NOVA SOZINHA" acima.
          setIaLigada(d.iaDisponivel !== false);
        }
        else setFalhouConversa(true);
      })
      .catch(() => { if (vivo) setFalhouConversa(true); });
    return () => { vivo = false; };
  }, [resumo?.leadId]);

  /**
   * Pede a ficha nova. `forcar` é o botão "Refazer análise" — o único caminho
   * que manda a IA reescrever uma ficha que o servidor considera atual.
   */
  async function pedirPerfil(forcar: boolean) {
    if (!resumo?.leadId) return;
    setAnalisando(true); setErroPerfil("");
    try {
      const r = await fetch("/zapintel/api/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: resumo.leadId, forcar }),
      });
      const d = await r.json();
      if (!r.ok) setErroPerfil(d?.erro || "Não consegui analisar agora.");
      else if (d?.perfil) {
        setPerfilIA(d.perfil as PerfilIA);
        setPerfilAtual(true);
        setNovasDesde(0);
        setPerfilEm(String(d.geradoEm || new Date().toISOString()));
        // O robô do canto conta os leads pendentes; este acabou de sair da lista.
        window.dispatchEvent(new CustomEvent("zapintel:analise-feita", { detail: resumo.leadId }));
      }
    } catch {
      setErroPerfil("Não consegui analisar agora.");
    }
    setAnalisando(false);
  }

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

  /**
   * A mensagem que retoma dali. Rascunho — ninguém envia nada sozinho.
   *
   * O prompt é montado no SERVIDOR (`/zapintel/api/sugestao`), com o nome da
   * loja e o ramo vindos do banco. Montá-lo aqui deixaria quem souber a URL
   * escolher o que a IA do CRM responde, pagando com a chave do Lucas.
   */
  async function pedirSugestao() {
    if (!resumo?.leadId || sugerindo) return;
    setSugerindo(true); setErroSugestao(""); setSugestao("");
    try {
      const r = await fetch("/zapintel/api/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: resumo.leadId }),
      });
      const d = await r.json();
      if (!r.ok) setErroSugestao(d?.erro || "Não consegui gerar agora.");
      else {
        setSugestao(String(d?.mensagem || ""));
        logAction("sugestao", "Mensagem de retomada sugerida pela IA");
      }
    } catch {
      setErroSugestao("Não consegui gerar agora.");
    }
    setSugerindo(false);
  }

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

  /**
   * O QUE A TELA AFIRMA — IA quando existe, motor de regra quando não existe.
   *
   * Não é um "modo IA" opcional: é a mesma tela, com a origem melhor de cada
   * campo. Enquanto a ficha não foi gerada (lead recém-chegado, IA desligada
   * pelo superadmin, provedor fora do ar), os motores antigos continuam
   * respondendo — uma tela vazia seria pior que um rótulo genérico.
   *
   * O que NÃO entra aqui é contagem: mensagens, dias de conversa e dias de
   * silêncio são fatos medidos, e pedir a um modelo que os repita só criaria
   * uma chance de ele errar um número que já estava certo.
   */
  const ia = perfilIA;
  const vClass = ia?.classificacao ?? lead.classification;
  const vScore = ia?.score ?? lead.score;
  const vPerfil = ia?.perfil ?? lead.buyerProfile;
  const vRisco = ia?.riscoPerda ?? lead.lossRisk;
  const vUrgencia = ia?.urgencia ?? lead.urgency;
  const vProxima = ia?.proximaAcao ?? lead.nextAction;

  const urgColors: Record<string, string> = {
    critical: "var(--red)", high: "var(--orange)", medium: "var(--yellow)", low: "var(--dim)",
  };
  const urgCol = urgColors[vUrgencia] || "var(--dim)";


  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      <button onClick={() => router.back()} style={{
        display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
        color: "var(--dim)", cursor: "pointer", fontSize: 13, marginBottom: 16,
      }}>
        <ArrowLeft size={14} /> Voltar
      </button>

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
              <Badge cls={vClass} />
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
          <ScoreRing score={vScore} size={54} />
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

        {/*
          ANÁLISE DE IA — e desde 13/10/2026 o rótulo é verdade.

          Até aqui, este bloco mostrava `lead.insight`, que era uma cadeia de
          `if` sobre a fala do cliente em `insights/followUp.ts`. No lead 439
          (Carol Baldasso) ele dizia "Preocupação com saúde da bateria —
          reforçar garantia de 6 meses" para uma cliente que havia comprado
          52 dias antes, recebido em casa e mandado foto com o aparelho.
        */}
        <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <SeloIA rotulo="ANÁLISE DE IA" ia={!!ia} analisando={analisando} />
          <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>
            {ia?.diagnostico || lead.insight}
          </p>
          {erroPerfil && (
            <p style={{ fontSize: 11, color: "var(--yellow)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={12} /> {erroPerfil}
            </p>
          )}
          {/*
            NOVA ANÁLISE DISPONÍVEL — o aviso no lugar do pedido automático.
            A ficha antiga continua à vista: ela ainda é a melhor leitura que
            existe até alguém decidir pagar por uma nova.
          */}
          {!analisando && (!ia || !perfilAtual) && !carregandoConversa && !falhouConversa && (
            <div style={{
              marginTop: 10, padding: "8px 10px", borderRadius: 8,
              background: "rgba(124,92,252,.08)", border: "1px solid rgba(124,92,252,.28)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 11, color: "var(--txt)", display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} style={{ color: "var(--purple-l)" }} />
                {ia
                  ? <><b>Nova análise disponível</b>{novasDesde > 0
                      ? ` · ${novasDesde} ${novasDesde === 1 ? "mensagem nova" : "mensagens novas"} desde esta análise`
                      : " · a conversa mudou desde esta análise"}</>
                  : <><b>Este lead ainda não tem análise de IA</b></>}
              </span>
              {iaLigada ? (
                <button
                  onClick={() => pedirPerfil(false)}
                  style={{
                    background: "var(--purple)", color: "#fff", border: "none", borderRadius: 7,
                    padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <Bot size={12} /> {ia ? "Gerar nova análise" : "Gerar análise"}
                </button>
              ) : (
                <span style={{ fontSize: 10, color: "var(--muted)" }}>A IA do CRM está desligada</span>
              )}
            </div>
          )}
        </div>

        {/* Meta cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
          {[
            { l: "Perfil", v: vPerfil, c: "var(--txt)" },
            { l: "Duração da conversa", v: lead.conversationDays === 0 ? "1 dia" : `${lead.conversationDays}d`, c: "var(--teal)", tip: "dias entre 1ª e última mensagem" },
            { l: "Inativo há", v: lead.daysInactive === 0 ? "Hoje" : `${lead.daysInactive}d`, c: lead.daysInactive <= 2 ? "var(--green)" : lead.daysInactive <= 7 ? "var(--yellow)" : "var(--red)" },
            { l: "Mensagens", v: String(lead.totalMessages), c: "var(--blue)" },
            { l: "Risco de perda", v: `${vRisco}%`, c: vRisco > 60 ? "var(--red)" : "var(--yellow)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="card2" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: .5, marginBottom: 3 }}>{l.toUpperCase()}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/*
          SINAIS E OBJEÇÕES — AGORA COM A EVIDÊNCIA DO LADO.

          A evidência não é enfeite: é o que separa análise de invenção com
          boa redação. Um texto bonito e errado é pior que um rótulo genérico,
          porque o vendedor acredita nele e liga errado na frente de um
          cliente de verdade. Com o trecho à vista, quem lê confere em dois
          segundos.

          E era preciso: os rótulos antigos vinham de `includes` em texto
          corrido. Medido no lead 439 em 13/10/2026, dois dos seis sinais eram
          falsos — `Pediu NF` saiu de "só me co-NF-irma se é esse valor", e
          `Indecisão / Timing` saiu da palavra "depois" em "tenho que ir aí
          pagar depois buscar?". Nenhum dos dois sobreviveria a ter de mostrar
          de onde veio.
        */}
        {ia ? (
          <>
            {ia.sinais.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SeloIA rotulo="SINAIS DE COMPRA" ia={!!ia} analisando={analisando} />
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {ia.sinais.map((s, i) => (
                    <div key={`${s.rotulo}-${i}`} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{
                        background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)",
                        color: "var(--green)", borderRadius: 20, padding: "3px 10px", fontSize: 11,
                        flexShrink: 0,
                      }}>✓ {s.rotulo}</span>
                      {s.evidencia && (
                        <span style={{ fontSize: 11, color: "var(--dim)", fontStyle: "italic", lineHeight: 1.5 }}>
                          “{s.evidencia}”
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ia.objecoes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SeloIA rotulo="OBJEÇÕES" ia={!!ia} analisando={analisando} />
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {ia.objecoes.map((o, i) => (
                    <div key={`${o.rotulo}-${i}`}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{
                          background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)",
                          color: "var(--yellow)", borderRadius: 20, padding: "3px 10px", fontSize: 11,
                          flexShrink: 0,
                        }}>⚠ {o.rotulo}</span>
                        {o.evidencia && (
                          <span style={{ fontSize: 11, color: "var(--dim)", fontStyle: "italic", lineHeight: 1.5 }}>
                            “{o.evidencia}”
                          </span>
                        )}
                      </div>
                      {o.desfecho && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, paddingLeft: 12 }}>
                          → {o.desfecho}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/*
              PONTAS SOLTAS — o que foi combinado e ninguém retomou.

              Nasceu do teste na Carol: o marido pagou o iPhone cheio e o
              12 Pro Max dela nunca foi entregue na troca, embora o vendedor
              tenha prometido, EM ÁUDIO, aceitá-lo como entrada. É um seminovo
              de R$ 1.200 parado na gaveta de uma cliente que confia na loja,
              e nenhum motor de palavra-chave chegaria perto disso.
            */}
            {ia.pontasSoltas.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SeloIA rotulo="FICOU EM ABERTO" ia={!!ia} analisando={analisando} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ia.pontasSoltas.map((p, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 8, alignItems: "baseline",
                      background: "rgba(56,189,248,.07)", border: "1px solid rgba(56,189,248,.22)",
                      borderRadius: 9, padding: "8px 12px",
                    }}>
                      <span style={{ color: "var(--teal)", fontSize: 12, flexShrink: 0 }}>◆</span>
                      <span style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}

        {/* Next action */}
        <div style={{ background: "var(--card2)", border: `1px solid ${urgCol}50`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: urgCol, letterSpacing: .7 }}>
              <UrgencyDot urgency={vUrgencia} />
              PRÓXIMA AÇÃO · {vUrgencia.toUpperCase()}
            </span>
            {ia && <EtiquetaIA />}
          </div>
          <p style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.6 }}>{vProxima}</p>
          {ia?.proximaAcaoPorque && (
            <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, marginTop: 6 }}>
              Por quê: {ia.proximaAcaoPorque}
            </p>
          )}

          {/*
            A MENSAGEM É RASCUNHO, E A TELA PRECISA DIZER ISSO.

            Nada é enviado por aqui: o botão copia. O prompt proíbe prometer
            preço, prazo ou condição que a loja não tenha oferecido nesta
            conversa, mas a última conferência é de quem vai mandar.
          */}
          {ia?.mensagemSugerida && (
            <div style={{ marginTop: 12, background: "var(--card)", border: "1px solid var(--brd2)", borderRadius: 9, padding: "10px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: .5 }}>
                  RASCUNHO PARA MANDAR AGORA
                </span>
                <button
                  onClick={() => copyMsg("perfil", ia.mensagemSugerida)}
                  style={{
                    background: "none", border: "1px solid var(--brd2)", borderRadius: 7,
                    padding: "3px 9px", fontSize: 10, color: "var(--dim)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  }}
                >
                  <Copy size={10} /> {copiedId === "perfil" ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--txt)", lineHeight: 1.65 }}>{ia.mensagemSugerida}</p>
            </div>
          )}

          {/*
            Quem lê precisa saber quando isto foi escrito e poder mandar
            refazer. Sem a data, uma ficha de três semanas atrás se apresenta
            com a mesma autoridade de uma escrita há um minuto.
          */}
          {ia && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, color: "var(--muted)" }}>
                {perfilEm ? `Análise de ${new Date(perfilEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                {!perfilAtual && " · a conversa andou desde então"}
              </span>
              {/* Sem IA configurada não há o que refazer — e um botão que só
                  sabe dar erro é pior que botão nenhum. */}
              {iaLigada && (
                <button
                  onClick={() => pedirPerfil(true)}
                  disabled={analisando}
                  style={{
                    background: "none", border: "1px solid var(--brd2)", borderRadius: 7,
                    padding: "3px 9px", fontSize: 10, color: "var(--dim)",
                    cursor: analisando ? "not-allowed" : "pointer", opacity: analisando ? .5 : 1,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <RefreshCw size={10} className={analisando ? "spin" : undefined} />
                  {analisando ? "Analisando…" : "Refazer análise"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/*
        ── Marcar Venda Fechada ─────────────────────────────────────────────

        ⚠ A CONDIÇÃO AQUI É `lead.classification`, NÃO `vClass`, E ISSO É DE
        PROPÓSITO.

        `lead.classification` só diz "customer" quando existe venda ligada a
        este lead na ponte `zapintel_venda_lead` — fato do CRM. A IA diz
        "customer" quando LÊ na conversa que a pessoa comprou. Quando os dois
        divergem, é justamente aí que este botão mais serve: a venda aconteceu
        e o sistema não sabe.

        Trocar por `vClass` esconderia o botão exatamente no caso que ele
        existe para resolver. Medido no lead 439 em 13/10/2026: a Carol pagou
        R$ 5.695 em 22/08, e não há nenhuma venda entre R$ 5.000 e R$ 6.500 na
        empresa 1 em toda aquela semana.
      */}
      {lead.classification !== "customer" && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          {ia?.classificacao === "customer" && (
            <div style={{
              background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.3)",
              borderRadius: 9, padding: "10px 13px", marginBottom: 14,
              display: "flex", gap: 9, alignItems: "flex-start",
            }}>
              <AlertTriangle size={14} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6 }}>
                <b style={{ color: "var(--green)" }}>A conversa diz que esta venda aconteceu</b>, mas não há
                venda ligada a este lead no CRM. Se foi fechada mesmo, registre aqui — o faturamento, o
                ticket médio e o ciclo de venda do painel só contam o que está registrado.
              </div>
            </div>
          )}
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

      {/*
        A FICHA — o que aconteceu nesta conversa, antes de qualquer número.

        Pedida pelo Lucas em 10/10/2026: "ao invés de trazer o histórico de
        chats, trazer como foi ou está sendo a conversa". É o mesmo princípio
        que as ferramentas do segmento chamam de revisar trechos em vez de
        médias — o número acha o momento, o trecho mostra o que fazer.

        Em 13/10/2026 o Lucas pediu estes dois blocos — a ficha e o ponto de
        travamento — **juntos, logo acima do Copiloto**, em vez de no topo
        absoluto. A ordem passou a ser: quem é o lead, depois o que aconteceu
        nele, depois o que fazer.

        Faz sentido: os dois são leitura da conversa e alimentam exatamente a
        decisão que o Copiloto propõe. Separados por 300px de cartões de
        número, ninguém ligava um ao outro.
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
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .5 }}>
                O QUE ACONTECEU
              </span>
              {ia?.relato && <EtiquetaIA />}
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
          {/*
            O RELATO: a IA quando existe, o mecânico quando não.

            O relato mecânico (`montarRelato`, em `lib/zapintel/ficha.ts`)
            continua sendo gerado e continua certo — ele é fato costurado em
            frase ("Procurou iPhone 16 Pro Max. Pediu 18x. Travou em: Depende
            de terceiro."). O que ele não consegue é ligar os fatos: que o
            crédito foi negado duas vezes, que ela mesma propôs o cartão do
            irmão, que o aparelho só se revelou por encomenda no último dia.

            Os parágrafos vêm separados por linha em branco e são renderizados
            como parágrafos. Jogar o texto inteiro num bloco só desfaria a
            divisão que o modelo fez e devolveria a parede de texto que a
            ficha veio substituir.
          */}
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--txt)", marginBottom: 14 }}>
            {(ia?.relato || ficha.relato).split(/\n{2,}/).map((p, i) => (
              <p key={i} style={{ marginBottom: 10 }}>{p.trim()}</p>
            ))}
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

      {/* ── Onde a venda travou ──────────────────────────────────────────── */}
      {/*
        O ponto exato, não o diagnóstico em prosa. A ficha já conta o que
        aconteceu; quem abre a conversa para conferir rolava 41 mensagens
        procurando o momento — e o momento é sempre uma mensagem só.

        Nada aparece aqui em conversa que virou venda: ali não travou nada, e
        pintar alerta sobre venda fechada é o sistema mentindo com cara de
        ajuda. Ver `lib/zapintel/travou.ts`.

        ⚠ `ondeTravou` decide isso pela PONTE de vendas, que é fato do CRM — e
        quando a venda não foi registrada, ele não tem como saber. Visto na
        tela em 13/10/2026, no lead 439: o bloco anunciava

            ONDE A VENDA TRAVOU · há 49 dias
            "A loja disse isto e ele não respondeu mais:
             Obrigadooo pelo feedback!!!!!"

        numa conversa que terminou com a cliente mandando foto do aparelho que
        acabara de comprar. A loja respondeu "obrigado pelo feedback" e, claro,
        não houve mais nada a dizer — isso é uma conversa que ACABOU, não uma
        que travou.

        A IA sabe o que a ponte não sabe, porque leu a conversa. Então quando
        ela diz que a pessoa comprou, o bloco some — mesmo sem venda
        registrada. O caminho de corrigir o registro continua logo acima, no
        aviso em cima de "Marcar Venda Fechada".
      */}
      {travou && ia?.classificacao !== "customer" && (() => {
        const msg = lead.messages[travou.indice];
        const grave = travou.tipo === "objecao_sem_resposta" || travou.tipo === "loja_deve_resposta";
        const cor = grave ? "var(--red)" : "var(--yellow)";
        return (
          <div className="card" style={{ padding: 20, marginBottom: 14, borderLeft: `3px solid ${cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: cor, letterSpacing: .7 }}>
                ONDE A VENDA TRAVOU
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{travou.detalhe}</span>
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--txt)", marginBottom: 10 }}>
              {travou.rotulo}
            </div>

            {msg && (
              <div style={{
                background: "var(--card2)", border: "1px solid var(--brd2)",
                borderLeft: `2px solid ${cor}`, borderRadius: 8,
                padding: "10px 14px", marginBottom: 12,
              }}>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>
                  {travou.daLoja ? (lead.sellerName || storeName || "LOJA").toUpperCase() : lead.contact.toUpperCase()}
                  {" · "}{msg.date} {msg.time}
                </div>
                <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {msg.body || (msg.mediaType ? `[${msg.mediaType}]` : "")}
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setVerConversa(true);
                  // O próximo quadro: a conversa ainda não existe no DOM quando
                  // este clique roda, e rolar para um elemento que não nasceu
                  // não faz nada — sem erro nenhum, que é o pior tipo.
                  setTimeout(() => {
                    document.getElementById("msg-travou")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 60);
                }}
                style={{
                  background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 9,
                  padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "var(--txt)", cursor: "pointer",
                }}
              >
                Ver na conversa
              </button>

              <button
                onClick={pedirSugestao}
                disabled={sugerindo}
                style={{
                  background: sugerindo ? "var(--card2)" : "var(--purple)", border: "none", borderRadius: 9,
                  padding: "8px 14px", fontSize: 12, fontWeight: 700,
                  color: sugerindo ? "var(--muted)" : "#fff",
                  cursor: sugerindo ? "default" : "pointer",
                }}
              >
                {sugerindo ? "Escrevendo…" : sugestao ? "Sugerir outra" : "Sugerir a mensagem"}
              </button>
            </div>

            {erroSugestao && (
              <p style={{ fontSize: 12, color: "var(--red)", marginTop: 10 }}>{erroSugestao}</p>
            )}

            {sugestao && (
              <div style={{
                background: "rgba(124,92,252,.07)", border: "1px solid rgba(124,92,252,.28)",
                borderRadius: 10, padding: "12px 16px", marginTop: 12,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--purple-l)", letterSpacing: .7, marginBottom: 6 }}>
                  RASCUNHO DA IA · LEIA ANTES DE ENVIAR
                </div>
                <p style={{ fontSize: 13.5, color: "var(--txt)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {sugestao}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(sugestao);
                      setCopiouSugestao(true);
                      setTimeout(() => setCopiouSugestao(false), 1800);
                    }}
                    style={{
                      background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 9,
                      padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "var(--txt)", cursor: "pointer",
                    }}
                  >
                    {copiouSugestao ? "Copiado ✓" : "Copiar"}
                  </button>
                  {lead.phone && (() => {
                    const base = whatsappLink(lead.phone);
                    return base ? (
                      <a
                        href={`${base}?text=${encodeURIComponent(sugestao)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          background: "#075e54", borderRadius: 9, padding: "7px 13px",
                          fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none",
                        }}
                      >
                        Abrir no WhatsApp
                      </a>
                    ) : null;
                  })()}
                </div>
                <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
                  A IA não sabe o preço de hoje nem o que está em estoque. Confira
                  qualquer número antes de mandar.
                </p>
              </div>
            )}
          </div>
        );
      })()}

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
            /**
             * ESTA é a mensagem onde travou?
             *
             * Comparação por REFERÊNCIA, não por índice: `displayMessages` é
             * `lead.messages` filtrado por canal na conversa fundida, então os
             * índices não batem — mas os objetos são os mesmos. E não por
             * texto: a loja repete a mesma frase de retomada em dezenas de
             * conversas, e a busca acharia a primeira, não a certa.
             */
            const ehOTravamento = !!travou && lead.messages[travou.indice] === msg;
            const corTravamento = travou && (travou.tipo === "objecao_sem_resposta" || travou.tipo === "loja_deve_resposta")
              ? "var(--red)" : "var(--yellow)";
            return (
              <div
                key={i}
                id={ehOTravamento ? "msg-travou" : undefined}
                style={{
                  display: "flex", flexDirection: "column",
                  alignItems: msg.isStore ? "flex-end" : "flex-start",
                  ...(ehOTravamento ? {
                    background: "var(--card2)",
                    border: `1px solid ${corTravamento}55`,
                    borderRadius: 12, padding: 10, margin: "6px 0",
                  } : null),
                }}
              >
                {ehOTravamento && travou && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 7, marginBottom: 7,
                    alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800,
                    color: corTravamento, letterSpacing: .5,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: 999, background: corTravamento,
                      display: "inline-block",
                    }} />
                    {travou.rotulo.toUpperCase()} · {travou.detalhe}
                  </div>
                )}
              <div style={{ display: "flex", width: "100%", justifyContent: msg.isStore ? "flex-end" : "flex-start" }}>
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
                  {/* Transcricao nao pode passar por texto digitado: fonte
                      serifada, cor apagada e rotulo. Ver `RawMessage.transcrito`. */}
                  {msg.transcrito && (
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: .4,
                      color: "var(--muted)", textTransform: "uppercase", marginBottom: 3,
                    }}>
                      ♪ transcrição automática
                    </div>
                  )}
                  <p style={{
                    fontSize: msg.transcrito ? 11.5 : 12,
                    color: msg.transcrito ? "var(--muted)" : "var(--dim)",
                    lineHeight: 1.6, whiteSpace: "pre-wrap",
                    fontFamily: msg.transcrito ? "Georgia, 'Times New Roman', serif" : undefined,
                    fontStyle: msg.transcrito ? "italic" : undefined,
                  }}>
                    {msg.body || (msg.mediaType ? `[${msg.mediaType}]` : "")}
                    {msg.mediaCaption ? ` — ${msg.mediaCaption}` : ""}
                  </p>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                    {msg.date} {msg.time}
                  </div>
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
        /* O ícone que gira enquanto a IA lê a conversa. O keyframe já existia
           aqui; faltava a classe, e sem ela o ícone ficava parado anunciando
           trabalho em andamento. */
        .spin { animation: spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
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
