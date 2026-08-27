import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { basePublica } from '@/lib/url-publica'
import {
  assinarWebhook, cifrar, ehErro, perfil, tokenLongo, trocarCodigo,
} from '@/lib/canais/instagram-login'
import { COOKIE_STATE } from '../iniciar/route'

/**
 * Volta do login do Instagram. TODO o trabalho acontece aqui, no servidor.
 *
 * Por que não na tela: hoje (27/08/2026) o conector via Página quebrou justamente
 * porque o `code` viajava na URL de uma página, e um redirecionamento pelo caminho
 * o descartou em silêncio — a Meta dizia "conectado" e o CRM não recebia nada.
 * Aqui o código nasce e morre dentro da rota; a tela só recebe "deu certo" ou o
 * motivo do erro.
 */

const voltar = (base: string, params: Record<string, string>) => {
  const p = new URLSearchParams(params)
  return NextResponse.redirect(`${base}/admin/integracoes?${p.toString()}`)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const { base } = basePublica(url.origin)

  // Recusa da Meta ou desistência do usuário: volta com a razão, sem estardalhaço.
  const erroMeta = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  if (erroMeta) return voltar(base, { ig_erro: erroMeta.slice(0, 300) })

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return voltar(base, { ig_erro: 'A Meta não devolveu o código de autorização.' })

  const jar = await cookies()
  const esperado = jar.get(COOKIE_STATE)?.value
  jar.delete(COOKIE_STATE)
  if (!esperado || !state || state !== esperado) {
    return voltar(base, { ig_erro: 'A conexão não confere com a que foi iniciada aqui. Tente de novo.' })
  }

  /**
   * O papel é conferido DEPOIS do state, e antes de qualquer chamada à Meta.
   *
   * `requireEmpresaRole` redireciona quando não há sessão — o que é o
   * comportamento certo: a volta acontece no navegador do lojista, logado.
   */
  const { empresaId, userId } = await requireEmpresaRole(['owner', 'admin'])

  const curto = await trocarCodigo(code, base)
  if (ehErro(curto)) return voltar(base, { ig_erro: curto.erro })

  const longo = await tokenLongo(curto.token)
  if (ehErro(longo)) return voltar(base, { ig_erro: longo.erro })

  /**
   * O id que vale é o que a API devolve em `/me`, não o `user_id` da troca do
   * código: é ele que aparece como `entry[].id` no webhook, e é por ele que a
   * função de borda acha o tenant. A Meta tem mais de um espaço de id para a mesma
   * conta — casar pelo errado dá canal que recebe e não pertence a ninguém.
   */
  const quem = await perfil(longo.token)
  if (ehErro(quem)) return voltar(base, { ig_erro: quem.erro })

  const svc = createServiceClient()

  /**
   * Conta já conectada em outra empresa é recusa explícita.
   *
   * Sem isto o upsert por (tipo, external_id) roubaria o canal do outro tenant —
   * e o vazamento seria silencioso, do pior tipo.
   */
  const { data: existente } = await svc.from('canais_conectados')
    .select('id, empresa_id, filial_id')
    .eq('tipo', 'instagram').eq('external_id', quem.id).maybeSingle()

  if (existente && existente.empresa_id !== empresaId) {
    return voltar(base, { ig_erro: 'Esta conta do Instagram já está conectada em outra conta do sistema.' })
  }

  const assinou = await assinarWebhook(longo.token)
  const agora = new Date().toISOString()

  const { error } = await svc.from('canais_conectados').upsert({
    empresa_id: empresaId,
    tipo: 'instagram',
    // Diz por qual caminho este canal foi conectado: decide o ENVIO (host e token).
    via: 'instagram',
    external_id: quem.id,
    ig_user_id: quem.id,
    waba_id: null,
    nome_exibicao: quem.username ? `@${quem.username}` : 'Instagram',
    access_token_enc: cifrar(longo.token),
    token_expira_em: longo.expiraEm,
    data_access_expira_em: null,
    status: ehErro(assinou) ? 'erro' : 'ativo',
    ultimo_erro: ehErro(assinou) ? assinou.erro : null,
    ultimo_erro_em: ehErro(assinou) ? agora : null,
    coexistencia: false,
    conectado_em: agora,
    updated_at: agora,
    criado_por: userId,
  } as never, { onConflict: 'tipo,external_id' })

  if (error) return voltar(base, { ig_erro: error.message })

  /**
   * Canal NOVO nasce na loja selecionada no topo; reconexão não mexe na loja.
   *
   * Mesma regra do conector via Página, e pelo mesmo motivo: a coluna dentro do
   * upsert seria sobrescrita numa reconexão, apagando a escolha do dono.
   *
   * A pergunta vai pelo cliente COM SESSÃO, não pelo service-role: `filial_atual()`
   * lê a loja escolhida a partir de `auth.uid()`, e sem sessão ela devolve nulo e a
   * função cai na matriz — o canal da Jaguariúna nasceria em Mogi.
   */
  if (!existente) {
    const sessao = await createClient()
    const { data: loja } = await sessao.rpc('filial_gravacao', { p_empresa: empresaId })
    const filial = loja as number | null
    if (filial != null) {
      await svc.from('canais_conectados').update({ filial_id: filial } as never)
        .eq('tipo', 'instagram').eq('external_id', quem.id).eq('empresa_id', empresaId)
    }
  }

  return voltar(base, ehErro(assinou)
    ? { ig_erro: `Conta conectada, mas o recebimento não foi ativado: ${assinou.erro}` }
    : { ig_ok: quem.username ?? '1' })
}
