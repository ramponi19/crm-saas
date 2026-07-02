import { createServiceClient } from '@/lib/supabase/service'

/**
 * Feed XML de imóveis para portais (padrão OLX / Canal Pro — Grupo OLX Brasil:
 * ZAP, VivaReal, Imovelweb). O portal consome esta URL periodicamente.
 *
 * Regras: só imóveis com `publicar_portais = true` e `status = 'disponivel'`.
 * A empresa é identificada pelo `slug` na URL. Só expõe dados de marketing.
 * Omite o número do endereço quando `ocultar_numero_publico = true`.
 */

type ImovelFeed = {
  id: number; codigo: string | null; titulo: string | null; tipo: string; finalidade: string
  descricao: string | null; valor_venda: number | null; valor_locacao: number | null
  valor_condominio: number | null; valor_iptu: number | null; area_util: number | null; area_total: number | null
  quartos: number | null; suites: number | null; banheiros: number | null; vagas: number | null
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; uf: string | null; latitude: number | null; longitude: number | null
  ocultar_numero_publico: boolean | null; fotos: unknown
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const cdata = (s: unknown) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]&gt;')}]]>`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tag = (name: string, val: unknown) =>
  val === null || val === undefined || val === '' ? '' : `      <${name}>${esc(val)}</${name}>\n`

function imovelXml(im: ImovelFeed): string {
  const fotos = Array.isArray(im.fotos) ? (im.fotos as string[]) : []
  const fotosXml = fotos.length
    ? `      <Fotos>\n${fotos.map((u, i) => `        <Foto>\n          <URLArquivo>${esc(u)}</URLArquivo>\n          <Principal>${i === 0 ? 1 : 0}</Principal>\n        </Foto>`).join('\n')}\n      </Fotos>\n`
    : ''

  return `    <Imovel>
${tag('CodigoImovel', im.codigo || im.id)}${tag('TituloImovel', im.titulo)}${tag('TipoImovel', cap(im.tipo))}${tag('Finalidade', im.finalidade === 'locacao' ? 'Locação' : im.finalidade === 'ambos' ? 'Venda e Locação' : 'Venda')}${tag('PrecoVenda', im.valor_venda)}${tag('PrecoLocacao', im.valor_locacao)}${tag('ValoresCondominio', im.valor_condominio)}${tag('ValorIPTU', im.valor_iptu)}${tag('AreaUtil', im.area_util)}${tag('AreaTotal', im.area_total)}${tag('QtdDormitorios', im.quartos)}${tag('QtdSuites', im.suites)}${tag('QtdBanheiros', im.banheiros)}${tag('QtdVagas', im.vagas)}${tag('CEP', im.cep)}${tag('Endereco', im.logradouro)}${im.ocultar_numero_publico ? '' : tag('Numero', im.numero)}${tag('Complemento', im.complemento)}${tag('Bairro', im.bairro)}${tag('Cidade', im.cidade)}${tag('UF', im.uf)}${tag('Latitude', im.latitude)}${tag('Longitude', im.longitude)}${im.descricao ? `      <Observacao>${cdata(im.descricao)}</Observacao>\n` : ''}${fotosXml}    </Imovel>`
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id, nome').eq('slug', slug).maybeSingle()
  if (!empresa) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<Imoveis></Imoveis>', {
      status: 404, headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const { data: imoveis } = await svc
    .from('imoveis')
    .select('id, codigo, titulo, tipo, finalidade, descricao, valor_venda, valor_locacao, valor_condominio, valor_iptu, area_util, area_total, quartos, suites, banheiros, vagas, cep, logradouro, numero, complemento, bairro, cidade, uf, latitude, longitude, ocultar_numero_publico, fotos')
    .eq('empresa_id', empresa.id)
    .eq('publicar_portais', true)
    .eq('status', 'disponivel')
    .order('id', { ascending: false })

  const corpo = (imoveis ?? []).map(im => imovelXml(im as ImovelFeed)).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Imoveis>\n${corpo}\n</Imoveis>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800', // portais reconsultam periodicamente
    },
  })
}
