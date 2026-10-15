"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, RefreshCw, Sparkles, AlertTriangle, ExternalLink, MessageSquareText, Clock, Bot } from "lucide-react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "../../providers";
import { createClient } from "@/lib/supabase/client";
import { ouvirZapintel } from "@/hooks/zapintel/canalZapintel";
import { CLASSE, corDoTexto, URG, num } from "@/components/zapintel/rotulos";
import type { Classe, Urgencia } from "@/hooks/zapintel/useDashboardAoVivo";
import type { Lead } from "@/types/zapintel";
import type { Ficha } from "@/lib/zapintel/ficha";
import type { Travou } from "@/lib/zapintel/travou";
import type { PerfilIA } from "@/lib/zapintel/perfil";

/**
 * A FICHA DO LEAD — REESCRITA DO ZERO EM 15/10/2026.
 *
 * A anterior era o arquivo de agosto, reformado em camadas: 1.145 linhas com o
 * motor de palavras como "plano B" (classificação, score, sinais e objeções
 * por palavra-chave, "LEITURA AUTOMÁTICA"), o histórico inteiro da conversa
 * (130, 400 mensagens baixadas a cada abertura), abas de "perfil unificado" de
 * uma importação que não existe mais e o botão "Responder no WhatsApp".
 *
 * Pedido do Lucas: *"Ficha entra limpa dentro do modelo mas sem dados
 * analisados por ia até que a mesma seja efetuada"* e *"com a analise feita
 * pela ia ja é o suficiente, se eu quiser ver a conversa ... um botao para
 * abrir direto o chat do lead em outra aba"*.
 *
 * Então: o que a conversa MEDE aparece sempre (mensagens, dias, quem falou por
 * último, onde travou). O que se AFIRMA sobre o lead — classe, score, sinais,
 * objeções, próxima ação — só existe se a análise de IA existir; sem ela, a
 * ficha diz isso e oferece gerar. A conversa abre no CRM, em outra aba.
 *
 * Dados: `/zapintel/api/conversa` (calculado na hora) e, ao vivo, recarrega
 * sozinha só quando chega mensagem DESTE lead (`canalZapintel.ts`).
 */

type TravouComTrecho = Travou & { trecho: { texto: string; data: string; hora: string; transcrito: boolean } | null };
interface Guardado { perfil: PerfilIA; atual: boolean; geradoEm: string; mensagensNaFicha?: number }

