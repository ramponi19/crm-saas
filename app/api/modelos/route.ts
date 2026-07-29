import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi, requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { decifrarToken } from '@/lib/canais/crypto'
import { criarModelo, listarModelos, statusDoModelo, metaConfigurada, ehErro } from '@/lib/canais/meta'

// Busca o canal de WhatsApp da empresa com o token já decifrado.
// Fica aqui (servidor) porque o token nunca pode chegar ao navegador.
async function canalWhatsApp(empresaId: number) {
  const svc = createServiceClient()
  const { data } = await svc
    .from('canais_conectados')
    .select('id, waba_id, external_id, access_token_enc, status')
    .eq('empresa_id', empresaId).eq('tipo', 'whatsapp')
    .order('conectado_em', { ascending: false }).limit(1)
  const c = data?.[0]
  if (!c?.waba_id || !c.access_token_enc) return null
  try {
    return { wabaId: String(c.waba_id), token: decifrarToken(c.access_token_enc) }
  } catch {
    return null
  }
}

/** Lista os modelos. `?sync=1` confere o estado da análise na Meta antes. */
export async function GET(req: Request) {
  try {
    const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
    if (auth.error) return auth.error
    const { supabase, empresaId } = auth
    const sincronizar = new URL(req.url).searchParams.get('sync') === '1'

    if (sincronizar) {
      const canal = await canalWhatsApp(empresaId)
      if (canal) {
        const naMeta = await listarModelos(canal.wabaId, canal.token)
        if (!ehErro(naMeta)) {
          const svc = createServiceClient()
          const agora = new Date().toISOString()
          for (const t of naMeta.modelos) {
            // A Meta é a fonte da verdade do status; o corpo também pode ter sido
            // ajustado por ela. Casa por (empresa, nome, idioma).
            await svc.from('modelos_mensagem').upsert({
              empresa_id: empresaId, nome: t.nome, idioma: t.idioma,
              categoria: t.categoria || 'UTILITY', corpo: t.corpo,
              status: statusDoModelo(t.status), motivo_recusa: t.motivo,
              meta_id: t.metaId, ultima_sync_em: agora, updated_at: agora,
            }, { onConflict: 'empresa_id,nome,idioma' })
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('modelos_mensagem')
      .select('id, nome, idioma, categoria, corpo, variaveis, status, motivo_recusa, ultima_sync_em, created_at')
      .eq('empresa_id', empresaId)
      .order('status')
      .order('nome')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const canal = await canalWhatsApp(empresaId)
    return NextResponse.json({
      modelos: data ?? [],
      // Sem WhatsApp conectado não há onde submeter modelo — a tela explica isso
      // em vez de deixar o usuário criar algo que nunca sai do rascunho.
      whatsappConectado: !!canal,
      metaPronta: metaConfigurada(),
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** Cria o modelo na Meta e guarda o espelho. */
export async function POST(req: Request) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId } = auth

    const { nome, corpo, categoria, idioma, variaveis, exemplos } = (await req.json()) as {
      nome?: string; corpo?: string; categoria?: string; idioma?: string
      variaveis?: string[]; exemplos?: string[]
    }
    if (!nome || !corpo) {
      return NextResponse.json({ error: 'Nome e texto do modelo são obrigatórios.' }, { status: 400 })
    }

    // Regra da Meta: minúsculas, números e underscore. Normaliza em vez de recusar.
    const nomeMeta = nome.trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
    if (!nomeMeta) return NextResponse.json({ error: 'O nome precisa ter letras ou números.' }, { status: 400 })

    const canal = await canalWhatsApp(empresaId)
    if (!canal) {
      return NextResponse.json(
        { error: 'Conecte o WhatsApp em Canais antes de criar modelos — é a Meta que aprova cada um.' },
        { status: 409 },
      )
    }

    const usadas = (corpo.match(/\{\{\d+\}\}/g) ?? []).length
    if (usadas && (!exemplos || exemplos.length < usadas)) {
      return NextResponse.json(
        { error: `Preencha um exemplo para cada variável (${usadas} no texto). A Meta recusa modelo sem exemplo.` },
        { status: 400 },
      )
    }

    const resp = await criarModelo(canal.wabaId, canal.token, {
      nome: nomeMeta,
      idioma: idioma || 'pt_BR',
      categoria: categoria || 'UTILITY',
      corpo,
      exemplos,
    })
    if (ehErro(resp)) return NextResponse.json({ error: resp.erro }, { status: 502 })

    const svc = createServiceClient()
    const agora = new Date().toISOString()
    const { data, error } = await svc.from('modelos_mensagem').upsert({
      empresa_id: empresaId, nome: nomeMeta, idioma: idioma || 'pt_BR',
      categoria: categoria || 'UTILITY', corpo,
      variaveis: variaveis ?? [], status: statusDoModelo(resp.status),
      meta_id: resp.metaId, ultima_sync_em: agora, updated_at: agora, motivo_recusa: null,
    }, { onConflict: 'empresa_id,nome,idioma' }).select('id, nome, status').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true, modelo: data,
      aviso: 'Modelo enviado para análise da Meta. A aprovação costuma sair em minutos, mas pode levar até 24h.',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Erro interno' }, { status: 500 })
  }
}
