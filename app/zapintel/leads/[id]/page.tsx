"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../../providers";
import { createClient } from "@/lib/supabase/client";
import { ouvirZapintel } from "@/hooks/zapintel/canalZapintel";
import type { Lead } from "@/types/zapintel";
import type { Ficha } from "@/lib/zapintel/ficha";
import type { Travou } from "@/lib/zapintel/travou";
import type { PerfilIA } from "@/lib/zapintel/perfil";
import { Badge, ScoreRing, UrgencyDot } from "@/components/zapintel/ui/atoms";
import { ArrowLeft, Copy, RefreshCw, Sparkles, Bot, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

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

/**
 * Sem análise, sinais, objeções e próxima ação vêm da regra por palavras do
 * motor antigo — que errou 2 de 6 sinais no lead 439. A tela diz de onde veio
 * para ninguém tratar palpite de regra como leitura da conversa.
 */
function RegraAutomatica() {
  return <span style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)", letterSpacing: .3, marginLeft: 6 }}>· regra automática</span>;
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
  const { storeName, sellerName } = useLeads();
  const empresa = useEmpresaZapintel();
  /**
   * A FICHA NÃO LÊ MAIS O PAINEL ANTIGO — DESDE 15/10/2026.
   *
   * O número do lead sai da URL (`lead-5760`) e o lead inteiro vem de
   * `/zapintel/api/conversa`, calculado na hora. Antes o topo vinha do painel
   * (calculado de tempos em tempos): o lead 1196 mostrava "Inativo há 7d" e
   * "152 mensagens" com o cliente tendo falado naquele dia, na mensagem 153.
   */
  const leadNum = Number(String(id ?? "").replace(/^lead-/, "")) || null;

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

  const carregar = useCallback((vivo: () => boolean) => {
    if (!leadNum) return;
    fetch(`/zapintel/api/conversa?lead=${leadNum}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!vivo()) return;
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
      .catch(() => { if (vivo()) setFalhouConversa(true); });
  }, [leadNum]);

  useEffect(() => {
    let vivo = true;
    carregar(() => vivo);
    return () => { vivo = false; };
  }, [carregar]);

  /**
   * AO VIVO: quando chega mensagem DESTE lead (o aviso do banco diz quais
   * leads mudaram — `zapintel_ao_vivo.sql`) ou a análise dele é refeita, a
   * ficha se recarrega sozinha. Só este lead: a loja recebe ~240 mensagens por
   * hora, e recarregar a cada uma seria uma chamada à Vercel por mensagem.
   */
  const [supabase] = useState(() => createClient());
  useEffect(() => {
    if (!empresa || !leadNum) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const sair = ouvirZapintel(supabase, empresa, {
      evento: (e) => {
        const p = (e.payload ?? {}) as { leads?: number[]; lead?: number };
        const meu = e.event === "mensagens" ? (p.leads ?? []).includes(leadNum) : e.event === "analises" && p.lead === leadNum;
        if (!meu) return;
        if (espera) clearTimeout(espera);
        espera = setTimeout(() => carregar(() => vivo), 2500);
      },
      status: () => {},
    });
    return () => { vivo = false; if (espera) clearTimeout(espera); sair(); };
  }, [supabase, empresa, leadNum, carregar]);


  /**
   * Pede a ficha nova. `forcar` é o botão "Refazer análise" — o único caminho
   * que manda a IA reescrever uma ficha que o servidor considera atual.
   */
  async function pedirPerfil(forcar: boolean) {
    if (!leadNum) return;
    setAnalisando(true); setErroPerfil("");
    try {
      const r = await fetch("/zapintel/api/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: leadNum, forcar }),
      });
      const d = await r.json();
      if (!r.ok) setErroPerfil(d?.erro || "Não consegui analisar agora.");
      else if (d?.perfil) {
        setPerfilIA(d.perfil as PerfilIA);
        setPerfilAtual(true);
        setNovasDesde(0);
        setPerfilEm(String(d.geradoEm || new Date().toISOString()));
        // O robô do canto conta os leads pendentes; este acabou de sair da lista.
        window.dispatchEvent(new CustomEvent("zapintel:analise-feita", { detail: leadNum }));
      }
    } catch {
      setErroPerfil("Não consegui analisar agora.");
    }
    setAnalisando(false);
  }

  // Derivado, não guardado: "está carregando" é exatamente "tem o que buscar e
  // ainda não chegou". Um estado separado só poderia divergir disso.
  const carregandoConversa = !!leadNum && !conversa && !falhouConversa;

  const lead: Lead | null = conversa;

  const [tab, setTab] = useState<Tab>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);


  if (!lead) return (
    <div style={{ textAlign: "center", paddingTop: 80, color: "var(--dim)" }}>
      {carregandoConversa ? "Carregando a conversa…" : "Lead não encontrado."}{" "}
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
    if (!leadNum || sugerindo) return;
    setSugerindo(true); setErroSugestao(""); setSugestao("");
    try {
      const r = await fetch("/zapintel/api/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: leadNum }),
      });
      const d = await r.json();
      if (!r.ok) setErroSugestao(d?.erro || "Não consegui gerar agora.");
      else setSugestao(String(d?.mensagem || ""));
    } catch {
      setErroSugestao("Não consegui gerar agora.");
    }
    setSugerindo(false);
  }

  async function copyMsg(id: string, text: string) {
    await navigator.clipboard.writeText(text);

    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
          <SeloIA rotulo={ia ? "ANÁLISE DE IA" : "LEITURA AUTOMÁTICA"} ia={!!ia} analisando={analisando} />
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
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .7, marginBottom: 8 }}>SINAIS DE COMPRA <RegraAutomatica /></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {lead.buySignals.map(s => (
                    <span key={s} style={{ background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)", color: "var(--green)", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>✓ {s}</span>
                  ))}
                </div>
              </div>
            )}

            {lead.objections.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: .7, marginBottom: 8 }}>OBJEÇÕES <RegraAutomatica /></div>
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
            {ia ? <EtiquetaIA /> : <RegraAutomatica />}
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
        A FICHA — o que aconteceu nesta conversa, antes de qualquer número.

        Pedida pelo Lucas em 10/10/2026: "ao invés de trazer o histórico de
        chats, trazer como foi ou está sendo a conversa". É o mesmo princípio
        que as ferramentas do segmento chamam de revisar trechos em vez de
        médias — o número acha o momento, o trecho mostra o que fazer.

        Em 13/10/2026 o Lucas pediu estes dois blocos — a ficha e o ponto de
        travamento — **juntos, logo acima do Copiloto**, em vez de no topo
        absoluto. A ordem passou a ser: quem é o lead, depois o que aconteceu
        nele, depois o que fazer.

        Faz sentido: os dois são leitura da conversa e alimentam a decisão do
        que fazer. Separados por 300px de cartões de número, ninguém ligava um
        ao outro. (O "Copilot de Vendas" que vinha embaixo saiu em 15/10/2026:
        tinha "JM Store, vendedor Pedro" fixo no prompt e repetia a análise.)
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
    </div>
  );
}

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
