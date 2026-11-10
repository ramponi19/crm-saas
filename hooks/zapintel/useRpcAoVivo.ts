"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ouvirZapintel } from "./canalZapintel";
import { INTERVALO_MINIMO, avisoRefaz, decidirDisparo, esperaComSorteio, esperaDaVolta, esperaDoAviso, sorteioEntre } from "./ritmo";
import { registrarTempoEsgotado } from "@/lib/zapintel/tempo-esgotado";

/**
 * UMA CONSULTA AO BANCO QUE SE ATUALIZA SOZINHA — SEM PULSO E SEM VERCEL.
 *
 * O dashboard e a lista de leads do ZapIntel usam isto. Dois caminhos, os dois
 * direto do navegador ao Supabase:
 *
 *   1. os DADOS — uma função do banco (`rpc`), com a sessão de quem olha. O
 *      banco decide empresa e lojas (`zapintel_escopo`);
 *   2. o AVISO — o canal privado `zapintel:<empresa>`, que o próprio banco
 *      alimenta a cada lote de mensagens, ficha refeita ou venda registrada
 *      (`supabase/funcoes/zapintel_ao_vivo.sql`). Um canal só por empresa,
 *      dividido entre todas as consultas da tela (`canalZapintel.ts`).
 *
 * ══ O RITMO ═════════════════════════════════════════════════════════════════
 *
 * Aviso não reconsulta na hora: espera `RESPIRO` sem aviso novo — uma rajada
 * de 12 mensagens vira UMA consulta. E nunca consulta mais de uma vez a cada
 * `INTERVALO_MINIMO`: medido em 14/10/2026, a loja recebe ~240 mensagens por
 * hora, e sem esse teto cada tela aberta pediria os dados quase a cada aviso.
 * Com a aba escondida não consulta nada; reconsulta quando a aba volta.
 * Testado em 14/10: 100 s com mensagens chegando = 4 consultas, 0 à Vercel.
 *
 * ══ PARÂMETROS NOVOS (filtro, página) ═══════════════════════════════════════
 *
 * Consultam na hora, sem teto — foi a pessoa que pediu. Enquanto a resposta
 * não chega, `carregando` fica verdadeiro e os dados velhos continuam na tela.
 *
 * ══ OPÇÕES POR CONSULTA (21/10/2026) ════════════════════════════════════════
 *
 * `eventos`: a quais avisos esta consulta reage (padrão: todos). O resumo do
 * menu só muda com mensagem — ficha refeita e venda registrada o recalculavam à
 * toa. `intervaloMinimo`: o teto de ritmo desta consulta (padrão 20 s).
 *
 * Aba que volta do segundo plano também respeita o teto: antes reconsultava na
 * hora, e quem alternava de aba fazia uma consulta por volta.
 */
export interface OpcoesAoVivo {
  /** Avisos que disparam nova consulta ("mensagens", "analises", "vendas"). Ausente = todos. */
  eventos?: string[];
  /** Mínimo entre duas consultas desta aba, em ms. Ausente = 20 s. */
  intervaloMinimo?: number;
  /**
   * Sorteio [mín, máx] em ms SOMADO ao que faltar do teto, no lugar do respiro
   * fixo de 2,5 s — as abas deixam de disparar juntas (ver `ritmo.ts`). Com ele,
   * a carga inicial conta para o teto e o disparo confere se uma consulta mais
   * nova que o aviso já começou (`decidirDisparo`).
   */
  sorteio?: [number, number];
  /** Nunca consulta com a aba escondida — nem na carga inicial (espera ficar visível). */
  soVisivel?: boolean;
  /**
   * As abas do mesmo navegador (a mesma pessoa: a sessão é um cookie só)
   * partilham a consulta por BroadcastChannel: quem começa avisa as irmãs, e o
   * resultado chega a todas. Só serve dados dos MESMOS parâmetros (loja, filtro).
   */
  partilhar?: boolean;
}

