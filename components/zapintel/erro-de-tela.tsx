import { AlertTriangle, RefreshCw } from "lucide-react";
import { mensagemDeErroDeTela } from "@/lib/zapintel/mensagem-erro";

/**
 * O aviso de erro das telas do ZapIntel: a frase que orienta (nunca o erro cru —
 * ver `lib/zapintel/mensagem-erro.ts`) e um botão de tentar de novo.
 *
 * Sem "use client" de propósito: só é usado dentro das telas, que já são
 * componentes de cliente — e assim pode receber funções como props.
 */
export function ErroDeTela({ erro, onTentar, className, titulo }: {
  erro: unknown;
  onTentar?: () => void;
  className?: string;
  titulo?: string;
}) {
  return (
    <div className={className} role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <AlertTriangle size={18} style={{ color: "var(--yellow)" }} />
      {titulo && <p style={{ fontSize: 14, fontWeight: 700 }}>{titulo}</p>}
      <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>{mensagemDeErroDeTela(erro)}</p>
      {onTentar && (
        <button type="button" onClick={onTentar} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", minHeight: 40,
          borderRadius: 8, border: "1px solid var(--brd2)", background: "var(--card)", color: "var(--txt)",
          fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}>
          <RefreshCw size={13} /> Tentar de novo
        </button>
      )}
    </div>
  );
}
