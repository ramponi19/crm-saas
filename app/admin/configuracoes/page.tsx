import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import { semSegredos } from '@/lib/segredos'

export const metadata = { title: 'Configurações' }

async function getConfigs() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: configs }, { data: taxas }, { data: empresa }, { data: canais }] = await Promise.all([
    supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .eq('empresa_id', empresaId)
      .in('chave', ['dados_loja', 'preferencias']),
    supabase
      .from('taxas_pagamento')
      .select('forma_pagamento, bandeira, parcelas, percentual_taxa')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    supabase.from('empresas').select('segmento, slug').eq('id', empresaId).maybeSingle(),
    // Status dos canais: a fonte é canais_conectados (o que o chat e o envio usam).
    // Chave de serviço porque a RLS de canais_conectados exige vínculo em
    // empresa_usuarios, que o superadmin impersonando não tem (a tela mostrava tudo
    // "Inativo"). Só o tipo, filtrado pela empresa da sessão; a página já exige
    // dono/admin. Sem access_token_enc: o token nunca sai do servidor.
    createServiceClient().from('canais_conectados').select('tipo').eq('empresa_id', empresaId).eq('status', 'ativo'),
  ])

  // Token, secret, key e senha não vão para o navegador (lib/segredos.ts).
  const ler = (chave: string) => semSegredos(configs?.find(d => d.chave === chave)?.valor ?? null).valor
  const dadosLoja    = ler('dados_loja')
  const preferencias = ler('preferencias')
  const conta = (tipo: string) => (canais ?? []).filter(c => c.tipo === tipo).length

  return {
    canaisAtivos: { whatsapp: conta('whatsapp'), instagram: conta('instagram'), messenger: conta('messenger') },
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
  const { canaisAtivos, dadosLoja, preferencias, taxas, segmento, slug } = await getConfigs()

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Configurações" />
      <ConfiguracoesView
        canaisAtivos={canaisAtivos}
        dadosLoja={dadosLoja}
        preferencias={preferencias}
        taxas={taxas}
        segmento={segmento}
        slug={slug}
      />
    </>
  )
}
