"use client";
import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { Lead, DashboardStats, ManualSale } from "@/types/zapintel";
import type { LeadLeve, Agregados, Loja, Painel } from "@/lib/zapintel/painel";
import { getSegment, getRole, DEFAULT_SEGMENT_ID } from "@/lib/zapintel/segments/segments";
import type { SegmentConfig } from "@/lib/zapintel/segments/segments";

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

  /** As lojas disponíveis. A primeira é sempre "toda a rede" (`id: null`). */
  lojas: Loja[];
  lojaAtiva: number | null;
  setLojaAtiva: (id: number | null) => void;

  /** Mensagens que entraram na análise — o número que antes vinha truncado. */
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

export function LeadProvider({ children }: { children: ReactNode }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [lojaAtiva, setLojaAtiva] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  useEffect(() => { void buscar(); }, [buscar]);

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
  const segmentId = painel?.segmentId ?? DEFAULT_SEGMENT_ID;

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
    lojas: painel?.lojas ?? [],
    lojaAtiva,
    setLojaAtiva,
    mensagens: painel?.mensagens ?? 0,
    semConversa: painel?.semConversa ?? 0,
    calculadoEm: painel?.calculadoEm ?? null,
    markSaleClosed,
    syncFromCRM,
    syncing,
    storeName: painel?.empresaNome ?? "",
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
 * De qual canal veio o lead.
 *
 * Era adivinhação pelo formato do telefone e pelo nome do arquivo — herança da
 * importação manual. Hoje `_channel` é preenchido em `aliviar()` com
 * `leads.origem`, que o CRM grava. A função fica como leitura única do campo,
 * para nenhuma tela voltar a inventar regra própria.
 */
export function detectLeadOrigin(lead: { _channel?: string }): "whatsapp" | "instagram" {
  return lead._channel === "instagram" ? "instagram" : "whatsapp";
}

export type { Lead };
