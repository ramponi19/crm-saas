"use client";
import { useCallback } from "react";
import { useRpcAoVivo } from "./useRpcAoVivo";
import { TRAVA_DO_DASHBOARD } from "./ritmo";
import { registrarTempoEsgotado } from "@/lib/zapintel/tempo-esgotado";

/**
 * O DASHBOARD DO ZAPINTEL AO VIVO — SEM PULSO E SEM VERCEL.
 *
 * Pedido do Lucas em 14/10/2026: *"um dashboard completamente integrado e
 * como falamos sem precisar ficando clicando para atualizar"*. Os dados vêm de
 * `zapintel_dashboard` e o ritmo das atualizações (aviso do banco, teto de
 * 20 s, aba escondida) mora em `useRpcAoVivo`, o mesmo da lista de leads.
 */

export type Classe = "customer" | "hot" | "warm" | "followup" | "stalled" | "lost" | "unqualified" | "sem_analise" | "sem_resposta";
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
  /** A mesma conta da tela Atendimento (`zapintel_turnos`), nos últimos 7 dias. */
  resposta: {
    medianaMin: number | null; ate5Pct: number | null; mais4hPct: number | null; semResposta: number; retomadas: number;
    horario: { inicio: string; fim: string; dias: number[]; configurado: boolean };
  };
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
  analises: { comAnalise: number; desatualizadas: number; semAnalise: number; semResposta: number };
  porLoja: { id: number; nome: string; ativos7d: number; esperando: number; quentes: number; vendasMes: number; respostaMin: number | null }[];
}

export interface LeadDaLista {
  leadId: number; nome: string | null; loja: string | null; ultimaMensagem: string;
  classificacao: Classe; urgencia: Urgencia; score: number | null; rotulo: string | null;
  proximaAcao: string | null; esperando: boolean; detalhe: string | null;
}

export function useDashboardAoVivo(filial: number | null, empresa: number | null) {
  /*
   * A TRAVA DO DASHBOARD (10/11/2026, pedido do Lucas). Era: todo aviso
   * (mensagem, ficha, venda), teto de 20 s, respiro fixo de 2,5 s — todas as
   * abas abertas disparavam juntas a cada mensagem. Agora: só aviso de mensagem;
   * no máximo 1 recálculo a cada 60 s por aba; nunca com a aba escondida, nem na
   * carga inicial; sorteio de 0 a 5 s para as abas não dispararem juntas; e as
   * abas da mesma pessoa partilham a consulta (ver `useRpcAoVivo`, `ritmo.ts`).
   * Ficha refeita e venda aparecem no próximo recálculo (a loja recebe uma
   * mensagem a cada ~12 s no horário de pico).
   */
  const { dados, erro, aoVivo, ultimoAviso, atualizando, mensagemAvisada, supabase, carregando, tentarDeNovo } =
    useRpcAoVivo<Dashboard>("zapintel_dashboard", { p_filial: filial, p_empresa: empresa }, empresa, TRAVA_DO_DASHBOARD);

  const lista = useCallback(async (tipo: string, valor?: string | null) => {
    const inicio = Date.now();
    const { data, error } = await supabase.rpc("zapintel_dashboard_lista" as never, {
      p_tipo: tipo, p_valor: valor ?? null, p_filial: filial, p_empresa: empresa,
    } as never);
    void registrarTempoEsgotado(supabase, error, { funcao: "zapintel_dashboard_lista", empresa, inicio, params: { p_filial: filial } });
    if (error) throw new Error(error.message);
    return data as unknown as { total: number; leads: LeadDaLista[] };
  }, [supabase, filial, empresa]);

  // A mais recente entre a que o banco contou e a que o aviso anunciou.
  const doBanco = dados?.ultimaMensagem ? new Date(dados.ultimaMensagem).getTime() : 0;
  const maior = Math.max(doBanco, mensagemAvisada ?? 0);
  const ultimaMensagem = maior ? new Date(maior).toISOString() : null;

  return { dados, erro, aoVivo, ultimoAviso, atualizando, lista, ultimaMensagem, carregando, tentarDeNovo };
}
