import { entrarNaEmpresaDePreview } from '@/lib/superadmin-preview'

/**
 * Entra na empresa de LABORATÓRIO para construir tela nova — a mesma empresa do
 * preview de preset, sem trocar a base dela: quem está construindo quer a
 * empresa como está. O trabalho mora em lib/superadmin-preview.ts.
 */
export async function POST() {
  return entrarNaEmpresaDePreview(null)
}
