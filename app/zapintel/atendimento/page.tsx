"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowRight, AlertTriangle, Sparkles, Clock, MoonStar, UserX, RotateCcw, Users, TrendingUp, Grid3x3 } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../providers";
import { useRpcAoVivo } from "@/hooks/zapintel/useRpcAoVivo";
import type { Classe } from "@/hooks/zapintel/useDashboardAoVivo";
import { CLASSE, num, ha } from "@/components/zapintel/rotulos";

/**
 * ATENDIMENTO — COMO A LOJA ATENDE. Substitui Performance I e II (15/10/2026).
 *
 * Pedido do Lucas: *"auditoria performance + performance 2"* → *"pode
 * construir"*. As duas telas eram do motor de palavras e se contradiziam: o
 * tempo de resposta saía com quatro números (4h14 "crítico", 14 min, 1h14; "<5
 * min" = 31% e 64%), o funil dizia 35 clientes (análises: 246), a ação #02 ainda
 * multiplicava o ticket inventado de R$ 5.200, e "melhor horário para fechar"
 * era 1 da manhã.
 *
 * Medido no horário da loja, a resposta sai em 2 minutos (mediana). O problema
 * de verdade estava fora da tela: quem fala depois do expediente espera, e há
 * conversas em aberto com o cliente falando por último há dias.
 *
 * Esta tela mede o SERVIÇO. Não promete venda: tempo de resposta não separou
 * quem compra (medido no Insights e aqui). Tudo vem de `zapintel_atendimento`,
 * e cada lista abre a de leads com o mesmo recorte.
 */

interface Resposta { loja: string | null; turnos: number; mediana: number; p75: number; ate5: number; ate30: number; mais4h: number }
interface Item { leadId: number; nome: string | null; classe: Classe; desde: string; loja: string | null; fala?: string | null; score?: number | null }
interface Atendimento {
  dias: number | null;
  horario: { inicio: string; fim: string; dias: number[] };
  horarioConfigurado: boolean;
  resposta: Resposta[];
  foraDoHorario: { turnos: number; pct: number | null; mediana: number | null; ate1h: number | null };
  semanas: { inicio: string; turnos: number; mediana: number; ate5: number; mais4h: number }[];
  cobertura: { dow: number; hora: number; turnos: number; mais4h: number }[];
  largadas: { total: number; itens: Item[] };
  retomar: { total: number; itens: Item[] };
  vendedor: { leads: number; comResponsavel: number; mensagensDaLoja: number; mensagensComUsuario: number };
}

const PERIODOS: [string, string][] = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["tudo", "Tudo"]];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS = Array.from({ length: 16 }, (_, i) => i + 7);

