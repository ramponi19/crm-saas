import { createServiceClient } from '@/lib/supabase/service'
import { PLANO_BASE } from '@/lib/plano'
import { DOCUMENTOS_LEGAIS, versoesDoCadastro, type DocumentoLegal } from '@/lib/termos'
import { RegisterForm, type ResumoPlano } from './register-form'

export const metadata = { title: 'Criar conta' }
// Lido a cada visita: o resumo do plano é editável no superadmin (sem isto o build congelava o da hora do build).
export const dynamic = 'force-dynamic'

/** Se o banco não responder, o resumo segue o que a migração 20261118000100 gravou. */
const RESUMO_PADRAO: ResumoPlano = {
  nome: 'Nexus',
  precoCentavos: 19700,
  descricao: '14 dias grátis, sem cartão. Módulos extras na Central.',
  inclui: ['3 usuários', '1 número de WhatsApp, com Instagram e Messenger', '2 lojas', 'Funil de vendas', 'Comunicação', 'Tarefas', 'Automatize', 'Etiquetas'],
}

/**
 * Cadastro (18/11/2026, plano único + módulos): sem escolha de plano nem de ramo. O resumo ao lado é o
 * plano base de planos_config (editável no superadmin); o aceite dos três documentos legais é obrigatório.
 */
export default async function RegisterPage() {
  let resumo = RESUMO_PADRAO
  try {
    const { data } = await createServiceClient().from('planos_config')
      .select('nome, descricao, preco_centavos, features').eq('id', PLANO_BASE).maybeSingle()
    if (data) {
      resumo = {
        nome: data.nome,
        precoCentavos: data.preco_centavos,
        descricao: data.descricao ?? '',
        inclui: Array.isArray(data.features) ? (data.features as string[]) : [],
      }
    }
  } catch { /* fica o padrão */ }

  const versoes = versoesDoCadastro()
  const documentos = (Object.keys(DOCUMENTOS_LEGAIS) as DocumentoLegal[])
    .map((d) => ({ ...DOCUMENTOS_LEGAIS[d], versao: versoes[d] }))
  return <RegisterForm resumo={resumo} documentos={documentos} />
}
