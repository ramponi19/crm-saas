"use client";
import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { Lead, DashboardStats, ManualSale } from "@/types/zapintel";
import { parseCombinedCSV } from "@/lib/zapintel/parser/csvParser";
import { parseInstagramFile } from "@/lib/zapintel/parser/instagramParser";
import { computeStats } from "@/lib/zapintel/insights/stats";
import { getSegment, getRole, DEFAULT_SEGMENT_ID } from "@/lib/zapintel/segments/segments";
import type { SegmentConfig } from "@/lib/zapintel/segments/segments";
import { generateMatchSuggestions, mergeLeads, type MatchSuggestion } from "@/lib/zapintel/merge/matchEngine";
import SAMPLE from "@/lib/zapintel/sample-data/sample";

export function detectLeadOrigin(lead: Lead): "whatsapp" | "instagram" {
  if ((lead as any)._channel === "instagram") return "instagram";
  if ((lead as any).filename?.toLowerCase().endsWith(".json")) return "instagram";
  if ((lead as any).filename?.toLowerCase().includes("instagram")) return "instagram";
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  if (lead.phone && digits.length < 4 && /[a-zA-Z_]/.test(lead.phone)) return "instagram";
  return "whatsapp";
}

interface LeadStore {
  leads: Lead[];
  stats: DashboardStats | null;
  segment: SegmentConfig;
  loaded: boolean;
  loading: boolean;
  whatsappLeads: Lead[];
  instagramLeads: Lead[];
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  matchSuggestions: MatchSuggestion[];
  matchesLoading: boolean;
  hasPendingMatches: boolean;
  loadSample: () => void;
  loadWhatsapp: (text: string, channel?: "whatsapp" | "instagram") => void;
  loadInstagram: (text: string, filename: string) => void;
  runMatchSuggestions: () => void;
  confirmMatch: (id: string) => void;
  rejectMatch: (id: string) => void;
  confirmAllMatches: () => void;
  applyMatches: () => void;
  markSaleClosed: (leadId: string, sale: ManualSale) => void;
  setSegmentId: (id: string) => void;
  clearData: () => void;
  syncFromCRM: () => void;
  syncing: boolean;
  storeName: string;
  sellerName: string;
}

const Ctx = createContext<LeadStore | null>(null);

