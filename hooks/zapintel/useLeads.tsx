"use client";
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import type { Lead, DashboardStats, ManualSale } from "@/types/zapintel";
import type { LeadLeve, Agregados, Loja, Painel } from "@/lib/zapintel/painel";
import { getSegment, getRole, DEFAULT_SEGMENT_ID, mapCrmSegmento } from "@/lib/zapintel/segments/segments";
import type { SegmentConfig } from "@/lib/zapintel/segments/segments";
import { useRpcAoVivo } from "./useRpcAoVivo";

/**
 * A FONTE DE DADOS DO ZAPINTEL.
 *
 * ══ O QUE SAIU EM 10/10/2026 ═══════════════════════════════════════════════
 *
 * Todo o caminho de IMPORTAÇÃO MANUAL. O ZapIntel nasceu fora deste CRM, comendo
 * planilha de conversa exportada, e trouxe consigo: as telas `/import` e
 * `/merge`, dois parsers de CSV, um motor de fusão WhatsApp×Instagram, uma base
 * de exemplo e o estado que segurava tudo isso no navegador.
 *
 * Nada disso tinha para onde ir: o negócio é online e o CRM alimenta sozinho.
 * Manter era guardar duas verdades sobre o mesmo lead — a importada e a real —
 * e pagar o parser de CSV no meio do caminho de cada recálculo.
 *
 * O que sobrou é o que sempre foi o produto: pedir o painel ao servidor,
 * escolher a loja, e saber de quando é o número.
 *
 * ══ 15/10/2026: O MENU SAIU DO PAINEL, E O PAINEL VIROU SOB DEMANDA ════════
 *
 * *"achei que ele rodava online fulltime"* — o Lucas, ao ver o menu "Vendo"
 * parado em 1.911 enquanto o banco tinha 1.919. Lojas, contagens e nome da
 * empresa agora vêm de `zapintel_resumo`, ao vivo (mesmo canal e mesmo teto
 * das telas novas). E o painel antigo — calculado na Vercel, congelado até
 * "Sincronizar" — só é baixado pelas telas que ainda dependem dele, via
 * `usePainelAntigo()`. Antes TODA tela do ZapIntel o baixava ao abrir,
 * inclusive as que já liam o banco: uma chamada à Vercel por tela, à toa.
 *
 * ══ LEAD LEVE ══════════════════════════════════════════════════════════════
 *
 * `leads` é `LeadLeve[]`, não `Lead[]`: o campo `messages` vem declarado como
 * `never[]`, então qualquer tela que tente ler o texto da conversa daqui PARA
 * DE COMPILAR em vez de silenciosamente contar zero. Quem precisa da conversa
 * busca por lead, sob demanda, em `/zapintel/api/conversa`.
 */

interface LeadStore {
  /** Os leads do recorte ativo (toda a rede, ou uma loja). Sem as conversas. */
  leads: LeadLeve[];
  stats: DashboardStats | null;
  /** Todos os agregados do recorte ativo, já calculados no servidor. */
  agregados: Agregados | null;
  segment: SegmentConfig;
  loaded: boolean;
  loading: boolean;

  /** As lojas disponíveis, ao vivo. A primeira é sempre "toda a rede" (`id: null`). */
  lojas: Loja[];
  /** Leads ativos com conversa, ao vivo (`zapintel_resumo`). */
  conversas: number;
  /** Instante da mensagem mais recente — o "última mensagem há X" do menu. */
  ultimaMensagem: string | null;
  /** O canal ao vivo está conectado. */
  aoVivo: boolean;
  /** As telas antigas chamam (via `usePainelAntigo`) para o painel ser baixado. */
  pedirPainel: () => void;
  lojaAtiva: number | null;
  setLojaAtiva: (id: number | null) => void;

  /** Mensagens das conversas, ao vivo. */
  mensagens: number;
  /** Leads ativos sem nenhuma conversa. Ficam fora dos agregados, de propósito. */
  semConversa: number;
  /**
   * Quando esta conta foi feita.
   *
   * O painel não se atualiza sozinho, então a tela PRECISA dizer de quando é o
   * número. Sem isso, dado de ontem se apresenta como dado de agora — que é o
   * defeito que este módulo já teve duas vezes, as duas em silêncio.
   */
  calculadoEm: string | null;

  markSaleClosed: (leadId: string, sale: ManualSale) => void;
  /** "Sincronizar agora": recalcula no servidor, furando a janela. */
  syncFromCRM: () => void;
  syncing: boolean;
  storeName: string;
  sellerName: string;
}

const Ctx = createContext<LeadStore | null>(null);

interface Resumo {
  empresa: number; empresaNome: string | null; segmento: string | null;
  conversas: number; semConversa: number; mensagens: number; ultimaMensagem: string | null;
  lojas: Loja[];
}

