import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import { semSegredos } from '@/lib/segredos'
import { notFound } from 'next/navigation'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'

/**
 * UMA ABA DA ANTIGA /admin/configuracoes COMO SEÇÃO PRÓPRIA (navegação nova, 21/10/2026).
 *
 * As doze abas viraram itens do menu de Configurações (e de Automações): cada
 * uma tem endereço, e o link "ajustar horário" cai direto no horário. O conteúdo
 * é o mesmo componente de antes, com a aba fixa e sem a barra de abas; a carga é
 * a mesma que a página antiga fazia.
 *
 * Quem protege é o layout do grupo (só dono/admin), como o /admin fazia.
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
    supabase.from('empresas').select('segmento:preset_onboarding, slug').eq('id', empresaId).maybeSingle(),
  ])

  // Token, secret, key e senha não vão para o navegador (lib/segredos.ts).
  const ler = (chave: string) => semSegredos(configs?.find(d => d.chave === chave)?.valor ?? null).valor

  return {
    dadosLoja: ler('dados_loja'),
    preferencias: ler('preferencias'),
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

export async function SecaoConfiguracoes({ aba, titulo }: { aba: string; titulo: string }) {
  const dados = await carregar()
  // Portais da imobiliária e da loja de veículos são abas diferentes no mesmo lugar.
  const seg = normalizarSegmento(dados.segmento)
  const abaReal = aba === 'portais' && seg === 'concessionaria' ? 'veiculos-portais' : aba
  // Aba de segmento (portais, cardápio, agendamento) só existe onde o segmento a declara.
  const DE_SEGMENTO = ['portais', 'veiculos-portais', 'cardapio', 'agendamento']
  if (DE_SEGMENTO.includes(abaReal) && !SEGMENTOS[seg].abasExtraConfiguracoes.some((a) => a.id === abaReal)) notFound()
  return (
    <>
      <Topbar title={titulo} />
      <ConfiguracoesView {...dados} aba={abaReal} />
    </>
  )
}
