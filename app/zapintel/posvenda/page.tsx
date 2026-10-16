"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Copy, Check, Search, Handshake, ShoppingBag, Clock, MessageCircle } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../providers";
import { useRpcAoVivo } from "@/hooks/zapintel/useRpcAoVivo";
import { num, ha } from "@/components/zapintel/rotulos";
import { ErroDeTela } from "@/components/zapintel/erro-de-tela";

/**
 * PÓS-VENDA — QUEM JÁ COMPROU E PRECISA DA LOJA. Reconstruída em 15/10/2026.
 *
 * A tela antiga lia o painel do motor de palavras: 35 "clientes" (as análises
 * leem 246), produto deduzido por palavra-chave, um contador de "fechados
 * manualmente" que vinha de um botão que não gravava nada, e quatro modelos de
 * mensagem prometendo "brinde especial" e "preço especial" que a loja nunca
 * ofereceu — o vendedor copiava e a loja ficava devendo.
 *
 * Agora vem de `zapintel_posvenda` (banco, ao vivo). Cliente é quem a análise
 * leu comprando ou quem tem venda do CRM ligada à conversa. A mensagem é a que
 * a análise daquela conversa sugeriu — escrita para aquela pessoa, sem promessa
 * que ninguém fez.
 */

interface Cliente {
  leadId: number; nome: string | null; telefone: string | null; origem: string | null; loja: string | null;
  produto: string | null; valor: number | null; vendaEm: string | null; ultimaMensagem: string | null;
  pendencias: string[] | null; pediuIndicacao: boolean; veioIndicado: boolean;
  mensagem: string | null; diagnostico: string | null;
}
interface PosVenda {
  total: number; comVendaRegistrada: number; comPendencia: number; semPedidoIndicacao: number; semConversa60d: number;
  clientes: Cliente[];
}
type Aba = "pendencia" | "indicacao" | "recompra" | "todos";

