import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import { semSegredos } from '@/lib/segredos'
import { notFound } from 'next/navigation'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { ABAS_DE_MODULO, abasDosModulos } from '@/core/modulos'

/**
 * UMA ABA DA ANTIGA /admin/configuracoes COMO SEÇÃO PRÓPRIA (navegação nova, 21/10/2026).
 *
 * As doze abas viraram itens do menu de Configurações (e de Automações): cada
 * uma tem endereço, e o link "ajustar horário" cai direto no horário. O conteúdo
 * é o mesmo componente de antes, com a aba fixa e sem a barra de abas; a carga é
 * a mesma que a página antiga fazia.
 *
 * Quem protege é o layout do grupo (só dono/admin), como o /admin fazia.
 *
 * Seção de módulo (portais, cardápio, agendamento) só existe com o módulo que a
 * traz ligado para a empresa (22/10/2026; core/modulos.ts).
 */
async function carregar() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: configs }, { data: taxas }, { data: empresa }] = await Promise.all([
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
    supabase.from('empresas').select('preset_onboarding, slug').eq('id', empresaId).maybeSingle(),
  ])
  const ligados = ligadosDaEmpresa(await carregarConfigEmpresa(supabase, empresaId, empresa?.preset_onboarding ?? null))

  // Token, secret, key e senha não vão para o navegador (lib/segredos.ts).
  const ler = (chave: string) => semSegredos(configs?.find(d => d.chave === chave)?.valor ?? null).valor

  return {
    dadosLoja: ler('dados_loja'),
    preferencias: ler('preferencias'),
    slug: empresa?.slug ?? null,
    ligados,
    taxas: ((taxas ?? []) as Array<{ forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number }>).map(t => ({
      forma_pagamento: t.forma_pagamento,
      bandeira: t.bandeira,
      parcelas: t.parcelas,
      percentual_taxa: Number(t.percentual_taxa),
    })),
  }
}

export async function SecaoConfiguracoes({ aba, titulo }: { aba: string; titulo: string }) {
  const { ligados, ...dados } = await carregar()
  const abas = abasDosModulos(ligados)
  // Portais de imóveis e de veículos moram no mesmo endereço: vale o do módulo ligado.
  const abaReal = aba === 'portais' && !abas.includes('portais') && abas.includes('veiculos-portais') ? 'veiculos-portais' : aba
  if (ABAS_DE_MODULO.includes(abaReal) && !abas.includes(abaReal)) notFound()
  return (
    <>
      <Topbar title={titulo} />
      <ConfiguracoesView {...dados} aba={abaReal} />
    </>
  )
}
