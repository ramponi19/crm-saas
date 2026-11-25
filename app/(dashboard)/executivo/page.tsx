import { VitrineDoModulo } from '@/components/modulos/vitrine-do-modulo'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { exigirPermissao } from '@/lib/sessao'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { ExecutivoImob } from '@/components/modules/imoveis/executivo-imob'

export const metadata = { title: 'Executivo' }

/**
 * O painel do dono. Hoje ele é todo de imóvel (vendas e locações, comissão por negócio,
 * captador e vendedor), por isso o Executivo `requer: ['imoveis']` e o painel mora no módulo
 * Imóveis (components/modules/imoveis/executivo-imob.tsx — 17/11/2026, regra "o ramo só
 * dentro do seu módulo"). Só dono e admin, e só com os dois módulos ligados; desligado, a
 * vitrine (etapa 0).
 */
export default async function ExecutivoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await exigirPermissao('core.ver_relatorios')
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const ligados = ligadosDaEmpresa(await carregarConfigEmpresa(supabase, empresaId))
  if (!ligados.has('/executivo') || !ligados.has('/imoveis')) return <VitrineDoModulo href="/executivo" />

  const { tipo } = await searchParams
  return <ExecutivoImob tipo={tipo} />
}