export default function FichaDoLead() {
  const { id } = useParams();
  const router = useRouter();
  const { lojas, storeName, sellerName } = useLeads();
  const empresa = useEmpresaZapintel();
  const leadNum = Number(String(id ?? "").replace(/^lead-/, "")) || null;

  const [lead, setLead] = useState<Lead | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [travou, setTravou] = useState<TravouComTrecho | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [iaLigada, setIaLigada] = useState(true);
  const [falhou, setFalhou] = useState(false);

  const [analisando, setAnalisando] = useState(false);
  const [erroIA, setErroIA] = useState("");
  const [sugestao, setSugestao] = useState("");
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState("");

  const carregar = useCallback((vivo: () => boolean) => {
    if (!leadNum) return;
    fetch(`/zapintel/api/conversa?lead=${leadNum}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo()) return;
        if (!d?.lead) { setFalhou(true); return; }
        setLead(d.lead as Lead);
        setFicha((d.ficha as Ficha) ?? null);
        setTravou((d.travou as TravouComTrecho) ?? null);
        setGuardado((d.perfil as Guardado) ?? null);
        setIaLigada(d.iaDisponivel !== false);
      })
      .catch(() => { if (vivo()) setFalhou(true); });
  }, [leadNum]);

  useEffect(() => {
    let vivo = true;
    carregar(() => vivo);
    return () => { vivo = false; };
  }, [carregar]);

  // Ao vivo: só quando o aviso do banco traz ESTE lead (mensagem nova ou
  // análise refeita). A loja recebe ~240 mensagens por hora; recarregar a cada
  // uma seria uma chamada à Vercel por mensagem.
  const [supabase] = useState(() => createClient());
  useEffect(() => {
    if (!empresa || !leadNum) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const sair = ouvirZapintel(supabase, empresa, {
      evento: (e) => {
        const p = (e.payload ?? {}) as { leads?: number[]; lead?: number };
        const meu = e.event === "mensagens" ? (p.leads ?? []).includes(leadNum) : e.event === "analises" && p.lead === leadNum;
        if (!meu) return;
        if (espera) clearTimeout(espera);
        espera = setTimeout(() => carregar(() => vivo), 2500);
      },
      status: () => {},
    });
    return () => { vivo = false; if (espera) clearTimeout(espera); sair(); };
  }, [supabase, empresa, leadNum, carregar]);

  /** A IA só escreve quando alguém pede — aqui ou no robô (regra de 14/10). */
  async function analisar(forcar: boolean) {
    if (!leadNum || analisando) return;
    setAnalisando(true); setErroIA("");
    try {
      const r = await fetch("/zapintel/api/perfil", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: leadNum, forcar }),
      });
      const d = await r.json();
      if (!r.ok) setErroIA(d?.erro || "Não consegui analisar agora.");
      else if (d?.perfil) {
        setGuardado({ perfil: d.perfil as PerfilIA, atual: true, geradoEm: String(d.geradoEm || new Date().toISOString()), mensagensNaFicha: lead?.totalMessages });
        window.dispatchEvent(new CustomEvent("zapintel:analise-feita", { detail: leadNum }));
      }
    } catch { setErroIA("Não consegui analisar agora."); }
    setAnalisando(false);
  }

  async function sugerir() {
    if (!leadNum || sugerindo) return;
    setSugerindo(true); setErroSugestao(""); setSugestao("");
    try {
      const r = await fetch("/zapintel/api/sugestao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: leadNum }),
      });
      const d = await r.json();
      if (!r.ok) setErroSugestao(d?.erro || "Não consegui escrever agora.");
      else setSugestao(String(d?.mensagem || ""));
    } catch { setErroSugestao("Não consegui escrever agora."); }
    setSugerindo(false);
  }

  const abrirNoCRM = leadNum ? `/leads?lead=${leadNum}` : null;

  if (!lead) {
    return (
      <div className="fc">
        <style>{CSS}</style>
        <button className="fc-voltar" onClick={() => router.back()}><ArrowLeft size={14} /> Voltar</button>
        {falhou || !leadNum
          ? <div className="card fc-vazio">Lead não encontrado — ou ele não tem conversa.</div>
          : <div className="card fc-osso" style={{ height: 420 }} />}
      </div>
    );
  }

  const ia = guardado?.perfil ?? null;
  const novas = ia && guardado ? Math.max(0, lead.totalMessages - (guardado.mensagensNaFicha ?? lead.totalMessages)) : 0;
  const loja = lojas.find((l) => l.id === lead.crm?.filialId)?.nome ?? null;
  const classe = ia ? (CLASSE[ia.classificacao as Classe] ?? null) : null;
  const urg = ia ? (URG[ia.urgencia as Urgencia] ?? URG.low) : null;
  const mostrarTravou = !!travou && ia?.classificacao !== "customer";
  const quemDaLoja = lead.sellerName || storeName || sellerName;

  return (
    <div className="fc">
      <style>{CSS}</style>

      <div className="fc-barra">
        <button className="fc-voltar" onClick={() => router.back()}><ArrowLeft size={14} /> Voltar</button>
        {abrirNoCRM && (
          <a className="fc-botao leve" href={abrirNoCRM} target="_blank" rel="noopener noreferrer">
            <MessageSquareText size={14} /> Abrir conversa no CRM <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* ── Quem é ─────────────────────────────────────────────────────── */}
      <section className="card fc-topo">
        <div className="fc-quem">
          <h1>{lead.contact}</h1>
          <div className="fc-meta">
            <span className={`fc-canal ${lead._channel === "instagram" ? "ig" : "wa"}`}>{lead._channel === "instagram" ? "Instagram" : "WhatsApp"}</span>
            {lead.phone && <span>{lead.phone}</span>}
            {loja && <span>{loja}</span>}
            {lead.sellerName && <span>responsável: {lead.sellerName}</span>}
          </div>
          {ia && classe && urg && (
            <div className="fc-selos">
              <span className="fc-tag" style={{ color: corDoTexto(classe), borderColor: classe.cor }}>{classe.nome}</span>
              <span className="fc-urg" style={{ color: urg.cor }}><span style={{ background: urg.cor }} /> urgência {urg.nome.toLowerCase()}</span>
              {ia.perfil && <span className="fc-perfil">{ia.perfil}</span>}
            </div>
          )}
        </div>
        {ia && (
          <div className="fc-score" title="Score da análise de IA">
            <b style={{ color: ia.score >= 70 ? "var(--green)" : ia.score >= 40 ? "var(--orange)" : "var(--dim)" }}>{ia.score}</b>
            <span>score</span>
          </div>
        )}
      </section>

      {/* ── O que a conversa mede (sempre) ─────────────────────────────── */}
      <div className="fc-fatos">
        <Fato rotulo="Última mensagem" valor={lead.daysInactive === 0 ? "hoje" : `há ${lead.daysInactive} ${lead.daysInactive === 1 ? "dia" : "dias"}`}
          cor={lead.daysInactive <= 2 ? "var(--green)" : lead.daysInactive <= 7 ? "var(--orange)" : "var(--red)"} />
        <Fato rotulo="Mensagens" valor={num(lead.totalMessages)} sub={ficha ? `${num(ficha.mensagensLead)} dele · ${num(ficha.mensagensLoja)} da loja` : undefined} />
        <Fato rotulo="Duração" valor={lead.conversationDays <= 1 ? "1 dia" : `${lead.conversationDays} dias`} />
        {ficha?.respostaMedianaMin != null && (
          <Fato rotulo="A loja responde em" valor={ficha.respostaMedianaMin < 60 ? `${ficha.respostaMedianaMin} min` : `${Math.round(ficha.respostaMedianaMin / 60)} h`}
            cor={ficha.respostaMedianaMin > 60 ? "var(--orange)" : undefined} />
        )}
        {ia && <Fato rotulo="Risco de perda" valor={`${ia.riscoPerda}%`} cor={ia.riscoPerda > 60 ? "var(--red)" : ia.riscoPerda > 30 ? "var(--orange)" : "var(--green)"} />}
      </div>

      {/* ── A análise de IA ────────────────────────────────────────────── */}
      <section className={`card fc-analise ${ia ? "" : "vazia"}`}>
        <div className="fc-cab">
          <h2><Sparkles size={14} /> Análise de IA</h2>
          {analisando && <span className="fc-andando"><RefreshCw size={12} style={{ animation: "zi-spin 1s linear infinite" }} /> lendo a conversa…</span>}
        </div>
        {ia ? (
          <>
            <p className="fc-diag">{ia.diagnostico}</p>
            {!guardado?.atual && !analisando && (
              <div className="fc-aviso">
                <span><b>Nova análise disponível</b> · {novas > 0 ? `${novas} ${novas === 1 ? "mensagem nova" : "mensagens novas"} desde esta análise` : "a conversa mudou desde esta análise"}</span>
                {iaLigada && <button className="fc-botao" onClick={() => analisar(false)}><Bot size={13} /> Gerar nova análise</button>}
              </div>
            )}
            <div className="fc-rodape">
              <span>Análise de {new Date(guardado!.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</span>
              {iaLigada && guardado?.atual && (
                <button className="fc-link" onClick={() => analisar(true)} disabled={analisando}><RefreshCw size={11} /> Refazer análise</button>
              )}
            </div>
          </>
        ) : lead.leadMessages === 0 ? (
          <div className="fc-sem">
            <p>Sem resposta do cliente: só a loja escreveu até agora ({lead.storeMessages} {lead.storeMessages === 1 ? "mensagem" : "mensagens"}). A análise fica disponível quando o cliente responder.</p>
          </div>
        ) : (
          <div className="fc-sem">
            <p>Este lead ainda não tem análise de IA. Ela lê a conversa inteira — inclusive os áudios transcritos — e escreve o diagnóstico, os sinais, as objeções e a próxima ação, com a frase do cliente como prova.</p>
            {iaLigada
              ? <button className="fc-botao" onClick={() => analisar(false)} disabled={analisando}><Bot size={13} /> {analisando ? "Analisando…" : "Gerar análise"}</button>
              : <span className="fc-mudo">A IA do CRM está desligada.</span>}
          </div>
        )}
        {erroIA && <p className="fc-erro"><AlertTriangle size={12} /> {erroIA}</p>}
      </section>

      {ia && (
        <>
          {/* ── O que fazer ─────────────────────────────────────────────── */}
          <section className="card fc-acao" style={{ borderLeftColor: urg?.cor }}>
            <div className="fc-cab"><h2>Próxima ação</h2>{urg && <span className="fc-urg" style={{ color: urg.cor }}><span style={{ background: urg.cor }} /> {urg.nome}</span>}</div>
            <p className="fc-acao-texto">{ia.proximaAcao}</p>
            {ia.proximaAcaoPorque && <p className="fc-porque">Por quê: {ia.proximaAcaoPorque}</p>}
            {ia.mensagemSugerida && <Rascunho rotulo="Rascunho para mandar agora" texto={ia.mensagemSugerida} />}
          </section>

          {(ia.sinais.length > 0 || ia.objecoes.length > 0) && (
            <section className="card fc-duplo">
              {ia.sinais.length > 0 && (
                <div>
                  <h3>Sinais de compra</h3>
                  <ul className="fc-evid">
                    {ia.sinais.map((s, i) => (
                      <li key={i}><span className="fc-chip ok">✓ {s.rotulo}</span>{s.evidencia && <q>{s.evidencia}</q>}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ia.objecoes.length > 0 && (
                <div>
                  <h3>Objeções</h3>
                  <ul className="fc-evid">
                    {ia.objecoes.map((o, i) => (
                      <li key={i}>
                        <span className="fc-chip alerta">⚠ {o.rotulo}</span>{o.evidencia && <q>{o.evidencia}</q>}
                        {o.desfecho && <span className="fc-desfecho">→ {o.desfecho}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {ia.pontasSoltas.length > 0 && (
            <section className="card">
              <h3 className="fc-h3">Ficou em aberto</h3>
              <ul className="fc-pontas">
                {ia.pontasSoltas.map((p, i) => <li key={i} className={p.startsWith("⚠") ? "grave" : ""}>{p.replace(/^⚠\s*/, "")}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ── O que aconteceu ───────────────────────────────────────────── */}
      {ficha && (
        <section className="card fc-relato">
          <div className="fc-cab">
            <h2>O que aconteceu</h2>
            <span className="fc-mudo">{ia?.relato ? "escrito pela análise" : "fatos da conversa"} · conversa até {new Date(`${ficha.ultimaEm}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
          </div>
          {(ia?.relato || ficha.relato) && (
            <div className="fc-texto">{(ia?.relato || ficha.relato).split(/\n{2,}/).map((p, i) => <p key={i}>{p.trim()}</p>)}</div>
          )}
          <div className="fc-momentos">
            {ficha.primeiraFalaDoCliente && <Momento rotulo="Ele abriu com" texto={ficha.primeiraFalaDoCliente} cor="var(--blue)" />}
            {ficha.ultimaOferta && <Momento rotulo="A loja ofereceu" texto={ficha.ultimaOferta} cor="var(--orange)" />}
            {ficha.fraseAntesDoSilencio && <Momento rotulo="Última coisa dita" texto={ficha.fraseAntesDoSilencio} cor="var(--purple-l)" />}
            {ficha.aguardandoLoja && <Momento rotulo="Parou em" texto="a última fala foi dele — a loja deve resposta" cor="var(--red)" />}
          </div>
          <div className="fc-numeros">
            <span><b>{ficha.trocasDeTurno}</b> trocas de turno</span>
            <span><b className={ficha.perguntasDaLoja === 0 ? "ruim" : ""}>{ficha.perguntasDaLoja}</b> perguntas da loja</span>
            {ficha.monologoLoja >= 3 && <span>maior sequência da loja sem resposta: <b className="ruim">{ficha.monologoLoja}</b></span>}
            {ficha.tentativasDeRetomada > 0 && <span><b>{ficha.tentativasDeRetomada}</b> tentativas de retomada</span>}
          </div>
        </section>
      )}

      {/* ── Onde travou (fato) + a mensagem que retoma (sugestão) ─────── */}
      {mostrarTravou && travou && (
        <section className="card fc-travou">
          <div className="fc-cab"><h2><Clock size={14} /> Onde a conversa parou</h2><span className="fc-mudo">{travou.detalhe}</span></div>
          <p className="fc-travou-rotulo">{travou.rotulo}</p>
          {travou.trecho && (
            <blockquote>
              <span>{travou.daLoja ? quemDaLoja : lead.contact} · {travou.trecho.data.split("-").reverse().join("/")} {travou.trecho.hora}{travou.trecho.transcrito ? " · áudio transcrito" : ""}</span>
              {travou.trecho.texto}
            </blockquote>
          )}
          <div className="fc-botoes">
            <button className="fc-botao" onClick={sugerir} disabled={sugerindo}>{sugerindo ? "Escrevendo…" : sugestao ? "Sugerir outra" : "Sugerir a mensagem"}</button>
            {abrirNoCRM && <a className="fc-botao leve" href={abrirNoCRM} target="_blank" rel="noopener noreferrer">Ver na conversa <ExternalLink size={12} /></a>}
          </div>
          {erroSugestao && <p className="fc-erro"><AlertTriangle size={12} /> {erroSugestao}</p>}
          {sugestao && <Rascunho rotulo="Rascunho da IA · leia antes de enviar" texto={sugestao} nota="A IA não sabe o preço de hoje nem o que está em estoque. Confira qualquer número antes de mandar." />}
        </section>
      )}
    </div>
  );
}

