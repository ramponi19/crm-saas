import { createServiceClient } from '@/lib/supabase/service'
import { editavelDoPreset } from '@/lib/presets'
import { PresetsView } from './presets-view'

export const metadata = { title: 'Segmentos' }

// Acesso já trancado por app/superadmin/layout.tsx (requireSuperAdmin).
// Os presets moram em presets_onboarding desde 21/10/2026; a tela segue com a
// mesma linha de sempre (lib/presets.ts converte nos dois sentidos).
export default async function PresetsPage() {
  const svc = createServiceClient()
  const { data } = await svc.from('presets_onboarding').select('chave, nome, descricao, rotulos, ativo')
  const linhas = ((data ?? []) as Parameters<typeof editavelDoPreset>[0][]).map(editavelDoPreset)
    .sort((a, b) => a.ordem - b.ordem || a.chave.localeCompare(b.chave))
  return <PresetsView initial={linhas} />
}
