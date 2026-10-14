import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";

/**
 * QUANTAS FICHAS FICARAM PARA TRÁS — O BLOCO NO TOPO DO CHAT DO ZAPINTEL.
 *
 * Pedido do Lucas em 14/10/2026: *"um icone de robo no canto inferior da tela
 * para perguntar quantos perfis sofreram alteracao de conversa para gerar nova
 * analise, pq se nao toda vez que abrir o zapintel a ia vai analisar tudo
 * consumindo token sem precisar"*. No mesmo dia virou chat (*"achei que seria
 * um chat"*), e este bloco passou a morar dentro dele, acima da conversa: o
 * robô continua mostrando o número, e abrir o chat continua sem gastar nada.
 *
 * Contar não custa token: `/zapintel/api/perfil/pendentes` compara números no
 * banco. Quem gasta é o botão "Gerar", e ele só roda depois de confirmado —
 * um lead por vez, parando no primeiro erro. Erro aqui quase sempre é cota do
 * provedor; insistir nos outros 40 seria colecionar o mesmo erro 40 vezes.
 *
 * Os leads internos (conversa com a própria equipe) ficam sem ficha de
 * propósito, então entram em "sem análise" para sempre. Por isso o número do
 * robô conta só as fichas DESATUALIZADAS — o que de fato pede ação.
 *
 * Sem "use client" de propósito: só é usado dentro do assistente, que já é
 * componente de cliente — e assim pode receber funções como props.
 */

type Pendente = {
  leadId: number;
  nome: string;
  filial: string | null;
  geradoEm: string | null;
  novas: number;
  ultima: string;
  lojaDeve: boolean;
};

type Contagem = { desatualizadas: Pendente[]; semAnalise: Pendente[]; iaDisponivel: boolean };

