import { entrarNaEmpresaDePreview } from '@/lib/superadmin-preview'

/**
 * Entra na empresa de LABORATÓRIO para construir tela nova — a mesma empresa do
 * preview de segmento, sem trocar o segmento dela: quem está construindo quer o
 * segmento como está. O trabalho mora em lib/superadmin-preview.ts.
 */
export async function POST() {
  return entrarNaEmpresaDePreview(null)
}
