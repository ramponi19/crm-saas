"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, X, Clock, AlertTriangle, Sparkles, SlidersHorizontal } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../providers";
import { useRpcAoVivo } from "@/hooks/zapintel/useRpcAoVivo";
import type { Classe, Urgencia } from "@/hooks/zapintel/useDashboardAoVivo";
import { CLASSE, ORDEM_FUNIL, URG, FAMILIAS_DE_OBJECAO, FAIXA_PARADO, num, ha } from "@/components/zapintel/rotulos";

/**
 * A LISTA DE LEADS DO ZAPINTEL — RECONSTRUÍDA EM 14/10/2026 SOBRE AS ANÁLISES.
 *
 * Pedido do Lucas: *"auditoria menu leads, so de olhar esta com motor antigo e
 * sem um modelo completo"*. A auditoria mediu, nos 1.895 leads: 75% com status
 * diferente da análise, 421 "quentes" (análises: 40; 91 deles já clientes),
 * score 31 pontos fora em média, e 6 frases de "próxima ação" para todos.
 *
 * Agora tudo vem de `zapintel_leads_lista` (banco, sessão de quem olha):
 * filtro, busca — inclusive no que foi dito na conversa —, ordem e página.
 * A tela recebe só a página que mostra e se atualiza sozinha (`useRpcAoVivo`).
 * Os filtros moram na URL: o dashboard abre esta lista já filtrada, e quem
 * abre uma ficha e volta encontra a lista como deixou. Mudar filtro troca a
 * URL sem empilhar histórico — "voltar" sai da lista, não desfaz um clique.
 */

interface LeadLinha {
  leadId: number; nome: string | null; telefone: string | null; origem: string | null; origemId: string | null;
  loja: string | null; classificacao: Classe; urgencia: Urgencia; score: number | null; rotulo: string | null;
  proximaAcao: string | null; temAnalise: boolean; desatualizada: boolean; comprou: boolean; esperando: boolean;
  ultimaDoCliente: string | null; ultimaMensagem: string; primeiraMensagem: string; mensagens: number;
  sinais: number; objecoes: number; alertas: number;
}
interface Lista {
  total: number; pagina: number; porPagina: number;
  contagens: Partial<Record<Classe, number>>; totalSemClasse: number; leads: LeadLinha[];
}

/** Os filtros que a URL carrega, e o nome de cada um na função do banco. */
const BOOLEANOS = ["esperando", "sem_registro", "desatualizadas", "pendencias"] as const;
const TEXTOS = ["classe", "urgencia", "perfil", "sinal", "objecao", "parado", "modelo", "canal", "dias", "sinal_familia", "fase"] as const;
/**
 * Os recortes que só chegam por link das telas Insights e Atendimento — sem controle próprio
 * aqui, aparecem como etiqueta removível. Sem eles a lista abria com outra
 * contagem que o card (Concorrência: 29 perdidos no card, 56 na lista).
 */
const ETIQUETAS: [string, (v: string) => string][] = [
  ["perfil", (v) => `Perfil: ${v}`], ["sinal", (v) => `Sinal: ${v}`], ["modelo", (v) => `Pediu iPhone ${v}`],
  ["sinal_familia", (v) => `Sinal: ${v}`], ["fase", () => "Ainda em aberto"],
  ["dias", (v) => `Conversa nos últimos ${v} dias`], ["funil", () => "Só quem está no funil"],
  ["largada", () => "Cliente sem resposta há 3+ dias"], ["retomar", () => "Cliente sumiu — retomar"],
];
const NOME_BOOLEANO: Record<(typeof BOOLEANOS)[number], string> = {
  esperando: "Esperando a loja", sem_registro: "Compraram sem registro",
  desatualizadas: "Conversa andou", pendencias: "Com pendência",
};
const ORDENS: [string, string][] = [
  ["prioridade", "Quem atender primeiro"], ["recentes", "Conversa mais recente"],
  ["parados", "Parados há mais tempo"], ["score", "Maior score"], ["mensagens", "Mais mensagens"],
];

