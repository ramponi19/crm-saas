"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * O DASHBOARD DO ZAPINTEL AO VIVO — SEM PULSO E SEM VERCEL.
 *
 * Pedido do Lucas em 14/10/2026: *"um dashboard completamente integrado e
 * como falamos sem precisar ficando clicando para atualizar"*.
 *
 * Os dois caminhos vão direto do navegador ao Supabase:
 *
 *   1. os NÚMEROS — `zapintel_dashboard`, com a sessão de quem olha. O banco
 *      decide empresa e lojas (`zapintel_escopo`), então a tela não tem como
 *      pedir a loja de outra pessoa;
 *   2. o AVISO — o canal `zapintel:<empresa>`, que o próprio banco alimenta a
 *      cada lote de mensagens, ficha refeita ou venda registrada
 *      (`supabase/funcoes/zapintel_ao_vivo.sql`).
 *
 * Nenhum dos dois acorda uma função da Vercel. O painel antigo custava 2,76 s
 * de Active CPU por recálculo, contra um teto de 4 h/mês para a conta inteira.
 *
 * ══ O RITMO ═════════════════════════════════════════════════════════════════
 *
 * Aviso não recalcula na hora: espera `RESPIRO` sem aviso novo. Uma rajada de
 * 12 mensagens vira UMA consulta, não 12. E com a aba escondida não consulta
 * nada — só marca que ficou para trás, e recalcula quando a aba volta.
 */

export type Classe = "customer" | "hot" | "warm" | "followup" | "stalled" | "lost" | "unqualified" | "sem_analise";
export type Urgencia = "critical" | "high" | "medium" | "low";

export interface ItemFila {
  leadId: number; nome: string | null; loja: string | null; desde: string;
  classificacao: Classe; urgencia: Urgencia; score: number | null; rotulo: string | null;
  proximaAcao: string | null; mensagemSugerida: string | null; desatualizada: boolean;
  ultimaFala: string | null; naoRespondidas: number;
}
export interface Pendencia { leadId: number; nome: string | null; loja: string | null; texto: string; urgencia: Urgencia; um: string }
export interface Dashboard {
  geradoEm: string;
  empresa: number;
  ultimaMensagem: string | null;
  lojas: { id: number; nome: string }[];
  agora: {
    recebidasHoje: number; enviadasHoje: number; conversasHoje: number; leadsNovosHoje: number;
    esperando: number; esperandoMais1h: number; esperandoAntigos: number; esperandoForaDoFunil: number;
    esperaMaisAntiga: string | null;
  };
  resposta: { medianaMin: number | null; ate15minPct: number | null; semResposta: number; retomadas: number };
  fila: ItemFila[];
  funil: Partial<Record<Classe, number>>;
  dinheiro: {
    ticketMedio: number | null; quentes: number; mornos: number;
    mesValor: number; mesQtd: number; mesAnteriorValor: number; mesAnteriorQtd: number;
    hojeValor: number; hojeQtd: number; clientesLidos: number; clientesComVenda: number; semRegistro: number;
  };
  pendencias: { total: number; leads: number; itens: Pendencia[] };
  objecoes: { familia: string; leads: number; emAberto: number; exemplos: string[] | null }[];
  sinais: { rotulo: string; leads: number }[];
  perfis: { rotulo: string; leads: number }[];
  inatividade: { faixa: string; leads: number }[];
  calor: [number, number, number][];
  modelos: { modelo: string; leads: number }[];
  silencio: { frase: string; vezes: number; venderam: number }[];
  analises: { comAnalise: number; desatualizadas: number; semAnalise: number };
  porLoja: { id: number; nome: string; ativos7d: number; esperando: number; quentes: number; vendasMes: number; respostaMin: number | null }[];
}

export interface LeadDaLista {
  leadId: number; nome: string | null; loja: string | null; ultimaMensagem: string;
  classificacao: Classe; urgencia: Urgencia; score: number | null; rotulo: string | null;
  proximaAcao: string | null; esperando: boolean; detalhe: string | null;
}

const RESPIRO = 2500;

export function useDashboardAoVivo(filial: number | null, empresa: number | null) {
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState(false);
  /** Quando chegou o último aviso do banco — a tela pisca o ponto verde. */
  const [ultimoAviso, setUltimoAviso] = useState<number | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [supabase] = useState(() => createClient());
  const atrasado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) { atrasado.current = true; return; }
    atrasado.current = false;
    setAtualizando(true);
    const { data, error } = await supabase.rpc("zapintel_dashboard" as never, {
      p_filial: filial, p_empresa: empresa,
    } as never);
    setAtualizando(false);
    if (error) { setErro(error.message); return; }
    setErro(null);
    setDados(data as unknown as Dashboard);
  }, [supabase, filial, empresa]);

  // Busca ao abrir e ao trocar de loja. Se a primeira falhar, tenta mais
  // duas vezes antes de mostrar erro: em 14/10/2026 a primeira consulta do dia
  // estourou o tempo do banco (cache frio) e a segunda saiu em meio segundo.
  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const tentar = (n: number) => {
      supabase.rpc("zapintel_dashboard" as never, { p_filial: filial, p_empresa: empresa } as never)
        .then(({ data, error }) => {
          if (!vivo) return;
          if (!error) { setErro(null); setDados(data as unknown as Dashboard); return; }
          // Permissão negada não melhora tentando de novo.
          if (n < 2 && error.code !== "42501") { espera = setTimeout(() => tentar(n + 1), 1500 * (n + 1)); return; }
          setErro(error.message);
        });
    };
    tentar(0);
    return () => { vivo = false; if (espera) clearTimeout(espera); };
  }, [supabase, filial, empresa]);

  // O canal ao vivo. Só se inscreve quando sabe a empresa — vem do servidor
  // (contexto) ou, na falta dele, da primeira resposta do banco.
  const empresaDoCanal = empresa ?? dados?.empresa ?? null;
  useEffect(() => {
    if (!empresaDoCanal) return;
    let ativo = true;
    const agendar = () => {
      setUltimoAviso(Date.now());
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (ativo) buscar(); }, RESPIRO);
    };
    const canal = supabase
      .channel(`zapintel:${empresaDoCanal}`, { config: { private: true } })
      .on("broadcast", { event: "mensagens" }, agendar)
      .on("broadcast", { event: "analises" }, agendar)
      .on("broadcast", { event: "vendas" }, agendar)
      .subscribe((status) => {
        if (!ativo) return;
        setAoVivo(status === "SUBSCRIBED");
        // Reconectou depois de cair: pode ter perdido avisos no meio.
        if (status === "SUBSCRIBED" && atrasado.current) buscar();
      });
    return () => {
      ativo = false;
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(canal);
    };
  }, [supabase, empresaDoCanal, buscar]);

  // Aba escondida não consulta; ao voltar, se ficou algo para trás, consulta.
  useEffect(() => {
    const voltar = () => { if (!document.hidden && atrasado.current) buscar(); };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [buscar]);

  const lista = useCallback(async (tipo: string, valor?: string | null) => {
    const { data, error } = await supabase.rpc("zapintel_dashboard_lista" as never, {
      p_tipo: tipo, p_valor: valor ?? null, p_filial: filial, p_empresa: empresa,
    } as never);
    if (error) throw new Error(error.message);
    return data as unknown as { total: number; leads: LeadDaLista[] };
  }, [supabase, filial, empresa]);

  return { dados, erro, aoVivo, ultimoAviso, atualizando, lista };
}
