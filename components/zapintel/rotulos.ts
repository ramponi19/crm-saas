/**
 * Os nomes e cores que o ZapIntel usa para as análises — um lugar só, para o
 * dashboard e a lista de leads chamarem cada coisa do mesmo jeito.
 */
import type { Classe, Urgencia } from "@/hooks/zapintel/useDashboardAoVivo";

export const CLASSE: Record<Classe, { nome: string; cor: string }> = {
  hot:         { nome: "Quente",        cor: "#dc2626" },
  warm:        { nome: "Morno",         cor: "#ea580c" },
  customer:    { nome: "Cliente",       cor: "#16a34a" },
  followup:    { nome: "Acompanhar",    cor: "#2563eb" },
  stalled:     { nome: "Parado",        cor: "#7c5cfc" },
  lost:        { nome: "Perdido",       cor: "#6b7280" },
  unqualified: { nome: "Fora do funil", cor: "#a1a8b3" },
  sem_analise: { nome: "Sem análise",   cor: "#c4c9d1" },
  // Sem análise = o cliente falou e ninguém pediu a análise ainda (o robô
  // oferece). Sem resposta = só a loja escreveu: não há o que analisar.
  sem_resposta: { nome: "Sem resposta do cliente", cor: "#e2e5ea" },
};

export const ORDEM_FUNIL: Classe[] = ["customer", "hot", "warm", "followup", "stalled", "lost", "unqualified", "sem_analise", "sem_resposta"];

export const URG: Record<Urgencia, { nome: string; cor: string }> = {
  critical: { nome: "Crítico", cor: "#dc2626" },
  high:     { nome: "Alta",    cor: "#ea580c" },
  medium:   { nome: "Média",   cor: "#ca8a04" },
  low:      { nome: "Baixa",   cor: "#9199a3" },
};

/** As famílias de objeção, na mesma grafia de `zapintel_familia_objecao`. */
export const FAMILIAS_DE_OBJECAO = [
  "Preço e dinheiro", "Crédito e pagamento", "Troca e usado", "Concorrência",
  "Momento e indecisão", "Decide com outra pessoa", "Produto e estoque",
  "Falha da loja", "Entrega e prazo", "Confiança para pagar antes",
];

export const FAIXA_PARADO: Record<string, string> = {
  hoje: "Hoje", "1-2": "1 a 2 dias", "3-7": "3 a 7 dias", "8-14": "8 a 14 dias", "15-30": "15 a 30 dias", "30+": "Mais de 30 dias",
};

export const num = (v: number) => v.toLocaleString("pt-BR");

/** "há 3 min", "há 1 h 12 min", "há 2 dias" — a partir de um relógio que anda. */
export function ha(iso: string | null, agora: number): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
