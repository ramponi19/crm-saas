"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users, Lightbulb, MessageSquare, ShoppingBag, Headset, ArrowLeft, Menu, X } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";

const NAV = [
  { href: "/zapintel", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { href: "/zapintel/leads", icon: Users, label: "Leads" },
  // TRES TELAS SAIRAM DAQUI, e o motivo e o mesmo nas tres: duplicavam o CRM.
  //
  //   Contatos (10/10) .. segunda lista dos MESMOS leads, com botao de
  //                       WhatsApp. O CRM ja tem Leads e Clientes.
  //   Agenda (11/10) .... um SEGUNDO kanban, inteiro em `useState`: recarregou
  //                       a pagina, perdeu os cartoes. O CRM tem kanban de
  //                       verdade, com `kanban_status` gravado em 2.072 leads.
  //   Scripts (11/10) ... modelos de mensagem, tambem so no navegador e tambem
  //                       sem persistir. O CRM tem /modelos.
  //
  // Tres listas da mesma coisa so servem para divergir — e duas delas nem
  // sobreviviam a um F5.
  { href: "/zapintel/insights", icon: Lightbulb, label: "Insights" },
  { href: "/zapintel/atendimento", icon: Headset, label: "Atendimento" },
  { href: "/zapintel/posvenda", icon: ShoppingBag, label: "Pós Venda" },
];

/** "há 3 min", "há 2 h" — de quando é a última mensagem que chegou. */
function haQuanto(iso: string | null, agora: number) {
  if (!iso) return null
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000))
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`
}

export function ZapSidebar({ empresaNome = "Minha empresa" }: { empresaNome?: string }) {
  const path = usePathname();
  const { lojas, lojaAtiva, setLojaAtiva, conversas, mensagens, semConversa, ultimaMensagem, aoVivo } = useLeads();
  // O relógio do "última mensagem há X" anda sozinho; os números chegam pelo canal.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ultima = haQuanto(ultimaMensagem, agora);
  /**
   * NO CELULAR A BARRA VIRA MENU. Antes ela ocupava 210 px fixos, metade de
   * uma tela de 390 — o dashboard ao vivo, que o vendedor abre no balcão pelo
   * celular, ficava espremido no resto. Abaixo de 860 px: botão no topo, barra
   * por cima do conteúdo, e qualquer clique dentro dela fecha.
   */
  const [aberta, setAberta] = useState(false);
  // Teclado no celular: o foco entra no menu ao abrir, Escape fecha e o foco
  // volta ao botão. Fechado, o menu fica `visibility: hidden` (abaixo) — antes
  // ele só saía da tela por `transform` e o Tab caía em links invisíveis.
  const lado = useRef<HTMLElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberta) return;
    lado.current?.querySelector<HTMLElement>("a, button")?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberta(false); botao.current?.focus(); } };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberta]);
  return (
    <>
    <style>{`
      .zi-side-botao { display: none; }
      @media (max-width: 860px) {
        .zi-side { position: fixed; inset: 0 auto 0 0; z-index: 960; transform: translateX(-105%); visibility: hidden; transition: transform .2s ease-out, visibility 0s linear .2s; box-shadow: 12px 0 40px rgba(21,24,28,.18); overflow-y: auto; }
        .zi-side.aberta { transform: none; visibility: visible; transition: transform .2s ease-out; }
        .zi-side-botao { display: grid; place-items: center; position: fixed; top: 12px; left: 12px; z-index: 955; width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--brd); background: var(--card); color: var(--txt); box-shadow: 0 2px 8px rgba(21,24,28,.08); }
        .zi-side-fundo { position: fixed; inset: 0; z-index: 958; background: rgba(21,24,28,.32); }
      }
      @media (prefers-reduced-motion: reduce) { .zi-side { transition: none; } }
    `}</style>
    <button ref={botao} className="zi-side-botao" onClick={() => setAberta(true)} aria-label="Abrir menu do ZapIntel" aria-expanded={aberta}><Menu size={19} /></button>
    {aberta && <div className="zi-side-fundo" onClick={() => setAberta(false)} />}
    <aside ref={lado} className={`zi-side ${aberta ? "aberta" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setAberta(false); }}
      style={{ width: 210, background: "var(--panel)", borderRight: "1px solid var(--brd)", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4, flexShrink: 0 }}>
      {aberta && (
        <button onClick={() => setAberta(false)} aria-label="Fechar menu"
          style={{ position: "absolute", top: 14, right: 12, background: "none", border: "none", color: "var(--dim)", cursor: "pointer" }}>
          <X size={18} />
        </button>
      )}
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
                  title={`${loja.leads} conversas`}
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

      {/*
        AO VIVO DESDE 15/10/2026. Aqui ficava "Atualizado em 14/10 às 17:37" e o
        botão "Sincronizar agora", do painel antigo — e o menu inteiro parecia
        depender de clique (*"achei que ele rodava online fulltime"*). Agora os
        números vêm de `zapintel_resumo`, pelo mesmo canal das telas. As telas
        que ainda leem o painel antigo têm o próprio aviso no topo.
      */}
      <div style={{ background: "var(--card2)", border: "1px solid var(--brd2)", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, color: aoVivo ? "var(--green)" : "var(--muted)" }}>
          {aoVivo ? "● Ao vivo" : "● Conectando…"}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
          {conversas > 0 ? (
            <>
              {conversas.toLocaleString("pt-BR")} conversas · {mensagens.toLocaleString("pt-BR")} mensagens
              {semConversa > 0 && <> · {semConversa} lead{semConversa > 1 ? "s" : ""} sem conversa</>}
              {ultima && <><br />Última mensagem {ultima}</>}
            </>
          ) : "Lendo as conversas…"}
        </div>
      </div>
      <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, textDecoration: "none", fontSize: 12, color: "var(--dim)" }}>
        <ArrowLeft size={15} /> Voltar ao CRM
      </Link>
    </aside>
    </>
  );
}
