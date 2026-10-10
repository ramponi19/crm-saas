"use client";
import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { Lead, DashboardStats, ManualSale } from "@/types/zapintel";
import { parseCombinedCSV } from "@/lib/zapintel/parser/csvParser";
import { parseInstagramFile } from "@/lib/zapintel/parser/instagramParser";
import { aliviar, agregar, type LeadLeve, type Agregados, type Loja, type Painel } from "@/lib/zapintel/painel";
import { generateMatchSuggestions, mergeLeads, type MatchSuggestion } from "@/lib/zapintel/merge/matchEngine";
import { getSegment, getRole, DEFAULT_SEGMENT_ID } from "@/lib/zapintel/segments/segments";
import type { SegmentConfig } from "@/lib/zapintel/segments/segments";
import SAMPLE from "@/lib/zapintel/sample-data/sample";

/**
 * A FONTE DE DADOS DO ZAPINTEL.
 *
 * ══ O QUE MUDOU EM 09/10/2026 ══════════════════════════════════════════════
 *
 * Antes isto baixava as conversas em CSV e rodava os motores NO NAVEGADOR. O
 * tamanho da resposta era o limite, e o limite foi pago com truncamento: a
 * análise parava em 23/09, ignorava 17 mil mensagens, e o painel anunciava
 * números de três semanas antes com cara de números de hoje.
 *
 * Agora quem analisa é `/zapintel/api/painel`, ao lado do banco, sobre 100%
 * das mensagens. O que chega aqui é a conclusão — e nenhuma conversa.
 *
 * ══ LEAD LEVE ══════════════════════════════════════════════════════════════
 *
 * Por isso `leads` é `LeadLeve[]`, e não `Lead[]`: o campo `messages` vem
 * declarado como `never[]`, então qualquer tela que tente ler o texto da
 * conversa daqui PARA DE COMPILAR em vez de silenciosamente contar zero. Quem
 * precisa da conversa inteira busca por lead, sob demanda.
 */

export function detectLeadOrigin(lead: { _channel?: string; filename?: string; phone?: string }): "whatsapp" | "instagram" {
  if (lead._channel === "instagram") return "instagram";
  if (lead.filename?.toLowerCase().endsWith(".json")) return "instagram";
  if (lead.filename?.toLowerCase().includes("instagram")) return "instagram";
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  if (lead.phone && digits.length < 4 && /[a-zA-Z_]/.test(lead.phone)) return "instagram";
  return "whatsapp";
}

interface LeadStore {
  /** Os leads do recorte ativo (toda a rede, ou uma loja). Sem as conversas. */
  leads: LeadLeve[];
  /**
   * Os leads COM as conversas — só existe no caminho de importação manual,
   * onde o texto está no navegador porque foi o usuário quem o trouxe. No
   * caminho normal é `null`, e quem precisa de uma conversa pede ao servidor.
   */
  leadsCompletos: Lead[] | null;
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
   * Desde 09/10/2026 este campo é obrigação, não enfeite: o painel não se
   * atualiza sozinho, então a tela PRECISA dizer de quando é o número. Sem
   * isso, dado de ontem se apresenta como dado de agora — que é o defeito que
   * este módulo já teve duas vezes (análise truncada em 23/09 e canal de tempo
   * real que não recebia nada), as duas em silêncio.
   */
  calculadoEm: string | null;

  loadSample: () => void;
  loadWhatsapp: (text: string, channel?: "whatsapp" | "instagram") => void;
  loadInstagram: (text: string, filename: string) => void;
  markSaleClosed: (leadId: string, sale: ManualSale) => void;
  clearData: () => void;
  syncFromCRM: () => void;
  syncing: boolean;
  storeName: string;
  sellerName: string;

