import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { verificarLimite } from '@/lib/limites'
import { emailConvite, enviarEmail } from '@/lib/email'

// Papéis que podem ser atribuídos por esta rota. 'owner' é definido apenas
// na criação da empresa e não pode ser concedido aqui.
// 'tecnico' (17/11/2026): o papel existia na tela, na permissão e no banco, e só esta rota o recusava.
const ROLES_PERMITIDOS = ['admin', 'vendedor', 'tecnico'] as const

/**
 * Mesma regra da rota atualizar-usuario: quem chama so concede papel ABAIXO do
 * proprio. Sem isso, um admin criava outros admins (ou readmitia um ex-vendedor
 * ja como admin) e, rebaixado depois, continuava entrando como admin por eles.
 */
const HIERARQUIA: Record<string, number> = { superadmin: 4, owner: 3, admin: 2, vendedor: 1, tecnico: 1 }

/**
 * E-mail aceito pela rota. Recusa `%` e `*`, que o filtro `ilike` abaixo leria
 * como coringa (o PostgREST traduz `*` para `%`): com eles um admin descobria
 * e-mails de OUTRAS empresas pela diferenca entre as respostas.
 */
const EMAIL_VALIDO = /^[^\s@%*]+@[^\s@%*]+\.[^\s@%*]+$/

