import { createServiceClient } from '@/lib/supabase/service'
import { decifrarToken } from '@/lib/canais/crypto'
import { cifrar, ehErro, renovarToken } from '@/lib/canais/instagram-login'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Renovação do token do Instagram conectado por login (sem Página).
 *
 * ⚠️ SEM ISTO, TODO INSTAGRAM CAI EM 60 DIAS. O token do login do Instagram
 * expira; o da Página, não. A função `renovarToken` existia desde 27/08 e nunca
 * era chamada por ninguém — o canal da Jaguariúna estava marcado para morrer em
 * 26/10/2026, calado. O sintoma para o lojista seria "parou de chegar mensagem",
 * sem erro em tela, sem ninguém entender por quê.
 *
 * A renovação é servidor-para-servidor: o lojista não faz nada e não fica
 * sabendo que existe. É como deve ser — aviso que aparece todo dia é aviso que
 * ninguém lê no dia em que importa.
 */

/**
 * Renova com 15 DIAS DE ANTECEDÊNCIA, não na véspera.
 *
 * Renovar cedo é de graça: cada renovação reseta os 60 dias a partir do momento
 * em que acontece, então não se "perde" prazo. A margem é rede de segurança —
 * se o job falhar por deploy, instabilidade da Meta ou cron que não disparou,
 * ainda restam quinze tentativas diárias antes de o canal cair de fato.
 */
export const DIAS_DE_ANTECEDENCIA = 15

export interface ResultadoRenovacao {
  verificados: number
  renovados: number
  falhas: { canalId: number; erro: string }[]
  expirados: number
}

interface CanalRenovavel {
  id: number
  empresa_id: number
  nome_exibicao: string | null
  access_token_enc: string | null
  token_expira_em: string | null
}

/**
 * Renova os canais de Instagram-login que estão perto de vencer.
 *
 * `empresaId` limita a uma empresa — é o que a tela de Integrações usa ao abrir,
 * como segunda chance caso o agendador tenha falhado. O cron chama sem filtro.
 */
export async function renovarTokensInstagram(
  svc: Svc,
  empresaId?: number,
): Promise<ResultadoRenovacao> {
  const limite = new Date(Date.now() + DIAS_DE_ANTECEDENCIA * 86400_000).toISOString()

  let consulta = svc
    .from('canais_conectados')
    .select('id, empresa_id, nome_exibicao, access_token_enc, token_expira_em')
    .eq('tipo', 'instagram')
    .eq('via', 'instagram')
    // Canal que o lojista desconectou de propósito não volta sozinho.
    .in('status', ['ativo', 'erro'])
    .not('token_expira_em', 'is', null)
    .lt('token_expira_em', limite)
  if (empresaId != null) consulta = consulta.eq('empresa_id', empresaId)

  const { data, error } = await consulta
  if (error) throw new Error(`ler canais para renovar: ${error.message}`)

  const canais = (data ?? []) as CanalRenovavel[]
  const res: ResultadoRenovacao = { verificados: canais.length, renovados: 0, falhas: [], expirados: 0 }
  const agora = new Date()

  for (const c of canais) {
    if (!c.access_token_enc) {
      res.falhas.push({ canalId: c.id, erro: 'canal sem token guardado' })
      continue
    }

    /**
     * Token já vencido não se renova — a Meta recusa. O caminho é o lojista
     * autorizar de novo, então o canal é marcado `expirado`, que é o status que
     * a tela de Integrações já pinta de vermelho com "Reconectar".
     */
    const vencido = !!c.token_expira_em && new Date(c.token_expira_em) <= agora

    let atual: string
    try { atual = decifrarToken(c.access_token_enc) } catch {
      res.falhas.push({ canalId: c.id, erro: 'não foi possível abrir o token guardado' })
      continue
    }

    const novo = vencido ? { erro: 'O acesso ao Instagram expirou. Reconecte a conta.' } : await renovarToken(atual)

    if (ehErro(novo)) {
      /**
       * Falhar não derruba o canal enquanto houver prazo: ele segue `ativo` e
       * recebendo mensagem, com o erro anotado. Marcar como quebrado a cada
       * soluço de rede assustaria o lojista sem motivo — e ele reconectaria
       * uma conexão que estava funcionando.
       */
      await svc.from('canais_conectados').update({
        ...(vencido ? { status: 'expirado' } : {}),
        ultimo_erro: novo.erro.slice(0, 300),
        ultimo_erro_em: agora.toISOString(),
      } as never).eq('id', c.id)

      if (vencido) res.expirados++
      res.falhas.push({ canalId: c.id, erro: novo.erro })
      continue
    }

    const { error: erroGravar } = await svc.from('canais_conectados').update({
      access_token_enc: cifrar(novo.token),
      token_expira_em: novo.expiraEm,
      status: 'ativo',
      ultimo_erro: null,
      ultimo_erro_em: null,
      updated_at: agora.toISOString(),
    } as never).eq('id', c.id)

    if (erroGravar) {
      /**
       * Renovou na Meta e não gravou aqui: o token novo se perdeu, mas o ANTIGO
       * continua valendo (a Meta não invalida o anterior de imediato). Registrar
       * a falha e tentar de novo amanhã é seguro; o que não pode é ficar calado.
       */
      res.falhas.push({ canalId: c.id, erro: `renovou na Meta mas não gravou: ${erroGravar.message}` })
      continue
    }

    res.renovados++
  }

  return res
}
