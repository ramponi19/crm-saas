"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ouvirZapintel } from "./canalZapintel";

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
 */
const RESPIRO = 2500;
const INTERVALO_MINIMO = 20_000;

export function useRpcAoVivo<T>(rpc: string, params: Record<string, unknown>, empresa: number | null) {
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
        // Permissão negada não melhora tentando de novo.
        if (n < 2 && error.code !== "42501") { espera = setTimeout(() => tentar(n + 1), 1500 * (n + 1)); return; }
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
  }, [supabase, rpc, chave]);

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
      if (timer.current) clearTimeout(timer.current);
      // O que vier por último: o respiro da rajada, ou o fim do intervalo mínimo.
      const espera = Math.max(RESPIRO, ultimaConsulta.current + INTERVALO_MINIMO - agora);
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
  }, [supabase, empresaDoCanal, buscar]);

  // Aba escondida não consulta; ao voltar, se ficou algo para trás, consulta.
  useEffect(() => {
    const voltar = () => { if (!document.hidden && atrasado.current) buscar(); };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [buscar]);

  return {
    dados, erro, aoVivo, ultimoAviso, atualizando, mensagemAvisada, supabase,
    /** Parâmetros novos pedidos e ainda sem resposta. */
    carregando: chaveDosDados !== chave,
  };
}
