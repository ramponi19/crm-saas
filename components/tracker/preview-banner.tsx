import { Eye } from 'lucide-react'

/**
 * Faixa exibida quando um super admin está inspecionando os dados de outra
 * empresa (modo preview). Deixa claro o contexto e oferece a saída. Estilo
 * neutro/inline para funcionar tanto no /tracker quanto no /zapintel.
 */
export function PreviewBanner({ empresaNome, to }: { empresaNome: string; to: 'tracker' | 'zapintel' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, background: '#fef3c7', color: '#92400e',
      border: '1px solid #fcd34d', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 13,
    }}>
      <Eye size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>Modo preview (super admin)</strong> — você está vendo os dados de <strong>{empresaNome}</strong>. Ações e envios afetam a empresa real.
      </span>
      <a href={`/api/tracker/preview?clear=1&to=${to}`} style={{
        background: '#92400e', color: '#fff', borderRadius: 8, padding: '4px 12px',
        fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Sair do preview
      </a>
    </div>
  )
}
