"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Lightbulb, MessageSquare, BarChart2, BookUser, ShoppingBag, CalendarDays, BookOpen, GitCompare, Languages, FileText, Gauge, ArrowLeft, RefreshCw } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";

const NAV = [
  { href: "/zapintel", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { href: "/zapintel/leads", icon: Users, label: "Leads" },
  { href: "/zapintel/agenda", icon: CalendarDays, label: "Agenda" },
  { href: "/zapintel/contacts", icon: BookUser, label: "Contatos" },
  { href: "/zapintel/insights", icon: Lightbulb, label: "Insights" },
  { href: "/zapintel/performance", icon: BarChart2, label: "Performance" },
  { href: "/zapintel/performance2", icon: Gauge, label: "Performance II" },
  { href: "/zapintel/scripts", icon: BookOpen, label: "Scripts" },
  { href: "/zapintel/comparar", icon: GitCompare, label: "Comparar" },
  { href: "/zapintel/linguagem", icon: Languages, label: "Linguagem" },
  { href: "/zapintel/relatorio", icon: FileText, label: "Relatório" },
  { href: "/zapintel/posvenda", icon: ShoppingBag, label: "Pós Venda" },
];

export function ZapSidebar({ empresaNome = "Minha empresa" }: { empresaNome?: string }) {
  const path = usePathname();
  const { syncFromCRM, syncing, lojas, lojaAtiva, setLojaAtiva, mensagens, semConversa, calculadoEm, atualizando, tempoReal } = useLeads();
  return (
    <aside style={{ width: 210, background: "var(--panel)", borderRight: "1px solid var(--brd)", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4, flexShrink: 0 }}>
      <div style={{ padding: "8px 8px 20px", borderBottom: "1px solid var(--brd)", marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, marginBottom: 10, background: "linear-gradient(135deg,#7c5cfc,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageSquare size={17} color="#fff" />
        </div>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>ZapIntel</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>{empresaNome}</div>
      </div>

      {NAV.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "9px 12px",
            borderRadius: 9, textDecoration: "none", fontSize: 13, fontWeight: active ? 700 : 400,
            background: active ? "rgba(124,92,252,.18)" : "transparent",
            color: active ? "var(--purple-l)" : "var(--dim)", transition: "all .15s",
          }}>
            <Icon size={16} />
            {label}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Recorte: toda a rede, ou uma loja. Só aparece quando há mais de uma. */}
      {lojas.length > 2 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginBottom: 5, paddingLeft: 2 }}>VENDO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {lojas.map((loja) => {
              const ativa = loja.id === lojaAtiva;
              return (
                <button
                  key={loja.id ?? "geral"}
                  onClick={() => setLojaAtiva(loja.id)}
                  title={`${loja.leads} conversas analisadas`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    width: "100%", textAlign: "left", cursor: "pointer",
                    background: ativa ? "var(--purple)" : "var(--card2)",
                    border: `1px solid ${ativa ? "var(--purple)" : "var(--brd2)"}`,
                    color: ativa ? "#fff" : "var(--dim)",
                    borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: ativa ? 700 : 400,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loja.nome}</span>
                  <span style={{ fontSize: 10, opacity: 0.8, flexShrink: 0 }}>{loja.leads}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        {/*
          O estado real da assinatura, não um rótulo fixo. Canal caído some em
          silêncio: a tela continuaria mostrando os últimos números como se
          fossem os de agora.
        */}
        <div style={{
          fontSize: 10, fontWeight: 700, marginBottom: 4,
          color: atualizando ? "var(--yellow)" : tempoReal === "caiu" ? "var(--red)" : tempoReal === "ligado" ? "var(--green)" : "var(--muted)",
        }}>
          {/*
            Dizia "Recalculando…". Virou mentira em 09/10/2026, quando o
            recálculo passou a ter janela no servidor (10 min, para caber nas
            4 h de CPU que o plano da Vercel dá por mês): o aviso podia ficar
            aceso dez minutos sem nada recalculando. O que é verdade o tempo
            todo é que chegou mensagem e o número ainda não a inclui — e a
            linha de baixo diz de quando é o número.
          */}
          {atualizando ? "● Chegou mensagem nova"
            : tempoReal === "ligado" ? "● Conectado ao CRM"
            : tempoReal === "caiu" ? "● Sem contato com o servidor"
            : "● Conectando…"}
        </div>
        {/*
          O que o painel analisou, em números — e não a promessa de que analisa.
          Antes dizia só "sincroniza sozinho", enquanto por baixo cortava a
          análise em 40.000 mensagens e parava três semanas atrás.
        */}
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
          {mensagens > 0 ? (
            <>
              {mensagens.toLocaleString("pt-BR")} mensagens analisadas
              {semConversa > 0 && <> · {semConversa} lead{semConversa > 1 ? "s" : ""} sem conversa</>}
              {calculadoEm && <><br />às {new Date(calculadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · refaz a conta a cada 10 min</>}
            </>
          ) : "Lendo as conversas reais dos leads"}
        </div>
        <button
          onClick={syncFromCRM}
          disabled={syncing}
          title="Refaz a conta agora, sem esperar os 10 minutos. Descarta imports manuais e relê as conversas atuais dos leads"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8,
            padding: "7px 10px", fontSize: 11.5, fontWeight: 700, cursor: syncing ? "default" : "pointer",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: syncing ? "zi-spin 1s linear infinite" : undefined }} />
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
      <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, textDecoration: "none", fontSize: 12, color: "var(--dim)" }}>
        <ArrowLeft size={15} /> Voltar ao CRM
      </Link>
    </aside>
  );
}