export async function POST(req: NextRequest) {
  const { nome, email, senha, role, filialId, convite } = await req.json() as
    { nome?: string; email?: string; senha?: string; role?: string; filialId?: number | null; convite?: boolean }
  // CONVITE POR E-MAIL (17/11/2026): sem senha digitada pelo dono — a pessoa recebe o link e cria a dela
  // (/reset-senha). O e-mail sai pelo provedor (lib/email.ts); sem provedor configurado, o link volta na
  // resposta para o dono repassar (decisão (b) do Lucas: provedor e domínio).
  if (!nome || !email || (!senha && !convite) || !role)
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

  // O cast existe porque `role` passou a ser tipado na desestruturacao; a
  // verificacao em si continua a mesma, feita em tempo de execucao.
  if (!ROLES_PERMITIDOS.includes(role as (typeof ROLES_PERMITIDOS)[number]))
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })

  if (!EMAIL_VALIDO.test(String(email).trim()))
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Resolve empresa_id respeitando impersonação (super admin não tem empresa_usuarios)
  const empresaId = await getEmpresaId()

  // Verifica se é super admin (tem permissão total durante impersonação)
  const { data: usuarioAtual } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  let callerRole = 'superadmin'
  if (!usuarioAtual?.is_super_admin) {
    // Usuário normal: verifica vínculo e papel
    const { data: eu } = await supabase
      .from('empresa_usuarios')
      .select('role')
      .eq('usuario_id', user.id)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .maybeSingle()

    if (!eu || !['owner', 'admin'].includes(eu.role))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    callerRole = eu.role
  }

  if ((HIERARQUIA[callerRole] ?? 0) <= (HIERARQUIA[role] ?? 0))
    return NextResponse.json({ error: 'Sem permissão para conceder este papel' }, { status: 403 })

  /**
   * Loja onde a pessoa trabalha. Nula = sem loja definida (cai na principal).
   *
   * Validada aqui, antes de qualquer escrita, porque este e o unico ponto em que a
   * pessoa nasce na empresa: cadastrar todo mundo sem loja e depois pedir para o
   * dono redistribuir a mao e trabalho que ninguem faz.
   */
  let lojaValida: number | null = null
  if (filialId != null) {
    const { data: filial } = await createServiceClient()
      .from('filiais').select('id')
      .eq('id', filialId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()
    if (!filial) return NextResponse.json({ error: 'Loja nao encontrada nesta empresa' }, { status: 400 })
    lojaValida = filialId
  }

  // Enforcement de limite de usuários do plano
  const limite = await verificarLimite(empresaId, 'usuarios')
  if (!limite.permitido) {
    return NextResponse.json(
      { error: `Limite de usuários do plano atingido (${limite.usoAtual}/${limite.limite}). Faça upgrade para adicionar mais.` },
      { status: 402 }
    )
  }

  // Service client reservado exclusivamente para a criação do usuário no Auth,
  // operação administrativa que exige a service role. Todas as demais escritas
  // usam o client autenticado para que as políticas RLS continuem valendo.
  const service = createServiceClient()

  // READMISSÃO. Remover da equipe desativa o vínculo, mas o usuário do Auth
  // continua existindo — então "criar de novo com o mesmo e-mail" falharia com
  // "e-mail já registrado" e o dono ficaria sem caminho de volta. Aqui, e-mail
  // já conhecido com vínculo INATIVO nesta empresa reativa em vez de recusar.
  const emailNormalizado = String(email).trim().toLowerCase()
  // `ilike` continua (e-mails antigos podem ter maiusculas), mas sem coringa:
  // `%` e `*` ja foram recusados acima e `_` e escapado para valer so ele mesmo.
  const { data: existente } = await service
    .from('usuarios').select('id').ilike('email', emailNormalizado.replace(/_/g, '\\_')).maybeSingle()

  if (existente?.id) {
    const { data: vinculo } = await service
      .from('empresa_usuarios').select('ativo')
      .eq('usuario_id', existente.id).eq('empresa_id', empresaId).maybeSingle()

    if (vinculo?.ativo) {
      // NOVO LINK DE ACESSO (19/11/2026): convidado cujo link venceu ou falhou pede um novo pelo mesmo
      // "Novo usuário" com convite. Só para quem é da equipe DESTA empresa e de nenhuma outra, e não é dono
      // nem superadmin: um link de acesso entra na conta inteira, e o admin daqui não pode chegar por ele
      // à empresa de outra pessoa.
      if (convite) {
        const [{ count: outras }, { data: perfil }, { data: papel }] = await Promise.all([
          service.from('empresa_usuarios').select('id', { count: 'exact', head: true })
            .eq('usuario_id', existente.id).neq('empresa_id', empresaId).eq('ativo', true),
          service.from('usuarios').select('is_super_admin').eq('id', existente.id).maybeSingle(),
          service.from('empresa_usuarios').select('role').eq('usuario_id', existente.id).eq('empresa_id', empresaId).maybeSingle(),
        ])
        // E só para quem está ABAIXO de quem pede (a mesma hierarquia da criação): admin não gera link de outro admin.
        const abaixo = (HIERARQUIA[callerRole] ?? 0) > (HIERARQUIA[papel?.role ?? 'owner'] ?? 0)
        if (!outras && !perfil?.is_super_admin && papel?.role !== 'owner' && abaixo) {
          const novo = await linkDeAcesso(service, base(req), emailNormalizado, 'recovery')
          if ('error' in novo) return NextResponse.json({ error: novo.error }, { status: 400 })
          return NextResponse.json({ ok: true, id: existente.id, convite: { enviado: false, link: novo.link }, novoLink: true })
        }
      }
      return NextResponse.json({ error: 'Este e-mail já está na equipe.' }, { status: 409 })
    }
    if (!vinculo) {
      // Existe, mas nunca foi desta empresa. Não anexo o usuário de outra conta
      // a esta loja por causa de um e-mail coincidente.
      return NextResponse.json({
        error: 'Este e-mail já pertence a outra conta do sistema. Use outro e-mail.',
      }, { status: 409 })
    }

    const { error: reErr } = await service
      .from('empresa_usuarios').update({ role, ativo: true, filial_id: lojaValida })
      .eq('usuario_id', existente.id).eq('empresa_id', empresaId)
    if (reErr) return NextResponse.json({ error: reErr.message }, { status: 400 })

    // Nome pode ter mudado; a senha NÃO é redefinida aqui — quem volta entra com
    // a que já tinha, e "esqueci a senha" resolve o resto.
    await service.from('usuarios').update({ nome }).eq('id', existente.id)
    await incluirNaDistribuicao(service, empresaId, existente.id)

    return NextResponse.json({ ok: true, id: existente.id, readmitido: true })
  }

  let linkConvite: string | null = null
  let userId: string
  if (convite) {
    const gerado = await linkDeAcesso(service, base(req), email, 'invite', nome)
    if ('error' in gerado) return NextResponse.json({ error: gerado.error }, { status: 400 })
    userId = gerado.userId
    linkConvite = gerado.link
  } else {
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    userId = authData.user.id
  }

  // O trigger on_auth_user_created (handle_new_user) já insere a linha em
  // public.usuarios assim que o usuário é criado no Auth. Portanto NÃO inserimos
  // de novo (causaria duplicate key na pkey) — apenas atualizamos os dados de
  // cadastro. Usamos o service client para não depender de timing de RLS logo
  // após a criação.
  //
  // `role` NÃO entra aqui de propósito. O papel do usuário na empresa vive em
  // `empresa_usuarios.role`, gravado logo abaixo — é de lá que todo o
  // enforcement lê (lib/owner.ts, sidebar, guards). Escrever `usuarios.role`
  // era inútil e batia no gatilho trg_prevent_privilege_escalation, que barra
  // alteração de papel para quem não é super admin: com o service client
  // `auth.uid()` é nulo, então o gatilho concluía "não é super admin" e
  // abortava. Efeito prático: criar VENDEDOR funcionava (o papel não mudava do
  // padrão) e criar ADMINISTRADOR falhava sempre com
  // "Permission denied: cannot modify role". A rota de atualizar-usuario já
  // fazia certo; esta era a fora do padrão.
  const { error: uErr } = await service
    .from('usuarios')
    .update({ nome, email })
    .eq('id', userId)
  if (uErr) {
    // Desfaz o usuário recém-criado no Auth para não deixar órfãos.
    await service.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: uErr.message }, { status: 400 })
  }

  const { error: vErr } = await supabase.from('empresa_usuarios').insert({
    empresa_id: empresaId,
    usuario_id: userId,
    role,
    ativo: true,
    filial_id: lojaValida,
  })
  if (vErr) {
    await service.from('usuarios').delete().eq('id', userId)
    await service.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: vErr.message }, { status: 400 })
  }
  await incluirNaDistribuicao(service, empresaId, userId)

  if (convite && linkConvite) {
    const { data: emp } = await service.from('empresas').select('nome').eq('id', empresaId).maybeSingle()
    const { subject, html } = emailConvite(nome, (emp as { nome?: string } | null)?.nome ?? 'sua empresa', linkConvite)
    const envio = await enviarEmail({ to: email, subject, html })
    // Sem provedor (skipped) ou com falha: o dono recebe o link para mandar ele mesmo.
    const enviado = envio.ok && !envio.skipped
    return NextResponse.json({ ok: true, id: userId, convite: { enviado, link: enviado ? null : linkConvite } })
  }
  return NextResponse.json({ ok: true, id: userId })
}

