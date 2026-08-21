import { headers } from 'next/headers'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrCreatePortalToken } from '@/lib/portal-token'
import { carregarConfig, getOrCreateTokenEntrada } from '@/lib/c2s'
import type { EstadoC2S, EventoIntegracao } from '@/components/modules/integracoes/c2s-card'
import IntegracoesView from './integracoes-view'

export const metadata = { title: 'Integrações' }

export default async function IntegracoesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const svc = createServiceClient()

  const [{ data: empresa }, token, { data: importCfg }, cfgC2S, entradaC2S, { data: eventosC2S }] = await Promise.all([
    supabase.from('empresas').select('slug, segmento').eq('id', empresaId).single(),
    getOrCreatePortalToken(svc, empresaId),
    svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'import_imoveis').maybeSingle(),
    /**
     * Contact2Sale: estado da ligação e os últimos eventos.
     *
     * O token DELES não vem para cá nem cifrado — a tela só precisa saber se existe.
     * O token de ENTRADA vem, porque ele é parte da URL que o lojista copia.
     */
    carregarConfig(svc, empresaId),
    getOrCreateTokenEntrada(svc, empresaId),
    svc.from('integracao_eventos')
      .select('id, acao, status, lead_id, detalhes, created_at')
      .eq('empresa_id', empresaId).eq('origem', 'contact2sale')
      .order('created_at', { ascending: false }).limit(20),
  ])

  const cfg = (importCfg?.valor as { feed_url?: string; ultima_importacao?: string } | null) ?? null

  /**
   * Base da URL do webhook.
   *
   * Sai do env porque o C2S guarda o endereço do lado DELE: precisa ser o domínio
   * definitivo, não o host da requisição em que a tela foi aberta — abrir o painel
   * por um domínio de preview registraria o webhook apontando para o preview.
   */
  const envBase = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const limpo = envBase.endsWith('/') ? envBase.slice(0, -1) : envBase
  /**
   * Fallback pelo host da requisicao.
   *
   * A variavel de ambiente e a preferencia — o C2S guarda este endereco do lado
   * DELE, entao tem de ser o dominio definitivo. Mas em ambiente local ela aponta
   * para localhost, e na Vercel pode nao existir: sem fallback a tela mostraria uma
   * URL vazia e o lojista copiaria um endereco quebrado.
   */
  const h = await headers()
  const hostReq = h.get('host')
  const baseUrl = limpo && !limpo.includes('localhost')
    ? limpo
    : hostReq ? 'https://' + hostReq : limpo

  return (
    <IntegracoesView
      slug={empresa?.slug ?? ''}
      segmento={empresa?.segmento ?? ''}
      token={token}
      feedUrlInicial={cfg?.feed_url ?? ''}
      ultimaImportacao={cfg?.ultima_importacao ?? null}
      appId={process.env.NEXT_PUBLIC_META_APP_ID ?? ''}
      c2s={{
        temToken: !!cfgC2S.token,
        assinaturas: cfgC2S.assinaturas ?? [],
        assinadoEm: cfgC2S.assinado_em ?? null,
        urlWebhook: `${baseUrl}/api/webhook/c2s/${empresa?.slug ?? ''}?token=${entradaC2S}`,
      } satisfies EstadoC2S}
      eventosC2S={(eventosC2S ?? []) as EventoIntegracao[]}
    />
  )
}