function useRelogio(ms = 30_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return agora;
}

export default function LeadsPage() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const { lojas, lojaAtiva, storeName } = useLeads();
  const empresa = useEmpresaZapintel();
  const agora = useRelogio();

  // ── filtros: a URL é a fonte ───────────────────────────────────────────────
  const filtros: Record<string, string | boolean> = {};
  for (const k of TEXTOS) { const v = busca.get(k); if (v) filtros[k] = v; }
  for (const k of BOOLEANOS) if (busca.get(k) === "1") filtros[k] = true;
  for (const k of ["funil", "largada", "retomar"]) if (busca.get(k) === "1") filtros[k] = true;
  const q = busca.get("q") ?? "";
  if (q) filtros.busca = q;
  const ordem = busca.get("ordem") ?? "prioridade";
  const pagina = Math.max(1, Number(busca.get("pagina") ?? 1) || 1);

  function mudar(alteracoes: Record<string, string | null>, manterPagina = false) {
    // A URL de AGORA, não a deste render: a busca grava depois de uma pausa,
    // e com a cópia do render ela devolvia um filtro que "Limpar" já tirou.
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(alteracoes)) { if (v == null || v === "") p.delete(k); else p.set(k, v); }
    if (!manterPagina) p.delete("pagina");
    router.replace(`${caminho}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }

  // A busca digitada só vai para a URL depois de uma pausa: cada letra seria
  // uma consulta ao texto das conversas.
  const [digitado, setDigitado] = useState(q);
  // A URL mudou por fora (link do dashboard, outra aba do menu): o campo segue.
  // Só quando não foi a própria busca que escreveu — senão apagaria o que a
  // pessoa digitou enquanto a URL atualizava.
  const [qAnterior, setQAnterior] = useState(q);
  const [qEscrito, setQEscrito] = useState(q);
  if (q !== qAnterior) { setQAnterior(q); if (q !== qEscrito) setDigitado(q); }
  useEffect(() => {
    if (digitado === q) return;
    const t = setTimeout(() => { setQEscrito(digitado.trim()); mudar({ q: digitado.trim() || null }); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mudar` lê a URL atual; refazer o efeito por ela recomeçaria a pausa a cada render
  }, [digitado]);

  const { dados, erro, aoVivo, carregando } = useRpcAoVivo<Lista>("zapintel_leads_lista", {
    p_filtros: filtros, p_ordem: ordem, p_pagina: pagina, p_por_pagina: 50,
    p_filial: lojaAtiva, p_empresa: empresa,
  }, empresa);

  const recorte = lojaAtiva == null ? `${storeName || "Sua empresa"} · toda a rede` : (lojas.find((l) => l.id === lojaAtiva)?.nome ?? "Loja");
  const temFiltro = Object.keys(filtros).length > 0;
  // Filtros finos que estão ligados — fora a classe (que tem os chips) e a busca.
  const finos = Object.keys(filtros).filter((k) => k !== "classe" && k !== "busca").length;
  // No celular os filtros finos ficam atrás de um botão: abertos, empurravam
  // o primeiro lead para fora da tela.
  const [verFiltros, setVerFiltros] = useState(false);
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  return (
    <div className="lv">
      <style>{CSS}</style>

      <header className="lv-topo">
        <div>
          <h1 className="lv-titulo">Leads</h1>
          <p className="lv-sub">
            {dados ? `${num(dados.total)} ${dados.total === 1 ? "conversa" : "conversas"}` : "carregando…"} · {recorte}
            {carregando && dados && <span className="lv-carregando"> · buscando…</span>}
          </p>
        </div>
        <span className="lv-vivo" title={aoVivo ? "Atualiza sozinha a cada mensagem" : "Reconectando"}>
          <span className={`lv-ponto ${aoVivo ? "on" : ""}`} /> {aoVivo ? "Ao vivo" : "Reconectando…"}
        </span>
      </header>

      {/* Busca e ordem */}
      <div className="lv-barra">
        <label className="lv-busca">
          <Search size={14} />
          <input value={digitado} onChange={(e) => setDigitado(e.target.value)}
            placeholder="Buscar por nome, telefone ou o que foi dito na conversa (ex.: 18 Pro Max, boleto)" />
          {digitado && <button onClick={() => setDigitado("")} aria-label="Limpar busca"><X size={13} /></button>}
        </label>
        <select className="lv-select" value={ordem} onChange={(e) => mudar({ ordem: e.target.value === "prioridade" ? null : e.target.value })}>
          {ORDENS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>

      {/* Classes, com a contagem dentro dos outros filtros */}
      <div className="lv-chips">
        <button className={`lv-chip ${!filtros.classe ? "ativo" : ""}`} onClick={() => mudar({ classe: null })}>
          Todos <b>{dados ? num(dados.totalSemClasse) : "…"}</b>
        </button>
        {ORDEM_FUNIL.map((c) => {
          const n = dados?.contagens[c] ?? 0;
          if (dados && !n && filtros.classe !== c) return null;
          return (
            <button key={c} className={`lv-chip ${filtros.classe === c ? "ativo" : ""}`}
              style={{ ["--cor" as string]: CLASSE[c].cor }} onClick={() => mudar({ classe: filtros.classe === c ? null : c })}>
              <span className="lv-bola" style={{ background: CLASSE[c].cor }} />{CLASSE[c].nome} <b>{dados ? num(n) : "…"}</b>
            </button>
          );
        })}
      </div>

      {/* Atalhos e filtros finos */}
      <button className="lv-abre-filtros" onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}>
        <SlidersHorizontal size={13} /> Filtros{finos ? ` · ${finos} ${finos === 1 ? "ligado" : "ligados"}` : ""}
      </button>
      <div className={`lv-filtros ${verFiltros ? "aberto" : ""}`}>
        {BOOLEANOS.map((k) => (
          <button key={k} className={`lv-toggle ${filtros[k] ? "ativo" : ""}`} onClick={() => mudar({ [k]: filtros[k] ? null : "1" })}>
            {NOME_BOOLEANO[k]}
          </button>
        ))}
        <Seletor valor={filtros.urgencia as string | undefined} vazio="Toda urgência" onChange={(v) => mudar({ urgencia: v })}
          opcoes={(Object.keys(URG) as Urgencia[]).map((u) => [u, `Urgência ${URG[u].nome.toLowerCase()}`])} />
        <Seletor valor={filtros.objecao as string | undefined} vazio="Toda objeção" onChange={(v) => mudar({ objecao: v })}
          opcoes={FAMILIAS_DE_OBJECAO.map((f) => [f, f])} />
        <Seletor valor={filtros.parado as string | undefined} vazio="Qualquer tempo" onChange={(v) => mudar({ parado: v })}
          opcoes={Object.entries(FAIXA_PARADO).map(([k, n]) => [k, `Sem conversa: ${n.toLowerCase()}`])} />
        <Seletor valor={filtros.canal as string | undefined} vazio="Todo canal" onChange={(v) => mudar({ canal: v })}
          opcoes={[["whatsapp", "WhatsApp"], ["instagram", "Instagram"]]} />
        {ETIQUETAS.map(([k, nome]) => filtros[k] ? (
          <button key={k} className="lv-toggle ativo" onClick={() => mudar({ [k]: null })}>
            {nome(String(filtros[k]))} <X size={11} />
          </button>
        ) : null)}
        {temFiltro && (
          <button className="lv-limpar" onClick={() => { setDigitado(""); setQEscrito(""); router.replace(caminho, { scroll: false }); }}>
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {erro && !dados && (
        <div className="card lv-vazio"><AlertTriangle size={18} style={{ color: "var(--yellow)" }} />
          {/loja fora/i.test(erro) ? "Esta loja não está no seu acesso. Escolha \"Toda a rede\" ou a sua loja no menu." : erro}
        </div>
      )}
      {!dados && !erro && <div className="card lv-osso" style={{ height: 420 }} />}

      {dados && (
        <div className={`card lv-tabela-caixa ${carregando ? "apagada" : ""}`}>
          {dados.leads.length === 0 ? (
            <div className="lv-vazio">Nenhum lead com esses filtros.</div>
          ) : (
            <table className="lv-tabela">
              <thead>
                <tr><th>Contato</th><th>Situação</th><th className="lv-num">Score</th><th>Perfil</th><th>Conversa</th><th>Próxima ação</th></tr>
              </thead>
              <tbody>
                {dados.leads.map((l) => <Linha key={l.leadId} l={l} agora={agora} />)}
              </tbody>
            </table>
          )}
        </div>
      )}

      {dados && dados.total > dados.porPagina && (
        <nav className="lv-paginas">
          <span>{num((pagina - 1) * dados.porPagina + 1)}–{num(Math.min(pagina * dados.porPagina, dados.total))} de {num(dados.total)}</span>
          <div>
            <button disabled={pagina <= 1} onClick={() => mudar({ pagina: String(pagina - 1) }, true)} aria-label="Página anterior"><ChevronLeft size={15} /></button>
            <span>{pagina} / {totalPaginas}</span>
            <button disabled={pagina >= totalPaginas} onClick={() => mudar({ pagina: String(pagina + 1) }, true)} aria-label="Próxima página"><ChevronRight size={15} /></button>
          </div>
        </nav>
      )}
    </div>
  );
}

function Seletor({ valor, vazio, opcoes, onChange }: {
  valor?: string; vazio: string; opcoes: [string, string][]; onChange: (v: string | null) => void;
}) {
  return (
    <select className={`lv-select pequeno ${valor ? "ativo" : ""}`} value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{vazio}</option>
      {opcoes.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
    </select>
  );
}

function Linha({ l, agora }: { l: LeadLinha; agora: number }) {
  const router = useRouter();
  const href = `/zapintel/leads/lead-${l.leadId}`;
  const cls = CLASSE[l.classificacao] ?? CLASSE.sem_analise;
  const espera = l.esperando && l.ultimaDoCliente ? agora - new Date(l.ultimaDoCliente).getTime() : 0;
  return (
    <tr onClick={() => router.push(href)}>
      <td>
        <div className="lv-contato">
          <span className="lv-urg" style={{ background: URG[l.urgencia].cor }} title={`Urgência ${URG[l.urgencia].nome.toLowerCase()}`} />
          <div style={{ minWidth: 0 }}>
            <Link href={href} className="lv-nome" onClick={(e) => e.stopPropagation()}>{l.nome || "Sem nome"}</Link>
            <div className="lv-meta">
              <span className={`lv-canal ${l.origem === "instagram" ? "ig" : "wa"}`}>{l.origem === "instagram" ? "Instagram" : "WhatsApp"}</span>
              {l.loja && <span>{l.loja}</span>}
              <a href={`/leads?lead=${l.leadId}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="lv-wa">abrir conversa no CRM</a>
            </div>
          </div>
        </div>
      </td>
      <td>
        <span className="lv-tag" style={{ color: cls.cor, borderColor: cls.cor }}>{cls.nome}</span>
        <div className="lv-selos">
          {l.esperando && <Selo cor="var(--red)"><Clock size={10} /> esperando {ha(l.ultimaDoCliente, agora).replace("há ", "")}</Selo>}
          {l.comprou && <Selo cor="var(--green)">venda registrada</Selo>}
          {l.alertas > 0 && <Selo cor="var(--yellow)"><AlertTriangle size={10} /> {l.alertas} {l.alertas === 1 ? "pendência" : "pendências"}</Selo>}
          {l.desatualizada && <Selo cor="var(--muted)">conversa andou</Selo>}
          {!l.temAnalise && l.classificacao !== "sem_resposta" && <Selo cor="var(--purple-l)"><Sparkles size={10} /> sem análise</Selo>}
        </div>
      </td>
      <td className="lv-num">
        {l.score == null ? <span className="lv-traco">—</span>
          : <span className="lv-score" style={{ color: l.score >= 70 ? "var(--green)" : l.score >= 40 ? "var(--orange)" : "var(--dim)" }}>{l.score}</span>}
      </td>
      <td className="lv-perfil">{l.rotulo || <span className="lv-traco">—</span>}</td>
      <td>
        <div className={`lv-quando ${espera > 3_600_000 ? "atraso" : ""}`}>{ha(l.ultimaMensagem, agora)}</div>
        <div className="lv-meta">{num(l.mensagens)} msg{l.sinais ? ` · ✓${l.sinais}` : ""}{l.objecoes ? ` · ⚠${l.objecoes}` : ""}</div>
      </td>
      <td><div className="lv-acao">{l.proximaAcao || <span className="lv-traco">Lead novo — responder e qualificar.</span>}</div></td>
    </tr>
  );
}

function Selo({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className="lv-selo" style={{ color: cor }}>{children}</span>;
}

const CSS = `
.lv { display: flex; flex-direction: column; gap: 12px; max-width: 1400px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.lv-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.lv-titulo { font-size: 24px; font-weight: 800; letter-spacing: -.6px; }
.lv-sub { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
.lv-carregando { color: var(--purple-l); }
.lv-vivo { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--green); background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; }
.lv-ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.lv-ponto.on { background: var(--green); box-shadow: 0 0 0 3px rgba(22,163,74,.18); }
.lv-barra { display: flex; gap: 8px; }
.lv-busca { flex: 1; display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--brd); border-radius: 12px; padding: 0 12px; color: var(--muted); }
.lv-busca:focus-within { border-color: var(--purple); }
.lv-busca input { flex: 1; border: none; outline: none; background: transparent; color: var(--txt); font: inherit; font-size: 13px; padding: 10px 0; min-width: 0; }
.lv-busca button { background: none; border: none; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.lv-select { background: var(--card); border: 1px solid var(--brd); border-radius: 12px; color: var(--txt); font: inherit; font-size: 12.5px; padding: 0 10px; cursor: pointer; }
.lv-select.pequeno { border-radius: 999px; padding: 5px 10px; font-size: 12px; color: var(--dim); }
.lv-select.ativo { border-color: var(--purple); color: var(--purple-l); font-weight: 700; }
.lv-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.lv-abre-filtros { display: none; }
.lv-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; color: var(--dim); cursor: pointer; }
.lv-chip b { color: var(--txt); }
.lv-chip:hover { border-color: var(--cor, var(--purple)); }
.lv-chip.ativo { background: var(--txt); border-color: var(--txt); color: #fff; }
.lv-chip.ativo b { color: #fff; }
.lv-bola { width: 8px; height: 8px; border-radius: 2px; }
.lv-filtros { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.lv-toggle { background: var(--card2); border: 1px solid var(--brd2); border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.lv-toggle.ativo { background: rgba(124,92,252,.12); border-color: var(--purple); color: var(--purple-l); font-weight: 700; }
.lv-limpar { background: none; border: none; color: var(--purple-l); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.lv-tabela-caixa { overflow-x: auto; transition: opacity .15s; }
.lv-tabela-caixa.apagada { opacity: .55; }
.lv-tabela { width: 100%; border-collapse: collapse; min-width: 980px; }
.lv-tabela th { text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); padding: 10px 12px; border-bottom: 1px solid var(--brd); white-space: nowrap; }
.lv-tabela td { padding: 10px 12px; border-bottom: 1px solid var(--card2); vertical-align: top; font-size: 12.5px; }
.lv-tabela tbody tr { cursor: pointer; transition: background .1s; }
.lv-tabela tbody tr:hover { background: var(--card2); }
.lv-num { text-align: right; }
.lv-contato { display: flex; gap: 9px; align-items: flex-start; min-width: 220px; max-width: 300px; }
.lv-urg { width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 5px; }
.lv-nome { font-weight: 800; color: var(--txt); text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lv-nome:hover { color: var(--purple-l); }
.lv-meta { font-size: 11px; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.lv-canal { font-weight: 700; }
.lv-canal.wa { color: #16a34a; }
.lv-canal.ig { color: #db2777; }
.lv-wa { color: var(--muted); text-decoration: underline; text-underline-offset: 2px; }
.lv-wa:hover { color: var(--purple); }
.lv-tag { font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 1px 8px; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
.lv-selos { display: flex; flex-direction: column; gap: 2px; margin-top: 5px; }
.lv-selo { font-size: 10.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.lv-score { font-size: 16px; font-weight: 800; }
.lv-perfil { color: var(--txt); white-space: nowrap; }
.lv-traco { color: var(--muted); }
.lv-quando { font-weight: 700; color: var(--dim); white-space: nowrap; }
.lv-quando.atraso { color: var(--red); }
.lv-acao { color: var(--txt); line-height: 1.45; min-width: 260px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lv-vazio { padding: 40px 0; text-align: center; color: var(--muted); font-size: 13px; display: flex; gap: 8px; justify-content: center; align-items: center; }
.lv-paginas { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--dim); }
.lv-paginas div { display: flex; align-items: center; gap: 8px; }
.lv-paginas button { background: var(--card); border: 1px solid var(--brd); border-radius: 8px; padding: 5px 8px; cursor: pointer; color: var(--txt); display: grid; place-items: center; }
.lv-paginas button:disabled { opacity: .4; cursor: default; }
.lv-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: lv-osso 1.2s linear infinite; }
@keyframes lv-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.lv button:focus-visible, .lv a:focus-visible, .lv select:focus-visible, .lv input:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
@media (max-width: 860px) {
  .lv-barra { flex-direction: column; }
  .lv-select { padding: 9px 10px; }
  .lv-limpar { margin-left: 0; }
  .lv-chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px 2px; scrollbar-width: none; }
  .lv-chip { flex: none; }
  .lv-abre-filtros { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--txt); cursor: pointer; }
  .lv-filtros { display: none; }
  .lv-filtros.aberto { display: flex; }
  /* A tabela vira cartões: uma coluna por linha não cabe em 390 px. */
  .lv-tabela-caixa { overflow: visible; background: none; border: none; box-shadow: none; padding: 0; }
  .lv-tabela { min-width: 0; display: block; }
  .lv-tabela thead { display: none; }
  .lv-tabela tbody { display: flex; flex-direction: column; gap: 8px; }
  .lv-tabela tbody tr { display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; background: var(--card); border: 1px solid var(--brd); border-radius: 12px; padding: 12px; }
  .lv-tabela td { display: block; padding: 0; border: none; }
  .lv-tabela td:nth-child(1) { grid-column: 1; }
  .lv-tabela td:nth-child(3) { grid-column: 2; grid-row: 1; }
  .lv-tabela td:nth-child(2) { grid-column: 1 / -1; }
  .lv-tabela td:nth-child(2) .lv-selos { flex-direction: row; flex-wrap: wrap; gap: 4px 10px; }
  .lv-tabela td:nth-child(4) { display: none; }
  .lv-tabela td:nth-child(5) { grid-column: 1 / -1; display: flex; gap: 8px; align-items: baseline; }
  .lv-tabela td:nth-child(6) { grid-column: 1 / -1; }
  .lv-contato { min-width: 0; max-width: none; }
  .lv-acao { min-width: 0; }
}
@media (prefers-reduced-motion: reduce) { .lv-osso { animation: none; } }
`;
