"use client";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { useEmpresaZapintel } from "./providers";
import { PainelAoVivo } from "@/components/zapintel/painel-ao-vivo";

/**
 * O dashboard do ZapIntel. Desde 14/10/2026 os números saem das ANÁLISES
 * (fichas de cada conversa) e se atualizam sozinhos — ver
 * `components/zapintel/painel-ao-vivo.tsx` e `hooks/zapintel/useDashboardAoVivo.ts`.
 *
 * A loja vem do seletor "Vendo" da barra lateral (`useLeads`), o mesmo que as
 * outras telas do ZapIntel usam: trocar ali troca aqui.
 */
export default function DashboardPage() {
  const { lojas, lojaAtiva, storeName } = useLeads();
  const empresa = useEmpresaZapintel();
  const recorte = lojaAtiva == null
    ? `${storeName || "Sua empresa"} · toda a rede`
    : (lojas.find((l) => l.id === lojaAtiva)?.nome ?? "Loja");
  return <PainelAoVivo filial={lojaAtiva} nomeDoRecorte={recorte} empresa={empresa} />;
}