function Fato({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="fc-fato">
      <span>{rotulo}</span>
      <b style={cor ? { color: cor } : undefined}>{valor}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Momento({ rotulo, texto, cor }: { rotulo: string; texto: string; cor: string }) {
  return (
    <div className="fc-momento" style={{ borderLeftColor: cor }}>
      <span style={{ color: cor }}>{rotulo}</span>
      <p>{texto}</p>
    </div>
  );
}

function Rascunho({ rotulo, texto, nota }: { rotulo: string; texto: string; nota?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="fc-rascunho">
      <div className="fc-cab">
        <span className="fc-rotulo">{rotulo}</span>
        <button className="fc-link" onClick={async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão de área de transferência */ } }}>
          {copiado ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
        </button>
      </div>
      <p>{texto}</p>
      {nota && <small>{nota}</small>}
    </div>
  );
}

const CSS = `
.fc { display: flex; flex-direction: column; gap: 12px; max-width: 880px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.fc-barra { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.fc-voltar { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; color: var(--dim); font: inherit; font-size: 13px; cursor: pointer; padding: 0; }
.fc-botao { display: inline-flex; align-items: center; gap: 6px; background: var(--purple); color: #fff; border: none; border-radius: 9px; padding: 7px 13px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; text-decoration: none; }
.fc-botao:disabled { opacity: .55; cursor: default; }
.fc-botao.leve { background: var(--card); color: var(--txt); border: 1px solid var(--brd); }
.fc-botao.leve:hover { border-color: var(--purple); }
.fc-link { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--purple-l); font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 0; }
.fc-topo { padding: 20px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.fc-quem { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.fc-quem h1 { font-size: 22px; font-weight: 800; letter-spacing: -.5px; overflow-wrap: anywhere; }
.fc-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--muted); }
.fc-canal { font-weight: 700; }
.fc-canal.wa { color: #16a34a; }
.fc-canal.ig { color: #db2777; }
.fc-selos { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; }
.fc-tag { font-size: 10.5px; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 1px 9px; text-transform: uppercase; letter-spacing: .4px; }
.fc-urg { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; }
.fc-urg span { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.fc-perfil { font-size: 12px; color: var(--txt); background: var(--card2); border: 1px solid var(--brd2); border-radius: 999px; padding: 1px 9px; }
.fc-score { display: flex; flex-direction: column; align-items: center; flex: none; }
.fc-score b { font-size: 34px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.fc-score span { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
.fc-fatos { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.fc-fato { background: var(--card); border: 1px solid var(--brd); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.fc-fato span { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); }
.fc-fato b { font-size: 17px; font-weight: 800; color: var(--txt); }
.fc-fato small { font-size: 11px; color: var(--muted); }
.card.fc-analise, .card.fc-acao, .card.fc-duplo, .card.fc-relato, .card.fc-travou, section.card { padding: 16px 18px; }
.fc-cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.fc-cab h2 { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
.fc-h3, .fc-duplo h3 { font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.fc-andando { font-size: 11.5px; color: var(--purple-l); display: inline-flex; align-items: center; gap: 5px; }
.fc-diag { font-size: 14px; line-height: 1.65; color: var(--txt); }
.fc-aviso { margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; background: rgba(124,92,252,.07); border: 1px solid rgba(124,92,252,.28); border-radius: 10px; padding: 8px 11px; font-size: 12px; color: var(--txt); }
.fc-rodape { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--muted); }
.fc-analise.vazia { border-style: dashed; }
.fc-sem { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.fc-sem p { font-size: 13px; color: var(--dim); line-height: 1.6; }
.fc-mudo { font-size: 11px; color: var(--muted); }
.fc-erro { font-size: 12px; color: var(--orange); margin-top: 8px; display: flex; gap: 6px; align-items: center; }
.fc-acao { border-left: 3px solid var(--purple); }
.fc-acao-texto { font-size: 14px; font-weight: 600; color: var(--txt); line-height: 1.55; }
.fc-porque { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.fc-rascunho { margin-top: 12px; background: var(--card2); border: 1px solid var(--brd2); border-radius: 10px; padding: 10px 12px; }
.fc-rascunho .fc-cab { margin-bottom: 4px; }
.fc-rotulo { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--purple-l); }
.fc-rascunho p { font-size: 13px; color: var(--txt); line-height: 1.6; white-space: pre-wrap; }
.fc-rascunho small { display: block; font-size: 11px; color: var(--muted); margin-top: 8px; }
.fc-duplo { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.fc-evid { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.fc-evid li { display: flex; flex-direction: column; gap: 3px; }
.fc-chip { align-self: flex-start; font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 2px 9px; }
.fc-chip.ok { color: var(--green); background: rgba(22,163,74,.08); border: 1px solid rgba(22,163,74,.3); }
.fc-chip.alerta { color: #b45309; background: rgba(234,179,8,.1); border: 1px solid rgba(234,179,8,.35); }
.fc-evid q { font-size: 12px; color: var(--dim); font-style: italic; line-height: 1.45; }
.fc-desfecho { font-size: 11.5px; color: var(--muted); }
.fc-pontas { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.fc-pontas li { font-size: 12.5px; color: var(--txt); line-height: 1.5; background: var(--card2); border: 1px solid var(--brd2); border-radius: 9px; padding: 7px 10px; }
.fc-pontas li.grave { background: rgba(234,88,12,.06); border-color: rgba(234,88,12,.3); }
.fc-texto p { font-size: 14px; line-height: 1.7; color: var(--txt); margin-bottom: 10px; }
.fc-momentos { display: flex; flex-direction: column; gap: 7px; margin: 4px 0 10px; }
.fc-momento { border-left: 2px solid; padding-left: 10px; }
.fc-momento span { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
.fc-momento p { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
.fc-numeros { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11.5px; color: var(--muted); }
.fc-numeros b { color: var(--txt); }
.fc-numeros b.ruim { color: var(--orange); }
.fc-travou { border-left: 3px solid var(--orange); }
.fc-travou-rotulo { font-size: 14px; font-weight: 700; color: var(--txt); margin-bottom: 8px; }
.fc-travou blockquote { background: var(--card2); border: 1px solid var(--brd2); border-radius: 9px; padding: 9px 12px; font-size: 13px; color: var(--dim); line-height: 1.55; white-space: pre-wrap; margin-bottom: 10px; }
.fc-travou blockquote span { display: block; font-size: 10.5px; font-weight: 700; color: var(--muted); margin-bottom: 3px; }
.fc-botoes { display: flex; gap: 8px; flex-wrap: wrap; }
.fc-vazio { padding: 40px 0; text-align: center; color: var(--muted); font-size: 13px; }
.fc-osso { background: linear-gradient(90deg, var(--card2), #eceef2, var(--card2)); background-size: 200% 100%; animation: fc-osso 1.2s linear infinite; }
@keyframes fc-osso { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.fc button:focus-visible, .fc a:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
@media (max-width: 560px) { .fc-topo { flex-direction: column; } .fc-score { flex-direction: row; gap: 6px; align-items: baseline; } .fc-quem h1 { font-size: 19px; } }
@media (prefers-reduced-motion: reduce) { .fc-osso { animation: none; } }
`;
