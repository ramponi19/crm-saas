"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { papelDoSegmento } from "@/lib/zapintel/papel";
import { useRpcAoVivo } from "./useRpcAoVivo";

/**
 * O CONTEXTO DO ZAPINTEL: A EMPRESA, AS LOJAS E A LOJA ESCOLHIDA — AO VIVO.
 *
 * ══ 15/10/2026: O PAINEL ANTIGO SAIU ═══════════════════════════════════════
 *
 * Até aqui este provider baixava `/zapintel/api/painel`: todos os leads, já
 * classificados pelo motor de palavras, mais os agregados de cada tela,
 * calculados na Vercel e congelados até alguém clicar em "Sincronizar agora".
 * O Lucas: *"achei que ele rodava online fulltime"*.
 *
 * As telas foram passando para o banco uma a uma (dashboard, lista, Insights,
 * Atendimento, Pós-venda, a ficha), e Comparar, Linguagem e Relatório saíram.
 * Sobrou para este provider só o que o menu precisa — e vem de
 * `zapintel_resumo`, pelo mesmo canal ao vivo das telas.
 *
 * Saíram com ele: a rota do painel, o cálculo (`lib/zapintel/painel.ts`), a
 * janela de cache, os agregados do motor (`stats.ts`, `linguagem.ts`), a venda
 * "marcada à mão" que não gravava nada e o botão "Sincronizar".
 */

export interface Loja {
  id: number | null;
  nome: string;
  leads: number;
}

interface Contexto {
  /** As lojas, ao vivo. A primeira é sempre "toda a rede" (`id: null`). */
  lojas: Loja[];
  lojaAtiva: number | null;
  setLojaAtiva: (id: number | null) => void;
  /** Leads ativos com conversa. */
  conversas: number;
  /** Mensagens dessas conversas. */
  mensagens: number;
  /** Leads ativos sem nenhuma mensagem. */
  semConversa: number;
  /** Instante da mensagem mais recente — o "última mensagem há X" do menu. */
  ultimaMensagem: string | null;
  /** O canal ao vivo está conectado. */
  aoVivo: boolean;
  storeName: string;
  sellerName: string;
}

const Ctx = createContext<Contexto | null>(null);

interface Resumo {
  empresa: number; empresaNome: string | null; segmento: string | null;
  conversas: number; semConversa: number; mensagens: number; ultimaMensagem: string | null;
  lojas: Loja[];
}

export function LeadProvider({ children, empresa }: { children: ReactNode; empresa: number | null }) {
  const [lojaAtiva, setLojaAtiva] = useState<number | null>(null);
  /**
   * O RESUMO SÓ ANDA COM MENSAGEM, E NO MÁXIMO A CADA 30 s (21/10/2026). Ele
   * monta o menu (conversas, mensagens, leads por loja) e custava ~1,7 s no banco
   * a cada aviso — inclusive de ficha refeita e de venda, que não mudam nada aqui.
   * Com a aba em segundo plano não consulta (regra do useRpcAoVivo).
   */
  const { dados: resumo, aoVivo } = useRpcAoVivo<Resumo>("zapintel_resumo", { p_empresa: empresa }, empresa,
    { eventos: ["mensagens"], intervaloMinimo: 30_000 });

  const valor: Contexto = {
    lojas: resumo?.lojas ?? [],
    lojaAtiva,
    setLojaAtiva,
    conversas: resumo?.conversas ?? 0,
    mensagens: resumo?.mensagens ?? 0,
    semConversa: resumo?.semConversa ?? 0,
    ultimaMensagem: resumo?.ultimaMensagem ?? null,
    aoVivo,
    storeName: resumo?.empresaNome ?? "",
    sellerName: papelDoSegmento(resumo?.segmento),
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useLeads() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeads must be inside LeadProvider");
  return ctx;
}