  // ── Importação manual e fusão WhatsApp×Instagram ────────────────────────
  //
  // Caminho LEGADO: `/zapintel/import` e `/zapintel/merge` não estão na
  // navegação desde que o ZapIntel passou a se alimentar sozinho do CRM. Segue
  // funcionando porque tirar tela do produto é decisão de quem é dono dele, não
  // consequência de uma refatoração — mas nada disto é alimentado pelo servidor.
  whatsappLeads: Lead[];
  instagramLeads: Lead[];
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  matchSuggestions: MatchSuggestion[];
  matchesLoading: boolean;
  hasPendingMatches: boolean;
  runMatchSuggestions: () => void;
  confirmMatch: (id: string) => void;
  rejectMatch: (id: string) => void;
  confirmAllMatches: () => void;
  applyMatches: () => void;
  setSegmentId: (id: string) => void;
}

const Ctx = createContext<LeadStore | null>(null);


export function LeadProvider({ children }: { children: ReactNode }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [lojaAtiva, setLojaAtiva] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Caminho legado: importação manual de CSV (/zapintel/import). Fora da
  // navegação hoje; quando usado, roda os motores aqui e produz exatamente a
  // mesma forma que o servidor produz — uma forma só para as telas.
  const [waCrus, setWaCrus] = useState<Lead[]>([]);
  const [igCrus, setIgCrus] = useState<Lead[]>([]);
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [segmentManual, setSegmentManual] = useState<string | null>(null);

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

  // ── O recorte ativo ───────────────────────────────────────────────────────
  const chave = lojaAtiva == null ? "geral" : String(lojaAtiva);

  // ── Importação manual (legado) ────────────────────────────────────────────
  //
  // Enquanto houver dado importado ele tem precedência: quem abriu a tela de
  // import quer ver o que importou, não a base do CRM.
  const crusImportados = useMemo(() => {
    if (!waCrus.length && !igCrus.length) return null;
    const confirmados = matchSuggestions.filter((m) => m.status === "confirmed");
    const fundidosIds = new Set([
      ...confirmados.map((m) => m.whatsappLead.id),
      ...confirmados.map((m) => m.instagramLead.id),
    ]);
    return [
      ...confirmados.map((m) => mergeLeads(m.whatsappLead, m.instagramLead)),
      ...waCrus.filter((l) => !fundidosIds.has(l.id)),
      ...igCrus.filter((l) => !fundidosIds.has(l.id)),
    ].sort((a, b) => b.score - a.score);
  }, [waCrus, igCrus, matchSuggestions]);

  const importado = useMemo(() => {
    if (!crusImportados) return null;
    return { leads: crusImportados.map((l) => aliviar(l, null)), agregados: agregar(crusImportados) };
  }, [crusImportados]);

  const leads = useMemo(() => {
    if (importado) return importado.leads;
    if (!painel) return [];
    return lojaAtiva == null ? painel.leads : painel.leads.filter((l) => l.filialId === lojaAtiva);
  }, [importado, painel, lojaAtiva]);

  const agregados = importado ? importado.agregados : (painel?.agregados[chave] ?? null);

  const segmentId = segmentManual ?? painel?.segmentId ?? DEFAULT_SEGMENT_ID;
  const segment = getSegment(segmentId);
  const sellerName = getRole(segmentId);

  const loadSample = useCallback(() => {
    setLoading(true);
    setTimeout(() => { setWaCrus(SAMPLE); setIgCrus([]); setMatchSuggestions([]); setLoading(false); }, 300);
  }, []);

  const loadWhatsapp = useCallback((text: string, channel: "whatsapp" | "instagram" = "whatsapp") => {
    setLoading(true);
    setTimeout(() => {
      const lidos = parseCombinedCSV(text).map((l) => ({ ...l, _channel: channel }));
      if (channel === "whatsapp") setWaCrus(lidos); else setIgCrus(lidos);
      setMatchSuggestions([]);
      setLoading(false);
    }, 300);
  }, []);

  const loadInstagram = useCallback((text: string, filename: string) => {
    const result = parseInstagramFile(text, filename);
    if (!result) return;
    const linhas = [
      "Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime",
    ];
    for (const msg of result.messages) {
      linhas.push([
        result.contact, filename, msg.date, msg.date, msg.time,
        msg.isStore ? "5519998862028" : (msg.phone || result.contact),
        msg.isStore ? "Store" : result.contact,
        (msg.body || "").replace(/;/g, ","),
        msg.mediaType || "", "", msg.mediaCaption || "", "", "", "", "",
      ].join(";"));
    }
    loadWhatsapp(linhas.join("\n"), "instagram");
  }, [loadWhatsapp]);

  const limparImportado = useCallback(() => {
    setWaCrus([]); setIgCrus([]); setMatchSuggestions([]);
  }, []);

  const clearData = useCallback(() => {
    limparImportado();
    setLoading(true);
    void buscar();
  }, [limparImportado, buscar]);

  /**
   * "Sincronizar agora" — o botão da barra lateral.
   *
   * Desde 09/10/2026 ele FURA a janela de recálculo do servidor (`forcar`), e é
   * o que torna a janela aceitável: ninguém fica preso a um número de dez
   * minutos atrás sem ter o que fazer. Cronômetro espera; pessoa, não. O custo
   * não escapa mesmo assim — o servidor mantém um piso curto contra o clique
   * repetido (ver JANELA_FORCADO_MS em lib/zapintel/cache.ts).
   */
  const syncFromCRM = useCallback(() => {
    limparImportado();
    setSyncing(true);
    void buscar(true).finally(() => setSyncing(false));
  }, [limparImportado, buscar]);

  // Sugerir fusões é caro e só faz sentido com os dois canais importados.
  const runMatchSuggestions = useCallback(() => {
    if (!waCrus.length || !igCrus.length) return;
    setMatchesLoading(true);
    setTimeout(() => {
      setMatchSuggestions(generateMatchSuggestions(waCrus, igCrus));
      setMatchesLoading(false);
    }, 50);
  }, [waCrus, igCrus]);

  const confirmMatch = useCallback((id: string) => {
    setMatchSuggestions((prev) => prev.map((m) => (m.id === id ? { ...m, status: "confirmed" as const } : m)));
  }, []);
  const rejectMatch = useCallback((id: string) => {
    setMatchSuggestions((prev) => prev.map((m) => (m.id === id ? { ...m, status: "rejected" as const } : m)));
  }, []);
  const confirmAllMatches = useCallback(() => {
    setMatchSuggestions((prev) => prev.map((m) => (m.status === "pending" ? { ...m, status: "confirmed" as const } : m)));
  }, []);
  // A fusão já acontece em `crusImportados`; a tela só navega para fora.
  const applyMatches = useCallback(() => {}, []);

  // Marcar venda é visual: vale enquanto a aba está aberta e some no próximo
  // cálculo. Mantido como estava — virar registro de verdade é outra conversa.
  const markSaleClosed = useCallback((leadId: string, sale: ManualSale) => {
    const vendido = { classification: "customer" as const, score: 95, manualSale: sale };
    const marcarCru = (l: Lead): Lead => (l.id === leadId ? { ...l, ...vendido } : l);
    setWaCrus((prev) => prev.map(marcarCru));
    setIgCrus((prev) => prev.map(marcarCru));
    setPainel((prev) => (prev
      ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, ...vendido } : l)) }
      : prev));
  }, []);

  const valor: LeadStore = {
    leads,
    leadsCompletos: crusImportados,
    stats: agregados?.stats ?? null,
    agregados,
    segment,
    loaded: !!painel || !!importado,
    loading,
    lojas: painel?.lojas ?? [],
    lojaAtiva,
    setLojaAtiva,
    mensagens: painel?.mensagens ?? 0,
    semConversa: painel?.semConversa ?? 0,
    calculadoEm: painel?.calculadoEm ?? null,
    loadSample, loadWhatsapp, loadInstagram,
    markSaleClosed, clearData,
    syncFromCRM, syncing,
    storeName: painel?.empresaNome ?? "",
    sellerName,

    whatsappLeads: waCrus,
    instagramLeads: igCrus,
    hasWhatsapp: waCrus.length > 0,
    hasInstagram: igCrus.length > 0,
    matchSuggestions,
    matchesLoading,
    hasPendingMatches: matchSuggestions.some((m) => m.status === "pending"),
    runMatchSuggestions, confirmMatch, rejectMatch, confirmAllMatches, applyMatches,
    setSegmentId: setSegmentManual,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useLeads() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeads must be inside LeadProvider");
  return ctx;
}
