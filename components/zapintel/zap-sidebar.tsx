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
  const { syncFromCRM, syncing } = useLeads();
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

      <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, marginBottom: 4 }}>● Conectado ao CRM</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>Sincroniza sozinho das conversas reais dos leads</div>
        <button
          onClick={syncFromCRM}
          disabled={syncing}
          title="Descarta imports manuais e recarrega só as conversas atuais dos leads"
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
