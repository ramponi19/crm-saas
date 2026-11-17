import { after } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { renovarTokensInstagram } from '@/lib/canais/renovacao'
import { capacidades, carregarConfigEmpresa } from '@/lib/empresa-config'
import { getPortalToken } from '@/lib/portal-token'
import IntegracoesView from './integracoes-view'

export const metadata = { title: 'Integrações' }

/**
 * A TELA NÃO CRIA MAIS TOKEN NENHUM (22/10/2026).
 *
 * Abrir Integrações gerava, para qualquer empresa, o token de portal
 * (`portal_leads`) e o token de entrada do Contact2Sale, os dois em texto em
 * `configuracoes_sistema` — a JM e a Preview tinham os dois sem nunca terem usado.
 * O Contact2Sale saiu (desligado em 21/10; a rota de entrada já respondia 404) e
 * as linhas foram apagadas (06, seção 13). O token de portal nasce quando o módulo
 * Imóveis é instalado, cifrado em `empresa_segredos` (primeira migração da viagem);
 * esta tela só o lê, para o dono configurar o portal e o site.
 */
export default async function IntegracoesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const svc = createServiceClient()

  // Portais, site e importação: a capacidade `integraPortais` (do módulo Imóveis, ligado para a empresa).
  const [{ data: empresa }, cfgEmpresa] = await Promise.all([
    supabase.from('empresas').select('slug').eq('id', empresaId).single(),
    carregarConfigEmpresa(supabase, empresaId),
  ])
  const portais = !!capacidades(cfgEmpresa).integraPortais

  /**
   * Segunda chance de renovar o token do Instagram, fora do agendador.
   *
   * O cron diário é quem faz o trabalho; isto existe porque agendador falha em
   * silêncio — e esta é justamente a tela onde alguém apareceria para ver que o
   * canal caiu. Renovar aqui transforma a visita em conserto.
   *
   * Dentro de `after`: roda depois da resposta, então não segura a página. Uma
   * falha aqui não pode derrubar a tela — ela já é anotada no próprio canal.
   */
  after(async () => {
    try { await renovarTokensInstagram(svc, empresaId) }
    catch (e) { console.error('[integracoes] renovação de token falhou:', e) }
  })

  // O token nasce na instalação do Imóveis, cifrado (lib/portal-token.ts); aqui só é LIDO,
  // e só por quem já passou pela trava de Configurações (dono ou admin). A configuração da
  // importação (`import_imoveis`) também só com o módulo ligado.
  const [tokenPortal, { data: importCfg }] = portais
    ? await Promise.all([
      getPortalToken(svc, empresaId),
      svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'import_imoveis').maybeSingle(),
    ])
    : [null, { data: null }]

  const cfg = (importCfg?.valor as { feed_url?: string; ultima_importacao?: string } | null) ?? null

  return (
    <IntegracoesView
      slug={empresa?.slug ?? ''}
      portais={portais}
      tokenPortal={tokenPortal}
      feedUrlInicial={cfg?.feed_url ?? ''}
      ultimaImportacao={cfg?.ultima_importacao ?? null}
      appId={process.env.NEXT_PUBLIC_META_APP_ID ?? ''}
    />
  )
}
