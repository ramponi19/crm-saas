import { requireEmpresaRole } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import type { Filial } from '@/lib/filiais'
import { contarLeadsPorFilial } from '@/lib/filiais-consulta'
import FiliaisView from './filiais-view'

export const metadata = { title: 'Filiais' }

export interface ResumoFilial {
  pessoas: number
  leads: number
}

export default async function FiliaisPage() {
  const { empresaId } = await requireEmpresaRole(['owner', 'admin'])

  // Números da empresa inteira, pelo service-role — o porquê está em
  // lib/filiais-consulta.ts, que é a mesma consulta que a Visão geral usa. Duas
  // contas próprias divergiriam, e a divergência apareceria como "a tela de
  // configuração e o painel discordam de quantos leads a loja tem".
  const svc = createServiceClient()

  const [{ data: filiais }, { data: vinculos }] = await Promise.all([
    svc.from('filiais')
      .select('id, nome, matriz, ativo, cnpj, telefone, email, cep, endereco, numero, complemento, bairro, cidade, estado, representante_nome, representante_cpf')
      .eq('empresa_id', empresaId)
      .order('matriz', { ascending: false })
      .order('nome'),
    svc.from('empresa_usuarios').select('filial_id').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const lista = (filiais ?? []) as unknown as Filial[]

  /**
   * Leads ATIVOS, a mesma base da Visão geral.
   *
   * A primeira versão contava tudo, incluindo arquivado: esta tela dizia "1.033" e o
   * painel dizia "715" para a mesma loja. Duas telas discordando sobre o mesmo
   * número é pior do que qualquer uma das duas estar incompleta.
   */
  const { porFilial: leadsPorFilial, semFilial: leadsSemLoja } =
    await contarLeadsPorFilial(svc, empresaId, lista, { soAtivos: true })

  const pessoasPorFilial = new Map<number, number>()
  let pessoasSemLoja = 0
  for (const v of vinculos ?? []) {
    const id = (v as { filial_id: number | null }).filial_id
    if (id == null) pessoasSemLoja++
    else pessoasPorFilial.set(id, (pessoasPorFilial.get(id) ?? 0) + 1)
  }

  const resumo: Record<number, ResumoFilial> = {}
  for (const f of lista) {
    resumo[f.id] = { pessoas: pessoasPorFilial.get(f.id) ?? 0, leads: leadsPorFilial.get(f.id) ?? 0 }
  }

  return (
    <FiliaisView
      filiais={lista}
      resumo={resumo}
      pessoasSemLoja={pessoasSemLoja}
      leadsSemLoja={leadsSemLoja}
    />
  )
}