export function LeadProvider({ children, empresa }: { children: ReactNode; empresa: number | null }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [lojaAtiva, setLojaAtiva] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const painelPedido = useRef(false);
  const { dados: resumo, aoVivo } = useRpcAoVivo<Resumo>("zapintel_resumo", { p_empresa: empresa }, empresa);

  // Quem avisa "estou carregando" é o CHAMADOR, não esta função: o primeiro
  // carregamento já começa com `loading` ligado, e marcar de novo dentro do
  // efeito dispara renderização em cascata.
  const buscar = useCallback(async (forcar = false) => {
    try {
      // `forcar` só sai daqui quando uma PESSOA clica em atualizar. O servidor
      // segura recálculo por janela (ver lib/zapintel/cache.ts); o clique fura
      // a janela, o cronômetro não.
      const url = forcar ? "/zapintel/api/painel?forcar=1" : "/zapintel/api/painel";
      const r = await fetch(url, { cache: "no-store" });
      const d = (await r.json()) as Painel & { erro?: string };
      if (!d?.erro && Array.isArray(d.leads)) setPainel(d);
    } catch {
      // Mantém o que já está na tela: dado velho é melhor que tela vazia, e a
      // data do cálculo fica visível para quem olha.
    } finally {
      setLoading(false);
    }
  }, []);

  // Só baixa quando uma tela antiga pede — e uma vez; o resto é "Sincronizar".
  const pedirPainel = useCallback(() => {
    if (painelPedido.current) return;
    painelPedido.current = true;
    setLoading(true);
    void buscar();
  }, [buscar]);

  // ── Atualizar: só quando pedem ────────────────────────────────────────────
  //
  // Não há relógio nenhum aqui. Houve, no mesmo dia 09/10/2026: primeiro uma
  // assinatura de tempo real que não recebia nada (rodava no navegador sob o
  // RLS do usuário, que para dono e admin enxerga só a loja selecionada — a
  // tela mostrava duas lojas e reagia a uma), depois um pulso de 45 s com
  // recálculo automático a cada 10 min.
  //
  // O pulso funcionava. Saiu por preço: cada batida custava ~97 ms de CPU
  // somando proxy e rota, e cada recálculo, 2,76 s — contra um teto de 4 h de
  // Active CPU por mês para a conta inteira, que ao estourar PAUSA os
  // projetos. Automatismo pago por tempo gasta igual com a loja cheia ou
  // vazia, e ninguém vê a conta correr.
  //
  // A troca foi essa: o número não se atualiza sozinho, e em compensação a
  // tela DIZ de quando ele é. Quem quiser o de agora clica em "Sincronizar
  // agora", e aí sim o servidor recalcula — ver lib/zapintel/cache.ts.

  const chave = lojaAtiva == null ? "geral" : String(lojaAtiva);

  const leads = useMemo(() => {
    if (!painel) return [];
    return lojaAtiva == null ? painel.leads : painel.leads.filter((l) => l.filialId === lojaAtiva);
  }, [painel, lojaAtiva]);

  const agregados = painel?.agregados[chave] ?? null;
  const segmentId = resumo ? mapCrmSegmento(resumo.segmento) : (painel?.segmentId ?? DEFAULT_SEGMENT_ID);

  const syncFromCRM = useCallback(() => {
    setSyncing(true);
    void buscar(true).finally(() => setSyncing(false));
  }, [buscar]);

  // Marcar venda é visual: vale enquanto a aba está aberta e some no próximo
  // cálculo. Virar registro de verdade é outra conversa — e o lugar dela é a
  // ponte venda↔conversa, não um estado de tela.
  const markSaleClosed = useCallback((leadId: string, sale: ManualSale) => {
    const vendido = { classification: "customer" as const, score: 95, manualSale: sale };
    setPainel((prev) => (prev
      ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, ...vendido } : l)) }
      : prev));
  }, []);

  const valor: LeadStore = {
    leads,
    stats: agregados?.stats ?? null,
    agregados,
    segment: getSegment(segmentId),
    loaded: !!painel,
    loading,
    lojas: resumo?.lojas ?? [],
    conversas: resumo?.conversas ?? 0,
    ultimaMensagem: resumo?.ultimaMensagem ?? null,
    aoVivo,
    pedirPainel,
    lojaAtiva,
    setLojaAtiva,
    mensagens: resumo?.mensagens ?? 0,
    semConversa: resumo?.semConversa ?? 0,
    calculadoEm: painel?.calculadoEm ?? null,
    markSaleClosed,
    syncFromCRM,
    syncing,
    storeName: resumo?.empresaNome ?? painel?.empresaNome ?? "",
    sellerName: getRole(segmentId),
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useLeads() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeads must be inside LeadProvider");
  return ctx;
}

/**
 * Para as telas que AINDA leem o painel antigo (Comparar, Linguagem,
 * Relatório, Pós-venda e a ficha do lead): pede o painel ao abrir. Cada uma
 * mostra `AvisoPainelAntigo` — de quando é o número e o "Sincronizar".
 * Some quando a última delas passar a ler o banco.
 */
export function usePainelAntigo() {
  const ctx = useLeads();
  const { pedirPainel } = ctx;
  useEffect(() => { pedirPainel(); }, [pedirPainel]);
  return ctx;
}

export type { Lead };
