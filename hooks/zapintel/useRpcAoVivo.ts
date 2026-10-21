"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ouvirZapintel } from "./canalZapintel";
import { INTERVALO_MINIMO, avisoRefaz, esperaDaVolta, esperaDoAviso } from "./ritmo";

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
}

export function useRpcAoVivo<T>(rpc: string, params: Record<string, unknown>, empresa: number | null, opcoes: OpcoesAoVivo = {}) {
  const intervalo = opcoes.intervaloMinimo ?? INTERVALO_MINIMO;
  const eventosAceitos = opcoes.eventos?.join(",") ?? null;
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

  const buscar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) { atrasado.current = true; return; }
    atrasado.current = false;
    ultimaConsulta.current = Date.now();
    setAtualizando(true);
    const { data, error } = await supabase.rpc(rpc as never, JSON.parse(chave) as never);
    setAtualizando(false);
    // Um aviso disparou esta consulta na página 1; a pessoa foi para a página 2
    // e a 2 respondeu antes. Sem esta linha, a página 1 chegava por último e
    // tomava a tela (esmaecida, como "carregando", até o próximo aviso).
    if (chave !== chaveAtual.current) return;
    if (error) { setErro(error.message); return; }
    setErro(null);
    setDados(data as T);
    setChaveDosDados(chave);
  }, [supabase, rpc, chave]);

  // Busca ao abrir e a cada parâmetro novo. Se falhar, tenta mais duas vezes
  // antes de mostrar erro: em 14/10/2026 a primeira consulta do dia estourou o
  // tempo do banco (cache frio) e a segunda saiu em meio segundo.
  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const tentar = (n: number) => {
      supabase.rpc(rpc as never, JSON.parse(chave) as never).then(({ data, error }) => {
        if (!vivo) return;
        if (!error) { setErro(null); setDados(data as T); setChaveDosDados(chave); return; }
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
    tentar(0);
    return () => { vivo = false; if (espera) clearTimeout(espera); };
  }, [supabase, rpc, chave, tentativa]);

  // O canal ao vivo. Só se inscreve quando sabe a empresa — vem do servidor
  // (contexto) ou, na falta dele, da própria resposta do banco.
  const empresaDoCanal = empresa ?? (dados as { empresa?: number } | null)?.empresa ?? null;
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
  }, [supabase, empresaDoCanal, buscar, intervalo, eventosAceitos]);

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
