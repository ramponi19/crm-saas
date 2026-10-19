import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import type { OfficialConfig } from '@/lib/whatsapp/types'
import { semSegredos } from '@/lib/segredos'

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

  // Token, secret, key e senha não vão para o navegador: só o nome dos que estão
  // preenchidos, para a tela mostrar "configurado" (lib/segredos.ts).
  const ler = (chave: string) => semSegredos(configs?.find(d => d.chave === chave)?.valor ?? null)
  const official     = ler('whatsapp_official')
  const instagram    = ler('meta_instagram')
  const messenger    = ler('meta_messenger')
  const dadosLoja    = ler('dados_loja').valor
  const preferencias = ler('preferencias').valor

  return {
    official: (official.valor ?? null) as OfficialConfig | null,
    instagram: instagram.valor as MetaConfig | null,
    messenger: messenger.valor as MetaConfig | null,
    configurados: { whatsapp: official.configurados, instagram: instagram.configurados, messenger: messenger.configurados },
    dadosLoja, preferencias,
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
  const { official, instagram, messenger, configurados, dadosLoja, preferencias, taxas, segmento, slug } = await getConfigs()

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Configurações" />
      <ConfiguracoesView
        official={official}
        instagram={instagram}
        messenger={messenger}
        configurados={configurados}
        dadosLoja={dadosLoja}
        preferencias={preferencias}
        taxas={taxas}
        segmento={segmento}
        slug={slug}
      />
    </>
  )
}
