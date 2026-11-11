import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi, requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { metaConfigurada } from '@/lib/canais/meta'
import { criarEmTodosOsNumeros, numerosWhatsApp, sincronizarModelos } from '@/lib/canais/modelos-waba'

/**
 * Lista os modelos. `?sync=1` confere o estado da análise na Meta antes — em CADA número de
 * WhatsApp da empresa (11/11/2026: o status é por WABA; `numeros` diz onde cada um está aprovado).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
    if (auth.error) return auth.error
    const { supabase, empresaId } = auth
    const svc = createServiceClient()
    const sincronizar = new URL(req.url).searchParams.get('sync') === '1'
    let errosSync: string[] = []
    if (sincronizar) errosSync = (await sincronizarModelos(svc, empresaId)).erros

    const [{ data, error }, { data: porNumero }, numeros, { data: filiais }] = await Promise.all([
      supabase.from('modelos_mensagem')
        .select('id, nome, idioma, categoria, corpo, variaveis, status, motivo_recusa, ultima_sync_em, created_at')
        .eq('empresa_id', empresaId).order('status').order('nome'),
      supabase.from('modelos_mensagem_wabas').select('modelo_id, waba_id, status, motivo_recusa').eq('empresa_id', empresaId),
      numerosWhatsApp(svc, empresaId),
      svc.from('filiais').select('id, nome').eq('empresa_id', empresaId),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Nome do número = as lojas que enviam por ele (o waba_id não diz nada ao lojista).
    const nomeLoja = new Map(((filiais ?? []) as { id: number; nome: string }[]).map((f) => [f.id, f.nome]))
    const rotulo = new Map(numeros.map((n) => [n.wabaId,
      n.filiais.map((f) => (f == null ? 'Empresa' : nomeLoja.get(f) ?? `Loja ${f}`)).join(', ')]))
    const modelos = (data ?? []).map((m) => ({
      ...m,
      numeros: numeros.map((n) => {
        const r = ((porNumero ?? []) as { modelo_id: number; waba_id: string; status: string; motivo_recusa: string | null }[])
          .find((x) => x.modelo_id === m.id && x.waba_id === n.wabaId)
        return { lojas: rotulo.get(n.wabaId) ?? '', status: r?.status ?? 'ausente', motivo: r?.motivo_recusa ?? null }
      }),
    }))

    return NextResponse.json({
      modelos,
      // Sem WhatsApp conectado não há onde submeter modelo — a tela explica isso
      // em vez de deixar o usuário criar algo que nunca sai do rascunho.
      whatsappConectado: numeros.length > 0,
      metaPronta: metaConfigurada(),
      errosSync,
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** Cria o modelo na Meta, em CADA número da empresa, e guarda o espelho. */
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

    const usadas = (corpo.match(/\{\{\d+\}\}/g) ?? []).length
    if (usadas && (!exemplos || exemplos.length < usadas)) {
      return NextResponse.json(
        { error: `Preencha um exemplo para cada variável (${usadas} no texto). A Meta recusa modelo sem exemplo.` },
        { status: 400 },
      )
    }

    const svc = createServiceClient()
    const r = await criarEmTodosOsNumeros(svc, empresaId, {
      nome: nomeMeta, idioma: idioma || 'pt_BR', categoria: categoria || 'UTILITY', corpo, exemplos, variaveis,
    })
    if ('erro' in r) {
      const semCanal = r.erro.startsWith('Conecte o WhatsApp')
      return NextResponse.json({ error: r.erro }, { status: semCanal ? 409 : 502 })
    }

    return NextResponse.json({
      success: true, modelo: { id: r.id, nome: nomeMeta, status: r.status },
      aviso: 'Modelo enviado para análise da Meta em cada número de WhatsApp da empresa. A aprovação costuma sair em minutos, mas pode levar até 24h.'
        + (r.erros.length ? ` Não foi aceito em: ${r.erros.join(' · ')}` : ''),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Erro interno' }, { status: 500 })
  }
}
