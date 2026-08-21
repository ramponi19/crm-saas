import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import ImoveisView from './imoveis-view'

export const metadata = { title: 'Imóveis' }

export default async function ImoveisPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: empresa } = await supabase.from('empresas').select('segmento, slug').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/dashboard')

  const [{ data: imoveis }, { data: proprietarios }, { data: equipeRaw }] = await Promise.all([
    supabase.from('imoveis').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    /**
     * Proprietário É um cliente (21/08/2026): a lista de escolha são as PESSOAS da
     * carteira, não uma tabela paralela. Quem for escolhido no imóvel ganha o papel
     * de proprietário por trigger no banco — inclusive vindo do import de portais.
     */
    supabase.from('clientes').select('id, nome, proprietario').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    /**
     * A equipe, para o campo "Captado por".
     *
     * Sem embed direto: `empresa_usuarios` → `usuarios` precisa do nome da FK, e
     * errar o nome derruba a consulta INTEIRA em silêncio no PostgREST (foi o que
     * aconteceu no log de acessos em 12/08). Duas consultas simples são mais
     * baratas que uma depuração dessas.
     */
    supabase.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const ids = ((equipeRaw ?? []) as Array<{ usuario_id: string }>).map((e) => e.usuario_id)
  const { data: nomes } = ids.length
    ? await supabase.from('usuarios').select('id, nome').in('id', ids)
    : { data: [] as Array<{ id: string; nome: string | null }> }
  const equipe = ((nomes ?? []) as Array<{ id: string; nome: string | null }>)
    .map((u) => ({ id: u.id, nome: u.nome ?? '—' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <ImoveisView
      inicial={imoveis ?? []}
      proprietarios={proprietarios ?? []}
      equipe={equipe}
      empresaId={empresaId}
      slug={empresa?.slug ?? ''}
    />
  )
}
