"use client";
import { createContext, useContext } from "react";
import { LeadProvider } from "@/hooks/zapintel/useLeads";

/**
 * A empresa que o ZapIntel está mostrando, decidida no servidor
 * (`zapintelEmpresa`, que conhece o cookie de preview do superadmin).
 *
 * O dashboard lê o banco direto do navegador e precisa dela para duas coisas:
 * o canal ao vivo (`zapintel:<empresa>`) e o preview do superadmin, que o
 * banco não enxerga por não ler cookie. Para os demais usuários o banco ignora
 * este número e usa a empresa da sessão — mandar sempre é inofensivo.
 */
const EmpresaContext = createContext<number | null>(null);
export const useEmpresaZapintel = () => useContext(EmpresaContext);

export default function Providers({ children, empresaId }: { children: React.ReactNode; empresaId?: number }) {
  return (
    <EmpresaContext.Provider value={empresaId ?? null}>
      <LeadProvider>{children}</LeadProvider>
    </EmpresaContext.Provider>
  );
}
