import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { cifrarToken } from '@/lib/canais/crypto'
import {
  trocarCodigoPorToken, inspecionarToken, assinarWaba, statusDoNumero,
  sincronizarAppDoCelular, numerosDaWaba, metaConfigurada, ehErro,
} from '@/lib/canais/meta'

/**
 * Conecta o WhatsApp do cliente por Coexistência: o número segue no app do
 * celular E passa a funcionar no CRM.
 *
 * Recebe do navegador o que o fluxo da Meta devolveu: o código de troca, o id da
 * conta WhatsApp e o id do número. O token nunca passa pelo navegador — é
 * trocado aqui e gravado cifrado.
 *
 * A ordem importa e não é arbitrária:
 *   1. troca o código pelo token do cliente
 *   2. grava (assim uma falha depois não perde a conexão)
 *   3. assina o webhook  — sem isso não chega mensagem nenhuma
 *   4. confirma a coexistência
 *   5. dispara as sincronizações de contatos e histórico
 *
 * O passo 5 tem prazo de 24h e é de TIRO ÚNICO por cliente, então roda aqui,
 * automático, e não num botão que alguém pode esquecer de apertar.
 * Registro de número (`/register`) NÃO é chamado: na coexistência o número já
 * vem registrado do app, e não existe PIN.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId } = auth

    if (!metaConfigurada()) {
      return NextResponse.json({ error: 'Integração Meta não configurada no servidor.' }, { status: 503 })
    }

    const body = (await req.json()) as { code?: string; wabaId?: string; phoneNumberId?: string }
    const { code, wabaId } = body
    if (!code || !wabaId) {
      return NextResponse.json(
        { error: 'Conexão incompleta. Refaça o processo pelo botão Conectar.' },
        { status: 400 },
      )
    }

    // 1. código → token do cliente
    const troca = await trocarCodigoPorToken(code)
    if (ehErro(troca)) return NextResponse.json({ error: troca.erro }, { status: 502 })

    // O fluxo de coexistência às vezes devolve só o id da CONTA. Sem o id do
    // número não há roteamento nem envio, então busca na conta quando faltar.
    let phoneNumberId = body.phoneNumberId
    if (!phoneNumberId) {
      const nums = await numerosDaWaba(String(wabaId), troca.token)
      if (ehErro(nums) || !nums.numeros.length) {
        return NextResponse.json(
          { error: 'Conectou na Meta, mas nenhum número foi encontrado na conta. Verifique o número no WhatsApp Manager.' },
          { status: 502 },
        )
      }
      // Prefere o número que está no app do celular — é o da coexistência.
      phoneNumberId = (nums.numeros.find((n) => n.noApp) ?? nums.numeros[0]).id
    }

    const info = await inspecionarToken(troca.token)
    const validade = ehErro(info) ? null : info

    // 2. grava antes de qualquer outra chamada
    const svc = createServiceClient()
    const { data: canal, error: erroGravar } = await svc
      .from('canais_conectados')
      .upsert(
        {
          empresa_id: empresaId,
          tipo: 'whatsapp',
          external_id: String(phoneNumberId),
          waba_id: String(wabaId),
          access_token_enc: cifrarToken(troca.token),
          token_expira_em: validade?.expiraEm ?? null,
          data_access_expira_em: validade?.acessoDadosExpiraEm ?? null,
          status: 'ativo',
          ultimo_erro: null,
          ultimo_erro_em: null,
          conectado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tipo,external_id' },
      )
      .select('id')
      .single()

    if (erroGravar) {
      // Chave única (tipo, external_id): número já usado por OUTRA empresa.
      const conflito = erroGravar.code === '23505' || /duplicate|unique/i.test(erroGravar.message)
      return NextResponse.json(
        {
          error: conflito
            ? 'Este número já está conectado em outra conta do sistema.'
            : erroGravar.message,
        },
        { status: conflito ? 409 : 500 },
      )
    }

    const avisos: string[] = []

    // 3. assinar o webhook da conta WhatsApp — sem isso nada chega
    const assinou = await assinarWaba(String(wabaId), troca.token)
    if (ehErro(assinou)) {
      await svc.from('canais_conectados')
        .update({ status: 'erro', ultimo_erro: assinou.erro, ultimo_erro_em: new Date().toISOString() })
        .eq('id', canal.id)
      return NextResponse.json(
        { error: `Conectado, mas o recebimento não foi ativado: ${assinou.erro}` },
        { status: 502 },
      )
    }

    // 4. confirmar coexistência
    const status = await statusDoNumero(String(phoneNumberId), troca.token)
    let coexistencia = false
    let nome: string | null = null
    if (!ehErro(status)) {
      coexistencia = status.coexistencia
      nome = status.numero ? `${status.numero}${status.nomeVerificado ? ` · ${status.nomeVerificado}` : ''}` : null
      if (!coexistencia) {
        avisos.push(
          'O número conectou, mas a Meta ainda não confirmou o modo coexistência. ' +
            'Se o WhatsApp do celular parar de funcionar, fale com o suporte antes de mexer.',
        )
      }
    }

    // 5. sincronizações — 24h de prazo, uma chamada só cada
    const requestIds: Record<string, string | null> = {}
    const contatos = await sincronizarAppDoCelular(String(phoneNumberId), troca.token, 'smb_app_state_sync')
    if (ehErro(contatos)) avisos.push(`Contatos não sincronizados: ${contatos.erro}`)
    else requestIds.contatos = contatos.requestId

    const historico = await sincronizarAppDoCelular(String(phoneNumberId), troca.token, 'history')
    if (ehErro(historico)) avisos.push(`Histórico não solicitado: ${historico.erro}`)
    else requestIds.historico = historico.requestId

    await svc.from('canais_conectados').update({
      coexistencia,
      nome_exibicao: nome,
      sync_request_ids: requestIds,
      sync_contatos_em: requestIds.contatos ? new Date().toISOString() : null,
    }).eq('id', canal.id)

    return NextResponse.json({
      success: true,
      coexistencia,
      nome,
      avisos,
      // O cliente precisa saber disso na hora, senão acha que travou:
      instrucao: 'Deixe o WhatsApp aberto no celular por alguns minutos — é assim que os contatos e as conversas dos últimos 6 meses são copiados para o CRM.',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Erro interno' }, { status: 500 })
  }
}