export function LeadProvider({ children }: { children: ReactNode }) {
  // Keep WA and IG leads in separate buckets — never overwrite each other
  const [waLeads, setWaLeads] = useState<Lead[]>([]);
  const [igLeads, setIgLeads] = useState<Lead[]>([]);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [segmentId, setSegmentIdState] = useState(DEFAULT_SEGMENT_ID);
  const segment = getSegment(segmentId);
  const sellerName = getRole(segmentId);

  // Build combined leads list (merged + unmatched WA + unmatched IG)
  const leads = useMemo(() => {
    const confirmed = matchSuggestions.filter(m => m.status === "confirmed");
    const confirmedIds = new Set([
      ...confirmed.map(m => m.whatsappLead.id),
      ...confirmed.map(m => m.instagramLead.id),
    ]);
    const merged = confirmed.map(m => mergeLeads(m.whatsappLead, m.instagramLead));
    const unmatchedWA = waLeads.filter(l => !confirmedIds.has(l.id));
    const unmatchedIG = igLeads.filter(l => !confirmedIds.has(l.id));
    return [...merged, ...unmatchedWA, ...unmatchedIG].sort((a, b) => b.score - a.score);
  }, [waLeads, igLeads, matchSuggestions]);

  // Keep stats in sync
  const currentStats = useMemo(() => computeStats(leads), [leads]);

  const applyLeads = useCallback((data: Lead[], channel: "whatsapp" | "instagram") => {
    if (channel === "whatsapp") setWaLeads(data);
    else setIgLeads(data);
    setLoaded(true);
    setLoading(false);
  }, []);

  const loadSample = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setWaLeads(SAMPLE);
      setIgLeads([]);
      setMatchSuggestions([]);
      setLoaded(true);
      setLoading(false);
    }, 400);
  }, []);

  const loadWhatsapp = useCallback((text: string, channel: "whatsapp" | "instagram" = "whatsapp") => {
    setLoading(true);
    setTimeout(() => {
      const parsed = parseCombinedCSV(text).map(l => ({ ...l, _channel: channel }));
      applyLeads(parsed, channel);
      // Reset match suggestions when new data is loaded
      setMatchSuggestions([]);
    }, 300);
  }, [segmentId, applyLeads]);

  const loadInstagram = useCallback((text: string, filename: string) => {
    setLoading(true);
    const result = parseInstagramFile(text, filename);
    if (!result) { setLoading(false); return; }
    const csvLines = [
      "Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime"
    ];
    for (const msg of result.messages) {
      const row = [
        result.contact, filename, msg.date, msg.date, msg.time,
        msg.isStore ? "5519998862028" : (msg.phone || result.contact),
        msg.isStore ? "Store" : result.contact,
        (msg.body || "").replace(/;/g, ","),
        msg.mediaType || "", "", msg.mediaCaption || "", "", "", "", ""
      ].join(";");
      csvLines.push(row);
    }
    loadWhatsapp(csvLines.join("\n"), "instagram");
  }, [loadWhatsapp]);

  // Run match suggestions on demand (not automatically — too expensive)
  const runMatchSuggestions = useCallback(() => {
    if (waLeads.length === 0 || igLeads.length === 0) return;
    setMatchesLoading(true);
    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const suggestions = generateMatchSuggestions(waLeads, igLeads);
      setMatchSuggestions(suggestions);
      setMatchesLoading(false);
    }, 50);
  }, [waLeads, igLeads]);

  const confirmMatch = useCallback((id: string) => {
    setMatchSuggestions(prev => prev.map(m => m.id === id ? { ...m, status: "confirmed" as const } : m));
  }, []);

  const rejectMatch = useCallback((id: string) => {
    setMatchSuggestions(prev => prev.map(m => m.id === id ? { ...m, status: "rejected" as const } : m));
  }, []);

  const confirmAllMatches = useCallback(() => {
    setMatchSuggestions(prev => prev.map(m => m.status === "pending" ? { ...m, status: "confirmed" as const } : m));
  }, []);

  const applyMatches = useCallback(() => {
    // Already handled via the leads useMemo above — just navigate away
  }, []);

  const markSaleClosed = useCallback((leadId: string, sale: ManualSale) => {
    const update = (l: Lead) => l.id === leadId ? { ...l, classification: "customer" as const, score: 95, manualSale: sale } : l;
    setWaLeads(prev => prev.map(update));
    setIgLeads(prev => prev.map(update));
  }, []);

  const setSegmentId = useCallback((id: string) => setSegmentIdState(id), []);

  const clearData = useCallback(() => {
    setWaLeads([]); setIgLeads([]); setMatchSuggestions([]);
    setLoaded(false);
  }, []);

  // Sincroniza com as conversas REAIS dos leads do CRM (lead_mensagens), via
  // adaptador. Descarta qualquer import manual / dados de exemplo e traz só o
  // estado atual — é o "excluir os antigos e trazer só os novos". Nada é gravado
  // no servidor: o ZapIntel roda a análise sobre o snapshot recém-buscado.
  const syncFromCRM = useCallback(() => {
    setSyncing(true);
    setLoading(true);
    fetch("/zapintel/api/conversas", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setIgLeads([]); setMatchSuggestions([]);
        if (d?.empresaNome) setStoreName(d.empresaNome);
        if (d?.segmentId) setSegmentIdState(d.segmentId);
        if (d?.csv) loadWhatsapp(d.csv, "whatsapp");
        else { setWaLeads([]); setLoaded(true); setLoading(false); }
      })
      .catch(() => setLoading(false))
      .finally(() => setSyncing(false));
  }, [loadWhatsapp]);

  // Auto-carrega as conversas reais do CRM (lead_mensagens) via adaptador no
  // primeiro acesso. Import de CSV / dados de exemplo ficam como fallback manual.
  useEffect(() => {
    let ativo = true;
    setLoading(true);
    fetch("/zapintel/api/conversas", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!ativo) return;
        if (d?.empresaNome) setStoreName(d.empresaNome);
        if (d?.segmentId) setSegmentIdState(d.segmentId);
        if (d?.csv) loadWhatsapp(d.csv, "whatsapp"); else setLoading(false);
      })
      .catch(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [loadWhatsapp]);

  return (
    <Ctx.Provider value={{
      leads, stats: currentStats, segment, loaded, loading,
      whatsappLeads: waLeads,
      instagramLeads: igLeads,
      hasWhatsapp: waLeads.length > 0,
      hasInstagram: igLeads.length > 0,
      matchSuggestions,
      matchesLoading,
      hasPendingMatches: matchSuggestions.some(m => m.status === "pending"),
      loadSample, loadWhatsapp, loadInstagram,
      runMatchSuggestions,
      confirmMatch, rejectMatch, confirmAllMatches, applyMatches,
      markSaleClosed, setSegmentId, clearData,
      syncFromCRM, syncing, storeName, sellerName,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeads must be inside LeadProvider");
  return ctx;
}
