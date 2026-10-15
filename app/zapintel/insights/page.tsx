"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowRight, AlertTriangle, Sparkles, Users, TrendingDown, Receipt, Handshake } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../providers";
import { useRpcAoVivo } from "@/hooks/zapintel/useRpcAoVivo";
import { num, ha } from "@/components/zapintel/rotulos";

/**
 * INSIGHTS DO ZAPINTEL — POR QUE A LOJA VENDE E POR QUE PERDE.
 *
 * Reconstruída em 14/10/2026. Pedido do Lucas: *"aqui é os insights de ia
 * focado em venda total"*. A tela antiga era do motor de palavras e a
 * auditoria derrubou quase todo número dela: "Pediu indicação" 89 eram uns 5
 * ("você conhece a loja?" contava), "Chamou pelo nome" não separa venda (14,8%
 * compram chamando ou não), os "atendentes" saíam do texto ("seguinte",
 * "CEP"), e 465 "aguardando a loja" contavam "Fechado" e "obrigado".
 *
 * Tempo de primeira resposta e hora de chegada também foram medidos e NÃO
 * separam venda (13–17% e 11–16% em toda faixa) — por isso não têm card.
 *
 * O dashboard é o agora, a lista é quem; esta tela é o que mudar. Tudo vem de
 * `zapintel_insights` (banco, sessão de quem olha), e cada número abre a
 * lista de leads com o mesmo recorte — conferido 1:1 em 14/10.
 */

interface Linha { familia: string; leads: number; compraram: number; pct: number }
interface Objecao extends Linha { perdidos: number; emAberto: number }
type Fase = "aberto" | "pos" | "perdido";
interface Insights {
  dias: number | null; conversas: number; taxaBase: number | null;
  /** O período anterior, do mesmo tamanho (null em "Tudo"). Substitui a tela Comparar. */
  comparacao: { vendas: number; valor: number; conversasNovas: number; conversasNovasAntes: number } | null;
  vendaTotal: { registradas: number; valor: number; ticket: number | null; comConversa: number; lidasNasConversas: number; ligadas: number; semRegistro: number };
  objecoes: Objecao[];
  sinais: Linha[];
  pendencias: { total: number; fases: Partial<Record<Fase, number>>; itens: { leadId: number; nome: string | null; fase: Fase; texto: string; ultimaMensagem: string; loja: string | null }[] };
  clientes: { total: number; chegaramPorIndicacao: number; pediuIndicacao: number; semConversa60d: number; semIndicacaoPedida: number };
  perdidos: { total: number; exemplos: { leadId: number; nome: string | null; familia: string; diagnostico: string; loja: string | null }[] };
}