function minutos(m: number | null | undefined) {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function descreverHorario(h: Atendimento["horario"]) {
  const d = [...h.dias].sort();
  const seguidos = d.length > 1 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const dias = d.length === 0 ? "nenhum dia" : seguidos ? `${DIAS[d[0]].toLowerCase()} a ${DIAS[d[d.length - 1]].toLowerCase()}` : d.map((x) => DIAS[x].toLowerCase()).join(", ");
  return `${dias}, ${h.inicio} às ${h.fim}`;
}

export default function AtendimentoPage() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const { lojas, lojaAtiva, storeName } = useLeads();
  const empresa = useEmpresaZapintel();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const periodo = busca.get("periodo") ?? "30";
  const dias = periodo === "tudo" ? null : Number(periodo) || 30;
  const { dados, erro, aoVivo, carregando } = useRpcAoVivo<Atendimento>("zapintel_atendimento", {
    p_dias: dias, p_filial: lojaAtiva, p_empresa: empresa,
  }, empresa);

  const recorte = lojaAtiva == null ? `${storeName || "Sua empresa"} · toda a rede` : (lojas.find((l) => l.id === lojaAtiva)?.nome ?? "Loja");
  const quando = dias == null ? "em toda a história" : `nos últimos ${dias} dias`;
  const lista = (f: Record<string, string>) => {
    const p = new URLSearchParams(f);
    if (dias != null) p.set("dias", String(dias));
    return `/zapintel/leads?${p}`;
  };

  return (
    <div className="at">
      <style>{CSS}</style>

      <header className="at-topo">
        <div>
          <h1 className="at-titulo">Atendimento</h1>
          <p className="at-sub">
            Como a loja responde no WhatsApp e no Instagram, {quando} · {recorte}
            {carregando && dados && <span className="at-carregando"> · atualizando…</span>}
          </p>
        </div>
        <div className="at-acoes">
          <div className="at-periodo" role="group" aria-label="Período">
            {PERIODOS.map(([v, n]) => (
              <button key={v} className={periodo === v ? "ativo" : ""} aria-pressed={periodo === v}
                onClick={() => router.replace(v === "30" ? caminho : `${caminho}?periodo=${v}`, { scroll: false })}>{n}</button>
            ))}
          </div>
          <button className="at-botao" onClick={() => window.dispatchEvent(new CustomEvent("assistente:perguntar", {
            detail: `Faça o resumo do atendimento ${dias == null ? "de toda a história" : `dos últimos ${dias} dias`} ${lojaAtiva == null ? "da rede" : `da loja ${recorte}`}: como está o tempo de resposta, onde e quando a loja deixa o cliente esperando, quais conversas foram largadas e quais vale retomar primeiro. Use os dados do sistema e cite os leads com link.`,
          }))}>
            <Sparkles size={13} /> Resumo do atendimento
          </button>
          <span className="at-vivo" title={aoVivo ? "Atualiza sozinha a cada mensagem" : "Reconectando"}>
            <span className={`at-ponto ${aoVivo ? "on" : ""}`} /> {aoVivo ? "Ao vivo" : "Reconectando…"}
          </span>
        </div>
      </header>

      {erro && !dados && (
        <div className="card at-vazio"><AlertTriangle size={16} style={{ color: "var(--yellow)" }} />
          {/loja fora/i.test(erro) ? "Esta loja não está no seu acesso. Escolha \"Toda a rede\" ou a sua loja no menu." : erro}
        </div>
      )}
      {!dados && !erro && <div className="card at-osso" style={{ height: 520 }} />}

      {dados && (
        <div className={`at-grade ${carregando ? "apagada" : ""}`}>
          <TempoDeResposta d={dados} />
          <Largadas d={dados} lista={lista} agora={agora} />
          <Retomar d={dados} lista={lista} agora={agora} />
          <Cobertura d={dados} />
          <Semanas d={dados} />
          <ForaDoHorario d={dados} />
          <Vendedor d={dados} />
        </div>
      )}
    </div>
  );
}

