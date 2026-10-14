"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, X, RefreshCw, Sparkles, MessageCircle } from "lucide-react";

/**
 * O ROBÔ DO CANTO — QUANTAS FICHAS FICARAM PARA TRÁS, E NADA MAIS ATÉ ALGUÉM PEDIR.
 *
 * Pedido do Lucas em 14/10/2026: *"um icone de robo no canto inferior da tela
 * para perguntar quantos perfis sofreram alteracao de conversa para gerar nova
 * analise, pq se nao toda vez que abrir o zapintel a ia vai analisar tudo
 * consumindo token sem precisar"*.
 *
 * Contar não custa token: `/zapintel/api/perfil/pendentes` compara números no
 * banco. Quem gasta é o botão "Gerar", e ele só roda depois de confirmado —
 * um lead por vez, parando no primeiro erro. Erro aqui quase sempre é cota do
 * provedor; insistir nos outros 40 seria colecionar o mesmo erro 40 vezes.
 *
 * Os leads internos (conversa com a própria equipe) ficam sem ficha de
 * propósito, então entram em "sem análise" para sempre. Por isso o número no
 * robô conta só as fichas DESATUALIZADAS — o que de fato pede ação.
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

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";

export function RoboAnalises() {
  const [aberto, setAberto] = useState(false);
  const [desatualizadas, setDesatualizadas] = useState<Pendente[] | null>(null);
  const [semAnalise, setSemAnalise] = useState<Pendente[]>([]);
  const [iaDisponivel, setIaDisponivel] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState<{ feitos: number; total: number } | null>(null);
  const [erroLote, setErroLote] = useState("");
  const parar = useRef(false);

  const contar = useCallback(async () => {
    try {
      const r = await fetch("/zapintel/api/perfil/pendentes", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setDesatualizadas(d.desatualizadas as Pendente[]);
      setSemAnalise(d.semAnalise as Pendente[]);
      setIaDisponivel(!!d.iaDisponivel);
      setFalhou(false);
    } catch {
      setFalhou(true);
    }
  }, []);

  // Uma contagem ao entrar no ZapIntel, outra a cada vez que o painel abre.
  // O layout não remonta entre as telas, então navegar não reconta à toa.
  useEffect(() => { contar(); }, [contar]);

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

  const n = desatualizadas?.length ?? 0;

  return (
    <>
      <button
        onClick={() => { if (!aberto) contar(); setAberto(!aberto); }}
        aria-label={n ? `${n} leads com nova análise disponível` : "Análises de IA"}
        title={n ? `${n} leads com conversa nova desde a última análise` : "Análises de IA em dia"}
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 900,
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "var(--purple)", color: "#fff",
          boxShadow: "0 6px 20px rgba(124,92,252,.35), 0 1px 3px rgba(21,24,28,.15)",
          display: "grid", placeItems: "center",
        }}
      >
        {aberto ? <X size={22} /> : <Bot size={24} />}
        {!aberto && n > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3, minWidth: 22, height: 22, padding: "0 6px",
            borderRadius: 11, background: "var(--orange)", color: "#fff", border: "2px solid var(--bg)",
            fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center",
            fontVariantNumeric: "tabular-nums",
          }}>
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Análises de IA"
          style={{
            position: "fixed", right: 20, bottom: 84, zIndex: 900,
            width: "min(380px, calc(100vw - 32px))", maxHeight: "min(560px, calc(100dvh - 120px))",
            background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 14,
            boxShadow: "0 18px 48px rgba(21,24,28,.18)", display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--brd)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Bot size={16} style={{ color: "var(--purple-l)" }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)" }}>Análises de IA</span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.55 }}>
              {falhou ? "Não consegui contar agora." :
                desatualizadas === null ? "Contando…" :
                n === 0 ? "Todas as análises estão em dia com as conversas." :
                <><b style={{ color: "var(--txt)" }}>{n} {n === 1 ? "lead teve" : "leads tiveram"} conversa nova</b> desde a última análise. A IA só analisa quando você pedir.</>}
            </p>
          </div>

          {n > 0 && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {desatualizadas!.map((p) => (
                <Link
                  key={p.leadId}
                  href={`/zapintel/leads/lead-${p.leadId}`}
                  onClick={() => setAberto(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 16px",
                    borderBottom: "1px solid var(--brd)", textDecoration: "none", color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--txt)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
            </div>
          )}

          {semAnalise.length > 0 && (
            <p style={{ fontSize: 10.5, color: "var(--muted)", padding: "8px 16px", borderTop: "1px solid var(--brd)" }}>
              {semAnalise.length} {semAnalise.length === 1 ? "conversa está" : "conversas estão"} sem análise
              (conversas internas ficam assim de propósito).
            </p>
          )}

          {n > 0 && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--brd)", background: "var(--card2)" }}>
              {erroLote && (
                <p style={{ fontSize: 11, color: "var(--yellow)", marginBottom: 8, lineHeight: 1.5 }}>{erroLote}</p>
              )}
              {!iaDisponivel ? (
                <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                  A IA do CRM está desligada. Quando ela for ligada, este botão gera as análises novas.
                </p>
              ) : gerando ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: "var(--txt)", display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                    <RefreshCw size={12} style={{ animation: "zi-spin 1s linear infinite" }} />
                    Analisando {gerando.feitos + 1} de {gerando.total}…
                  </span>
                  <button
                    onClick={() => { parar.current = true; }}
                    style={{ background: "none", border: "1px solid var(--brd2)", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: "var(--dim)", cursor: "pointer" }}
                  >
                    Parar
                  </button>
                </div>
              ) : confirmando ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: "var(--txt)", lineHeight: 1.5 }}>
                    Gerar <b>{n}</b> {n === 1 ? "análise" : "análises"} agora? Cada uma é uma chamada à IA.
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={gerarTodas}
                      style={{ flex: 1, background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Sim, gerar {n}
                    </button>
                    <button
                      onClick={() => setConfirmando(false)}
                      style={{ background: "none", border: "1px solid var(--brd2)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "var(--dim)", cursor: "pointer" }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmando(true)}
                  style={{
                    width: "100%", background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Sparkles size={13} /> Gerar {n} {n === 1 ? "nova análise" : "novas análises"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
