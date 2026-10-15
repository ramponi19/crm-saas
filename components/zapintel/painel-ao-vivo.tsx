"use client";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy, Check, ArrowRight, MessageCircle, Clock, Inbox, Sparkles, AlertTriangle, X, Bot,
} from "lucide-react";
import {
  useDashboardAoVivo, type Dashboard, type ItemFila, type LeadDaLista,
} from "@/hooks/zapintel/useDashboardAoVivo";
import { CLASSE, ORDEM_FUNIL, URG, FAIXA_PARADO, num, ha } from "@/components/zapintel/rotulos";

/**
 * O DASHBOARD DO ZAPINTEL — RECONSTRUÍDO EM 14/10/2026 SOBRE AS ANÁLISES.
 *
 * O que estava aqui antes lia o MOTOR de palavra-chave: dizia 421 leads
 * quentes quando as fichas (a leitura da conversa inteira) diziam 40, e o
 * "fechar agora" listava quatro clientes que já tinham comprado. O Lucas
 * pediu: *"auditoria completa no dashboard com base na nova construcao de
 * analise ... sem precisar ficando clicando para atualizar"*.
 *
 * Os números vêm de `zapintel_dashboard` (banco, com a sessão de quem olha) e
 * se atualizam sozinhos pelo canal ao vivo — ver `useDashboardAoVivo`. Clicar
 * num número abre os leads por trás dele, pela MESMA regra do número
 * (`zapintel_dashboard_lista`): o cartão e a lista nunca discordam.
 *
 * O que saiu, e por quê:
 *   · "O dia da loja" — chamava a IA a cada abertura da tela (token gasto sem
 *     ninguém pedir). O resumo do dia agora se pede no assistente.
 *   · Taxa de ghost, indicações, reativação, pipeline e "perfis" — eram
 *     contas do motor de palavra-chave, desmentidas pelas fichas.
 */

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : v >= 10_000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : brl(v);

/**
 * "há 12 s" que anda de segundo em segundo. Componente próprio de propósito:
 * só ESTE texto re-renderiza a cada segundo, não o painel inteiro. Não
 * consulta nada — é o relógio do navegador.
 */
function RelogioVivo({ iso }: { iso: string | null }) {
  const agora = useRelogio(1000);
  return <>{ha(iso, agora)}</>;
}

/** Relógio da tela: só re-renderiza, não consulta nada. */
function useRelogio(ms = 15_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return agora;
}

type Gaveta = { titulo: string; tipo: string; valor?: string | null; explica?: string } | null;

