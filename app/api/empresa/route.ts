import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { temAcesso } from '@/lib/empresa-context'

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

/** Só estes campos podem ser gravados por aqui. */
const CAMPOS_IDENTIDADE = [
  'nome', 'cnpj', 'telefone', 'email',
  'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'representante_nome', 'representante_cpf',
] as const

const CAMPOS_WHITE_LABEL = ['wl_slogan', 'wl_whatsapp', 'wl_cor', 'wl_logo_url'] as const

type Campo = (typeof CAMPOS_IDENTIDADE)[number] | (typeof CAMPOS_WHITE_LABEL)[number]

export async function PATCH(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId, supabase } = auth

  const body = (await req.json().catch(() => ({}))) as Partial<Record<Campo, unknown>>

  // Plano decide o white-label; identificação não é recurso pago — é o que faz o
  // contrato ser válido.
  const { data: emp } = await supabase.from('empresas').select('plano').eq('id', empresaId).maybeSingle()
  const podeWl = temAcesso(emp?.plano as 'free' | 'starter' | 'pro' | undefined, 'white_label')

  const permitidos: Campo[] = [...CAMPOS_IDENTIDADE, ...(podeWl ? CAMPOS_WHITE_LABEL : [])]

  const patch: Record<string, string | null> = {}
  for (const campo of permitidos) {
    if (!(campo in body)) continue
    const bruto = body[campo]
    const texto = typeof bruto === 'string' ? bruto.trim() : bruto == null ? '' : String(bruto).trim()
    // UF em maiúsculas: o contrato escreve "Campinas - SP", não "- sp".
    patch[campo] = campo === 'estado' ? (texto.toUpperCase() || null) : (texto || null)
  }

  // `nome` é o único que não pode virar nulo: é como a loja aparece em todo lugar.
  if ('nome' in patch && !patch.nome) {
    return NextResponse.json({ error: 'O nome da loja não pode ficar vazio' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada a salvar' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc.from('empresas').update(patch as never).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, camposSalvos: Object.keys(patch) })
}