const SESSENTA_DIAS = 60 * 86_400_000;
const POR_VEZ = 30;
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function PosVendaPage() {
  const { lojas, lojaAtiva, storeName } = useLeads();
  const empresa = useEmpresaZapintel();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const [aba, setAba] = useState<Aba>("pendencia");
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState(POR_VEZ);

  const { dados, erro, aoVivo, carregando, tentarDeNovo } = useRpcAoVivo<PosVenda>("zapintel_posvenda", { p_filial: lojaAtiva, p_empresa: empresa }, empresa);
  const recorte = lojaAtiva == null ? `${storeName || "Sua empresa"} · toda a rede` : (lojas.find((l) => l.id === lojaAtiva)?.nome ?? "Loja");

  const filtrados = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.clientes.filter((c) => {
      if (q && !`${c.nome ?? ""} ${c.telefone ?? ""} ${c.produto ?? ""}`.toLowerCase().includes(q)) return false;
      if (aba === "pendencia") return !!c.pendencias?.length;
      if (aba === "indicacao") return !c.pediuIndicacao;
      if (aba === "recompra") return !!c.ultimaMensagem && agora - new Date(c.ultimaMensagem).getTime() > SESSENTA_DIAS;
      return true;
    });
  }, [dados, busca, aba, agora]);

  const abas: [Aba, string, number][] = dados ? [
    ["pendencia", "Com pendência", dados.comPendencia],
    ["indicacao", "Nunca pedimos indicação", dados.semPedidoIndicacao],
    ["recompra", "Sem conversa há 60+ dias", dados.semConversa60d],
    ["todos", "Todos os clientes", dados.total],
  ] : [];

  return (
    <div className="pv2">
      <style>{CSS}</style>
      <header className="pv2-topo">
        <div>
          <h1>Pós-venda</h1>
          <p>
            {dados ? `${num(dados.total)} clientes · ${num(dados.comVendaRegistrada)} com a venda registrada no CRM` : "carregando…"} · {recorte}
          </p>
        </div>
        <span className={`pv2-vivo ${aoVivo ? "" : "off"}`}><span className={`pv2-ponto ${aoVivo ? "on" : ""}`} /> {aoVivo ? "Ao vivo" : "Reconectando…"}</span>
      </header>

      {erro && !dados && <div className="card pv2-vazio"><ErroDeTela erro={erro} onTentar={tentarDeNovo} /></div>}
      {!dados && !erro && <div className="card pv2-osso" style={{ height: 420 }} />}

      {dados && (
        <div aria-busy={carregando} style={carregando ? { opacity: 0.55, transition: "opacity .2s" } : undefined}>
          <div className="pv2-barra">
            <div className="pv2-abas" role="tablist">
              {abas.map(([id, nome, n]) => (
                <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativo" : ""}
                  onClick={() => { setAba(id); setMostrar(POR_VEZ); }}>
                  {nome} <b>{num(n)}</b>
                </button>
              ))}
            </div>
            <label className="pv2-busca">
              <Search size={14} />
              <input value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(POR_VEZ); }} placeholder="Nome, telefone ou produto" aria-label="Buscar clientes" />
            </label>
          </div>

          <p className="pv2-explica">
            {aba === "pendencia" && "Algo que a loja ficou de resolver depois da venda — entrega, troca, nota, garantia. É o cliente que pode estar insatisfeito agora."}
            {aba === "indicacao" && "Clientes que nunca ouviram um pedido de indicação. Quem já comprou e gostou é o caminho mais barato para o próximo cliente."}
            {aba === "recompra" && "Clientes sem conversa há mais de 60 dias. Bom momento para saber como está o aparelho e oferecer a próxima troca."}
            {aba === "todos" && "Todos os clientes: quem a análise leu comprando e quem tem venda do CRM ligada à conversa."}
          </p>

          {filtrados.length === 0 ? <div className="card pv2-vazio">Ninguém aqui{busca ? " com essa busca" : ""}.</div> : (
            <ul className="pv2-lista">
              {filtrados.slice(0, mostrar).map((c) => <Cartao key={c.leadId} c={c} agora={agora} />)}
            </ul>
          )}
          {filtrados.length > mostrar && (
            <button className="pv2-mais" onClick={() => setMostrar((m) => m + POR_VEZ)}>
              Mostrar mais ({num(filtrados.length - mostrar)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Cartao({ c, agora }: { c: Cliente; agora: number }) {
  const [copiado, setCopiado] = useState(false);
  const crm = `/leads?lead=${c.leadId}`;
  async function copiar() {
    if (!c.mensagem) return;
    try {
      await navigator.clipboard.writeText(c.mensagem);
      setCopiado(true); setTimeout(() => setCopiado(false), 1800);
    } catch { /* sem permissão de área de transferência */ }
  }
  return (
    <li className="card pv2-cartao">
      <div className="pv2-cab">
        <Link href={`/zapintel/leads/lead-${c.leadId}`} className="pv2-nome">{c.nome || "Sem nome"}</Link>
        {c.loja && <span>{c.loja}</span>}
        {c.veioIndicado && <span className="pv2-tag ok"><Handshake size={10} /> veio por indicação</span>}
        {c.pediuIndicacao && <span className="pv2-tag">já pedimos indicação</span>}
        <span className="pv2-quando"><Clock size={11} /> {c.ultimaMensagem ? `conversa ${ha(c.ultimaMensagem, agora)}` : "sem conversa"}</span>
      </div>
      <div className="pv2-compra">
        <ShoppingBag size={12} />
        {c.vendaEm
          ? <>{c.produto || "Produto não informado"}{c.valor ? ` · ${reais(c.valor)}` : ""} · {new Date(c.vendaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>
          : <span className="pv2-sem">venda não registrada no CRM — a conversa diz que comprou</span>}
      </div>
      {!!c.pendencias?.length && (
        <ul className="pv2-pend">
          {c.pendencias.map((p, i) => <li key={i}><AlertTriangle size={12} /> {p.replace(/^⚠\s*/, "")}</li>)}
        </ul>
      )}
      {c.mensagem && (
        <div className="pv2-msg">
          <span className="pv2-msg-rotulo">Mensagem sugerida pela análise</span>
          <p>{c.mensagem}</p>
          <div className="pv2-acoes">
            <button onClick={copiar}>{copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}</button>
            <a href={crm} target="_blank" rel="noopener"><MessageCircle size={12} /> Abrir conversa no CRM</a>
          </div>
        </div>
      )}
      {!c.mensagem && (
        <div className="pv2-acoes"><a href={crm} target="_blank" rel="noopener"><MessageCircle size={12} /> Abrir conversa no CRM</a></div>
      )}
    </li>
  );
}

const CSS = `
.pv2 { display: flex; flex-direction: column; gap: 12px; max-width: 1100px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.pv2-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.pv2-topo h1 { font-size: 23px; font-weight: 800; letter-spacing: -.6px; }
.pv2-topo p { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
.pv2-vivo.off { color: var(--dim); }
.pv2-vivo { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--green); background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; }
.pv2-ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.pv2-ponto.on { background: var(--green); box-shadow: 0 0 0 3px rgba(22,163,74,.18); }
.pv2-barra { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.pv2-abas { display: flex; gap: 6px; flex-wrap: wrap; }
.pv2-abas button { background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; color: var(--dim); cursor: pointer; }
.pv2-abas button b { color: var(--txt); margin-left: 3px; }
.pv2-abas button.ativo { background: var(--txt); border-color: var(--txt); color: #fff; }
.pv2-abas button.ativo b { color: #fff; }
.pv2-busca { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--brd); border-radius: 12px; padding: 0 12px; color: var(--muted); min-width: 240px; }
.pv2-busca input { border: none; outline: none; background: transparent; color: var(--txt); font: inherit; font-size: 13px; padding: 9px 0; width: 100%; }
.pv2-explica { font-size: 12px; color: var(--dim); line-height: 1.5; }
.pv2-lista { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.pv2-cartao { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.pv2-cab { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 11.5px; color: var(--muted); }
.pv2-nome { font-size: 14px; font-weight: 800; color: var(--txt); text-decoration: none; }
.pv2-nome:hover { color: var(--purple-l); }
.pv2-quando { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
.pv2-tag { font-size: 10.5px; font-weight: 700; border: 1px solid var(--brd2); border-radius: 999px; padding: 0 7px; color: var(--dim); display: inline-flex; align-items: center; gap: 3px; }
.pv2-tag.ok { color: var(--green); border-color: rgba(22,163,74,.35); }
.pv2-compra { font-size: 12.5px; color: var(--txt); display: flex; gap: 6px; align-items: center; }
.pv2-sem { color: var(--orange); font-size: 12px; }
.pv2-pend { list-style: none; display: flex; flex-direction: column; gap: 4px; background: rgba(234,88,12,.06); border: 1px solid rgba(234,88,12,.25); border-radius: 10px; padding: 8px 10px; }
.pv2-pend li { font-size: 12px; color: var(--txt); line-height: 1.45; display: flex; gap: 6px; }
.pv2-pend svg { color: var(--orange); flex: none; margin-top: 2px; }
.pv2-msg { background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 6px; }
.pv2-msg-rotulo { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--purple-l); }
.pv2-msg p { font-size: 12.5px; color: var(--txt); line-height: 1.5; white-space: pre-wrap; }
.pv2-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
.pv2-acoes button, .pv2-acoes a { display: inline-flex; align-items: center; gap: 5px; background: var(--card); border: 1px solid var(--brd); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 11.5px; font-weight: 700; color: var(--txt); text-decoration: none; cursor: pointer; }
.pv2-acoes a:hover, .pv2-acoes button:hover { border-color: var(--purple); }
.pv2-mais { align-self: center; background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 7px 16px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--txt); cursor: pointer; }
.pv2-vazio { padding: 28px 0; text-align: center; color: var(--muted); font-size: 13px; display: flex; gap: 8px; justify-content: center; align-items: center; }
.pv2-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: pv2-osso 1.2s linear infinite; }
@keyframes pv2-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.pv2 button:focus-visible, .pv2 a:focus-visible, .pv2 input:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
@media (max-width: 560px) { .pv2-busca { min-width: 0; width: 100%; } .pv2-quando { margin-left: 0; } }
@media (prefers-reduced-motion: reduce) { .pv2-osso { animation: none; } }
`;