/** O endereço do app para os links (o do ambiente, senão o da própria requisição). */
function base(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
}

/**
 * LINK DE ACESSO PELO token_hash (19/11/2026). O `action_link` do Supabase volta para o app com a sessão no
 * fragmento da URL (#access_token=…), e o cliente do @supabase/ssr (fluxo PKCE) não lê fragmento: o convidado
 * caía em "Link inválido ou expirado" em /reset-senha e não entrava nunca. Agora o link vai direto para
 * /reset-senha com o `token_hash`, e a página troca por sessão com `verifyOtp` (cookie, como o resto do app).
 * `invite` cria o usuário; `recovery` é o link novo de quem já existe.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkDeAcesso(service: any, baseUrl: string, email: string, tipo: 'invite' | 'recovery', nome?: string): Promise<{ userId: string; link: string } | { error: string }> {
  const { data, error } = await service.auth.admin.generateLink(tipo === 'invite'
    ? { type: 'invite', email, options: { data: { nome }, redirectTo: `${baseUrl}/reset-senha` } }
    : { type: 'recovery', email, options: { redirectTo: `${baseUrl}/reset-senha` } })
  const hash = data?.properties?.hashed_token as string | undefined
  if (error || !data?.user || !hash) return { error: error?.message ?? 'Não foi possível gerar o link de acesso' }
  return { userId: data.user.id as string, link: `${baseUrl}/reset-senha?token_hash=${encodeURIComponent(hash)}&type=${tipo}` }
}

/**
 * 5b (26/11/2026): pessoa nova ou readmitida entra na roleta e na liberação diária da loja principal, nas lojas em que
 * essas listas estão configuradas (Configurações › Distribuição) — o mesmo que acontecia antes das listas, quando todo
 * vínculo novo "participava da roleta". Falha aqui não desfaz o cadastro: o dono ajusta pela tela.
 */
async function incluirNaDistribuicao(service: ReturnType<typeof createServiceClient>, empresaId: number | null, usuarioId: string) {
  if (!empresaId) return
  const { error } = await (service as unknown as { rpc: (f: string, a: object) => Promise<{ error: { message: string } | null }> })
    .rpc('distribuicao_incluir_pessoa', { p_empresa: empresaId, p_usuario: usuarioId })
  if (error) console.error('[criar-usuario] distribuicao_incluir_pessoa:', error.message)
}