const PERIODOS: [string, string][] = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["tudo", "Tudo"]];
const FASES: [Fase, string][] = [["aberto", "Antes da venda"], ["pos", "Pós-venda"], ["perdido", "Perdidos"]];
const pct = (v: number | null) => `${(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function InsightsPage() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const { lojas, lojaAtiva, storeName } = useLeads();
  const empresa = useEmpresaZapintel();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const periodo = busca.get("periodo") ?? "30";
  const dias = periodo === "tudo" ? null : Number(periodo) || 30;
  const { dados, erro, aoVivo, carregando } = useRpcAoVivo<Insights>("zapintel_insights", {
    p_dias: dias, p_filial: lojaAtiva, p_empresa: empresa,
  }, empresa);

  const recorte = lojaAtiva == null ? `${storeName || "Sua empresa"} · toda a rede` : (lojas.find((l) => l.id === lojaAtiva)?.nome ?? "Loja");
  const quando = dias == null ? "em toda a história" : `nos últimos ${dias} dias`;

  /** O link da lista com o mesmo recorte do card: período + o que o card conta. */
  const lista = (f: Record<string, string>) => {
    const p = new URLSearchParams(f);
    if (dias != null) p.set("dias", String(dias));
    return `/zapintel/leads?${p}`;
  };

  return (
    <div className="ins">
      <style>{CSS}</style>

      <header className="ins-topo">
        <div>
          <h1 className="ins-titulo">Por que a loja vende — e por que perde</h1>
          <p className="ins-sub">
            {dados ? `${num(dados.conversas)} conversas com mensagem ${quando}` : "carregando…"} · {recorte}
            {carregando && dados && <span className="ins-carregando"> · atualizando…</span>}
          </p>
        </div>
        <div className="ins-acoes">
          <div className="ins-periodo" role="group" aria-label="Período">
            {PERIODOS.map(([v, n]) => (
              <button key={v} className={periodo === v ? "ativo" : ""} aria-pressed={periodo === v}
                onClick={() => router.replace(v === "30" ? caminho : `${caminho}?periodo=${v}`, { scroll: false })}>{n}</button>
            ))}
          </div>
          <button className="ins-botao" onClick={() => window.dispatchEvent(new CustomEvent("assistente:perguntar", {
            detail: `Faça o resumo comercial ${dias == null ? "de toda a história" : `dos últimos ${dias} dias`} ${lojaAtiva == null ? "da rede" : `da loja ${recorte}`}: quanto se vendeu, onde as vendas estão se perdendo, quais promessas da loja estão em aberto e as 3 coisas que mais aumentariam as vendas agora. Use os dados do sistema e cite os leads com link.`,
          }))}>
            <Sparkles size={13} /> Resumo do período
          </button>
          <span className="ins-vivo" title={aoVivo ? "Atualiza sozinha quando uma análise ou venda muda" : "Reconectando"}>
            <span className={`ins-ponto ${aoVivo ? "on" : ""}`} /> {aoVivo ? "Ao vivo" : "Reconectando…"}
          </span>
        </div>
      </header>

      {erro && !dados && (
        <div className="card ins-vazio"><AlertTriangle size={16} style={{ color: "var(--yellow)" }} />
          {/loja fora/i.test(erro) ? "Esta loja não está no seu acesso. Escolha \"Toda a rede\" ou a sua loja no menu." : erro}
        </div>
      )}
      {!dados && !erro && <div className="card ins-osso" style={{ height: 520 }} />}

      {dados && (
        <div className={`ins-grade ${carregando ? "apagada" : ""}`}>
          <VendaTotal d={dados} lista={lista} quando={quando} />
          <Perdas d={dados} lista={lista} />
          <Sinais d={dados} lista={lista} />
          <Pendencias d={dados} lista={lista} agora={agora} />
          <Clientes d={dados} lista={lista} />
          <Perdidos d={dados} lista={lista} />
        </div>
      )}
    </div>
  );
}

function Cartao({ icone, titulo, sub, acao, largo, children }: {
  icone: ReactNode; titulo: string; sub?: string; acao?: ReactNode; largo?: boolean; children: ReactNode;
}) {
  return (
    <section className={`card ins-cartao ${largo ? "largo" : ""}`}>
      <div className="ins-cartao-topo">
        <div>
          <h2>{icone} {titulo}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function VerNaLista({ href, children = "ver na lista" }: { href: string; children?: ReactNode }) {
  return <Link href={href} className="ins-link">{children} <ArrowRight size={12} /></Link>;
}

/** O que o CRM registrou contra o que as conversas mostram. */
function VendaTotal({ d, lista, quando }: { d: Insights; lista: (f: Record<string, string>) => string; quando: string }) {
  const v = d.vendaTotal;
  return (
    <Cartao largo icone={<Receipt size={15} />} titulo="Venda total"
      sub={`O que o CRM registrou contra o que as conversas mostram, ${quando}.`}>
      <div className="ins-venda">
        <div className="ins-num">
          <span className="ins-num-rotulo">Registradas no CRM</span>
          <b>{num(v.registradas)}</b>
          <span>{reais(v.valor)}{v.ticket != null && <> · ticket {reais(v.ticket)}</>}</span>
          <small>{num(v.comConversa)} delas ligadas a uma conversa</small>
          {d.comparacao && <Variacao atual={v.registradas} antes={d.comparacao.vendas} rotulo="vendas no período anterior" />}
        </div>
        <div className="ins-num">
          <span className="ins-num-rotulo">Compras lidas nas conversas</span>
          <b>{num(v.lidasNasConversas)}</b>
          <span>clientes, segundo a análise de cada conversa</span>
          {d.comparacao && <Variacao atual={d.comparacao.conversasNovas} antes={d.comparacao.conversasNovasAntes} rotulo="conversas novas no período anterior" prefixo={`${num(d.comparacao.conversasNovas)} conversas novas · `} />}
          <Link href={lista({ classe: "customer" })} className="ins-link">ver quem <ArrowRight size={12} /></Link>
        </div>
        <Link href={lista({ sem_registro: "1" })} className="ins-num alerta">
          <span className="ins-num-rotulo">Compraram e o CRM não tem a venda</span>
          <b>{num(v.semRegistro)}</b>
          <span>sem venda lançada no CRM{d.dias == null || d.dias > 90 ? " · conversas dos últimos 90 dias" : ""}</span>
          <small className="ins-link">registrar <ArrowRight size={12} /></small>
        </Link>
      </div>
      <p className="ins-nota">
        Cliente lido na conversa inclui quem comprou antes do período e voltou a falar — por isso não vira valor em reais.
        Venda sem registro some do faturamento, da comissão e do pós-venda.
      </p>
    </Cartao>
  );
}

/** "+12% · 30 no período anterior" — a comparação que antes era uma tela inteira. */
function Variacao({ atual, antes, rotulo, prefixo = "" }: { atual: number; antes: number; rotulo: string; prefixo?: string }) {
  const pct = antes > 0 ? Math.round(((atual - antes) / antes) * 100) : null;
  const cor = pct == null || pct === 0 ? "var(--muted)" : pct > 0 ? "var(--green)" : "var(--red)";
  return (
    <small style={{ color: "var(--muted)" }}>
      {prefixo}
      {pct != null && <b style={{ color: cor }}>{pct > 0 ? "+" : ""}{pct}% </b>}
      · {num(antes)} {rotulo}
    </small>
  );
}

/** Objeção por família contra o desfecho: onde a venda se perde de verdade. */
function Perdas({ d, lista }: { d: Insights; lista: (f: Record<string, string>) => string }) {
  const base = d.taxaBase ?? 0;
  const maxLeads = Math.max(1, ...d.objecoes.map((o) => o.leads));
  return (
    <Cartao largo icone={<TrendingDown size={15} />} titulo="Onde a venda se perde"
      sub={`Cada objeção que a análise leu, e o que aconteceu depois. Em média, ${pct(base)} das conversas no funil terminam em compra.`}>
      {d.objecoes.length === 0 ? <p className="ins-vazio">Nenhuma objeção no período.</p> : (
        <div className="ins-tabela-caixa">
          <table className="ins-tabela">
            <thead><tr><th>Objeção</th><th className="n">Conversas</th><th>Compraram</th><th className="n">Perdidos</th><th className="n">Em aberto</th><th /></tr></thead>
            <tbody>
              {d.objecoes.map((o) => {
                const depoisDaCompra = o.pct >= base * 2.5 && o.compraram >= 5;
                return (
                  <tr key={o.familia}>
                    <td>
                      <b>{o.familia}</b>
                      {depoisDaCompra && <div className="ins-dica">aparece mais em quem já comprou</div>}
                    </td>
                    <td className="n">
                      <div className="ins-barra-num"><span style={{ width: `${(o.leads / maxLeads) * 100}%` }} />{num(o.leads)}</div>
                    </td>
                    <td><Taxa pct={o.pct} base={base} n={o.compraram} /></td>
                    <td className="n">{o.perdidos ? <Link href={lista({ objecao: o.familia, classe: "lost", funil: "1" })} className="ins-perdido">{num(o.perdidos)}</Link> : "—"}</td>
                    <td className="n">{o.emAberto ? <Link href={lista({ objecao: o.familia, fase: "aberto", funil: "1" })}>{num(o.emAberto)}</Link> : "—"}</td>
                    <td><VerNaLista href={lista({ objecao: o.familia, funil: "1" })}>abrir</VerNaLista></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

/** "12%" com uma régua: a barra é a taxa, o traço é a média. */
function Taxa({ pct, base, n }: { pct: number; base: number; n: number }) {
  const fmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const escala = Math.max(50, base * 3);
  const cor = pct >= base * 1.3 ? "var(--green)" : pct <= base * 0.6 ? "var(--red)" : "var(--orange)";
  return (
    <div className="ins-taxa" title={`${n} compraram`}>
      <div className="ins-regua">
        <span className="ins-regua-barra" style={{ width: `${Math.min(100, (pct / escala) * 100)}%`, background: cor }} />
        <span className="ins-regua-media" style={{ left: `${Math.min(100, (base / escala) * 100)}%` }} />
      </div>
      <b style={{ color: cor }}>{fmt(pct)}</b>
    </div>
  );
}

/** O que aparecia na conversa de quem comprou — sinal que prevê, não sinal que conta. */
function Sinais({ d, lista }: { d: Insights; lista: (f: Record<string, string>) => string }) {
  const base = d.taxaBase ?? 0;
  return (
    <Cartao icone={<Sparkles size={15} />} titulo="O que quem compra tinha"
      sub={`Sinais que a análise leu antes da compra. O traço é a média (${pct(base)}).`}>
      {d.sinais.length === 0 ? <p className="ins-vazio">Poucos sinais no período.</p> : (
        <ul className="ins-sinais">
          {d.sinais.map((s) => (
            <li key={s.familia}>
              <Link href={lista({ sinal_familia: s.familia, funil: "1" })}>
                <span className="ins-sinal-nome">{s.familia}<small>{num(s.leads)} conversas</small></span>
                <Taxa pct={s.pct} base={base} n={s.compraram} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="ins-nota">
        Mostra o que andou junto com a compra, não o que a causou. Abaixo do traço quer dizer que o sinal aparece muito em
        quem ainda não fechou — vale cobrar o próximo passo.
      </p>
    </Cartao>
  );
}

/** As pendências ⚠ que a análise apontou, separadas pela fase da conversa. */
function Pendencias({ d, lista, agora }: { d: Insights; lista: (f: Record<string, string>) => string; agora: number }) {
  const [fase, setFase] = useState<Fase>("aberto");
  const p = d.pendencias;
  const itens = p.itens.filter((i) => i.fase === fase);
  const link = fase === "aberto" ? lista({ pendencias: "1", fase: "aberto", funil: "1" })
    : lista({ pendencias: "1", classe: fase === "pos" ? "customer" : "lost" });
  return (
    <Cartao icone={<AlertTriangle size={15} />} titulo="Pendências da loja"
      sub={`${num(p.total)} conversas com algo que a loja precisa resolver — promessa, resposta ou risco.`}
      acao={<VerNaLista href={link}>todas</VerNaLista>}>
      <div className="ins-abas" role="tablist">
        {FASES.map(([f, n]) => (
          <button key={f} role="tab" aria-selected={fase === f} className={fase === f ? "ativo" : ""} onClick={() => setFase(f)}>
            {n} <b>{num(p.fases[f] ?? 0)}</b>
          </button>
        ))}
      </div>
      {itens.length === 0 ? <p className="ins-vazio">Nada pendente nesta fase.</p> : (
        <ul className="ins-pend">
          {itens.slice(0, 6).map((i, k) => (
            <li key={`${i.leadId}-${k}`}>
              <Link href={`/zapintel/leads/lead-${i.leadId}`}>
                <div className="ins-pend-topo"><b>{i.nome || "Sem nome"}</b>{i.loja && <span>{i.loja}</span>}<span>última mensagem {ha(i.ultimaMensagem, agora)}</span></div>
                <p>{i.texto.replace(/^⚠\s*/, "")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function Clientes({ d, lista }: { d: Insights; lista: (f: Record<string, string>) => string }) {
  const c = d.clientes;
  return (
    <Cartao icone={<Handshake size={15} />} titulo="Clientes: indicação e recompra"
      sub="Quem já comprou é o lead mais barato que existe."
      acao={<VerNaLista href={lista({ classe: "customer" })}>clientes</VerNaLista>}>
      <div className="ins-mini">
        <div><b>{num(c.total)}</b><span>clientes com conversa</span></div>
        <Link href={lista({ sinal_familia: "Veio por indicação", funil: "1" })}><b>{num(c.chegaramPorIndicacao)}</b><span>conversas que chegaram por indicação</span></Link>
        <div className={c.pediuIndicacao <= c.total * 0.1 ? "ruim" : ""}><b>{num(c.pediuIndicacao)}</b><span>{c.pediuIndicacao === 1 ? "cliente recebeu" : "clientes receberam"} pedido de indicação</span></div>
      </div>
      <p className="ins-nota">
        {c.semIndicacaoPedida > 0
          ? <>{num(c.semIndicacaoPedida)} clientes nunca ouviram &ldquo;conhece alguém que queira trocar de iPhone?&rdquo;. Indicação já traz {num(c.chegaramPorIndicacao)} conversas sem ninguém pedir.</>
          : <>Todos os clientes do período receberam pedido de indicação.</>}
        {c.semConversa60d > 0 && <> {num(c.semConversa60d)} estão há mais de 60 dias sem conversa.</>}
      </p>
    </Cartao>
  );
}

function Perdidos({ d, lista }: { d: Insights; lista: (f: Record<string, string>) => string }) {
  const p = d.perdidos;
  return (
    <Cartao icone={<Users size={15} />} titulo={`Perdidos: ${num(p.total)}`}
      sub="O porquê, nas palavras da análise de cada conversa."
      acao={<VerNaLista href={lista({ classe: "lost" })}>todos</VerNaLista>}>
      {p.exemplos.length === 0 ? <p className="ins-vazio">Nenhum perdido no período.</p> : (
        <ul className="ins-pend">
          {p.exemplos.map((e) => (
            <li key={e.leadId}>
              <Link href={`/zapintel/leads/lead-${e.leadId}`}>
                <div className="ins-pend-topo"><b>{e.nome || "Sem nome"}</b><span className="ins-tag">{e.familia}</span>{e.loja && <span>{e.loja}</span>}</div>
                <p>{e.diagnostico}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

const CSS = `
.ins { display: flex; flex-direction: column; gap: 14px; max-width: 1280px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.ins-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.ins-titulo { font-size: 23px; font-weight: 800; letter-spacing: -.6px; text-wrap: balance; }
.ins-sub { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
.ins-carregando { color: var(--purple-l); }
.ins-acoes { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ins-periodo { display: inline-flex; background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 3px; }
.ins-periodo button { background: none; border: none; border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; }
.ins-periodo button.ativo { background: var(--txt); color: #fff; font-weight: 700; }
.ins-botao { display: inline-flex; align-items: center; gap: 6px; background: var(--purple); color: #fff; border: none; border-radius: 999px; padding: 7px 13px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.ins-vivo { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--green); background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; }
.ins-ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.ins-ponto.on { background: var(--green); box-shadow: 0 0 0 3px rgba(22,163,74,.18); }
.ins-grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; transition: opacity .15s; }
.ins-grade.apagada { opacity: .55; }
.ins-cartao { padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ins-cartao.largo { grid-column: 1 / -1; }
.ins-cartao-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ins-cartao-topo h2 { font-size: 14.5px; font-weight: 800; display: flex; align-items: center; gap: 7px; }
.ins-cartao-topo p { font-size: 12px; color: var(--dim); margin-top: 3px; line-height: 1.5; }
.ins-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--purple-l); text-decoration: none; white-space: nowrap; }
.ins-link:hover { text-decoration: underline; }
.ins-nota { font-size: 11.5px; color: var(--muted); line-height: 1.55; }
.ins-vazio { padding: 24px 0; text-align: center; color: var(--muted); font-size: 12.5px; display: flex; gap: 8px; justify-content: center; align-items: center; }
.ins-venda { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ins-num { display: flex; flex-direction: column; gap: 3px; background: var(--card2); border: 1px solid var(--brd2); border-radius: 12px; padding: 14px; text-decoration: none; color: inherit; }
.ins-num b { font-size: 30px; font-weight: 800; letter-spacing: -1px; line-height: 1.1; }
.ins-num span { font-size: 12px; color: var(--dim); }
.ins-num small { font-size: 11px; color: var(--muted); margin-top: 2px; }
.ins-num-rotulo { font-size: 10.5px !important; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--muted) !important; }
.ins-num.alerta { border-color: rgba(220,38,38,.35); background: rgba(220,38,38,.04); }
.ins-num.alerta b { color: var(--red); }
.ins-num.alerta:hover { border-color: var(--red); }
.ins-num small.ins-link { color: var(--purple-l); font-size: 12px; }
.ins-tabela-caixa { overflow-x: auto; }
.ins-tabela { width: 100%; border-collapse: collapse; min-width: 640px; }
.ins-tabela th { text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--brd); white-space: nowrap; }
.ins-tabela td { padding: 9px 10px; border-bottom: 1px solid var(--card2); font-size: 12.5px; vertical-align: middle; }
.ins-tabela .n { text-align: right; }
.ins-tabela td a { color: var(--txt); font-weight: 700; text-decoration: none; }
.ins-tabela td a:hover { color: var(--purple-l); }
.ins-tabela td a.ins-perdido { color: var(--red); }
.ins-tabela td a.ins-link { color: var(--purple-l); }
.ins-dica { font-size: 10.5px; color: var(--green); margin-top: 2px; }
.ins-barra-num { position: relative; display: flex; justify-content: flex-end; align-items: center; gap: 6px; min-width: 70px; }
.ins-barra-num span { position: absolute; left: 0; top: 50%; height: 4px; transform: translateY(-50%); background: var(--brd2); border-radius: 2px; max-width: calc(100% - 36px); }
.ins-taxa { display: flex; align-items: center; gap: 8px; min-width: 150px; }
.ins-taxa b { font-size: 12.5px; width: 42px; text-align: right; }
.ins-regua { position: relative; flex: 1; height: 8px; background: var(--card2); border-radius: 4px; }
.ins-regua-barra { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }
.ins-regua-media { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--txt); opacity: .55; }
.ins-sinais { list-style: none; display: flex; flex-direction: column; gap: 2px; }
.ins-sinais a { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 8px; border-radius: 8px; text-decoration: none; color: inherit; }
.ins-sinais a:hover { background: var(--card2); }
.ins-sinal-nome { font-size: 12.5px; font-weight: 700; display: flex; flex-direction: column; }
.ins-sinal-nome small { font-size: 10.5px; font-weight: 400; color: var(--muted); }
.ins-abas { display: flex; gap: 4px; flex-wrap: wrap; }
.ins-abas button { background: var(--card2); border: 1px solid var(--brd2); border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; }
.ins-abas button b { color: var(--txt); margin-left: 3px; }
.ins-abas button.ativo { background: var(--txt); border-color: var(--txt); color: #fff; }
.ins-abas button.ativo b { color: #fff; }
.ins-pend { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ins-pend a { display: block; background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 9px 12px; text-decoration: none; color: inherit; }
.ins-pend a:hover { border-color: var(--purple); }
.ins-pend-topo { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 12.5px; }
.ins-pend-topo span { font-size: 11px; color: var(--muted); }
.ins-pend p { font-size: 12px; color: var(--dim); line-height: 1.5; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ins-tag { font-size: 10px !important; font-weight: 700; color: var(--dim) !important; border: 1px solid var(--brd2); border-radius: 999px; padding: 0 7px; }
.ins-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ins-mini > * { display: flex; flex-direction: column; gap: 2px; background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 10px 12px; text-decoration: none; color: inherit; }
.ins-mini a:hover { border-color: var(--purple); }
.ins-mini b { font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
.ins-mini span { font-size: 11px; color: var(--dim); line-height: 1.4; }
.ins-mini .ruim b { color: var(--red); }
.ins-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: ins-osso 1.2s linear infinite; }
@keyframes ins-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.ins button:focus-visible, .ins a:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
@media (max-width: 960px) {
  .ins-grade { grid-template-columns: minmax(0, 1fr); }
  .ins-venda { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .ins-mini { grid-template-columns: minmax(0, 1fr); }
  .ins-titulo { font-size: 20px; }
}
@media (prefers-reduced-motion: reduce) { .ins-osso { animation: none; } .ins-grade { transition: none; } }
`;
