import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { temAcesso, type Plano } from '@/lib/planos'

/**
 * Dados da própria empresa — identificação e white-label.
 *
 * POR QUE ISTO EXISTE, e não um update direto do navegador:
 *
 * `empresas` tem grant de UPDATE por COLUNA para `authenticated`, e só em
 * `nome, wl_cor, wl_logo_url, wl_slogan, wl_whatsapp` — o resto foi trancado numa
 * auditoria anterior, com razão: a policy de RLS (`id = get_empresa_id()`) libera
 * qualquer usuário do tenant, então sem o limite por coluna um VENDEDOR poderia
 * reescrever o CNPJ da loja.
 *
 * Consequência que passou batida: a tela "Minha empresa" salvava direto pelo
 * cliente, então gravar CNPJ e telefone dava "permission denied for column" —
 * a tela existia e não funcionava. Foi por isso que a JM seguiu com os dois
 * vazios e o contrato saiu sem identificar a vendedora.
 *
 * Aqui o servidor confere o papel (owner/admin) e grava com service role, com
 * lista fechada de campos. Nenhum grant novo para o cliente: vendedor continua
 * sem poder tocar nos dados da empresa nem por fora da tela.
 */

/**
 * Só estes campos podem ser gravados por aqui — cada grupo na sua tabela desde
 * 22/10/2026 (core v1): identificação em `empresas`, representante e banco em
 * `empresa_dados_contrato`, white-label em `empresa_branding`. A tela manda os
 * nomes de sempre.
 *
 * Até aqui a lista aceitava só `representante_nome` e `representante_cpf`: a tela
 * mandava nacionalidade, estado civil, profissão e os quatro dados do banco, e a
 * rota DESCARTAVA os sete em silêncio — o contrato saía com eles em branco por
 * mais que o dono os preenchesse.
 */
const CAMPOS_IDENTIDADE = [
  'nome', 'cnpj', 'telefone', 'email',
  'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
] as const

const CAMPOS_CONTRATO = [
  'representante_nome', 'representante_cpf', 'representante_nacionalidade', 'representante_estado_civil',
  'representante_profissao', 'banco_nome', 'banco_agencia', 'banco_conta', 'banco_pix',
] as const

/** Campo da tela -> coluna de empresa_branding. */
const CAMPOS_WHITE_LABEL = { wl_slogan: 'slogan', wl_whatsapp: 'whatsapp', wl_cor: 'cor', wl_logo_url: 'logo_url' } as const

type Campo = (typeof CAMPOS_IDENTIDADE)[number] | (typeof CAMPOS_CONTRATO)[number] | keyof typeof CAMPOS_WHITE_LABEL

export async function PATCH(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId, supabase } = auth

  const body = (await req.json().catch(() => ({}))) as Partial<Record<Campo, unknown>>

  // Plano decide o white-label; identificação não é recurso pago — é o que faz o
  // contrato ser válido.
  const { data: emp } = await supabase.from('empresas').select('plano').eq('id', empresaId).maybeSingle()
  const podeWl = temAcesso(emp?.plano as Plano | undefined, 'white_label')

  const limpar = (campo: Campo): string | null => {
    const bruto = body[campo]
    const texto = typeof bruto === 'string' ? bruto.trim() : bruto == null ? '' : String(bruto).trim()
    // UF em maiúsculas: o contrato escreve "Campinas - SP", não "- sp".
    return campo === 'estado' ? (texto.toUpperCase() || null) : (texto || null)
  }

  const empresa: Record<string, string | null> = {}
  for (const campo of CAMPOS_IDENTIDADE) if (campo in body) empresa[campo] = limpar(campo)
  const contrato: Record<string, string | null> = {}
  for (const campo of CAMPOS_CONTRATO) if (campo in body) contrato[campo] = limpar(campo)
  const branding: Record<string, string | null> = {}
  if (podeWl) {
    for (const [campo, coluna] of Object.entries(CAMPOS_WHITE_LABEL) as [keyof typeof CAMPOS_WHITE_LABEL, string][]) {
      if (campo in body) branding[coluna] = limpar(campo)
    }
  }

  // `nome` é o único que não pode virar nulo: é como a loja aparece em todo lugar.
  if ('nome' in empresa && !empresa.nome) {
    return NextResponse.json({ error: 'O nome da loja não pode ficar vazio' }, { status: 400 })
  }
  const salvos = [...Object.keys(empresa), ...Object.keys(contrato),
    ...Object.entries(CAMPOS_WHITE_LABEL).filter(([, c]) => c in branding).map(([campo]) => campo)]
  if (salvos.length === 0) {
    return NextResponse.json({ error: 'Nada a salvar' }, { status: 400 })
  }

  const svc = createServiceClient()
  const agora = new Date().toISOString()
  if (Object.keys(empresa).length) {
    const { error } = await svc.from('empresas').update(empresa as never).eq('id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (Object.keys(contrato).length) {
    const { error } = await svc.from('empresa_dados_contrato')
      .upsert({ empresa_id: empresaId, ...contrato, updated_at: agora } as never, { onConflict: 'empresa_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (Object.keys(branding).length) {
    const { error } = await svc.from('empresa_branding')
      .upsert({ empresa_id: empresaId, ...branding, updated_at: agora } as never, { onConflict: 'empresa_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, camposSalvos: salvos })
}