function Cartao({ icone, titulo, sub, acao, largo, children }: {
  icone: ReactNode; titulo: string; sub?: ReactNode; acao?: ReactNode; largo?: boolean; children: ReactNode;
}) {
  return (
    <section className={`card at-cartao ${largo ? "largo" : ""}`}>
      <div className="at-cartao-topo">
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

/** Mediana, faixas e espera longa — o total e cada loja, lado a lado. */
function TempoDeResposta({ d }: { d: Atendimento }) {
  return (
    <Cartao largo icone={<Clock size={15} />} titulo="Tempo de resposta no horário da loja"
      sub={<>Quanto o cliente espera quando fala com a loja aberta ({descreverHorario(d.horario)}{!d.horarioConfigurado && " — horário padrão"}). <Link href="/admin/configuracoes?aba=horario" className="at-link">ajustar horário</Link></>}>
      {d.resposta.length === 0 ? <p className="at-vazio">Nenhuma mensagem de cliente no horário da loja neste período.</p> : (
        <div className="at-resp">
          {d.resposta.map((r) => {
            const f530 = Math.max(0, r.ate30 - r.ate5);
            const f304 = Math.max(0, 100 - r.ate30 - r.mais4h);
            return (
              <div key={r.loja ?? "todas"} className={`at-resp-linha ${r.loja == null ? "total" : ""}`}>
                <div className="at-resp-nome">
                  <b>{r.loja ?? (d.resposta.length > 2 ? "Toda a rede" : "Total")}</b>
                  <span>{num(r.turnos)} vezes que um cliente falou</span>
                </div>
                <div className="at-resp-med"><b>{minutos(r.mediana)}</b><span>espera típica</span></div>
                <div className="at-resp-barra" role="img"
                  aria-label={`${r.ate5}% em menos de 5 minutos, ${f530}% de 5 a 30 minutos, ${f304}% de 30 minutos a 4 horas, ${r.mais4h}% 4 horas ou mais`}>
                  <span style={{ width: `${r.ate5}%`, background: "var(--green)" }} />
                  <span style={{ width: `${f530}%`, background: "#86c99a" }} />
                  <span style={{ width: `${f304}%`, background: "var(--orange)" }} />
                  <span style={{ width: `${r.mais4h}%`, background: "var(--red)" }} />
                </div>
                <div className="at-resp-nums">
                  <span><b style={{ color: "var(--green)" }}>{r.ate5}%</b> em até 5 min</span>
                  <span><b>{r.ate30}%</b> em até 30 min</span>
                  <span><b style={{ color: r.mais4h >= 10 ? "var(--red)" : "var(--txt)" }}>{r.mais4h}%</b> esperaram 4 h ou mais</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="at-nota">
        Mede o serviço, não a venda: nos números da loja, quem foi respondido mais rápido não comprou mais. Responder rápido é
        respeito ao cliente; o que fecha venda está no Insights.
      </p>
    </Cartao>
  );
}

function Pessoa({ i, agora, detalhe }: { i: Item; agora: number; detalhe: ReactNode }) {
  const c = CLASSE[i.classe] ?? CLASSE.followup;
  return (
    <li>
      <Link href={`/zapintel/leads/lead-${i.leadId}`}>
        <div className="at-item-topo">
          <b>{i.nome || "Sem nome"}</b>
          <span className="at-tag" style={{ color: c.cor, borderColor: c.cor }}>{c.nome}</span>
          {i.loja && <span>{i.loja}</span>}
          <span className="at-quando">{ha(i.desde, agora)}</span>
        </div>
        {detalhe}
      </Link>
    </li>
  );
}

function Largadas({ d, lista, agora }: { d: Atendimento; lista: (f: Record<string, string>) => string; agora: number }) {
  const l = d.largadas;
  return (
    <Cartao icone={<UserX size={15} />} titulo={`Conversas largadas: ${num(l.total)}`}
      sub="Em aberto, o cliente falou por último e ninguém respondeu há 3 dias ou mais."
      acao={l.total > 0 ? <Link href={lista({ largada: "1" })} className="at-link">todas <ArrowRight size={12} /></Link> : undefined}>
      {l.itens.length === 0 ? <p className="at-vazio">Nenhuma conversa largada no período.</p> : (
        <ul className="at-itens">
          {l.itens.map((i) => (
            <Pessoa key={i.leadId} i={i} agora={agora} detalhe={i.fala ? <p>&ldquo;{i.fala}&rdquo;</p> : null} />
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function Retomar({ d, lista, agora }: { d: Atendimento; lista: (f: Record<string, string>) => string; agora: number }) {
  const r = d.retomar;
  return (
    <Cartao icone={<RotateCcw size={15} />} titulo={`Para retomar: ${num(r.total)}`}
      sub="Em aberto, a loja falou por último e o cliente sumiu há 3 dias ou mais. Primeiro as de maior score."
      acao={r.total > 0 ? <Link href={lista({ retomar: "1" })} className="at-link">todas <ArrowRight size={12} /></Link> : undefined}>
      {r.itens.length === 0 ? <p className="at-vazio">Nenhuma conversa para retomar no período.</p> : (
        <ul className="at-itens">
          {r.itens.map((i) => (
            <Pessoa key={i.leadId} i={i} agora={agora}
              detalhe={<p className="at-meta">score {i.score ?? "—"} · a loja falou por último</p>} />
          ))}
        </ul>
      )}
    </Cartao>
  );
}

/** Dia × hora: o número é quantas vezes clientes falaram; a cor, quantos esperaram 4 h+. */
function Cobertura({ d }: { d: Atendimento }) {
  const mapa = new Map(d.cobertura.map((c) => [`${c.dow}-${c.hora}`, c]));
  const aberto = (dow: number, h: number) => {
    const ini = Number(d.horario.inicio.slice(0, 2)), fim = Number(d.horario.fim.slice(0, 2));
    return d.horario.dias.includes(dow) && h >= ini && h < fim;
  };
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return (
    <Cartao largo icone={<Grid3x3 size={15} />} titulo="Quando o cliente fala e quando ele espera"
      sub="O número é quantas vezes um cliente puxou conversa naquela hora; a cor, quantos desses esperaram 4 horas ou mais. Moldura tracejada = fora do horário da loja.">
      <div className="at-mapa-caixa">
        <div className="at-mapa" style={{ gridTemplateColumns: `44px repeat(${HORAS.length}, minmax(30px, 1fr))` }}>
          <span />
          {HORAS.map((h) => <span key={h} className="at-mapa-h">{h}h</span>)}
          {ordem.map((dow) => (
            <Linha key={dow} dow={dow} mapa={mapa} aberto={aberto} />
          ))}
        </div>
      </div>
      <div className="at-legenda">
        <span><i style={{ background: "rgba(22,163,74,.18)" }} /> quase todos respondidos</span>
        <span><i style={{ background: "rgba(234,88,12,.45)" }} /> 1 em 4 esperou</span>
        <span><i style={{ background: "rgba(220,38,38,.85)" }} /> a maioria esperou 4 h+</span>
      </div>
    </Cartao>
  );
}

function Linha({ dow, mapa, aberto }: { dow: number; mapa: Map<string, Atendimento["cobertura"][number]>; aberto: (d: number, h: number) => boolean }) {
  return (
    <>
      <span className="at-mapa-d">{DIAS[dow]}</span>
      {HORAS.map((h) => {
        const c = mapa.get(`${dow}-${h}`);
        const p = c?.mais4h ?? 0;
        const fundo = !c ? "var(--card2)"
          : p >= 50 ? `rgba(220,38,38,${0.5 + p / 200})`
          : p >= 20 ? `rgba(234,88,12,${0.25 + p / 200})`
          : `rgba(22,163,74,${0.12 + (c.turnos > 30 ? 0.12 : 0)})`;
        return (
          <span key={h} className={`at-cel ${aberto(dow, h) ? "" : "fora"}`} style={{ background: fundo, color: p >= 50 ? "#fff" : "var(--txt)" }}
            title={c ? `${DIAS[dow]} ${h}h · ${c.turnos} ${c.turnos === 1 ? "vez" : "vezes"} · ${p}% esperaram 4 h+` : `${DIAS[dow]} ${h}h · ninguém`}>
            {c ? num(c.turnos) : ""}
          </span>
        );
      })}
    </>
  );
}

/** Oito semanas: a barra é a espera longa; o rótulo, a espera típica. */
function Semanas({ d }: { d: Atendimento }) {
  const max = Math.max(15, ...d.semanas.map((s) => s.mais4h));
  return (
    <Cartao icone={<TrendingUp size={15} />} titulo="Semana a semana"
      sub="Quantos esperaram 4 h ou mais no horário da loja (barra) e a espera típica (abaixo). Últimas 8 semanas.">
      {d.semanas.length === 0 ? <p className="at-vazio">Sem semanas para comparar.</p> : (
        <div className="at-semanas">
          {d.semanas.map((s, i) => {
            const atual = i === d.semanas.length - 1;
            const dt = new Date(`${s.inicio}T12:00:00`);
            return (
              <div key={s.inicio} className={`at-sem ${atual ? "atual" : ""}`} title={`${num(s.turnos)} vezes que clientes falaram`}>
                <b>{s.mais4h}%</b>
                <div className="at-sem-trilho"><span style={{ height: `${(s.mais4h / max) * 100}%`, background: s.mais4h >= 12 ? "var(--red)" : s.mais4h >= 9 ? "var(--orange)" : "var(--green)" }} /></div>
                <small>{minutos(s.mediana)}</small>
                <em>{dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{atual ? " · atual" : ""}</em>
              </div>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}

function ForaDoHorario({ d }: { d: Atendimento }) {
  const f = d.foraDoHorario;
  return (
    <Cartao icone={<MoonStar size={15} />} titulo="Com a loja fechada"
      sub={`Cliente que fala fora de ${descreverHorario(d.horario)}.`}>
      <div className="at-mini">
        <div><b>{f.pct ?? 0}%</b><span>das vezes o cliente falou com a loja fechada</span></div>
        <div><b>{minutos(f.mediana)}</b><span>espera típica até a resposta</span></div>
        <div className={f.ate1h != null && f.ate1h < 50 ? "ruim" : ""}><b>{f.ate1h ?? 0}%</b><span>respondidos em até 1 hora</span></div>
      </div>
      <p className="at-nota">
        {num(f.turnos)} vezes no período.{!d.horarioConfigurado && " Se a loja abre aos sábados, ajuste o horário — hoje o sábado conta como fechado."}
      </p>
    </Cartao>
  );
}

function Vendedor({ d }: { d: Atendimento }) {
  const v = d.vendedor;
  const pctMsg = v.mensagensDaLoja ? Math.round((v.mensagensComUsuario / v.mensagensDaLoja) * 100) : 0;
  return (
    <Cartao icone={<Users size={15} />} titulo="Por vendedor"
      sub="Para comparar vendedores, o sistema precisa saber quem atendeu cada conversa.">
      <div className="at-mini">
        <div className={v.comResponsavel < v.leads * 0.5 ? "ruim" : ""}><b>{num(v.comResponsavel)}</b><span>de {num(v.leads)} conversas têm responsável</span></div>
        <div className={pctMsg < 50 ? "ruim" : ""}><b>{pctMsg}%</b><span>das respostas saíram pelo CRM (as outras, do celular)</span></div>
      </div>
      <p className="at-nota">
        O ranking por vendedor aparece aqui quando a equipe atribuir o responsável de cada lead ou responder pelo CRM. Até lá,
        qualquer número por pessoa seria palpite.
      </p>
    </Cartao>
  );
}

const CSS = `
.at { display: flex; flex-direction: column; gap: 14px; max-width: 1280px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.at-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.at-titulo { font-size: 23px; font-weight: 800; letter-spacing: -.6px; }
.at-sub { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
.at-carregando { color: var(--purple-l); }
.at-acoes { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.at-periodo { display: inline-flex; background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 3px; }
.at-periodo button { background: none; border: none; border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer; }
.at-periodo button.ativo { background: var(--txt); color: #fff; font-weight: 700; }
.at-botao { display: inline-flex; align-items: center; gap: 6px; background: var(--purple); color: #fff; border: none; border-radius: 999px; padding: 7px 13px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.at-vivo { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--green); background: var(--card); border: 1px solid var(--brd); border-radius: 999px; padding: 6px 12px; }
.at-ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.at-ponto.on { background: var(--green); box-shadow: 0 0 0 3px rgba(22,163,74,.18); }
.at-grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; transition: opacity .15s; }
.at-grade.apagada { opacity: .55; }
.at-cartao { padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.at-cartao.largo { grid-column: 1 / -1; }
.at-cartao-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.at-cartao-topo h2 { font-size: 14.5px; font-weight: 800; display: flex; align-items: center; gap: 7px; }
.at-cartao-topo p { font-size: 12px; color: var(--dim); margin-top: 3px; line-height: 1.5; }
.at-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--purple-l); text-decoration: none; white-space: nowrap; }
.at-link:hover { text-decoration: underline; }
.at-nota { font-size: 11.5px; color: var(--muted); line-height: 1.55; }
.at-vazio { padding: 22px 0; text-align: center; color: var(--muted); font-size: 12.5px; display: flex; gap: 8px; justify-content: center; align-items: center; }
.at-resp { display: flex; flex-direction: column; gap: 6px; }
.at-resp-linha { display: grid; grid-template-columns: 190px 110px minmax(160px, 1fr) auto; gap: 14px; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--card2); border: 1px solid var(--brd2); }
.at-resp-linha.total { background: var(--card); border-color: var(--brd); }
.at-resp-nome { display: flex; flex-direction: column; }
.at-resp-nome b { font-size: 13.5px; }
.at-resp-nome span, .at-resp-med span { font-size: 11px; color: var(--muted); }
.at-resp-med { display: flex; flex-direction: column; }
.at-resp-med b { font-size: 22px; font-weight: 800; letter-spacing: -.5px; line-height: 1.1; }
.at-resp-barra { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--brd); }
.at-resp-barra span { display: block; height: 100%; }
.at-resp-nums { display: flex; gap: 14px; font-size: 11.5px; color: var(--dim); flex-wrap: wrap; }
.at-resp-nums b { font-size: 13px; }
.at-itens { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.at-itens a { display: block; background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 9px 12px; text-decoration: none; color: inherit; }
.at-itens a:hover { border-color: var(--purple); }
.at-item-topo { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 12.5px; }
.at-item-topo span { font-size: 11px; color: var(--muted); }
.at-quando { margin-left: auto; }
.at-tag { font-size: 10px !important; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 0 7px; text-transform: uppercase; letter-spacing: .3px; }
.at-itens p { font-size: 12px; color: var(--dim); line-height: 1.5; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.at-itens p.at-meta { color: var(--muted); font-size: 11px; }
.at-mapa-caixa { overflow-x: auto; }
.at-mapa { display: grid; gap: 3px; min-width: 620px; }
.at-mapa-h { font-size: 10px; color: var(--muted); text-align: center; }
.at-mapa-d { font-size: 11px; color: var(--dim); font-weight: 700; display: flex; align-items: center; }
.at-cel { height: 26px; border-radius: 4px; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.at-cel.fora { outline: 1px dashed var(--brd2); outline-offset: -2px; }
.at-legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--dim); }
.at-legenda span { display: inline-flex; align-items: center; gap: 5px; }
.at-legenda i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.at-semanas { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; align-items: end; }
.at-sem { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.at-sem b { font-size: 12px; }
.at-sem-trilho { width: 100%; max-width: 34px; height: 110px; background: var(--card2); border-radius: 6px; display: flex; align-items: flex-end; overflow: hidden; }
.at-sem-trilho span { display: block; width: 100%; border-radius: 6px 6px 0 0; }
.at-sem small { font-size: 10.5px; color: var(--dim); white-space: nowrap; }
.at-sem em { font-size: 10px; color: var(--muted); font-style: normal; white-space: nowrap; }
.at-sem.atual em { color: var(--purple-l); font-weight: 700; }
.at-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.at-mini > div { display: flex; flex-direction: column; gap: 2px; background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 10px 12px; }
.at-mini b { font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
.at-mini span { font-size: 11px; color: var(--dim); line-height: 1.4; }
.at-mini .ruim b { color: var(--red); }
.at-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: at-osso 1.2s linear infinite; }
@keyframes at-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.at button:focus-visible, .at a:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
@media (max-width: 960px) {
  .at-grade { grid-template-columns: minmax(0, 1fr); }
  .at-resp-linha { grid-template-columns: 1fr auto; }
  .at-resp-barra, .at-resp-nums { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .at-titulo { font-size: 20px; }
  .at-sem small { display: none; }
}
@media (prefers-reduced-motion: reduce) { .at-osso { animation: none; } .at-grade { transition: none; } }
`;
