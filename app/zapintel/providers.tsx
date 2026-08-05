"use client";
import { LeadProvider } from "@/hooks/zapintel/useLeads";
export default function Providers({ children }: { children: React.ReactNode }) {
  return <LeadProvider>{children}</LeadProvider>;
}
