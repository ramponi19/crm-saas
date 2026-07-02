import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Landing from './landing/Landing'
import type { PlanData } from './landing/Sections'

// Usuários já autenticados são mandados para o dashboard.
// Visitantes veem a landing page institucional.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/entrar')

  // Planos da vitrine vêm da MESMA fonte do checkout (planos_config),
  // então preço/nome/features nunca divergem do que é cobrado.
  // Leitura no servidor via service client (nunca exposto ao browser).
  let plans: PlanData[] = []
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from('planos_config')
      .select('id, nome, descricao, preco_centavos, features, destaque, ordem')
      .eq('ativo', true)
      .gt('preco_centavos', 0) // não exibe o plano Free na vitrine (segue disponível no sistema)
      .order('ordem')
    if (data) {
      plans = data.map((p) => ({
        id: p.id,
        name: p.nome,
        priceCents: p.preco_centavos,
        tagline: p.descricao ?? '',
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
        featured: !!p.destaque,
      }))
    }
  } catch {
    plans = [] // Sections cai no fallback embutido
  }

  return <Landing plans={plans} />
}