/** O que as abas trocam pelo BroadcastChannel. */
type MsgAbas = { tipo: "inicio"; chave: string; em: number } | { tipo: "dados"; chave: string; em: number; dados: unknown };

export function useRpcAoVivo<T>(rpc: string, params: Record<string, unknown>, empresa: number | null, opcoes: OpcoesAoVivo = {}) {
  const intervalo = opcoes.intervaloMinimo ?? INTERVALO_MINIMO;
  const eventosAceitos = opcoes.eventos?.join(",") ?? null;
  const sorteioMin = opcoes.sorteio?.[0] ?? null;
  const sorteioMax = opcoes.sorteio?.[1] ?? null;
  const soVisivel = !!opcoes.soVisivel;
  const partilhar = !!opcoes.partilhar;
  const chave = JSON.stringify(params);
  const [dados, setDados] = useState<T | null>(null);
  const [chaveDosDados, setChaveDosDados] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState(false);
  /** Quando chegou o último aviso do banco — a tela pisca o ponto verde. */
  const [ultimoAviso, setUltimoAviso] = useState<number | null>(null);
  /** Última mensagem que o AVISO anunciou (sem esperar a consulta). */
  const [mensagemAvisada, setMensagemAvisada] = useState<number | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  // Sobe a cada "Tentar de novo" da tela: refaz a busca inicial com as mesmas regras.
  const [tentativa, setTentativa] = useState(0);
  const [supabase] = useState(() => createClient());
  const atrasado = useRef(false);
  /** Quando a última consulta começou — o teto de ritmo conta a partir daqui. */
  const ultimaConsulta = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Os parâmetros que a tela pede AGORA — resposta de outros é descartada. */
  const chaveAtual = useRef(chave);
  useEffect(() => { chaveAtual.current = chave; }, [chave]);
  /** Já esteve conectado: uma queda depois disso pode ter perdido avisos. */
  const conectou = useRef(false);
  /** Quando chegou o último aviso que ESTA consulta aceita (a trava com sorteio decide por ele). */
  const avisoAceitoEm = useRef(0);
  /** De que parâmetros são os dados na tela (para a volta do segundo plano não repetir a consulta). */
  const chaveDosDadosRef = useRef<string | null>(null);
  useEffect(() => { chaveDosDadosRef.current = chaveDosDados; }, [chaveDosDados]);
  /** O canal entre as abas do mesmo navegador (`partilhar`). */
  const abas = useRef<BroadcastChannel | null>(null);
  const avisarAbas = useCallback((msg: MsgAbas) => {
    try { abas.current?.postMessage(msg); } catch { /* aba fechando: sem problema */ }
  }, []);

  // A empresa vem do servidor (contexto) ou, na falta dele, da própria resposta do banco.
  const empresaDoCanal = empresa ?? (dados as { empresa?: number } | null)?.empresa ?? null;

  // Antes da carga inicial, para o "inicio" dela já sair pelo canal.
  // `partilhar`: as abas do mesmo navegador conversam. "inicio" de uma irmã conta
  // como consulta desta aba (o teto e o `decidirDisparo` olham para ele); "dados"
  // dos mesmos parâmetros entram na tela sem ir ao banco.
  useEffect(() => {
    if (!partilhar || !empresaDoCanal || typeof BroadcastChannel === "undefined") return;
    const canal = new BroadcastChannel(`zapintel:${rpc}:${empresaDoCanal}`);
    abas.current = canal;
    canal.onmessage = (e: MessageEvent<MsgAbas>) => {
      const m = e.data;
      if (!m || m.chave !== chaveAtual.current) return;
      ultimaConsulta.current = Math.max(ultimaConsulta.current, m.em);
      if (m.tipo === "dados") {
        setErro(null);
        setDados(m.dados as T);
        setChaveDosDados(m.chave);
        // A irmã consultou depois do último aviso: não há o que buscar na volta.
        if (m.em >= avisoAceitoEm.current) atrasado.current = false;
      }
    };
    return () => { canal.close(); if (abas.current === canal) abas.current = null; };
  }, [partilhar, rpc, empresaDoCanal]);

  const buscar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) { atrasado.current = true; return; }
    atrasado.current = false;
    ultimaConsulta.current = Date.now();
    avisarAbas({ tipo: "inicio", chave, em: ultimaConsulta.current });
    setAtualizando(true);
    const inicio = Date.now();
    const { data, error } = await supabase.rpc(rpc as never, JSON.parse(chave) as never);
    setAtualizando(false);
    // Tempo esgotado vira evento (lib/zapintel/tempo-esgotado.ts): o banco não registra as canceladas.
    void registrarTempoEsgotado(supabase, error, { funcao: rpc, empresa, inicio, params: JSON.parse(chave) });
    // Um aviso disparou esta consulta na página 1; a pessoa foi para a página 2
    // e a 2 respondeu antes. Sem esta linha, a página 1 chegava por último e
    // tomava a tela (esmaecida, como "carregando", até o próximo aviso).
    if (chave !== chaveAtual.current) return;
    if (error) { setErro(error.message); return; }
    setErro(null);
    setDados(data as T);
    setChaveDosDados(chave);
    avisarAbas({ tipo: "dados", chave, em: inicio, dados: data });
  }, [supabase, rpc, chave, empresa, avisarAbas]);

  // Busca ao abrir e a cada parâmetro novo. Se falhar, tenta mais duas vezes
  // antes de mostrar erro: em 14/10/2026 a primeira consulta do dia estourou o
  // tempo do banco (cache frio) e a segunda saiu em meio segundo.
  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const tentar = (n: number) => {
      const inicio = Date.now();
      // Com a trava (sorteio), a carga inicial conta para o teto e avisa as irmãs.
      if (sorteioMin !== null) { ultimaConsulta.current = inicio; avisarAbas({ tipo: "inicio", chave, em: inicio }); }
      supabase.rpc(rpc as never, JSON.parse(chave) as never).then(({ data, error }) => {
        void registrarTempoEsgotado(supabase, error, { funcao: rpc, empresa, inicio, params: JSON.parse(chave), tentativa: n });
        if (!vivo) return;
        if (!error) { setErro(null); setDados(data as T); setChaveDosDados(chave); avisarAbas({ tipo: "dados", chave, em: inicio, dados: data }); return; }
        // Permissão negada não melhora tentando de novo. Tempo esgotado (57014)
        // tenta UMA vez, e só depois de 5 s: em 15/10/2026, com várias telas
        // abertas, cada consulta cortada aos 8 s era repetida mais duas vezes —
        // 8 s de CPU a mais por tentativa, justo quando o banco já estava
        // sobrecarregado (40 cortes em 4 minutos nos logs). O caso que a
        // repetição resolve (cache frio na 1ª consulta do dia) sai na segunda.
        const limite = error.code === "57014" ? 1 : 2;
        const atraso = error.code === "57014" ? 5000 : 1500 * (n + 1);
        if (n < limite && error.code !== "42501") { espera = setTimeout(() => tentar(n + 1), atraso); return; }
        // Desistiu dos parâmetros NOVOS (outra loja, outro filtro): os dados na
        // tela são dos antigos. Mantê-los mostrava os números da loja anterior
        // com o nome da loja nova, e as telas só exibem o erro sem dados.
        setDados(null);
        setChaveDosDados(null);
        setErro(error.message);
      });
    };
    // `soVisivel`: aba aberta em segundo plano não consulta nem para carregar —
    // espera ficar visível. Se uma aba irmã entregou estes dados nesse meio-tempo
    // (`partilhar`) e eles ainda estão dentro do teto, nem consulta.
    let aoVoltar: (() => void) | null = null;
    if (soVisivel && typeof document !== "undefined" && document.hidden) {
      aoVoltar = () => {
        if (document.hidden || !vivo) return;
        document.removeEventListener("visibilitychange", aoVoltar!);
        aoVoltar = null;
        // A carga (ou os dados da irmã) já cobrem o que ficou para trás escondido.
        atrasado.current = false;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const fresco = chaveDosDadosRef.current === chave && Date.now() - ultimaConsulta.current < intervalo;
        if (!fresco) tentar(0);
      };
      document.addEventListener("visibilitychange", aoVoltar);
    } else {
      tentar(0);
    }
    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      if (aoVoltar) document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [supabase, rpc, chave, tentativa, empresa, soVisivel, sorteioMin, intervalo, avisarAbas]);

  // O canal ao vivo. Só se inscreve quando sabe a empresa (`empresaDoCanal`, lá em cima).
  useEffect(() => {
    if (!empresaDoCanal) return;
    let ativo = true;
    const agendar = (evento: { event?: string }) => {
      const agora = Date.now();
      setUltimoAviso(agora);
      if (evento?.event === "mensagens") setMensagemAvisada(agora);
      // Aviso que não muda esta consulta não a refaz (ver `eventos`).
      if (!avisoRefaz(evento?.event, eventosAceitos ? eventosAceitos.split(",") : null)) return;
      if (timer.current) clearTimeout(timer.current);
      if (sorteioMin !== null && sorteioMax !== null) {
        // A trava: o que faltar do teto MAIS um sorteio; no disparo, confere se
        // uma consulta (desta aba ou de uma irmã) mais nova que o aviso já começou.
        avisoAceitoEm.current = agora;
        const disparar = () => {
          if (!ativo) return;
          const d = decidirDisparo(Date.now(), ultimaConsulta.current, avisoAceitoEm.current, intervalo);
          if (d === "consultar") { buscar(); return; }
          if (d === "esperar") {
            timer.current = setTimeout(disparar, esperaComSorteio(Date.now(), ultimaConsulta.current, intervalo, sorteioEntre(sorteioMin, sorteioMax)));
          }
        };
        timer.current = setTimeout(disparar, esperaComSorteio(agora, ultimaConsulta.current, intervalo, sorteioEntre(sorteioMin, sorteioMax)));
        return;
      }
      // O que vier por último: o respiro da rajada, ou o fim do intervalo mínimo.
      const espera = esperaDoAviso(agora, ultimaConsulta.current, intervalo);
      timer.current = setTimeout(() => { if (ativo) buscar(); }, espera);
    };
    // O canal é compartilhado entre as consultas ao vivo da tela (o menu e a
    // página escutam ao mesmo tempo) — ver `canalZapintel.ts`.
    const sair = ouvirZapintel(supabase, empresaDoCanal, {
      evento: agendar,
      status: (status) => {
        if (!ativo) return;
        setAoVivo(status === "SUBSCRIBED");
        // Caiu depois de ter conectado: o que chegar durante a queda não avisa.
        // Marca como atrasado para reconsultar quando voltar (antes, só a aba
        // escondida marcava, e a reconexão não recuperava nada).
        if (status === "SUBSCRIBED") conectou.current = true;
        else if (conectou.current) atrasado.current = true;
        if (status === "SUBSCRIBED" && atrasado.current) buscar();
      },
    });
    return () => {
      ativo = false;
      if (timer.current) clearTimeout(timer.current);
      sair();
    };
  }, [supabase, empresaDoCanal, buscar, intervalo, eventosAceitos, sorteioMin, sorteioMax]);

  // Aba escondida não consulta; ao voltar, se ficou algo para trás, consulta —
  // dentro do teto: se a última consulta foi há menos que o intervalo, espera o resto.
  useEffect(() => {
    const voltar = () => {
      if (document.hidden || !atrasado.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(buscar, esperaDaVolta(Date.now(), ultimaConsulta.current, intervalo));
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [buscar, intervalo]);

  const tentarDeNovo = useCallback(() => { setErro(null); setTentativa((n) => n + 1); }, []);

  return {
    dados, erro, aoVivo, ultimoAviso, atualizando, mensagemAvisada, supabase, tentarDeNovo,
    /** Parâmetros novos pedidos e ainda sem resposta. */
    carregando: chaveDosDados !== chave,
  };
}
