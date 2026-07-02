import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizarSegmento } from '@/lib/segmentos'

/**
 * Bootstrap de cadastro (self-service), 100% no servidor via service client.
 *
 * Cria o usuário de auth pelo Admin API (email_confirm: true) — NÃO envia
 * e-mail e NÃO passa pelo rate limit do signUp público — e em seguida cria
 * empresa + vínculo (owner), bypassando a RLS com segurança. Em caso de falha
 * na criação da empresa, faz rollback do usuário de auth (evita órfãos).
 *
 * O cliente, após o sucesso, faz signInWithPassword para obter a sessão.
 */

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: Request) {
  const svc = createServiceClient()

  let body: {
    email?: string; password?: string; nomeUsuario?: string
    nomeEmpresa?: string; cnpj?: string; telefone?: string; plano?: string
    segmento?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const nomeUsuario = (body.nomeUsuario || '').trim()
  const nomeEmpresa = (body.nomeEmpresa || '').trim()

  if (!email.includes('@')) return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres' }, { status: 400 })
  if (!nomeUsuario) return NextResponse.json({ error: 'Informe seu nome' }, { status: 400 })
  if (!nomeEmpresa) return NextResponse.json({ error: 'Informe o nome da loja' }, { status: 400 })

  // 1) cria o usuário de auth já confirmado (sem e-mail, sem rate limit)
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: nomeUsuario },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message || ''
    if (/already|exist|registered|duplicate/i.test(msg)) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado. Faça login ou use outro.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro ao criar usuário: ' + msg }, { status: 500 })
  }
  const userId = created.user.id

  // valida plano (fallback: free)
  const { data: planoRow } = await svc
    .from('planos_config')
    .select('id, limite_usuarios, limite_leads')
    .eq('id', body.plano || '')
    .maybeSingle()
  const planoId = planoRow?.id ?? 'free'

  const slug = `${slugify(nomeEmpresa) || 'loja'}-${userId.slice(0, 8)}`
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  // 2) empresa
  const { data: empresa, error: empErr } = await svc
    .from('empresas')
    .insert({
      nome: nomeEmpresa,
      slug,
      plano: planoId,
      segmento: normalizarSegmento(body.segmento),
      status: 'ativo',
      cnpj: body.cnpj || null,
      telefone: body.telefone || null,
      wl_whatsapp: body.telefone || null,
      trial_ends_at: trialEnds,
      limite_usuarios: planoRow?.limite_usuarios ?? null,
      limite_leads: planoRow?.limite_leads ?? null,
    })
    .select('id')
    .single()
  if (empErr || !empresa) {
    await svc.auth.admin.deleteUser(userId) // rollback: não deixa usuário órfão
    return NextResponse.json({ error: 'Erro ao criar empresa: ' + (empErr?.message ?? 'desconhecido') }, { status: 500 })
  }

  // rollback completo: evita órfãos em qualquer falha após criar a empresa
  const rollback = async () => {
    await svc.from('empresa_usuarios').delete().eq('empresa_id', empresa.id)
    await svc.from('empresas').delete().eq('id', empresa.id)
    await svc.auth.admin.deleteUser(userId)
  }

  // 3) perfil do usuário — NÃO tocar em `role`: o trigger prevent_privilege_escalation
  //    bloqueia mudança de role quando auth.uid() é nulo (contexto service). A
  //    autorização real vem de empresa_usuarios.role = 'owner' (passo 4).
  const { error: usrErr } = await svc
    .from('usuarios')
    .upsert({ id: userId, nome: nomeUsuario, email }, { onConflict: 'id' })
  if (usrErr) {
    await rollback()
    return NextResponse.json({ error: 'Erro ao criar perfil: ' + usrErr.message }, { status: 500 })
  }

  // 4) vínculo owner (empresa_usuarios não tem trigger de bloqueio)
  const { error: vinErr } = await svc
    .from('empresa_usuarios')
    .insert({ empresa_id: empresa.id, usuario_id: userId, role: 'owner', ativo: true })
  if (vinErr) {
    await rollback()
    return NextResponse.json({ error: 'Erro ao vincular usuário: ' + vinErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, empresaId: empresa.id })
}
