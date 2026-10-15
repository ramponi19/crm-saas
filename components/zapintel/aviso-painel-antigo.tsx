"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";

/**
 * O AVISO DAS TELAS QUE AINDA NÃO SÃO AO VIVO.
 *
 * Desde 15/10/2026 o menu do ZapIntel é ao vivo, e o "Sincronizar agora" saiu
 * dele: deixá-lo lá fazia parecer que o ZapIntel inteiro dependia de clique.
 * As telas que ainda leem o painel antigo (Comparar, Linguagem, Relatório,
 * Pós-venda) dizem isso no topo — de quando é o número e como refazer — até
 * passarem a ler o banco. Quando a última sair, este componente sai junto.
 */
export function AvisoPainelAntigo() {
  const { calculadoEm, syncFromCRM, syncing } = useLeads();
  const [agora] = useState(() => Date.now());
  const t = calculadoEm ? new Date(calculadoEm) : null;
  const quando = t
    ? `${t.toDateString() === new Date(agora).toDateString() ? "hoje" : t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : null;
  const velho = t ? agora - t.getTime() > 2 * 3_600_000 : false;
  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      background: velho ? "rgba(234,88,12,.07)" : "var(--card2)", border: `1px solid ${velho ? "rgba(234,88,12,.35)" : "var(--brd2)"}`,
      borderRadius: 10, padding: "9px 14px", marginBottom: 16, fontSize: 12, color: "var(--dim)", lineHeight: 1.5,
    }}>
      <span>
        <b style={{ color: velho ? "var(--orange)" : "var(--txt)" }}>Esta tela ainda não atualiza sozinha.</b>{" "}
        {syncing ? "Refazendo a conta…" : quando ? `Números calculados ${quando}.` : "Carregando o cálculo…"}
      </span>
      <button onClick={syncFromCRM} disabled={syncing} style={{
        display: "inline-flex", alignItems: "center", gap: 6, background: "var(--purple)", color: "#fff", border: "none",
        borderRadius: 8, padding: "6px 11px", fontSize: 11.5, fontWeight: 700, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1,
      }}>
        <RefreshCw size={12} style={{ animation: syncing ? "zi-spin 1s linear infinite" : undefined }} />
        {syncing ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </div>
  );
}