export function PainelAoVivo({ filial, nomeDoRecorte, empresa }: {
  filial: number | null; nomeDoRecorte: string; empresa: number | null;
}) {
  const router = useRouter();
  const { dados, erro, aoVivo, ultimoAviso, atualizando, lista, ultimaMensagem } = useDashboardAoVivo(filial, empresa);
  const agora = useRelogio();
  const [gaveta, setGaveta] = useState<Gaveta>(null);
  const abrir = (g: NonNullable<Gaveta>) => setGaveta(g);

  if (erro && !dados) {
    return (
      <div className="card" style={{ padding: 28, maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
        <AlertTriangle size={22} style={{ color: "var(--yellow)", marginBottom: 10 }} />
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Não consegui abrir o painel</p>
        <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
          {/loja fora/i.test(erro) ? "Esta loja não está no seu acesso. Escolha \"Toda a rede\" ou a sua loja no menu ao lado." : erro}
        </p>
      </div>
    );
  }
  if (!dados) return <Esqueleto />;

  const d = dados;
  const pisca = ultimoAviso != null && agora - ultimoAviso < 4000;

  return (
    <div className="pv">
      <style>{CSS}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header className="pv-topo">
        <div>
          <h1 className="pv-titulo">Agora na loja</h1>
          <p className="pv-sub">
            {nomeDoRecorte} · {d.analises.comAnalise.toLocaleString("pt-BR")} conversas lidas pela análise
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* O parágrafo do dia (escolha do Lucas em 12/10) agora é pedido ao
            assistente, que lê estes mesmos dados. Antes era escrito sozinho a
            cada mensagem nova, a partir dos números do motor antigo — gastava
            token sem ninguém pedir e contradizia este painel. */}
        <button className="pv-botao" onClick={() => window.dispatchEvent(new CustomEvent("assistente:perguntar", {
          detail: `Faça o resumo do dia ${filial == null ? "da rede" : `da loja ${nomeDoRecorte}`} agora: o que aconteceu hoje, quem está esperando resposta, o que é mais urgente e por onde começar. Seja direto, use os dados do sistema e cite os leads com link.`,
        }))}>
          <Sparkles size={13} /> Resumo do dia
        </button>
        <div className="pv-vivo" title={aoVivo ? "Conectado: atualiza sozinho a cada mensagem" : "Reconectando ao canal ao vivo"}>
          <span className={`pv-ponto ${aoVivo ? "on" : ""} ${pisca ? "pisca" : ""}`} />
          <span style={{ fontWeight: 700, color: aoVivo ? "var(--green)" : "var(--muted)" }}>
            {aoVivo ? "Ao vivo" : "Reconectando…"}
          </span>
          <span className="pv-sep">·</span>
          <span>última mensagem <RelogioVivo iso={ultimaMensagem} /></span>
          {atualizando && <span className="pv-sep">· atualizando</span>}
        </div>
        </div>
      </header>

      {/* ── O pulso de agora ────────────────────────────────────────────── */}
      <section className="pv-pulso">
        <Pulso
          rotulo="Esperando resposta"
          valor={num(d.agora.esperando)}
          cor={d.agora.esperando > 0 ? "var(--red)" : "var(--green)"}
          linha={d.agora.esperando > 0
            ? `${d.agora.esperandoMais1h} há mais de 1 h · a mais antiga ${ha(d.agora.esperaMaisAntiga, agora)}`
            : "ninguém esperando a loja"}
          rodape={d.agora.esperandoForaDoFunil > 0 ? `+${d.agora.esperandoForaDoFunil} candidatos e não-clientes, à parte` : undefined}
          onClick={() => abrir({ titulo: "Esperando resposta da loja", tipo: "esperando", explica: "A última mensagem é do cliente, nas últimas 72 h. Candidatos à vaga e não-clientes não entram." })}
          destaque={d.agora.esperando > 0}
        />
        <Pulso rotulo="Conversas hoje" valor={num(d.agora.conversasHoje)}
          linha={`${num(d.agora.recebidasHoje)} mensagens recebidas · ${num(d.agora.enviadasHoje)} enviadas`} />
        <Pulso rotulo="Leads novos hoje" valor={num(d.agora.leadsNovosHoje)}
          linha="primeiro contato hoje" />
        <Pulso
          rotulo="Tempo de resposta"
          valor={d.resposta.medianaMin == null ? "—" : `${d.resposta.medianaMin.toLocaleString("pt-BR")} min`}
          cor={d.resposta.medianaMin != null && d.resposta.medianaMin > 15 ? "var(--orange)" : "var(--txt)"}
          linha={d.resposta.ate5Pct == null ? "ninguém falou no horário da loja nos últimos 7 dias"
            : `${d.resposta.ate5Pct}% em até 5 min · ${d.resposta.mais4hPct}% esperaram 4 h+`}
          rodape={`espera típica · 7 dias · ${descreverHorario(d.resposta.horario)}`}
          onClick={() => router.push("/zapintel/atendimento?periodo=7")}
        />
        <Pulso
          rotulo="Vendas no mês"
          valor={brlCurto(d.dinheiro.mesValor)}
          linha={`${d.dinheiro.mesQtd} ${d.dinheiro.mesQtd === 1 ? "venda" : "vendas"}${d.dinheiro.hojeQtd ? ` · hoje ${brlCurto(d.dinheiro.hojeValor)}` : ""}`}
          rodape={<Comparacao atual={d.dinheiro.mesValor} anterior={d.dinheiro.mesAnteriorValor} />}
        />
      </section>

      {/* ── Fila + dinheiro + pendências ────────────────────────────────── */}
      <section className="pv-meio">
        <Fila itens={d.fila} total={d.agora.esperando} antigos={d.agora.esperandoAntigos} agora={agora}
          verTodos={() => abrir({ titulo: "Esperando resposta da loja", tipo: "esperando" })} />

        <div className="pv-coluna">
          <Dinheiro d={d} abrir={abrir} />
          <Pendencias d={d} abrir={abrir} />
        </div>
      </section>

      {/* ── O que trava · como compram ──────────────────────────────────── */}
      <section className="pv-tres">
        <Travas d={d} abrir={abrir} />
        <div className="pv-coluna">
          <Bloco titulo="Sinais de compra" nota="o que a análise viu em quem está em negociação">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {d.sinais.map((s) => (
                <button key={s.rotulo} className="pv-chip" onClick={() => abrir({ titulo: `Sinal: ${s.rotulo}`, tipo: "sinal", valor: s.rotulo })}>
                  {s.rotulo} <b>{s.leads}</b>
                </button>
              ))}
            </div>
          </Bloco>
          <Bloco titulo="Como compram" nota="o perfil que a análise deu a cada lead">
            <Barras itens={d.perfis.map((p) => ({ nome: p.rotulo, n: p.leads }))} cor="var(--purple)"
              onClick={(nome) => abrir({ titulo: `Perfil: ${nome}`, tipo: "perfil", valor: nome })} />
          </Bloco>
        </div>
      </section>

      {/* ── Funil pelas análises ────────────────────────────────────────── */}
      <Funil d={d} abrir={abrir} />

      {/* ── Ritmo: calor, modelos, parados ──────────────────────────────── */}
      <section className="pv-tres iguais">
        <Calor celulas={d.calor} />
        <Bloco titulo="Modelos mais pedidos" nota="clientes que citaram o modelo · 30 dias">
          <Barras itens={d.modelos.map((m) => ({ nome: `iPhone ${m.modelo}`, n: m.leads, chave: m.modelo }))} cor="var(--blue)"
            onClick={(_, chave) => abrir({ titulo: `Pediram iPhone ${chave}`, tipo: "modelo", valor: chave })} />
        </Bloco>
        <Bloco titulo="Sem conversa há…" nota="leads ainda em negociação, pela última mensagem">
          <Barras
            itens={d.inatividade.map((i) => ({ nome: FAIXA_PARADO[i.faixa] ?? i.faixa, n: i.leads, chave: i.faixa }))}
            cor="var(--orange)"
            onClick={(nome, chave) => abrir({ titulo: `Sem conversa: ${nome}`, tipo: "inatividade", valor: chave })} />
        </Bloco>
      </section>

      {/* ── Antes de sumir · lojas ──────────────────────────────────────── */}
      <section className={d.porLoja.length > 1 && filial == null ? "pv-dois" : ""}>
        {d.silencio.length > 0 && (
          <Bloco titulo="O que a loja disse antes de o cliente sumir"
            nota="última fala da loja em conversas que morreram depois dela (3 a 60 dias). Mostra onde olhar, não o que culpar.">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.silencio.map((s) => (
                <div key={s.frase} className="pv-linha">
                  <span className="pv-vezes">{s.vezes}×</span>
                  <span style={{ flex: 1, whiteSpace: "pre-line" }}>&ldquo;{s.frase}&rdquo;</span>
                  {s.venderam > 0 && <span style={{ fontSize: 10.5, color: "var(--green)", whiteSpace: "nowrap" }}>{s.venderam} venderam</span>}
                </div>
              ))}
            </div>
          </Bloco>
        )}
        {d.porLoja.length > 1 && filial == null && <Lojas d={d} />}
      </section>

      <footer className="pv-rodape">
        <Sparkles size={13} style={{ color: "var(--purple-l)" }} />
        <span>
          <b>{num(d.analises.comAnalise)}</b> conversas analisadas ·{" "}
          <button className="pv-link" onClick={() => abrir({ titulo: "Conversa andou depois da análise", tipo: "desatualizadas" })}>
            {num(d.analises.desatualizadas)} com conversa nova
          </button>{" "}
          · {num(d.analises.semAnalise)} ainda sem análise
        </span>
        <button className="pv-botao" onClick={() => window.dispatchEvent(new Event("assistente:abrir"))}>
          <Bot size={13} /> Atualizar pelo assistente
        </button>
      </footer>

      {gaveta && <GavetaLeads g={gaveta} lista={lista} agora={agora} fechar={() => setGaveta(null)} />}
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

/**
 * "seg a sex, 09:00 às 18:00" — o horário da loja que vale para o tempo de
 * resposta, o mesmo da tela Atendimento (`zapintel_horario` no banco).
 */
function descreverHorario(h: { inicio: string; fim: string; dias: number[] }) {
  const N = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const d = [...h.dias].sort();
  const seguidos = d.length > 1 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const dias = d.length === 0 ? "nenhum dia" : seguidos ? `${N[d[0]]} a ${N[d[d.length - 1]]}` : d.map((x) => N[x]).join(", ");
  return `${dias}, ${h.inicio}–${h.fim}`;
}

function Pulso({ rotulo, valor, linha, rodape, cor = "var(--txt)", onClick, destaque }: {
  rotulo: string; valor: string; linha: string; rodape?: ReactNode; cor?: string; onClick?: () => void; destaque?: boolean;
}) {
  const miolo = (
    <>
      <span className="pv-rotulo">{rotulo}</span>
      <span className="pv-numero" style={{ color: cor }}>{valor}</span>
      <span className="pv-linha-pulso">{linha}</span>
      {rodape && <span className="pv-rodape-pulso">{rodape}</span>}
    </>
  );
  const classe = `pv-pulso-item ${onClick ? "clica" : ""} ${destaque ? "alerta" : ""}`;
  return onClick
    ? <button className={classe} onClick={onClick}>{miolo}</button>
    : <div className={classe}>{miolo}</div>;
}

function Comparacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (!anterior) return <>primeiro mês com venda registrada</>;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  const mes = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return (
    <span style={{ color: pct >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
      {pct >= 0 ? "+" : ""}{pct}% <span style={{ color: "var(--muted)", fontWeight: 400 }}>sobre {mes} até o mesmo dia</span>
    </span>
  );
}

function Bloco({ titulo, nota, children, acao, style }: {
  titulo: string; nota?: string; children: ReactNode; acao?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div className="card pv-bloco" style={style}>
      <div className="pv-bloco-topo">
        <div>
          <h2 className="pv-h2">{titulo}</h2>
          {nota && <p className="pv-nota">{nota}</p>}
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Barras({ itens, cor, onClick }: {
  itens: { nome: string; n: number; chave?: string }[]; cor: string; onClick?: (nome: string, chave: string) => void;
}) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  if (!itens.length) return <p className="pv-vazio">Nada ainda.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {itens.map((i) => (
        <button key={i.chave ?? i.nome} className="pv-barra" onClick={() => onClick?.(i.nome, i.chave ?? i.nome)} disabled={!onClick}>
          <span className="pv-barra-nome">{i.nome}</span>
          <span className="pv-barra-trilho"><span style={{ width: `${(i.n / max) * 100}%`, background: cor }} /></span>
          <span className="pv-barra-n">{num(i.n)}</span>
        </button>
      ))}
    </div>
  );
}

function Fila({ itens, total, antigos, agora, verTodos }: {
  itens: ItemFila[]; total: number; antigos: number; agora: number; verTodos: () => void;
}) {
  // Quem entrou na fila desde a última atualização ganha um destaque rápido.
  const [conhecidos, setConhecidos] = useState<Set<number> | null>(null);
  const novos = useMemo(() => new Set(conhecidos ? itens.filter((i) => !conhecidos.has(i.leadId)).map((i) => i.leadId) : []), [itens, conhecidos]);
  useEffect(() => {
    const t = setTimeout(() => setConhecidos(new Set(itens.map((i) => i.leadId))), 3500);
    return () => clearTimeout(t);
  }, [itens]);

  return (
    <div className="card pv-bloco pv-fila">
      <div className="pv-bloco-topo">
        <div>
          <h2 className="pv-h2" style={{ display: "flex", alignItems: "center", gap: 6 }}><Inbox size={15} style={{ color: "var(--purple-l)" }} />Fila de agora</h2>
          <p className="pv-nota">Quem está esperando a loja, na ordem em que a análise manda atender.</p>
        </div>
        {total > itens.length && (
          <button className="pv-link" onClick={verTodos}>ver os {total} <ArrowRight size={12} /></button>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="pv-fila-vazia">
          <Check size={18} style={{ color: "var(--green)" }} />
          <span>Ninguém esperando resposta agora.</span>
        </div>
      ) : (
        <ol className="pv-fila-lista">
          {itens.map((i) => <ItemDaFila key={i.leadId} i={i} agora={agora} novo={novos.has(i.leadId)} />)}
        </ol>
      )}
      {antigos > 0 && (
        <p className="pv-nota" style={{ marginTop: 10 }}>
          Fora da fila: {antigos} conversas em que o cliente falou por último há mais de 3 dias — já esfriaram.
        </p>
      )}
    </div>
  );
}

function ItemDaFila({ i, agora, novo }: { i: ItemFila; agora: number; novo: boolean }) {
  const [copiou, setCopiou] = useState(false);
  const espera = agora - new Date(i.desde).getTime();
  const cls = CLASSE[i.classificacao];
  const urg = URG[i.urgencia];
  async function copiar() {
    if (!i.mensagemSugerida) return;
    try { await navigator.clipboard.writeText(i.mensagemSugerida); setCopiou(true); setTimeout(() => setCopiou(false), 1600); } catch { /* sem permissão */ }
  }
  return (
    <li className={`pv-item ${novo ? "novo" : ""}`}>
      <div className="pv-item-topo">
        <span className="pv-urg" style={{ background: urg.cor }} title={`Urgência ${urg.nome.toLowerCase()}`} />
        <Link href={`/zapintel/leads/lead-${i.leadId}`} className="pv-nome">{i.nome || "Sem nome"}</Link>
        <span className="pv-tag" style={{ color: cls.cor, borderColor: cls.cor }}>{cls.nome}</span>
        {i.loja && <span className="pv-loja">{i.loja}</span>}
        <span className={`pv-espera ${espera > 3_600_000 ? "longa" : ""}`}>
          <Clock size={11} /> {ha(i.desde, agora).replace("há ", "")}
        </span>
      </div>
      {i.ultimaFala && (
        <p className="pv-fala">
          &ldquo;{i.ultimaFala}&rdquo;
          {i.naoRespondidas > 1 && <span className="pv-n"> · {i.naoRespondidas} sem resposta</span>}
        </p>
      )}
      {i.proximaAcao
        ? <p className="pv-acao"><ArrowRight size={12} /> {i.proximaAcao}</p>
        : <p className="pv-acao sem">Lead novo — ainda sem análise. Responder e qualificar.</p>}
      <div className="pv-item-botoes">
        {i.mensagemSugerida && (
          <button className="pv-botao leve" onClick={copiar}>
            {copiou ? <><Check size={12} /> Copiada</> : <><Copy size={12} /> Copiar mensagem sugerida</>}
          </button>
        )}
        <Link href={`/zapintel/leads/lead-${i.leadId}`} className="pv-botao leve">
          <MessageCircle size={12} /> Abrir conversa
        </Link>
        {i.desatualizada && <span className="pv-velha" title="Chegaram mensagens depois da análise">conversa andou depois da análise</span>}
      </div>
    </li>
  );
}

function Dinheiro({ d, abrir }: { d: Dashboard; abrir: (g: NonNullable<Gaveta>) => void }) {
  const t = d.dinheiro;
  const emJogo = t.ticketMedio ? t.quentes * t.ticketMedio : null;
  return (
    <Bloco titulo="Dinheiro na mesa">
      <button className="pv-dinheiro" onClick={() => abrir({ titulo: "Quentes — prontos para fechar", tipo: "classe", valor: "hot" })}>
        <span className="pv-rotulo">Em negociação</span>
        <span className="pv-numero" style={{ color: "var(--red)" }}>{emJogo == null ? `${t.quentes} quentes` : brlCurto(emJogo)}</span>
        <span className="pv-linha-pulso">
          {emJogo == null ? "sem venda registrada para estimar o ticket"
            : `estimativa: ${t.quentes} quentes × ticket médio de ${brl(t.ticketMedio!)} (90 dias)`}
        </span>
      </button>
      <div className="pv-dinheiro-par">
        <button className="pv-mini" onClick={() => abrir({ titulo: "Mornos", tipo: "classe", valor: "warm" })}>
          <b style={{ color: "var(--orange)" }}>{num(t.mornos)}</b> mornos
        </button>
        <button className="pv-mini" onClick={() => abrir({ titulo: "Clientes", tipo: "classe", valor: "customer" })}>
          <b style={{ color: "var(--green)" }}>{num(t.clientesLidos)}</b> clientes
        </button>
      </div>
      {t.semRegistro > 0 && (
        <button className="pv-aviso" onClick={() => abrir({
          titulo: "Compraram, mas o CRM não tem a venda", tipo: "sem_registro",
          explica: "A análise leu a compra na conversa (pagou, retirou, recebeu), mas não há venda registrada ligada a este lead. Conversa ativa nos últimos 90 dias.",
        })}>
          <AlertTriangle size={14} />
          <span><b>{num(t.semRegistro)} clientes compraram e o CRM não tem a venda.</b> Só {num(t.clientesComVenda)} leads têm venda registrada ligada à conversa — o faturamento acima é o mínimo, não o total.</span>
        </button>
      )}
    </Bloco>
  );
}

function Pendencias({ d, abrir }: { d: Dashboard; abrir: (g: NonNullable<Gaveta>) => void }) {
  const p = d.pendencias;
  return (
    <Bloco titulo="Pendências da loja"
      nota={`${num(p.total)} alertas em ${num(p.leads)} conversas — o que ficou prometido, errado ou sem resposta`}
      acao={<button className="pv-link" onClick={() => abrir({ titulo: "Pendências da loja", tipo: "pendencias" })}>todas <ArrowRight size={12} /></button>}>
      {p.itens.length === 0 ? <p className="pv-vazio">Nenhuma pendência recente.</p> : (
        <ul className="pv-pend">
          {p.itens.slice(0, 6).map((i, k) => (
            <li key={`${i.leadId}-${k}`}>
              <span className="pv-urg" style={{ background: URG[i.urgencia].cor, marginTop: 5 }} />
              <div>
                <Link href={`/zapintel/leads/lead-${i.leadId}`} className="pv-nome pequeno">{i.nome || "Sem nome"}</Link>
                {i.loja && <span className="pv-loja"> · {i.loja}</span>}
                <p>{i.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

function Travas({ d, abrir }: { d: Dashboard; abrir: (g: NonNullable<Gaveta>) => void }) {
  const max = Math.max(1, ...d.objecoes.map((o) => o.leads));
  return (
    <Bloco titulo="O que trava as vendas"
      nota="objeções que a análise encontrou, agrupadas. A parte escura ainda está em aberto — dá para trabalhar.">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {d.objecoes.filter((o) => o.familia !== "Outros").map((o) => {
          const daLoja = o.familia === "Falha da loja";
          return (
            <button key={o.familia} className={`pv-trava ${daLoja ? "loja" : ""}`}
              onClick={() => abrir({ titulo: `Objeção: ${o.familia}`, tipo: "objecao", valor: o.familia })}>
              <div className="pv-trava-topo">
                <span className="pv-trava-nome">{o.familia}{daLoja && <span className="pv-tag" style={{ color: "var(--red)", borderColor: "var(--red)", marginLeft: 6 }}>depende só da loja</span>}</span>
                <span className="pv-trava-n"><b>{o.emAberto}</b> em aberto · {o.leads} leads</span>
              </div>
              <span className="pv-trava-trilho">
                <span className="cheio" style={{ width: `${(o.leads / max) * 100}%` }}>
                  <span className="aberto" style={{ width: `${o.leads ? (o.emAberto / o.leads) * 100 : 0}%`, background: daLoja ? "var(--red)" : "var(--orange)" }} />
                </span>
              </span>
              {o.exemplos && <span className="pv-trava-ex">{o.exemplos.join(" · ")}</span>}
            </button>
          );
        })}
      </div>
    </Bloco>
  );
}

function Funil({ d, abrir }: { d: Dashboard; abrir: (g: NonNullable<Gaveta>) => void }) {
  const partes = ORDEM_FUNIL.map((c) => ({ c, n: d.funil[c] ?? 0 })).filter((p) => p.n > 0);
  const total = partes.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <Bloco titulo="O funil, pela leitura de cada conversa" nota={`${num(total)} conversas · clique numa parte para ver quem está nela`}>
      <div className="pv-funil">
        {partes.map((p) => (
          <button key={p.c} style={{ flex: p.n, background: CLASSE[p.c].cor }} title={`${CLASSE[p.c].nome}: ${p.n}`}
            onClick={() => abrir({ titulo: CLASSE[p.c].nome, tipo: "classe", valor: p.c })} />
        ))}
      </div>
      <div className="pv-funil-legenda">
        {partes.map((p) => (
          <button key={p.c} onClick={() => abrir({ titulo: CLASSE[p.c].nome, tipo: "classe", valor: p.c })}>
            <span style={{ background: CLASSE[p.c].cor }} />
            {CLASSE[p.c].nome} <b>{num(p.n)}</b>
            <i>{Math.round((p.n / total) * 100)}%</i>
          </button>
        ))}
      </div>
    </Bloco>
  );
}

function Calor({ celulas }: { celulas: [number, number, number][] }) {
  const horas = Array.from({ length: 16 }, (_, k) => k + 7); // 7h às 22h
  const mapa = new Map(celulas.map(([dia, h, n]) => [`${dia}-${h}`, n]));
  const max = Math.max(1, ...celulas.filter(([, h]) => h >= 7 && h <= 22).map(([, , n]) => n));
  const pico = celulas.reduce((a, c) => (c[2] > a[2] ? c : a), [0, 0, 0] as [number, number, number]);
  return (
    <Bloco titulo="Quando os clientes escrevem" nota={pico[2] ? `pico: ${DIAS[pico[0]]} às ${pico[1]}h · últimas 4 semanas` : "últimas 4 semanas"}>
      <div className="pv-calor">
        <span />
        {horas.map((h) => <span key={h} className="pv-calor-h">{h % 3 === 1 ? `${h}h` : ""}</span>)}
        {[1, 2, 3, 4, 5, 6, 7].map((dia) => (
          <FragmentoDia key={dia} dia={dia} horas={horas} mapa={mapa} max={max} />
        ))}
      </div>
    </Bloco>
  );
}
function FragmentoDia({ dia, horas, mapa, max }: { dia: number; horas: number[]; mapa: Map<string, number>; max: number }) {
  return (
    <>
      <span className="pv-calor-d">{DIAS[dia]}</span>
      {horas.map((h) => {
        const n = mapa.get(`${dia}-${h}`) ?? 0;
        return <span key={h} className="pv-calor-c" title={`${DIAS[dia]} ${h}h: ${n} mensagens`}
          style={{ background: n ? `rgba(124,92,252,${0.12 + 0.88 * (n / max)})` : "var(--card2)" }} />;
      })}
    </>
  );
}

function Lojas({ d }: { d: Dashboard }) {
  return (
    <Bloco titulo="Lojas lado a lado">
      <div style={{ overflowX: "auto" }}>
        <table className="pv-tabela">
          <thead>
            <tr><th>Loja</th><th>Conversas 7d</th><th>Esperando</th><th>Quentes</th><th>Resposta</th><th>Vendas no mês</th></tr>
          </thead>
          <tbody>
            {d.porLoja.map((l) => (
              <tr key={l.id}>
                <td><b>{l.nome}</b></td>
                <td>{num(l.ativos7d)}</td>
                <td style={{ color: l.esperando ? "var(--red)" : undefined, fontWeight: 700 }}>{num(l.esperando)}</td>
                <td>{num(l.quentes)}</td>
                <td>{l.respostaMin == null ? "—" : `${l.respostaMin.toLocaleString("pt-BR")} min`}</td>
                <td>{brlCurto(l.vendasMes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

/**
 * A mesma pergunta da gaveta, na lista de leads — onde dá para cruzar com
 * outros filtros, buscar e ver todos, não só os primeiros. Cada tipo da gaveta
 * tem o filtro de mesmo recorte em `zapintel_leads_lista` (conferido em
 * 14/10/2026: esperando 45 = 45).
 */
function linkDaLista(g: NonNullable<Gaveta>) {
  const p = new URLSearchParams();
  if (["esperando", "sem_registro", "desatualizadas", "pendencias"].includes(g.tipo)) p.set(g.tipo, "1");
  else if (g.valor) p.set(g.tipo === "inatividade" ? "parado" : g.tipo, g.valor);
  return `/zapintel/leads${p.toString() ? `?${p}` : ""}`;
}

function GavetaLeads({ g, lista, agora, fechar }: {
  g: NonNullable<Gaveta>; agora: number; fechar: () => void;
  lista: (tipo: string, valor?: string | null) => Promise<{ total: number; leads: LeadDaLista[] }>;
}) {
  const [res, setRes] = useState<{ total: number; leads: LeadDaLista[] } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    lista(g.tipo, g.valor).then((r) => { if (vivo) setRes(r); }).catch((e: Error) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [g, lista]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  return (
    <div className="pv-gaveta-fundo" onClick={fechar}>
      <aside className="pv-gaveta" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={g.titulo}>
        <div className="pv-gaveta-topo">
          <div>
            <h3>{g.titulo}</h3>
            <p>{res ? `${num(res.total)} ${res.total === 1 ? "lead" : "leads"}${res.total > res.leads.length ? ` · mostrando ${res.leads.length}` : ""}` : "carregando…"}</p>
          </div>
          <button onClick={fechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        {g.explica && <p className="pv-gaveta-explica">{g.explica}</p>}
        <Link href={linkDaLista(g)} className="pv-gaveta-lista-link" onClick={fechar}>
          Abrir na lista de leads <ArrowRight size={12} />
        </Link>
        {erro && <p className="pv-vazio">{erro}</p>}
        <ul className="pv-gaveta-lista">
          {res?.leads.map((l) => (
            <li key={l.leadId}>
              <Link href={`/zapintel/leads/lead-${l.leadId}`} onClick={fechar}>
                <div className="pv-item-topo">
                  <span className="pv-urg" style={{ background: URG[l.urgencia].cor }} />
                  <span className="pv-nome">{l.nome || "Sem nome"}</span>
                  <span className="pv-tag" style={{ color: CLASSE[l.classificacao].cor, borderColor: CLASSE[l.classificacao].cor }}>{CLASSE[l.classificacao].nome}</span>
                  {l.loja && <span className="pv-loja">{l.loja}</span>}
                  <span className="pv-espera">{ha(l.ultimaMensagem, agora)}</span>
                </div>
                {l.detalhe && <p className="pv-fala">{l.detalhe}</p>}
                {l.proximaAcao && <p className="pv-acao"><ArrowRight size={12} /> {l.proximaAcao}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="pv">
      <style>{CSS}</style>
      <div className="pv-topo"><div><div className="pv-osso" style={{ width: 220, height: 26 }} /><div className="pv-osso" style={{ width: 300, height: 12, marginTop: 8 }} /></div></div>
      <div className="pv-pulso">{[0, 1, 2, 3, 4].map((k) => <div key={k} className="pv-pulso-item"><div className="pv-osso" style={{ height: 60 }} /></div>)}</div>
      <div className="pv-meio"><div className="card pv-osso" style={{ height: 420 }} /><div className="card pv-osso" style={{ height: 420 }} /></div>
    </div>
  );
}

// ── Estilo ───────────────────────────────────────────────────────────────────
// Os tokens são os do ZapIntel (`.zi-root` em app/zapintel/globals.css); cor
// de estado (vermelho/laranja/verde) só onde significa estado.
const CSS = `
.pv { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; font-variant-numeric: tabular-nums; }
.pv-topo { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 4px; }
.pv-titulo { font-size: 26px; font-weight: 800; letter-spacing: -.7px; line-height: 1.1; }
.pv-sub { font-size: 12.5px; color: var(--dim); margin-top: 4px; }
.pv-vivo { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; }
.pv-sep { color: var(--muted); }
.pv-ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); position: relative; }
.pv-ponto.on { background: var(--green); }
.pv-ponto.on::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--green); opacity: 0; animation: pv-onda 2.4s ease-out infinite; }
.pv-ponto.pisca { box-shadow: 0 0 0 4px rgba(22,163,74,.25); }
@keyframes pv-onda { 0% { transform: scale(.6); opacity: .7; } 100% { transform: scale(1.8); opacity: 0; } }

.pv-pulso { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.pv-pulso-item { background: var(--card); border: 1px solid var(--brd); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; text-align: left; font: inherit; color: inherit; min-width: 0; }
.pv-pulso-item.clica { cursor: pointer; transition: border-color .15s, transform .15s; }
.pv-pulso-item.clica:hover { border-color: var(--purple); }
.pv-pulso-item.alerta { border-color: rgba(220,38,38,.35); background: linear-gradient(180deg, rgba(220,38,38,.05), var(--card) 60%); }
.pv-rotulo { font-size: 10.5px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; color: var(--muted); }
.pv-numero { font-size: 30px; font-weight: 800; letter-spacing: -1px; line-height: 1.1; }
.pv-linha-pulso { font-size: 11.5px; color: var(--dim); line-height: 1.45; }
.pv-rodape-pulso { font-size: 10.5px; color: var(--muted); margin-top: 2px; }

.pv-meio { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pv-tres { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pv-tres.iguais { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.pv-dois { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pv-coluna { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.pv-bloco { padding: 16px 18px; min-width: 0; }
.pv-bloco-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.pv-h2 { font-size: 14px; font-weight: 800; letter-spacing: -.2px; }
.pv-nota { font-size: 11.5px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
.pv-vazio { font-size: 12px; color: var(--muted); }
.pv-link { background: none; border: none; color: var(--purple-l); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 0; white-space: nowrap; }
.pv-botao { display: inline-flex; align-items: center; gap: 6px; background: var(--purple); color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; }
.pv-botao.leve { background: var(--card2); color: var(--txt); border: 1px solid var(--brd2); font-weight: 600; padding: 5px 10px; font-size: 11.5px; }
.pv-botao.leve:hover { border-color: var(--purple); color: var(--purple-l); }
.pv-chip { background: var(--card2); border: 1px solid var(--brd2); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 11.5px; color: var(--txt); cursor: pointer; }
.pv-chip b { color: var(--purple-l); margin-left: 3px; }
.pv-chip:hover { border-color: var(--purple); }

.pv-fila { border-color: rgba(124,92,252,.28); }
.pv-fila-lista { list-style: none; display: flex; flex-direction: column; gap: 8px; max-height: 760px; overflow-y: auto; padding-right: 2px; }
.pv-fila-vazia { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dim); padding: 28px 0; justify-content: center; }
.pv-item { border: 1px solid var(--brd); border-radius: 12px; padding: 11px 13px; background: var(--card); transition: background 1.2s; }
.pv-item.novo { background: rgba(124,92,252,.09); border-color: rgba(124,92,252,.45); animation: pv-entra .5s ease-out; }
@keyframes pv-entra { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
.pv-item-topo { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; }
.pv-urg { width: 7px; height: 7px; border-radius: 50%; flex: none; display: inline-block; }
.pv-nome { font-size: 13px; font-weight: 800; color: var(--txt); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.pv-nome.pequeno { font-size: 12px; }
.pv-nome:hover { color: var(--purple-l); }
.pv-tag { font-size: 9.5px; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 1px 7px; text-transform: uppercase; letter-spacing: .4px; }
.pv-loja { font-size: 11px; color: var(--muted); }
.pv-espera { margin-left: auto; font-size: 11px; color: var(--dim); display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.pv-espera.longa { color: var(--red); font-weight: 700; }
.pv-fala { font-size: 12px; color: var(--dim); font-style: italic; margin-top: 6px; line-height: 1.5; overflow-wrap: anywhere; }
.pv-n { font-style: normal; color: var(--orange); font-weight: 700; }
.pv-acao { font-size: 12.5px; color: var(--txt); margin-top: 5px; line-height: 1.5; display: flex; gap: 6px; align-items: baseline; }
.pv-acao svg { flex: none; color: var(--purple-l); position: relative; top: 1px; }
.pv-acao.sem { color: var(--muted); }
.pv-item-botoes { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
.pv-velha { font-size: 10.5px; color: var(--yellow); }

.pv-dinheiro { display: flex; flex-direction: column; gap: 3px; width: 100%; text-align: left; background: none; border: none; font: inherit; color: inherit; padding: 0; cursor: pointer; }
.pv-dinheiro-par { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.pv-mini { background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; text-align: left; }
.pv-mini b { font-size: 17px; margin-right: 4px; }
.pv-mini:hover { border-color: var(--purple); }
.pv-aviso { margin-top: 12px; display: flex; gap: 8px; align-items: flex-start; text-align: left; width: 100%; background: rgba(202,138,4,.09); border: 1px solid rgba(202,138,4,.35); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 12px; color: var(--txt); line-height: 1.5; cursor: pointer; }
.pv-aviso svg { flex: none; color: var(--yellow); margin-top: 2px; }

.pv-pend { list-style: none; display: flex; flex-direction: column; gap: 9px; }
.pv-pend li { display: flex; gap: 8px; align-items: flex-start; }
.pv-pend p { font-size: 12px; color: var(--dim); line-height: 1.45; margin-top: 1px; }

.pv-trava { background: none; border: none; font: inherit; color: inherit; text-align: left; padding: 6px 6px; margin: 0 -6px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.pv-trava:hover { background: var(--card2); }
.pv-trava-topo { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.pv-trava-nome { font-size: 12.5px; font-weight: 700; }
.pv-trava-n { font-size: 11px; color: var(--muted); }
.pv-trava-n b { color: var(--txt); }
.pv-trava-trilho { height: 8px; background: var(--card2); border-radius: 4px; display: block; overflow: hidden; }
.pv-trava-trilho .cheio { display: block; height: 100%; background: #e5d8c9; border-radius: 4px; overflow: hidden; }
.pv-trava.loja .pv-trava-trilho .cheio { background: #f3c9c9; }
.pv-trava-trilho .aberto { display: block; height: 100%; }
.pv-trava-ex { font-size: 10.5px; color: var(--muted); }

.pv-barra { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; background: none; border: none; font: inherit; color: inherit; padding: 4px 6px; margin: 0 -6px; border-radius: 6px; cursor: pointer; text-align: left; }
.pv-barra:disabled { cursor: default; }
.pv-barra:not(:disabled):hover { background: var(--card2); }
.pv-barra-nome { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-barra-trilho { height: 6px; background: var(--card2); border-radius: 3px; overflow: hidden; display: block; }
.pv-barra-trilho span { display: block; height: 100%; border-radius: 3px; }
.pv-barra-n { font-size: 12px; font-weight: 700; min-width: 28px; text-align: right; }

.pv-funil { display: flex; height: 22px; border-radius: 7px; overflow: hidden; gap: 2px; }
.pv-funil button { border: none; cursor: pointer; min-width: 4px; transition: filter .15s; }
.pv-funil button:hover { filter: brightness(1.12); }
.pv-funil-legenda { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; }
.pv-funil-legenda button { background: none; border: none; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; }
.pv-funil-legenda button span { width: 9px; height: 9px; border-radius: 2px; }
.pv-funil-legenda b { color: var(--txt); }
.pv-funil-legenda i { font-style: normal; color: var(--muted); font-size: 11px; }

.pv-calor { display: grid; grid-template-columns: 26px repeat(16, minmax(0, 1fr)); gap: 3px; align-items: center; }
.pv-calor-h { font-size: 9px; color: var(--muted); text-align: left; white-space: nowrap; }
.pv-calor-d { font-size: 10px; color: var(--dim); }
.pv-calor-c { aspect-ratio: 1; border-radius: 3px; display: block; }

.pv-linha { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; border-radius: 8px; background: var(--card2); border: 1px solid var(--brd2); font-size: 12px; line-height: 1.45; }
.pv-vezes { font-weight: 800; color: var(--orange); min-width: 30px; text-align: right; }

.pv-tabela { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pv-tabela th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--brd); white-space: nowrap; }
.pv-tabela td { padding: 9px 8px; border-bottom: 1px solid var(--brd); white-space: nowrap; }

.pv-rodape { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--dim); padding: 4px 2px 24px; }
.pv-rodape .pv-botao { margin-left: auto; }

.pv-gaveta-fundo { position: fixed; inset: 0; background: rgba(21,24,28,.32); z-index: 950; display: flex; justify-content: flex-end; }
.pv-gaveta { width: min(480px, 100vw); height: 100dvh; background: var(--bg); box-shadow: -12px 0 40px rgba(21,24,28,.18); display: flex; flex-direction: column; animation: pv-gaveta .22s ease-out; }
@keyframes pv-gaveta { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
.pv-gaveta-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 18px 18px 12px; border-bottom: 1px solid var(--brd); background: var(--card); }
.pv-gaveta-topo h3 { font-size: 16px; font-weight: 800; }
.pv-gaveta-topo p { font-size: 12px; color: var(--muted); margin-top: 2px; }
.pv-gaveta-topo button { background: none; border: none; color: var(--dim); cursor: pointer; }
.pv-gaveta-explica { font-size: 12px; color: var(--dim); padding: 10px 18px; background: var(--card2); border-bottom: 1px solid var(--brd); line-height: 1.5; }
.pv-gaveta-lista-link { display: flex; align-items: center; gap: 5px; padding: 9px 18px; font-size: 12px; font-weight: 700; color: var(--purple-l); text-decoration: none; border-bottom: 1px solid var(--brd); background: var(--card); }
.pv-gaveta-lista-link:hover { background: var(--card2); }
.pv-gaveta-lista { list-style: none; overflow-y: auto; padding: 10px 12px 24px; display: flex; flex-direction: column; gap: 8px; }
.pv-gaveta-lista a { display: block; background: var(--card); border: 1px solid var(--brd); border-radius: 12px; padding: 10px 12px; text-decoration: none; color: inherit; }
.pv-gaveta-lista a:hover { border-color: var(--purple); }

.pv-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: pv-osso 1.2s linear infinite; border-radius: 8px; }
@keyframes pv-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.pv button:focus-visible, .pv a:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }

@media (max-width: 1100px) {
  .pv-pulso { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pv-tres.iguais { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .pv-meio, .pv-tres, .pv-dois, .pv-tres.iguais { grid-template-columns: minmax(0, 1fr); }
  .pv-pulso { grid-template-columns: 1fr 1fr; }
  .pv-numero { font-size: 26px; }
  .pv-fila-lista { max-height: none; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .pv-ponto.on::after, .pv-item.novo, .pv-gaveta, .pv-osso { animation: none; }
}
`;
