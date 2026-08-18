import { createServiceClient } from '@/lib/supabase/service'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'

/**
 * Feed XML de veículos para portais (Sprint 4.2c). O portal consome esta URL
 * periodicamente e mantém os anúncios sincronizados com o estoque. Só expõe
 * unidades com status 'disponivel'. Formato genérico (adaptável por portal).
 */
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const tag = (name: string, val: unknown) => (val === null || val === undefined || val === '' ? '' : `      <${name}>${esc(val)}</${name}>\n`)

function parseFotos(v: string | null): string[] {
  if (!v) return []
  try { const j = JSON.parse(v); if (Array.isArray(j)) return j.map(String) } catch { /* não é JSON */ }
  return v.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()
  const xmlHeaders = { 'Content-Type': 'application/xml; charset=utf-8' }

  const { data: empresa } = await svc.from('empresas').select('id, nome, segmento').eq('slug', slug).maybeSingle()
  const vazio = new Response('<?xml version="1.0" encoding="UTF-8"?>\n<Veiculos></Veiculos>', { status: 404, headers: xmlHeaders })
  if (!empresa) return vazio

  /**
   * Só quem trabalha com veículo publica feed de veículo.
   *
   * A rota é aberta e o slug é público (aparece na landing, no cardápio, no link
   * de agendamento). Sem esta guarda, qualquer pessoa baixava o estoque INTEIRO
   * com preços de qualquer loja sabendo só o slug dela — inclusive de uma loja de
   * celular, que não tem nada a ver com portal de veículo. Mesmo 404 do slug
   * inexistente: não confirma se a empresa existe.
   */
  if (!SEGMENTOS[normalizarSegmento(empresa.segmento)].capacidades.usaPlaca) return vazio

  const { data: unidades } = await svc.from('inventario_unidades')
    // `observacoes` NÃO entra: é a nota INTERNA da peça, e é lá que o CRM escreve
    // "entrada por troca no PDV (cliente Maria)" e "downgrade — orçamento #12,
    // cliente João". O feed é público — isso vazava nome de cliente para o portal
    // e para quem tivesse a URL. Descrição de anúncio precisa de campo próprio,
    // escrito para ser lido de fora.
    .select('id, produto_id, ano, km, cor, condicao, preco_venda, fotos_urls, status')
    .eq('empresa_id', empresa.id).eq('status', 'disponivel').limit(1000)

  const prodIds = [...new Set((unidades ?? []).map((u) => u.produto_id).filter((x): x is number => x != null))]
  const nomePorProduto = new Map<number, string>()
  if (prodIds.length) {
    const { data: prods } = await svc.from('produtos').select('id, nome').in('id', prodIds)
    for (const p of prods ?? []) nomePorProduto.set(p.id, p.nome)
  }

  const itens = (unidades ?? []).map((u) => {
    const fotos = parseFotos(u.fotos_urls)
    const fotosXml = fotos.length
      ? `      <Fotos>\n${fotos.map((url, i) => `        <Foto><URLArquivo>${esc(url)}</URLArquivo><Principal>${i === 0 ? 1 : 0}</Principal></Foto>`).join('\n')}\n      </Fotos>\n`
      : ''
    return `    <Veiculo>
${tag('Codigo', u.id)}${tag('Modelo', u.produto_id != null ? nomePorProduto.get(u.produto_id) : '')}${tag('Ano', u.ano)}${tag('Quilometragem', u.km)}${tag('Cor', u.cor)}${tag('Condicao', u.condicao)}${tag('Preco', u.preco_venda)}${fotosXml}    </Veiculo>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Veiculos empresa="${esc(empresa.nome)}">\n${itens.join('\n')}\n</Veiculos>`
  return new Response(xml, { status: 200, headers: xmlHeaders })
}
