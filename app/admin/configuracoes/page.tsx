import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import type { OfficialConfig } from '@/lib/whatsapp/types'

type MetaConfig = { ativo?: boolean; page_id?: string; access_token?: string }

export const metadata = { title: 'Configurações' }

async function getConfigs() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: configs }, { data: taxas }, { data: empresa }] = await Promise.all([
    supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .eq('empresa_id', empresaId)
      .in('chave', ['whatsapp_official', 'meta_instagram', 'meta_messenger', 'dados_loja', 'preferencias']),
    supabase
      .from('taxas_pagamento')
      .select('forma_pagamento, bandeira, parcelas, percentual_taxa')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    supabase.from('empresas').select('segmento, slug').eq('id', empresaId).maybeSingle(),
  ])

  const official     = configs?.find(d => d.chave === 'whatsapp_official')?.valor as OfficialConfig | undefined
  const instagram    = (configs?.find(d => d.chave === 'meta_instagram')?.valor ?? null) as MetaConfig | null
  const messenger    = (configs?.find(d => d.chave === 'meta_messenger')?.valor ?? null) as MetaConfig | null
  const dadosLoja    = configs?.find(d => d.chave === 'dados_loja')?.valor ?? null
  const preferencias = configs?.find(d => d.chave === 'preferencias')?.valor ?? null

  return {
    official: official ?? null,
    instagram, messenger, dadosLoja, preferencias,
    segmento: empresa?.segmento ?? null,
    slug: empresa?.slug ?? null,
    taxas: ((taxas ?? []) as Array<{ forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number }>).map(t => ({
      forma_pagamento: t.forma_pagamento,
      bandeira: t.bandeira,
      parcelas: t.parcelas,
      percentual_taxa: Number(t.percentual_taxa),
    })),
  }
}

export default async function ConfiguracoesPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const { official, instagram, messenger, dadosLoja, preferencias, taxas, segmento, slug } = await getConfigs()

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Configurações" />
      <ConfiguracoesView
        official={official}
        instagram={instagram}
        messenger={messenger}
        dadosLoja={dadosLoja}
        preferencias={preferencias}
        taxas={taxas}
        segmento={segmento}
        slug={slug}
      />
    </>
  )
}
