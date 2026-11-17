import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { aplicarPreset, lerPreset } from '@/lib/presets'
import { enviarEmail, emailBoasVindas, emailConfirmacao } from '@/lib/email'
import { excedeuLimite } from '@/lib/rate-limit'
import { slugValido } from '@/lib/slug-publico'
import { soDigitos } from '@/lib/documento'
import { erroCnpj, erroTelefone, mascaraCnpj, mascaraTelefone } from '@/lib/mascaras'
import { origemDaRequisicao, registrarAceite, versoesVigentes } from '@/lib/termos'

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

// local@dominio.tld, sem espaço; o Auth recusa o resto.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** Slug da empresa: nome + 8 caracteres do id do usuário, no formato de lib/slug-publico (3–40). */
function slugDaEmpresa(nomeEmpresa: string, userId: string): string {
  const sufixo = userId.slice(0, 8).toLowerCase()
  const base = (slugify(nomeEmpresa) || 'loja').slice(0, 31).replace(/-+$/, '') || 'loja'
  const slug = `${base}-${sufixo}`
  return slugValido(slug) ? slug : `loja-${sufixo}`
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: Request) {
  const svc = createServiceClient()

  /**
   * Teto por origem.
   *
   * Esta rota cria usuário com `email_confirm: true` e a empresa junto — e passa
   * por fora do rate limit do signUp do Supabase de propósito (ver o docblock
   * acima). Sem teto, um script criava tenants confirmados sem parar: empresa,
   * funil, etapas e motivos de perda a cada chamada. Cinco por hora é folgado para
   * quem está de fato se cadastrando e inviável para quem está automatizando.
   */
  if (await excedeuLimite(svc, 'register', req, 5)) {
    return NextResponse.json(
      { error: 'Muitas tentativas de cadastro. Tente novamente em alguns minutos.' },
      { status: 429 },
    )
  }

  let body: {
    email?: string; password?: string; nomeUsuario?: string
    nomeEmpresa?: string; cnpj?: string; telefone?: string; plano?: string
    segmento?: string; aceite?: boolean
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

  if (email.length > 254 || !EMAIL.test(email)) return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres' }, { status: 400 })
  if (!nomeUsuario) return NextResponse.json({ error: 'Informe seu nome' }, { status: 400 })
  if (!nomeEmpresa) return NextResponse.json({ error: 'Informe o nome da loja' }, { status: 400 })
  // CNPJ e telefone são opcionais; preenchidos, têm de valer (17/11/2026 — a tela já confere, aqui é a regra).
  const erroDoc = erroCnpj(body.cnpj) ?? erroTelefone(body.telefone)
  if (erroDoc) return NextResponse.json({ error: erroDoc }, { status: 400 })
  // Termos e privacidade com versão definida (lib/termos.ts): o cadastro só segue com o aceite.
  if (versoesVigentes() && body.aceite !== true) return NextResponse.json({ error: 'Aceite os termos de uso e a política de privacidade para continuar.' }, { status: 400 })
  const cnpj = soDigitos(body.cnpj) ? mascaraCnpj(body.cnpj ?? '') : null
  const telefone = soDigitos(body.telefone) ? mascaraTelefone(body.telefone ?? '') : null

  // 1) cria o usuário de auth já confirmado (sem e-mail, sem rate limit)
  // CONFIRMAÇÃO DE E-MAIL (17/11/2026, pronta e DESLIGADA): com EXIGIR_CONFIRMACAO_EMAIL=1 o login só vale
  // depois de abrir o link mandado pelo provedor (lib/email.ts). Espera a decisão (b) do Lucas: provedor e
  // domínio — sem eles o link não chega, e por isso o padrão segue "confirmado no cadastro".
  const exigirConfirmacao = process.env.EXIGIR_CONFIRMACAO_EMAIL === '1'
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: !exigirConfirmacao,
    user_metadata: { nome: nomeUsuario },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message || ''
    if (/already|exist|registered|duplicate/i.test(msg)) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado. Faça login ou use outro.' }, { status: 409 })
    }
    console.error('[register] criar usuário:', msg)
    return NextResponse.json({ error: 'Não foi possível criar o usuário. Tente novamente.' }, { status: 500 })
  }
  const userId = created.user.id

  // valida plano (fallback: free)
  const { data: planoRow } = await svc
    .from('planos_config')
    .select('id, limite_usuarios, limite_leads')
    .eq('id', body.plano || '')
    .maybeSingle()
  const planoId = planoRow?.id ?? 'free'

  const slug = slugDaEmpresa(nomeEmpresa, userId)
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  // O preset escolhido (presets_onboarding): a ficha de partida da empresa. É o
  // único lugar do app, fora das ferramentas do superadmin, que o lê.
  const preset = await lerPreset(svc, body.segmento)
  if (!preset) {
    await svc.auth.admin.deleteUser(userId)
    console.error('[register] nenhum preset ativo no banco')
    return NextResponse.json({ error: 'Não foi possível criar a empresa. Tente novamente.' }, { status: 500 })
  }

  // 2) empresa
  const { data: empresa, error: empErr } = await svc
    .from('empresas')
    .insert({
      nome: nomeEmpresa,
      slug,
      plano: planoId,
      // Só o registro de qual preset foi usado no cadastro: nada no app lê isto
      // para decidir tela (29/10/2026).
      preset_onboarding: preset.chave,
      status: 'ativo',
      cnpj,
      telefone,
      trial_ends_at: trialEnds,
      limite_usuarios: planoRow?.limite_usuarios ?? null,
      limite_leads: planoRow?.limite_leads ?? null,
    })
    .select('id')
    .single()
  if (empErr || !empresa) {
    await svc.auth.admin.deleteUser(userId) // rollback: não deixa usuário órfão
    console.error('[register] criar empresa:', empErr?.message)
    return NextResponse.json({ error: 'Não foi possível criar a empresa. Tente novamente.' }, { status: 500 })
  }

  // White-label da empresa: o WhatsApp de contato nasce igual ao telefone, como era
  // em empresas.wl_whatsapp (empresa_branding desde 22/10/2026). Falhar aqui não
  // impede o cadastro: o dono preenche em "Minha empresa".
  const { error: brErr } = await svc.from('empresa_branding').insert({ empresa_id: empresa.id, whatsapp: telefone })
  if (brErr) console.error('[register] branding:', brErr.message)

  // rollback completo: evita órfãos em qualquer falha após criar a empresa
  const rollback = async () => {
    await svc.from('empresa_usuarios').delete().eq('empresa_id', empresa.id)
    await svc.from('filiais').delete().eq('empresa_id', empresa.id)
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
    console.error('[register] criar perfil:', usrErr.message)
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, { status: 500 })
  }

  // 4) a loja principal (17/11/2026: a empresa nascia sem loja nenhuma) e o vínculo owner nela
  //    (empresa_usuarios não tem trigger de bloqueio). Sem a loja, o cadastro desfaz tudo.
  const { data: loja, error: lojaErr } = await svc
    .from('filiais')
    .insert({ empresa_id: empresa.id, nome: nomeEmpresa, matriz: true, ativo: true, cnpj, telefone })
    .select('id')
    .single()
  if (lojaErr || !loja) {
    await rollback()
    console.error('[register] criar loja principal:', lojaErr?.message)
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, { status: 500 })
  }
  const { error: vinErr } = await svc
    .from('empresa_usuarios')
    .insert({ empresa_id: empresa.id, usuario_id: userId, role: 'owner', ativo: true, filial_id: loja.id })
  if (vinErr) {
    await rollback()
    console.error('[register] vincular usuário:', vinErr.message)
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, { status: 500 })
  }

  // 4b) o aceite dos termos (só com as versões definidas): grava versão, quando, IP e navegador.
  const { error: aceiteErr } = await registrarAceite(svc, { usuarioId: userId, empresaId: empresa.id, ...origemDaRequisicao(req) })
  if (aceiteErr) console.error('[register] aceite dos termos:', aceiteErr)

  /**
   * 5) o preset vira da empresa: base do menu (tela inicial e vocabulário juntos),
   * módulos, campos de partida, funil e motivos de perda (lib/presets.ts).
   *
   * Os motivos importam desde o primeiro dia: marcar lead como perdido EXIGE
   * motivo, e empresa nascida sem nenhum deixava o modal de perda vazio — porta
   * trancada. Só a base derruba o cadastro se falhar (sem ela o menu cai para o
   * núcleo); o resto vai para o log e a loja completa à mão.
   */
  const { error: presetErr } = await aplicarPreset(svc, empresa.id, preset)
  if (presetErr) {
    await rollback()
    console.error('[register] aplicar preset:', presetErr)
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, { status: 500 })
  }

  // 6) e-mail: com confirmação ligada, o link de confirmar; senão, as boas-vindas (não-bloqueante).
  if (exigirConfirmacao) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
    const { data: link } = await svc.auth.admin.generateLink({ type: 'signup', email, password, options: { redirectTo: `${base}/entrar` } })
    const acao = link?.properties?.action_link
    if (acao) await enviarEmail({ to: email, ...emailConfirmacao(nomeUsuario, acao) })
    return NextResponse.json({ ok: true, empresaId: empresa.id, confirmarEmail: true })
  }
  const { subject, html } = emailBoasVindas(nomeUsuario, nomeEmpresa)
  enviarEmail({ to: email, subject, html }).catch(() => {/* stub/no-op sem provider */})

  return NextResponse.json({ ok: true, empresaId: empresa.id })
}