/** Pergunta ao servidor; `null` quando não deu para contar. Não mexe em estado. */
async function buscarContagem(): Promise<Contagem | null> {
  try {
    const r = await fetch("/zapintel/api/perfil/pendentes", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) return null;
    return {
      desatualizadas: d.desatualizadas as Pendente[],
      semAnalise: d.semAnalise as Pendente[],
      iaDisponivel: !!d.iaDisponivel,
    };
  } catch {
    return null;
  }
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";

export function AnalisesPendentes({ onTotal, onAbrirLead, recontar }: {
  /** O número que o robô mostra no selo. */
  onTotal?: (n: number) => void;
  /** Clicar num lead navega — o chat fecha para a tela aparecer. */
  onAbrirLead?: () => void;
  /** Muda quando o chat abre: reconta. */
  recontar?: number;
}) {
  const [desatualizadas, setDesatualizadas] = useState<Pendente[] | null>(null);
  const [semAnalise, setSemAnalise] = useState<Pendente[]>([]);
  const [iaDisponivel, setIaDisponivel] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [lista, setLista] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState<{ feitos: number; total: number } | null>(null);
  const [erroLote, setErroLote] = useState("");
  const parar = useRef(false);

  const aplicar = useCallback((d: Contagem | null) => {
    if (!d) { setFalhou(true); return; }
    setDesatualizadas(d.desatualizadas);
    setSemAnalise(d.semAnalise);
    setIaDisponivel(d.iaDisponivel);
    setFalhou(false);
  }, []);

  const contar = useCallback(() => { buscarContagem().then(aplicar); }, [aplicar]);

  // Conta ao montar e a cada abertura do chat. O estado só muda na resposta,
  // dentro do `then` — e só se o bloco ainda estiver na tela.
  useEffect(() => {
    let vivo = true;
    buscarContagem().then((d) => { if (vivo) aplicar(d); });
    return () => { vivo = false; };
  }, [aplicar, recontar]);

  // A tela do lead avisa quando gerou uma ficha: ele sai da lista na hora.
  useEffect(() => {
    const tirar = (e: Event) => {
      const id = Number((e as CustomEvent).detail);
      setDesatualizadas((l) => l?.filter((p) => p.leadId !== id) ?? l);
      setSemAnalise((l) => l.filter((p) => p.leadId !== id));
    };
    window.addEventListener("zapintel:analise-feita", tirar);
    return () => window.removeEventListener("zapintel:analise-feita", tirar);
  }, []);

  // O selo do robô acompanha a lista, inclusive quando um lead sai dela.
  useEffect(() => { if (desatualizadas) onTotal?.(desatualizadas.length); }, [desatualizadas, onTotal]);

  async function gerarTodas() {
    const fila = [...(desatualizadas ?? [])];
    if (!fila.length) return;
    setConfirmando(false); setErroLote(""); parar.current = false;
    setGerando({ feitos: 0, total: fila.length });
    for (let i = 0; i < fila.length; i++) {
      if (parar.current) break;
      const p = fila[i];
      try {
        const r = await fetch("/zapintel/api/perfil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead: p.leadId, forcar: false }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErroLote(`Parei em ${p.nome}: ${d?.erro || "a IA não respondeu"}. As já geradas ficaram salvas.`);
          break;
        }
        window.dispatchEvent(new CustomEvent("zapintel:analise-feita", { detail: p.leadId }));
      } catch {
        setErroLote(`Parei em ${p.nome}: sem conexão. As já geradas ficaram salvas.`);
        break;
      }
      setGerando({ feitos: i + 1, total: fila.length });
    }
    setGerando(null);
    contar();
  }

  if (falhou || desatualizadas === null) return null;
  const n = desatualizadas.length;

  const botao = (cheio: boolean): React.CSSProperties => ({
    background: cheio ? "var(--purple)" : "none", color: cheio ? "#fff" : "var(--dim)",
    border: cheio ? "none" : "1px solid var(--brd2)", borderRadius: 7,
    padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 5,
  });

  return (
    <div style={{ borderBottom: "1px solid var(--brd)", background: "var(--card2)" }}>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--txt)", lineHeight: 1.45 }}>
          <Sparkles size={13} style={{ color: "var(--purple-l)", flex: "none" }} />
          {n === 0
            ? <span>Análises de IA em dia com as conversas.</span>
            : <span><b>{n} {n === 1 ? "lead teve" : "leads tiveram"} conversa nova</b> desde a última análise.</span>}
        </div>

        {n > 0 && erroLote && (
          <p style={{ fontSize: 11, color: "var(--yellow)", lineHeight: 1.5 }}>{erroLote}</p>
        )}

        {n > 0 && (
          !iaDisponivel ? (
            <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
              A IA do CRM está desligada; quando ligar, dá para gerar daqui.
            </p>
          ) : gerando ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11.5, color: "var(--txt)", display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                <RefreshCw size={12} style={{ animation: "zi-spin 1s linear infinite" }} />
                Analisando {gerando.feitos + 1} de {gerando.total}…
              </span>
              <button onClick={() => { parar.current = true; }} style={botao(false)}>Parar</button>
            </div>
          ) : confirmando ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--txt)" }}>
                Gerar <b>{n}</b>? Cada uma é uma chamada à IA.
              </span>
              <button onClick={gerarTodas} style={botao(true)}>Sim, gerar</button>
              <button onClick={() => setConfirmando(false)} style={botao(false)}>Cancelar</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmando(true)} style={botao(true)}>
                <Sparkles size={12} /> Gerar {n} {n === 1 ? "análise" : "análises"}
              </button>
              <button onClick={() => setLista((v) => !v)} style={botao(false)}>
                {lista ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {lista ? "Esconder" : "Ver quais"}
              </button>
            </div>
          )
        )}
      </div>

      {lista && n > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto", borderTop: "1px solid var(--brd)", background: "var(--card)" }}>
          {desatualizadas.map((p) => (
            <Link
              key={p.leadId}
              href={`/zapintel/leads/lead-${p.leadId}`}
              onClick={() => onAbrirLead?.()}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                borderBottom: "1px solid var(--brd)", textDecoration: "none", color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.nome}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                  {p.novas > 0 ? `+${p.novas} ${p.novas === 1 ? "mensagem" : "mensagens"}` : "conversa mudou"}
                  {p.geradoEm && ` desde ${dataCurta(p.geradoEm)}`}
                  {p.filial && ` · ${p.filial}`}
                </div>
              </div>
              {p.lojaDeve && (
                <span title="A última mensagem é do cliente" style={{
                  fontSize: 9.5, fontWeight: 700, color: "var(--orange)", whiteSpace: "nowrap",
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}>
                  <MessageCircle size={10} /> esperando a loja
                </span>
              )}
            </Link>
          ))}
          <Link href="/zapintel/leads?desatualizadas=1" onClick={() => onAbrirLead?.()}
            style={{ display: "block", padding: "8px 14px", fontSize: 11.5, fontWeight: 700, color: "var(--purple-l)", textDecoration: "none", borderBottom: "1px solid var(--brd)" }}>
            Ver todos na lista de leads →
          </Link>
          {semAnalise.length > 0 && (
            <p style={{ fontSize: 10.5, color: "var(--muted)", padding: "8px 14px" }}>
              {semAnalise.length} {semAnalise.length === 1 ? "conversa está" : "conversas estão"} sem análise
              (conversas internas ficam assim de propósito).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
